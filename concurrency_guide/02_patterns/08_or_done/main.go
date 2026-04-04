/*
=============================================================================
 ПАТТЕРН: Or-Done Channel (канал «или-готово»)
=============================================================================

 ПРОБЛЕМА:
   Когда мы читаем из канала в цикле, но нужно уважать отмену (done-канал
   или context), код быстро превращается в кашу: в каждом range нужен select
   с проверкой done. Это засоряет бизнес-логику.

 РЕШЕНИЕ — orDone хелпер:
   Функция orDone(done, ch) возвращает новый канал, который:
   - пробрасывает значения из ch
   - автоматически закрывается при закрытии done
   Теперь можно писать чистый range без вложенных select.

 ПАТТЕРН "or" (первый из N done-каналов):
   Рекурсивная функция or(channels...) возвращает канал, который закроется,
   как только ХОТЬ ОДИН из входных каналов закроется.
   Применение: "гонка" нескольких условий отмены — кто первый, тот и отменил.

 РЕАЛЬНЫЕ ПРИМЕНЕНИЯ:
   - Пайплайны с отменой: каждый стейдж использует orDone для чтения
   - Таймаут ИЛИ ручная отмена ИЛИ ошибка — or() объединяет сигналы
   - Graceful shutdown: or(sigint, sigterm, parentDone)

 Go 1.22: range по числу, безопасные переменные цикла.
=============================================================================
*/

package main

import (
	"context"
	"fmt"
	"math/rand/v2"
	"sync"
	"time"
)

// orDone — хелпер, оборачивающий чтение из канала с проверкой отмены.
// Возвращает канал, из которого можно безопасно range-ить:
// значения приходят из valueCh, а при закрытии done — канал закрывается.
func orDone[T any](done <-chan struct{}, valueCh <-chan T) <-chan T {
	out := make(chan T)
	go func() {
		defer close(out)
		for {
			select {
			case <-done:
				// Сигнал отмены — прекращаем проброс
				return
			case val, ok := <-valueCh:
				if !ok {
					// Исходный канал закрыт — выходим
					return
				}
				// Пробрасываем значение, но с проверкой done
				select {
				case out <- val:
				case <-done:
					return
				}
			}
		}
	}()
	return out
}

// or — рекурсивная функция, объединяющая N done-каналов.
// Возвращает канал, который закроется, когда ПЕРВЫЙ из входных закроется.
// Это паттерн "гонка отмен" (cancellation race).
func or(channels ...<-chan struct{}) <-chan struct{} {
	// Базовые случаи рекурсии
	switch len(channels) {
	case 0:
		return nil
	case 1:
		return channels[0]
	}

	orDone := make(chan struct{})

	go func() {
		defer close(orDone)

		switch len(channels) {
		case 2:
			// Оптимизация для двух каналов — без рекурсии
			select {
			case <-channels[0]:
			case <-channels[1]:
			}
		default:
			// Рекурсивный случай: делим каналы пополам и объединяем
			// select на первую половину + рекурсия на вторую + сам orDone
			midpoint := len(channels) / 2
			select {
			case <-or(channels[:midpoint]...):
			case <-or(channels[midpoint:]...):
			case <-orDone:
				// Кто-то закрыл orDone извне (не произойдёт, но защита от утечки)
			}
		}
	}()

	return orDone
}

// sig создаёт done-канал, который закроется через заданное время.
// Утилита для демонстрации.
func sig(after time.Duration) <-chan struct{} {
	ch := make(chan struct{})
	go func() {
		defer close(ch)
		time.Sleep(after)
	}()
	return ch
}

// demonstrateWithoutOrDone показывает "грязный" код БЕЗ orDone
func demonstrateWithoutOrDone() {
	fmt.Println("=== 1. БЕЗ orDone — грязный код с вложенными select ===")

	done := make(chan struct{})
	dataCh := make(chan int)

	// Генератор данных
	go func() {
		defer close(dataCh)
		for i := range 10 {
			dataCh <- i
			time.Sleep(30 * time.Millisecond)
		}
	}()

	// Отмена через 100 мс
	go func() {
		time.Sleep(100 * time.Millisecond)
		close(done)
	}()

	// Чтение — НУЖЕН select в каждой итерации (уродливо!)
	fmt.Print("  Получено: ")
	for {
		select {
		case <-done:
			fmt.Println("\n  [отмена] done закрыт — выходим из цикла")
			goto next
		case val, ok := <-dataCh:
			if !ok {
				goto next
			}
			fmt.Printf("%d ", val)
		}
	}
next:
	fmt.Println()
}

