/*
Задача: Система уведомлений (Pub/Sub Notification System)

Условие:
- Топики: "order.created", "order.paid", "order.shipped".
- Подписчики:
  - EmailService: подписан на все order.* (wildcard).
  - InventoryService: подписан на order.created и order.shipped.
  - AnalyticsService: подписан на все order.* (wildcard).
- Публикатор генерирует 10 событий разных типов.
- Каждый подписчик выводит полученные события.
- Реализована wildcard подписка (order.*) и подписка на конкретные топики.
- Graceful shutdown: unsubscribe всех подписчиков после завершения.

Паттерн: Pub/Sub с поддержкой wildcard подписок, каналами для доставки.
*/

package main

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

// Event — событие в системе
type Event struct {
	Topic   string
	Payload string
	Time    time.Time
}

// Subscriber — подписчик на события
type Subscriber struct {
	Name    string
	Channel chan Event
	Topics  []string // конкретные топики или паттерны с * (wildcard)
}

// PubSub — брокер сообщений
type PubSub struct {
	mu          sync.RWMutex
	subscribers map[string]*Subscriber // имя -> подписчик
	closed      bool
}

// NewPubSub создаёт новый брокер
func NewPubSub() *PubSub {
	return &PubSub{
		subscribers: make(map[string]*Subscriber),
	}
}

// Subscribe регистрирует подписчика на указанные топики/паттерны.
// Возвращает канал, из которого подписчик читает события.
func (ps *PubSub) Subscribe(name string, topics ...string) <-chan Event {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	ch := make(chan Event, 20) // буферизированный канал, чтобы не блокировать публикатора
	sub := &Subscriber{
		Name:    name,
		Channel: ch,
		Topics:  topics,
	}
	ps.subscribers[name] = sub
	fmt.Printf("  [подписка] %s подписан на: %v\n", name, topics)
	return ch
}

// Unsubscribe отписывает подписчика и закрывает его канал
func (ps *PubSub) Unsubscribe(name string) {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	if sub, ok := ps.subscribers[name]; ok {
		close(sub.Channel)
		delete(ps.subscribers, name)
		fmt.Printf("  [отписка] %s отписан\n", name)
	}
}

// Publish отправляет событие всем подходящим подписчикам
func (ps *PubSub) Publish(event Event) {
	ps.mu.RLock()
	defer ps.mu.RUnlock()

	if ps.closed {
		return
	}

	for _, sub := range ps.subscribers {
		if matchesAny(event.Topic, sub.Topics) {
			// Неблокирующая отправка: если буфер полон, пропускаем
			select {
			case sub.Channel <- event:
			default:
				fmt.Printf("  [WARN] буфер подписчика %s переполнен, событие пропущено\n", sub.Name)
			}
		}
	}
}

// Close закрывает брокер и все каналы подписчиков
func (ps *PubSub) Close() {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	ps.closed = true
	for name, sub := range ps.subscribers {
		close(sub.Channel)
		delete(ps.subscribers, name)
	}
	fmt.Println("  [брокер] закрыт, все подписчики отключены")
}

// matchesAny проверяет, соответствует ли топик хотя бы одному из паттернов
func matchesAny(topic string, patterns []string) bool {
	for _, pattern := range patterns {
		if matchTopic(topic, pattern) {
			return true
		}
	}
	return false
}

// matchTopic проверяет соответствие топика паттерну.
// Поддерживает wildcard: "order.*" совпадает с "order.created", "order.paid" и т.д.
func matchTopic(topic, pattern string) bool {
	// Точное совпадение
	if topic == pattern {
		return true
	}
	// Wildcard: "order.*" -> prefix = "order."
	if strings.HasSuffix(pattern, ".*") {
		prefix := strings.TrimSuffix(pattern, "*")
		return strings.HasPrefix(topic, prefix)
	}
	return false
}

// runSubscriber запускает горутину-обработчик для подписчика
func runSubscriber(name string, ch <-chan Event, wg *sync.WaitGroup, received *[]Event, mu *sync.Mutex) {
	wg.Add(1)
	go func() {
		defer wg.Done()
		for event := range ch {
			mu.Lock()
			*received = append(*received, event)
			mu.Unlock()
			fmt.Printf("    [%s] получил: topic=%s payload=%q\n", name, event.Topic, event.Payload)
		}
		fmt.Printf("    [%s] канал закрыт, обработчик завершён\n", name)
	}()
}

func main() {
	fmt.Println("=== Система уведомлений (Pub/Sub) ===\n")

	broker := NewPubSub()

	// --- Регистрация подписчиков ---
	fmt.Println("Регистрация подписчиков:")
	emailCh := broker.Subscribe("EmailService", "order.*")           // wildcard — все order.*
	inventoryCh := broker.Subscribe("InventoryService", "order.created", "order.shipped") // конкретные топики
	analyticsCh := broker.Subscribe("AnalyticsService", "order.*")   // wildcard — все order.*

	// Запускаем горутины-обработчики для каждого подписчика
	var wg sync.WaitGroup
	var mu sync.Mutex
	var emailEvents, inventoryEvents, analyticsEvents []Event

	runSubscriber("EmailService", emailCh, &wg, &emailEvents, &mu)
	runSubscriber("InventoryService", inventoryCh, &wg, &inventoryEvents, &mu)
	runSubscriber("AnalyticsService", analyticsCh, &wg, &analyticsEvents, &mu)

	// --- Публикация событий ---
	fmt.Println("\nПубликация событий:")
	topics := []string{"order.created", "order.paid", "order.shipped"}
	for i := 1; i <= 10; i++ {
		topic := topics[i%len(topics)]
		event := Event{
			Topic:   topic,
			Payload: fmt.Sprintf("заказ #%d", 1000+i),
			Time:    time.Now(),
		}
		fmt.Printf("  [публикация] #%d topic=%s payload=%q\n", i, event.Topic, event.Payload)
		broker.Publish(event)
		time.Sleep(50 * time.Millisecond) // имитация интервала между событиями
	}

	// --- Graceful shutdown ---
	fmt.Println("\nЗавершение работы:")

	// Отписываем всех подписчиков — это закроет их каналы
	broker.Unsubscribe("EmailService")
	broker.Unsubscribe("InventoryService")
	broker.Unsubscribe("AnalyticsService")

	// Ждём завершения всех горутин-обработчиков
	wg.Wait()

	// --- Статистика ---
	fmt.Println("\n--- Статистика ---")
	mu.Lock()
	fmt.Printf("  EmailService (order.*):                    %d событий\n", len(emailEvents))
	fmt.Printf("  InventoryService (order.created, shipped): %d событий\n", len(inventoryEvents))
	fmt.Printf("  AnalyticsService (order.*):                %d событий\n", len(analyticsEvents))
	mu.Unlock()

	fmt.Println("\nВсе подписчики отписаны, брокер завершён.")
}
