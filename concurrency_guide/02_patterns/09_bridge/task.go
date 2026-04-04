/*
Задача: Чтение пагинированного API (Bridge Channel)

Условие:
- Имитация API: каждая "страница" — канал с 5 элементами (Item).
- API возвращает канал каналов (<-chan <-chan Item).
- Всего 4 страницы, каждая загружается с задержкой (имитация сетевого запроса).
- Функция bridge сглаживает вложенный канал каналов в единый поток элементов.
- Клиент просто делает range по bridge — ему не нужно знать про пагинацию.
- Добавлен контекст: если клиент отменил операцию — загрузка следующих страниц прекращается.
- Вывести все элементы с указанием номера страницы.

Паттерн: bridge channel — превращает <-chan <-chan T в <-chan T.
*/

package main

import (
	"context"
	"fmt"
	"time"
)

// Item — элемент данных из API
type Item struct {
	ID   int
	Name string
	Page int
}

// bridge принимает канал каналов и возвращает единый плоский канал.
// При отмене контекста прекращает чтение из всех вложенных каналов.
func bridge[T any](ctx context.Context, chanOfChans <-chan <-chan T) <-chan T {
	out := make(chan T)
	go func() {
		defer close(out)
		for {
			// Ожидаем следующий внутренний канал (следующую "страницу")
			var innerChan <-chan T
			select {
			case <-ctx.Done():
				return
			case ic, ok := <-chanOfChans:
				if !ok {
					return // все страницы прочитаны
				}
				innerChan = ic
			}

			// Вычитываем все элементы из внутреннего канала
			for {
				select {
				case <-ctx.Done():
					return
				case item, ok := <-innerChan:
					if !ok {
						break // этот внутренний канал закрыт, переходим к следующему
					}
					select {
					case out <- item:
					case <-ctx.Done():
						return
					}
					continue
				}
				break
			}
		}
	}()
	return out
}

// fetchPage имитирует загрузку одной страницы API.
// Возвращает канал, из которого можно прочитать элементы страницы.
func fetchPage(ctx context.Context, pageNum int, pageSize int) <-chan Item {
	ch := make(chan Item)
	go func() {
		defer close(ch)
		// Имитация задержки загрузки страницы
		delay := time.Duration(100+pageNum*50) * time.Millisecond
		select {
		case <-time.After(delay):
		case <-ctx.Done():
			fmt.Printf("  [страница %d] загрузка отменена\n", pageNum)
			return
		}

		fmt.Printf("  [страница %d] загружена (задержка %v)\n", pageNum, delay)

		// Отправляем элементы страницы
		for i := 0; i < pageSize; i++ {
			itemID := (pageNum-1)*pageSize + i + 1
			item := Item{
				ID:   itemID,
				Name: fmt.Sprintf("товар_%d", itemID),
				Page: pageNum,
			}
			select {
			case ch <- item:
			case <-ctx.Done():
				fmt.Printf("  [страница %d] отправка прервана на элементе %d\n", pageNum, i)
				return
			}
		}
	}()
	return ch
}

// paginatedAPI возвращает канал каналов — каждый внутренний канал соответствует одной странице.
func paginatedAPI(ctx context.Context, totalPages, pageSize int) <-chan (<-chan Item) {
	chanOfChans := make(chan (<-chan Item))
	go func() {
		defer close(chanOfChans)
		for page := 1; page <= totalPages; page++ {
			// Загружаем страницу и отправляем её канал
			pageChan := fetchPage(ctx, page, pageSize)
			select {
			case chanOfChans <- pageChan:
			case <-ctx.Done():
				fmt.Printf("  [API] пагинация прервана на странице %d\n", page)
				return
			}
		}
		fmt.Println("  [API] все страницы отданы")
	}()
	return chanOfChans
}

func main() {
	fmt.Println("=== Чтение пагинированного API через bridge ===")
	fmt.Println()

	const totalPages = 4
	const pageSize = 5

	// --- Сценарий 1: полное чтение всех страниц ---
	fmt.Println("--- Сценарий 1: читаем все страницы ---")
	ctx1 := context.Background()
	pages1 := paginatedAPI(ctx1, totalPages, pageSize)
	stream1 := bridge(ctx1, pages1)

	var count1 int
	for item := range stream1 {
		count1++
		fmt.Printf("    #%02d [стр.%d] %s\n", item.ID, item.Page, item.Name)
	}
	fmt.Printf("  Итого получено: %d элементов\n\n", count1)

	// --- Сценарий 2: отмена после получения 12 элементов ---
	fmt.Println("--- Сценарий 2: отмена после 12 элементов ---")
	ctx2, cancel2 := context.WithCancel(context.Background())

	pages2 := paginatedAPI(ctx2, totalPages, pageSize)
	stream2 := bridge(ctx2, pages2)

	var count2 int
	for item := range stream2 {
		count2++
		fmt.Printf("    #%02d [стр.%d] %s\n", item.ID, item.Page, item.Name)
		if count2 >= 12 {
			fmt.Println("    --- клиент отменяет загрузку ---")
			cancel2()
			break
		}
	}
	// Дочитываем оставшиеся элементы из буфера (если есть)
	for range stream2 {
		count2++
	}
	fmt.Printf("  Итого получено: %d элементов (из %d возможных)\n\n", count2, totalPages*pageSize)

	// --- Сценарий 3: таймаут ---
	fmt.Println("--- Сценарий 3: таймаут 250мс ---")
	ctx3, cancel3 := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel3()

	pages3 := paginatedAPI(ctx3, totalPages, pageSize)
	stream3 := bridge(ctx3, pages3)

	var count3 int
	for item := range stream3 {
		count3++
		fmt.Printf("    #%02d [стр.%d] %s\n", item.ID, item.Page, item.Name)
	}
	fmt.Printf("  Итого получено: %d элементов (лимит по времени)\n\n", count3)

	// Даём время на завершение горутин
	time.Sleep(100 * time.Millisecond)
	fmt.Println("Все сценарии завершены.")
}
