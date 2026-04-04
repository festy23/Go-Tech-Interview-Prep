/*
=============================================================================
 ПАТТЕРН: Pub/Sub — Event Bus (издатель/подписчик, шина событий)
=============================================================================

 СУТЬ ПАТТЕРНА:
   Центральный брокер (Broker) позволяет компонентам системы общаться
   без прямых зависимостей друг от друга. Издатели публикуют события
   в топики, подписчики получают события из интересующих их топиков.

 КЛЮЧЕВЫЕ КОМПОНЕНТЫ:
   - Broker: центральный узел, хранит подписки, маршрутизирует события
   - Topic: строковый идентификатор канала (например, "user.created")
   - Subscriber: получатель событий, имеет буферизованный канал
   - Publish: неблокирующая отправка (пропускаем медленных подписчиков)

 ПОТОКОБЕЗОПАСНОСТЬ:
   sync.RWMutex защищает карту подписок: Publish берёт RLock (много
   одновременных публикаций), Subscribe/Unsubscribe берут полный Lock.

 РЕАЛЬНЫЕ ПРИМЕНЕНИЯ:
   - Внутренняя шина событий в микросервисах
   - GUI: обновление UI при изменении модели
   - Игровые серверы: рассылка событий игрокам
   - Системы мониторинга: алерты на определённые метрики

 Go 1.22: range по числу, безопасные переменные цикла, дженерики.
=============================================================================
*/

package main

import (
	"fmt"
	"sync"
	"time"
)

// Event — событие, передаваемое через шину
type Event struct {
	Topic   string      // топик события
	Payload any         // полезная нагрузка (любой тип)
	Time    time.Time   // время создания
}

// Subscriber — подписчик с буферизованным каналом
type Subscriber struct {
	id     int            // уникальный идентификатор
	ch     chan Event      // канал для получения событий
	topics map[string]bool // на какие топики подписан
	quit   chan struct{}   // сигнал завершения
}

// Broker — центральный брокер событий
type Broker struct {
	mu          sync.RWMutex
	subscribers map[int]*Subscriber          // все подписчики по ID
	topics      map[string]map[int]*Subscriber // топик → подписчики
	nextID      int                           // счётчик ID
	closed      bool                          // флаг закрытия
}

// NewBroker создаёт новый брокер
func NewBroker() *Broker {
	return &Broker{
		subscribers: make(map[int]*Subscriber),
		topics:      make(map[string]map[int]*Subscriber),
	}
}

// Subscribe подписывает нового подписчика на указанные топики.
// bufSize — размер буфера канала (чем больше, тем устойчивее к всплескам).
func (b *Broker) Subscribe(bufSize int, topics ...string) *Subscriber {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.closed {
		return nil
	}

	b.nextID++
	sub := &Subscriber{
		id:     b.nextID,
		ch:     make(chan Event, bufSize),
		topics: make(map[string]bool),
		quit:   make(chan struct{}),
	}

	// Регистрируем подписчика в каждом топике
	for _, topic := range topics {
		sub.topics[topic] = true
		if b.topics[topic] == nil {
			b.topics[topic] = make(map[int]*Subscriber)
		}
		b.topics[topic][sub.id] = sub
	}

	b.subscribers[sub.id] = sub
	return sub
}

// Publish публикует событие во все подписки на данный топик.
// Неблокирующая отправка: если буфер подписчика полон — событие пропускается
// (защита от медленных потребителей).
func (b *Broker) Publish(topic string, payload any) int {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.closed {
		return 0
	}

	event := Event{
		Topic:   topic,
		Payload: payload,
		Time:    time.Now(),
	}

	subs := b.topics[topic]
	delivered := 0

	for _, sub := range subs {
		// Неблокирующая отправка через select + default
		select {
		case sub.ch <- event:
			delivered++
		default:
			// Буфер подписчика полон — пропускаем
			// В продакшене здесь можно логировать или считать метрики
		}
	}

	return delivered
}

// Unsubscribe отписывает подписчика от всех топиков и закрывает его канал
func (b *Broker) Unsubscribe(sub *Subscriber) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if sub == nil {
		return
	}

	// Удаляем из всех топиков
	for topic := range sub.topics {
		if subs, ok := b.topics[topic]; ok {
			delete(subs, sub.id)
			if len(subs) == 0 {
				delete(b.topics, topic) // чистим пустой топик
			}
		}
	}

	// Удаляем из общего списка
	delete(b.subscribers, sub.id)

	// Закрываем каналы подписчика
	close(sub.quit)
	close(sub.ch)
}

// Close закрывает брокер и все каналы подписчиков.
// Graceful shutdown: после Close() нельзя публиковать или подписываться.
func (b *Broker) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.closed {
		return
	}
	b.closed = true

	// Закрываем каналы всех подписчиков
	for _, sub := range b.subscribers {
		close(sub.quit)
		close(sub.ch)
	}

	// Очищаем все структуры данных
	b.subscribers = make(map[int]*Subscriber)
	b.topics = make(map[string]map[int]*Subscriber)
}

// Stats возвращает текущую статистику брокера
func (b *Broker) Stats() (subscribers int, topics int) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.subscribers), len(b.topics)
}

// ============================================================================
// Демонстрация
// ============================================================================

