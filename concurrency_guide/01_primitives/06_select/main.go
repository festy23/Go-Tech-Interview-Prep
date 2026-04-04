/*
=== SELECT ===

select — это оператор мультиплексирования операций с каналами.
Похож на switch, но каждый case — это операция с каналом (отправка или получение).

Ключевые свойства:
  1. Если готово несколько case — выбирается СЛУЧАЙНЫЙ (НЕ первый!).
     Это предотвращает starvation (голодание) каналов.
  2. Если ни один case не готов — select блокируется до готовности одного из них.
  3. default — выполняется немедленно, если ни один case не готов (неблокирующий select).
  4. select {} — блокирует навсегда (полезно для серверов, daemon-горутин).

Частые паттерны:
  - Таймаут:   case <-time.After(duration)
  - Тикер:     case <-time.Tick(interval)  (осторожно: утечка! лучше time.NewTicker)
  - Отмена:    case <-ctx.Done()
  - Приоритет: вложенный select с default для предпочтения одного канала
  - Отключение case: присвоить nil каналу — этот case больше не сработает
*/
package main

import (
	"fmt"
	"math/rand"
	"time"
)

func main() {
	// =====================================================
	// Пример 1: Базовый select
	// =====================================================
	fmt.Println("=== Пример 1: Базовый select ===")

	ch1 := make(chan string, 1)
	ch2 := make(chan string, 1)

	ch1 <- "данные из ch1"
	ch2 <- "данные из ch2"

	// Оба канала готовы — select выберет случайный!
	select {
	case msg := <-ch1:
		fmt.Printf("  Выбран ch1: %s\n", msg)
	case msg := <-ch2:
		fmt.Printf("  Выбран ch2: %s\n", msg)
	}
	fmt.Println("  (запустите несколько раз — выбор будет разным!)")
	fmt.Println()

	// =====================================================
	// Пример 2: Случайный выбор при нескольких готовых case
	// =====================================================
	fmt.Println("=== Пример 2: Статистика случайного выбора ===")

	a := make(chan int, 1)
	b := make(chan int, 1)
	countA, countB := 0, 0

	for range 1000 {
		a <- 1
		b <- 1
		select {
		case <-a:
			countA++
		case <-b:
			countB++
		}
		// Вычитываем оставшийся, чтобы не забить буфер
		select {
		case <-a:
		case <-b:
		default:
		}
	}
	fmt.Printf("  Из 1000 итераций: ch_a=%d, ch_b=%d (примерно 50/50)\n", countA, countB)
	fmt.Println()

	// =====================================================
	// Пример 3: default — неблокирующий select
	// =====================================================
	fmt.Println("=== Пример 3: default — неблокирующий select ===")

	emptyCh := make(chan int)

	select {
	case val := <-emptyCh:
		fmt.Printf("  Получено: %d\n", val)
	default:
		fmt.Println("  Канал пуст, default сработал немедленно (без блокировки).")
	}

	// Неблокирующая отправка
	fullCh := make(chan int) // небуферизованный, некому читать
	select {
	case fullCh <- 42:
		fmt.Println("  Отправлено!")
	default:
		fmt.Println("  Отправка заблокирована, default сработал.")
	}
	fmt.Println()

	// =====================================================
	// Пример 4: Таймаут с time.After
	// =====================================================
	fmt.Println("=== Пример 4: Таймаут с time.After ===")

	delayCh := make(chan string)
	go func() {
		time.Sleep(2 * time.Second) // имитация медленной операции
		delayCh <- "результат"
	}()

	select {
	case result := <-delayCh:
		fmt.Printf("  Получен результат: %s\n", result)
	case <-time.After(500 * time.Millisecond):
		fmt.Println("  ТАЙМАУТ: операция заняла слишком долго (>500ms)")
	}
	fmt.Println()

	// =====================================================
	// Пример 5: Периодические действия с Ticker
	// =====================================================
	fmt.Println("=== Пример 5: Ticker + select с завершением ===")

	ticker := time.NewTicker(200 * time.Millisecond) // НЕ time.Tick — его нельзя остановить!
	defer ticker.Stop()                               // ВАЖНО: всегда останавливаем тикер

	done := make(chan struct{})
	go func() {
		time.Sleep(1 * time.Second)
		close(done) // сигнал остановки через 1 секунду
	}()

	tickCount := 0
tickerLoop:
	for {
		select {
		case t := <-ticker.C:
			tickCount++
			fmt.Printf("  тик #%d в %s\n", tickCount, t.Format("15:04:05.000"))
		case <-done:
			fmt.Println("  Получен сигнал остановки!")
			break tickerLoop // break с меткой — выходим из for, а не из select
		}
	}
	fmt.Println()

	// =====================================================
	// Пример 6: select {} — блокировка навсегда
	// =====================================================
	fmt.Println("=== Пример 6: select {} — блокировка навсегда ===")
	fmt.Println("  select {} блокирует горутину навсегда.")
	fmt.Println("  Полезно для серверов: запустить HTTP-сервер в горутине, а main заблокировать.")
	fmt.Println("  Пример:")
	fmt.Println("    go http.ListenAndServe(\":8080\", nil)")
	fmt.Println("    select {} // main не завершается")
	fmt.Println()

	// =====================================================
	// Пример 7: nil-канал для отключения case
	// =====================================================
	fmt.Println("=== Пример 7: nil-канал отключает case в select ===")

	fast := make(chan string, 10)
	slow := make(chan string, 10)

	// Наполняем каналы
	for i := range 3 {
		fast <- fmt.Sprintf("fast-%d", i)
		slow <- fmt.Sprintf("slow-%d", i)
	}

	// Закрываем, чтобы range не заблокировался
	close(fast)
	close(slow)

	// Читаем из обоих каналов. Когда один закроется — отключаем его через nil.
	var fastCh <-chan string = fast
	var slowCh <-chan string = slow
	received := 0

	for fastCh != nil || slowCh != nil {
		select {
		case val, ok := <-fastCh:
			if !ok {
				fmt.Println("  fast канал закрыт, отключаем его (nil)")
				fastCh = nil // теперь этот case НИКОГДА не сработает
				continue
			}
			fmt.Printf("  из fast: %s\n", val)
			received++
		case val, ok := <-slowCh:
			if !ok {
				fmt.Println("  slow канал закрыт, отключаем его (nil)")
				slowCh = nil // теперь этот case НИКОГДА не сработает
				continue
			}
			fmt.Printf("  из slow: %s\n", val)
			received++
		}
	}
	fmt.Printf("  Всего получено: %d\n", received)
	fmt.Println()

	// =====================================================
	// Пример 8: Приоритетный select (nested select with default)
	// =====================================================
	fmt.Println("=== Пример 8: Приоритетный select ===")
	fmt.Println("  Задача: предпочитать данные из высокоприоритетного канала.")

	highPriority := make(chan string, 10)
	lowPriority := make(chan string, 10)

	// Наполняем оба канала
	for i := range 5 {
		highPriority <- fmt.Sprintf("HIGH-%d", i)
		lowPriority <- fmt.Sprintf("low-%d", i)
	}

	// Читаем с приоритетом: сначала всегда пытаемся из high
	for range 10 {
		select {
		case msg := <-highPriority:
			// Высокий приоритет: всегда обрабатываем первым
			fmt.Printf("  [ПРИОРИТЕТ] %s\n", msg)
		default:
			// Если high пуст — читаем из любого
			select {
			case msg := <-highPriority:
				fmt.Printf("  [ПРИОРИТЕТ] %s\n", msg)
			case msg := <-lowPriority:
				fmt.Printf("  [обычный]   %s\n", msg)
			}
		}
	}
	fmt.Println()

	// =====================================================
	// Пример 9: select для отправки с таймаутом
	// =====================================================
	fmt.Println("=== Пример 9: Отправка с таймаутом ===")

	busyCh := make(chan int) // небуферизованный, никто не читает

	for i := range 3 {
		select {
		case busyCh <- i:
			fmt.Printf("  Отправлено: %d\n", i)
		case <-time.After(time.Duration(rand.Intn(100)+50) * time.Millisecond):
			fmt.Printf("  Таймаут при отправке %d — получатель не готов\n", i)
		}
	}

	fmt.Println("\n=== Все примеры завершены ===")
}
