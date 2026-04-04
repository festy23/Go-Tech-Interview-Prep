/*
=============================================================================
 ПАТТЕРН: Bridge Channel (мост каналов)
=============================================================================

 ПРОБЛЕМА:
   Иногда мы получаем "канал каналов" — <-chan <-chan T.
   Это типично для пагинированных API: каждая страница возвращает канал
   элементов, а все страницы приходят через внешний канал.
   Потребитель не хочет знать про двухуровневую структуру — ему нужен
   плоский поток значений <-chan T.

 РЕШЕНИЕ — bridge():
   Функция bridge(done, chanOfChans) "выпрямляет" вложенную структуру:
   читает из внешнего канала очередной внутренний канал, из него — все
   значения, потом переходит к следующему. Поддерживает отмену через done.

 СВЯЗЬ С orDone:
   Внутри bridge() используем orDone для безопасного чтения из внутренних
   каналов с проверкой отмены.

 РЕАЛЬНЫЕ ПРИМЕНЕНИЯ:
   - Пагинированные REST API (каждая страница = канал)
   - Чтение большого файла блоками (каждый блок = канал строк)
   - Websocket: каждое соединение = канал сообщений, reconnect = новый канал
   - Стриминг из нескольких источников последовательно

 Go 1.22: range по числу, безопасные переменные цикла.
=============================================================================
*/

package main

import (
	"context"
	"fmt"
	"math/rand/v2"
	"time"
)