func main() {
	fmt.Println("╔═════════════════════════════════════════════╗")
	fmt.Println("║   Pub/Sub Event Bus — шина событий          ║")
	fmt.Println("╚═════════════════════════════════════════════╝")
	fmt.Println()

	broker := NewBroker()
	defer broker.Close()

	// ─── Подписчики ─────────────────────────────────────────────
	fmt.Println("=== 1. Создаём подписчиков ===")

	// Подписчик на события пользователей
	userSub := broker.Subscribe(10, "user.created", "user.deleted")
	fmt.Printf("  Подписчик #%d: user.created, user.deleted\n", userSub.id)

	// Подписчик на события заказов
	orderSub := broker.Subscribe(10, "order.placed", "order.shipped")
	fmt.Printf("  Подписчик #%d: order.placed, order.shipped\n", orderSub.id)

	// Подписчик-аудитор: слушает ВСЁ (несколько топиков)
	auditSub := broker.Subscribe(20, "user.created", "user.deleted", "order.placed", "order.shipped")
	fmt.Printf("  Подписчик #%d (аудитор): все топики\n", auditSub.id)

	subs, topics := broker.Stats()
	fmt.Printf("\n  Статистика: %d подписчиков, %d топиков\n\n", subs, topics)

	// ─── Обработчики в горутинах ────────────────────────────────
	fmt.Println("=== 2. Запускаем обработчики в горутинах ===")

	var wg sync.WaitGroup

	// Обработчик пользовательских событий
	wg.Add(1)
	go func() {
		defer wg.Done()
		for event := range userSub.ch {
			fmt.Printf("  [user-handler] %s: %v\n", event.Topic, event.Payload)
		}
		fmt.Println("  [user-handler] канал закрыт, завершаюсь")
	}()

	// Обработчик заказов
	wg.Add(1)
	go func() {
		defer wg.Done()
		for event := range orderSub.ch {
			fmt.Printf("  [order-handler] %s: %v\n", event.Topic, event.Payload)
		}
		fmt.Println("  [order-handler] канал закрыт, завершаюсь")
	}()

	// Аудитор — пишет лог всех событий
	wg.Add(1)
	go func() {
		defer wg.Done()
		count := 0
		for event := range auditSub.ch {
			count++
			fmt.Printf("  [аудитор] #%d %s @ %s: %v\n",
				count, event.Topic, event.Time.Format("15:04:05.000"), event.Payload)
		}
		fmt.Printf("  [аудитор] канал закрыт, всего событий: %d\n", count)
	}()

	// ─── Публикация событий ─────────────────────────────────────
	fmt.Println("=== 3. Публикуем события ===")
	fmt.Println()

	// Серия событий (имитируем реальную систему)
	events := []struct {
		topic   string
		payload any
	}{
		{"user.created", map[string]any{"name": "Иван", "email": "ivan@example.com"}},
		{"order.placed", map[string]any{"id": 1001, "total": 2500}},
		{"user.created", map[string]any{"name": "Мария", "email": "maria@example.com"}},
		{"order.shipped", map[string]any{"id": 1001, "tracking": "RU123456"}},
		{"user.deleted", map[string]any{"name": "Иван", "reason": "по запросу"}},
		{"order.placed", map[string]any{"id": 1002, "total": 800}},
	}

	for _, e := range events {
		delivered := broker.Publish(e.topic, e.payload)
		fmt.Printf("  [publish] %s → доставлено %d подписчикам\n", e.topic, delivered)
		time.Sleep(50 * time.Millisecond) // пауза для наглядности вывода
	}

	fmt.Println()
	time.Sleep(100 * time.Millisecond) // даём обработчикам дочитать

	// ─── Демонстрация отписки ───────────────────────────────────
	fmt.Println("=== 4. Отписка подписчика ===")

	broker.Unsubscribe(userSub)
	fmt.Println("  Подписчик user-handler отписан")

	// Публикуем ещё — user-handler уже не получит
	delivered := broker.Publish("user.created", map[string]any{"name": "Тест"})
	fmt.Printf("  [publish] user.created → доставлено %d (без user-handler)\n", delivered)

	time.Sleep(50 * time.Millisecond)

	// ─── Демонстрация переполнения буфера ────────────────────────
	fmt.Println()
	fmt.Println("=== 5. Неблокирующая публикация (переполнение буфера) ===")

	// Создаём подписчика с маленьким буфером
	slowSub := broker.Subscribe(2, "flood.test")
	fmt.Printf("  Подписчик #%d: буфер=2\n", slowSub.id)

	// Публикуем 10 сообщений — только 2 влезут в буфер
	published := 0
	for i := range 10 {
		n := broker.Publish("flood.test", fmt.Sprintf("сообщение-%d", i))
		published += n
	}
	fmt.Printf("  Опубликовано 10 событий, доставлено: %d (буфер был полон!)\n", published)

	// Читаем то, что влезло
	count := 0
	for count < 2 {
		event := <-slowSub.ch
		count++
		fmt.Printf("  [slow-sub] получил: %v\n", event.Payload)
	}
	broker.Unsubscribe(slowSub)

	// ─── Graceful Close ─────────────────────────────────────────
	fmt.Println()
	fmt.Println("=== 6. Graceful Close — закрытие брокера ===")

	broker.Close()
	fmt.Println("  Брокер закрыт, ждём завершения всех обработчиков...")

	wg.Wait()

	subs, topics = broker.Stats()
	fmt.Printf("\n  Финальная статистика: %d подписчиков, %d топиков\n", subs, topics)
	fmt.Println()
	fmt.Println("Программа завершена. Все горутины остановлены!")
}