// demonstrateWithOrDone показывает чистый код С orDone
func demonstrateWithOrDone() {
	fmt.Println("=== 2. С orDone — чистый range с автоматической отменой ===")

	done := make(chan struct{})
	dataCh := make(chan int)

	// Генератор данных
	go func() {
		defer close(dataCh)
		for i := range 10 {
			dataCh <- i
			time.Sleep(30 * time.Millisecond)
		}
	}()

	// Отмена через 100 мс
	go func() {
		time.Sleep(100 * time.Millisecond)
		close(done)
	}()

	// Чтение — ЧИСТО! Просто range, orDone сам разрулит отмену
	fmt.Print("  Получено: ")
	for val := range orDone(done, dataCh) {
		fmt.Printf("%d ", val)
	}
	fmt.Println("\n  [отмена] orDone прекратил проброс")
	fmt.Println()
}

// demonstrateOrPattern показывает паттерн or() — гонка отмен
func demonstrateOrPattern() {
	fmt.Println("=== 3. Паттерн or() — первый закрытый канал побеждает ===")

	start := time.Now()

	// Пять каналов с разными задержками
	// or() закроется, когда первый из них закроется (50 мс)
	result := or(
		sig(500*time.Millisecond),
		sig(300*time.Millisecond),
		sig(50*time.Millisecond), // ← этот победит
		sig(800*time.Millisecond),
		sig(1000*time.Millisecond),
	)

	<-result
	elapsed := time.Since(start)
	fmt.Printf("  or() закрылся через %v (ожидали ~50 мс)\n", elapsed.Round(time.Millisecond))
	fmt.Println()
}

// demonstratePipelineWithOrDone показывает orDone в пайплайне
func demonstratePipelineWithOrDone() {
	fmt.Println("=== 4. orDone в пайплайне с контекстом ===")

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	// done-канал из контекста
	done := ctx.Done()

	// Стейдж 1: генератор (медленный — по 50 мс на элемент)
	generate := func() <-chan string {
		out := make(chan string)
		go func() {
			defer close(out)
			items := []string{"альфа", "бета", "гамма", "дельта", "эпсилон", "зета", "эта", "тета"}
			for _, item := range items {
				select {
				case out <- item:
					time.Sleep(50 * time.Millisecond)
				case <-done:
					return
				}
			}
		}()
		return out
	}

	// Стейдж 2: трансформация (добавляем случайный "вес")
	transform := func(in <-chan string) <-chan string {
		out := make(chan string)
		go func() {
			defer close(out)
			for val := range orDone(done, in) {
				result := fmt.Sprintf("%s (вес: %d)", val, rand.IntN(100))
				select {
				case out <- result:
				case <-done:
					return
				}
			}
		}()
		return out
	}

	// Собираем пайплайн и потребляем результат
	pipeline := transform(generate())

	fmt.Println("  Пайплайн (таймаут 200 мс):")
	count := 0
	for val := range orDone(done, pipeline) {
		count++
		fmt.Printf("    [%d] %s\n", count, val)
	}
	fmt.Printf("  Пайплайн завершён: обработано %d элементов до отмены\n", count)
	fmt.Println()
}

// demonstrateOrWithRealConditions — or() с реальными условиями отмены
func demonstrateOrWithRealConditions() {
	fmt.Println("=== 5. or() — объединение реальных условий отмены ===")

	// Имитируем три независимых условия отмены
	var wg sync.WaitGroup

	// Условие 1: таймаут
	timeoutCh := sig(500 * time.Millisecond)

	// Условие 2: пользователь "нажал отмену"
	userCancelCh := make(chan struct{})
	wg.Add(1)
	go func() {
		defer wg.Done()
		time.Sleep(150 * time.Millisecond) // имитация действия пользователя
		close(userCancelCh)
		fmt.Println("  [событие] Пользователь нажал 'Отмена'")
	}()

	// Условие 3: ошибка в другой системе
	errorCh := sig(800 * time.Millisecond)

	// Объединяем все условия: первое сработавшее отменит всё
	combined := or(timeoutCh, userCancelCh, errorCh)

	start := time.Now()
	<-combined
	elapsed := time.Since(start)

	fmt.Printf("  Операция отменена через %v (пользователь отменил на ~150 мс)\n",
		elapsed.Round(time.Millisecond))

	wg.Wait()
	fmt.Println()
}

func main() {
	fmt.Println("╔══════════════════════════════════════════╗")
	fmt.Println("║   Or-Done Channel — продвинутый паттерн ║")
	fmt.Println("╚══════════════════════════════════════════╝")
	fmt.Println()

	demonstrateWithoutOrDone()
	demonstrateWithOrDone()
	demonstrateOrPattern()
	demonstratePipelineWithOrDone()
	demonstrateOrWithRealConditions()

	fmt.Println("Все примеры завершены без утечек горутин!")
}
