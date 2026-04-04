/*
=== НАПРАВЛЕННЫЕ КАНАЛЫ (CHANNEL DIRECTIONS) ===

Go позволяет указать направление канала в сигнатуре функции:
  chan T      — двунаправленный (чтение и запись)
  chan<- T    — только для записи (send-only)
  <-chan T    — только для чтения (receive-only)

Правила преобразования:
  chan T → chan<- T   ✓ (неявное, автоматическое)
  chan T → <-chan T   ✓ (неявное, автоматическое)
  chan<- T → chan T   ✗ (ОШИБКА КОМПИЛЯЦИИ)
  <-chan T → chan T   ✗ (ОШИБКА КОМПИЛЯЦИИ)

Зачем использовать направленные каналы?
  1. Безопасность на этапе компиляции: невозможно случайно записать в канал,
     предназначенный только для чтения, или наоборот.
  2. Документация API: сигнатура функции явно показывает контракт —
     кто производит данные, кто потребляет.
  3. Принцип наименьших привилегий: функция получает только те права, которые ей нужны.

Идиоматичные паттерны:
  - Производитель возвращает <-chan T (только чтение для потребителя)
  - Потребитель принимает <-chan T (не может закрыть или записать в канал)
  - Только владелец (создатель) канала закрывает его
*/
package main

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

func main() {
	// =====================================================
	// Пример 1: Базовые направленные каналы
	// =====================================================
	fmt.Println("=== Пример 1: Базовые направленные каналы ===")

	ch := make(chan string, 1) // двунаправленный канал

	// Передаём как send-only в писателя
	go writer(ch, "привет")

	// Передаём как receive-only в читателя
	go reader(ch)

	time.Sleep(100 * time.Millisecond)
	fmt.Println()

	// =====================================================
	// Пример 2: Ошибки компиляции (закомментировано)
	// =====================================================
	fmt.Println("=== Пример 2: Ошибки компиляции с направленными каналами ===")
	fmt.Println("  Следующий код НЕ скомпилируется:")
	fmt.Println()
	fmt.Println("  func badReader(ch chan<- int) {")
	fmt.Println("      val := <-ch  // ОШИБКА: cannot receive from send-only channel")
	fmt.Println("  }")
	fmt.Println()
	fmt.Println("  func badWriter(ch <-chan int) {")
	fmt.Println("      ch <- 42  // ОШИБКА: cannot send to receive-only channel")
	fmt.Println("  }")
	fmt.Println()
	fmt.Println("  func badCloser(ch <-chan int) {")
	fmt.Println("      close(ch)  // ОШИБКА: cannot close receive-only channel")
	fmt.Println("  }")
	fmt.Println()

	// =====================================================
	// Пример 3: Производитель возвращает <-chan T
	// =====================================================
	fmt.Println("=== Пример 3: Паттерн производителя ===")

	// producer() создаёт канал внутри и возвращает receive-only версию.
	// Вызывающий код НЕ МОЖЕТ записать в канал или закрыть его.
	numbers := producer(5)

	fmt.Print("  Числа от производителя: ")
	for n := range numbers { // range читает до закрытия канала
		fmt.Printf("%d ", n)
	}
	fmt.Println()
	fmt.Println()

	// =====================================================
	// Пример 4: Конвейер (pipeline) с направленными каналами
	// =====================================================
	fmt.Println("=== Пример 4: Конвейер (pipeline) ===")

	// Конвейер: генератор → удвоитель → принтер
	// Каждая стадия принимает <-chan (вход) и возвращает <-chan (выход)
	gen := generate(1, 2, 3, 4, 5)
	doubled := transform(gen, func(n int) int { return n * 2 })
	squared := transform(doubled, func(n int) int { return n * n })

	fmt.Print("  Результат (((n*2)^2)): ")
	for val := range squared {
		fmt.Printf("%d ", val)
	}
	fmt.Println()
	fmt.Println()

	// =====================================================
	// Пример 5: Fan-out / Fan-in с направленными каналами
	// =====================================================
	fmt.Println("=== Пример 5: Fan-out / Fan-in ===")

	// Один источник → несколько обработчиков → один приёмник
	source := generate(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)

	// Fan-out: 3 воркера читают из одного канала
	const numWorkers = 3
	workers := make([]<-chan string, numWorkers)
	for i := range numWorkers {
		workers[i] = worker(i, source)
	}

	// Fan-in: объединяем результаты всех воркеров в один канал
	merged := fanIn(workers...)

	for result := range merged {
		fmt.Printf("  %s\n", result)
	}
	fmt.Println()

	// =====================================================
	// Пример 6: Двунаправленный → однонаправленный (неявное преобразование)
	// =====================================================
	fmt.Println("=== Пример 6: Неявное преобразование направлений ===")

	bidir := make(chan int, 1)

	// Присваиваем двунаправленный канал в однонаправленные переменные
	var sendOnly chan<- int = bidir // OK: неявное сужение прав
	var recvOnly <-chan int = bidir // OK: неявное сужение прав

	sendOnly <- 99
	val := <-recvOnly
	fmt.Printf("  Отправлено через send-only, получено через recv-only: %d\n", val)

	// Обратное преобразование НЕВОЗМОЖНО:
	// var bidir2 chan int = sendOnly // ОШИБКА КОМПИЛЯЦИИ
	_ = sendOnly
	_ = recvOnly
	fmt.Println()

	fmt.Println("=== Все примеры завершены ===")
}

// writer принимает канал только для записи.
func writer(ch chan<- string, msg string) {
	ch <- msg
	fmt.Printf("  writer: отправил %q\n", msg)
}

// reader принимает канал только для чтения.
func reader(ch <-chan string) {
	msg := <-ch
	fmt.Printf("  reader: получил %q\n", msg)
}

// producer — идиоматичный паттерн: создаёт канал, запускает горутину,
// возвращает receive-only канал. Вызывающий код не может сломать канал.
func producer(n int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out) // производитель закрывает канал, когда закончит
		for i := range n {
			out <- i
		}
	}()
	return out // возвращается как <-chan int (неявное преобразование)
}

// generate — генератор значений (стадия конвейера).
func generate(nums ...int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for _, n := range nums {
			out <- n
		}
	}()
	return out
}

// transform — преобразующая стадия конвейера.
// Принимает входной канал (только чтение) и функцию трансформации.
func transform(in <-chan int, fn func(int) int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for val := range in {
			out <- fn(val)
		}
	}()
	return out
}

// worker — обработчик, читает числа и возвращает строки-результаты.
func worker(id int, in <-chan int) <-chan string {
	out := make(chan string)
	go func() {
		defer close(out)
		for n := range in {
			// Имитация работы
			result := fmt.Sprintf("воркер-%d обработал %d → %s",
				id, n, strings.Repeat("*", n))
			out <- result
		}
	}()
	return out
}

// fanIn — объединяет несколько каналов в один.
func fanIn(channels ...<-chan string) <-chan string {
	out := make(chan string)
	var wg sync.WaitGroup

	for _, ch := range channels {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for val := range ch {
				out <- val
			}
		}()
	}

	// Закрываем выходной канал, когда все входные закроются
	go func() {
		wg.Wait()
		close(out)
	}()

	return out
}