// orDone — хелпер из предыдущего паттерна.
// Оборачивает чтение из канала с проверкой отмены.
func orDone[T any](done <-chan struct{}, ch <-chan T) <-chan T {
	out := make(chan T)
	go func() {
		defer close(out)
		for {
			select {
			case <-done:
				return
			case val, ok := <-ch:
				if !ok {
					return
				}
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

// bridge — главная функция паттерна.
// Принимает канал каналов и "выпрямляет" его в один плоский канал.
// done-канал позволяет прервать чтение на любом этапе.
func bridge[T any](done <-chan struct{}, chanOfChans <-chan <-chan T) <-chan T {
	out := make(chan T)

	go func() {
		defer close(out)

		// Читаем из внешнего канала: каждый элемент — это внутренний канал
		for innerCh := range orDone(done, chanOfChans) {
			// Читаем все значения из внутреннего канала
			// orDone гарантирует, что при отмене мы выйдем
			for val := range orDone(done, innerCh) {
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

// ============================================================================
// Практический пример: пагинированный API
// ============================================================================

// Item — элемент, возвращаемый API
type Item struct {
	ID   int
	Name string
	Page int // с какой страницы получен
}

// fetchPage имитирует запрос одной страницы API.
// Возвращает канал элементов этой страницы.
func fetchPage(ctx context.Context, pageNum int, pageSize int) <-chan Item {
	out := make(chan Item)

	go func() {
		defer close(out)

		// Имитируем задержку сети (50-150 мс на страницу)
		delay := time.Duration(50+rand.IntN(100)) * time.Millisecond
		select {
		case <-time.After(delay):
		case <-ctx.Done():
			return
		}

		// Генерируем элементы страницы
		startID := pageNum * pageSize
		for i := range pageSize {
			item := Item{
				ID:   startID + i,
				Name: fmt.Sprintf("item-%d", startID+i),
				Page: pageNum,
			}

			select {
			case out <- item:
			case <-ctx.Done():
				return
			}
		}
	}()

	return out
}

// fetchAllPages возвращает канал каналов — каждый элемент внешнего канала
// это канал элементов одной страницы.
func fetchAllPages(ctx context.Context, totalPages int, pageSize int) <-chan (<-chan Item) {
	pages := make(chan (<-chan Item))

	go func() {
		defer close(pages)

		for pageNum := range totalPages {
			// Получаем канал элементов очередной страницы
			pageCh := fetchPage(ctx, pageNum, pageSize)

			select {
			case pages <- pageCh:
				fmt.Printf("  [API] Страница %d отправлена на обработку\n", pageNum)
			case <-ctx.Done():
				fmt.Printf("  [API] Отмена на странице %d: %v\n", pageNum, ctx.Err())
				return
			}
		}
	}()

	return pages
}

// demonstrateBasicBridge — базовый пример bridge с числами
func demonstrateBasicBridge() {
	fmt.Println("=== 1. Базовый bridge: канал каналов → плоский канал ===")

	done := make(chan struct{})
	defer close(done)

	// Создаём канал каналов вручную
	chanOfChans := make(chan (<-chan int))

	go func() {
		defer close(chanOfChans)

		// 3 "пачки" данных, каждая — свой канал
		for batch := range 3 {
			ch := make(chan int)
			chanOfChans <- ch

			// Заполняем канал пачки
			go func() {
				defer close(ch)
				for j := range 4 {
					ch <- batch*100 + j
				}
			}()
		}
	}()

	// Потребитель видит один плоский поток
	fmt.Print("  Элементы: ")
	for val := range bridge(done, chanOfChans) {
		fmt.Printf("%d ", val)
	}
	fmt.Println()
	fmt.Println()
}

// demonstratePaginatedAPI — практический пример с пагинированным API
func demonstratePaginatedAPI() {
	fmt.Println("=== 2. Пагинированный API через bridge ===")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	totalPages := 4
	pageSize := 3

	fmt.Printf("  Запрашиваем %d страниц по %d элементов\n\n", totalPages, pageSize)

	// fetchAllPages возвращает <-chan <-chan Item
	// bridge выпрямляет в <-chan Item
	pages := fetchAllPages(ctx, totalPages, pageSize)
	items := bridge(ctx.Done(), pages)

	// Потребитель просто итерирует — не знает про пагинацию!
	count := 0
	for item := range items {
		count++
		fmt.Printf("  [потребитель] получен: ID=%d, Name=%s, Page=%d\n",
			item.ID, item.Name, item.Page)
	}
	fmt.Printf("\n  Всего получено: %d элементов\n", count)
	fmt.Println()
}

// demonstrateBridgeWithCancellation — bridge с отменой на полпути
func demonstrateBridgeWithCancellation() {
	fmt.Println("=== 3. Bridge с отменой (таймаут на полпути) ===")

	// Короткий таймаут — не успеем прочитать все страницы
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()

	totalPages := 10  // Много страниц
	pageSize := 5     // Много элементов

	fmt.Printf("  Запрашиваем %d страниц (таймаут: 300 мс)...\n\n", totalPages)

	pages := fetchAllPages(ctx, totalPages, pageSize)
	items := bridge(ctx.Done(), pages)

	count := 0
	for item := range items {
		count++
		fmt.Printf("  [потребитель] ID=%d (страница %d)\n", item.ID, item.Page)
	}

	fmt.Printf("\n  Получено %d из %d элементов до таймаута\n", count, totalPages*pageSize)
	fmt.Println()
}

// demonstrateBridgeWithStreams — bridge для объединения последовательных стримов
func demonstrateBridgeWithStreams() {
	fmt.Println("=== 4. Bridge для последовательных стримов ===")
	fmt.Println("  (имитация: websocket reconnect — каждое соединение = канал)")

	done := make(chan struct{})

	chanOfChans := make(chan (<-chan string))

	go func() {
		defer close(chanOfChans)

		// Три "соединения" последовательно
		connections := []struct {
			name     string
			messages []string
		}{
			{"conn-1", []string{"привет", "как дела", "ок"}},
			{"conn-2", []string{"переподключился", "данные", "ещё данные"}},
			{"conn-3", []string{"финальное соединение", "готово"}},
		}

		for _, conn := range connections {
			ch := make(chan string)
			chanOfChans <- ch

			go func() {
				defer close(ch)
				for _, msg := range conn.messages {
					select {
					case ch <- fmt.Sprintf("[%s] %s", conn.name, msg):
						time.Sleep(20 * time.Millisecond)
					case <-done:
						return
					}
				}
			}()

			// Пауза между "переподключениями"
			time.Sleep(30 * time.Millisecond)
		}
	}()

	// Потребитель видит единый поток сообщений
	msgCount := 0
	for msg := range bridge(done, chanOfChans) {
		msgCount++
		fmt.Printf("  [сообщение %d] %s\n", msgCount, msg)
	}

	close(done)
	fmt.Printf("\n  Получено %d сообщений из %d соединений\n", msgCount, 3)
	fmt.Println()
}

func main() {
	fmt.Println("╔═══════════════════════════════════════════════╗")
	fmt.Println("║   Bridge Channel — выпрямление канал каналов ║")
	fmt.Println("╚═══════════════════════════════════════════════╝")
	fmt.Println()

	demonstrateBasicBridge()
	demonstratePaginatedAPI()
	demonstrateBridgeWithCancellation()
	demonstrateBridgeWithStreams()

	fmt.Println("Все примеры завершены!")
}
