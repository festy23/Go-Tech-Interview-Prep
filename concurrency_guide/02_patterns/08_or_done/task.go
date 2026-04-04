/*
Задача: Конвейер логов с graceful drain (Log Pipeline with orDone)

Условие:
- Источник логов: канал, генерирующий записи бесконечно.
- 3 стадии обработки: parse -> enrich (добавить timestamp, level) -> format.
- Каждая стадия обёрнута в orDone для корректной отмены.
- Через 2 секунды срабатывает cancel.
- Показать, что все стадии корректно завершились.
- Показать, сколько логов обработано до отмены.
- Ни одна горутина не должна утечь (проверить runtime.NumGoroutine до и после).

Паттерн: orDone — обёртка над каналом, позволяющая прервать чтение при отмене контекста.
*/

package main

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"time"
)

// LogEntry — сырая запись лога (непарсированная строка)
type LogEntry struct {
	Raw string
	ID  int
}

// ParsedLog — результат парсинга
type ParsedLog struct {
	ID      int
	Message string
	Source  string
}

// EnrichedLog — лог с добавленными полями
type EnrichedLog struct {
	ID        int
	Message   string
	Source    string
	Timestamp time.Time
	Level     string
}

// FormattedLog — финальный отформатированный лог
type FormattedLog struct {
	ID     int
	Output string
}

// orDone — универсальная обёртка: читает из входного канала, но прекращает при отмене контекста.
// Возвращает канал, из которого можно безопасно читать через range.
func orDone[T any](ctx context.Context, in <-chan T) <-chan T {
	out := make(chan T)
	go func() {
		defer close(out)
		for {
			select {
			case <-ctx.Done():
				return
			case val, ok := <-in:
				if !ok {
					return
				}
				select {
				case out <- val:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return out
}

// generateLogs — бесконечный источник логов. Завершается при отмене контекста.
func generateLogs(ctx context.Context) <-chan LogEntry {
	out := make(chan LogEntry)
	go func() {
		defer close(out)
		id := 0
		sources := []string{"auth", "api", "db", "cache", "scheduler"}
		for {
			id++
			entry := LogEntry{
				Raw: fmt.Sprintf("[%s] событие #%d произошло", sources[id%len(sources)], id),
				ID:  id,
			}
			select {
			case out <- entry:
			case <-ctx.Done():
				fmt.Println("  [генератор] остановлен")
				return
			}
			// Небольшая задержка для имитации реального потока
			time.Sleep(5 * time.Millisecond)
		}
	}()
	return out
}

// stageParse — стадия парсинга: извлекает источник и сообщение из сырой строки
func stageParse(ctx context.Context, in <-chan LogEntry, count *atomic.Int64) <-chan ParsedLog {
	out := make(chan ParsedLog)
	go func() {
		defer close(out)
		defer fmt.Println("  [parse] стадия завершена")
		for entry := range orDone(ctx, in) {
			parsed := ParsedLog{
				ID:      entry.ID,
				Message: entry.Raw,
				Source:  fmt.Sprintf("src-%d", entry.ID%5),
			}
			count.Add(1)
			select {
			case out <- parsed:
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}

// stageEnrich — стадия обогащения: добавляет timestamp и level
func stageEnrich(ctx context.Context, in <-chan ParsedLog, count *atomic.Int64) <-chan EnrichedLog {
	out := make(chan EnrichedLog)
	levels := []string{"INFO", "WARN", "ERROR", "DEBUG"}
	go func() {
		defer close(out)
		defer fmt.Println("  [enrich] стадия завершена")
		for parsed := range orDone(ctx, in) {
			enriched := EnrichedLog{
				ID:        parsed.ID,
				Message:   parsed.Message,
				Source:    parsed.Source,
				Timestamp: time.Now(),
				Level:     levels[parsed.ID%len(levels)],
			}
			count.Add(1)
			select {
			case out <- enriched:
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}

// stageFormat — стадия форматирования: формирует итоговую строку
func stageFormat(ctx context.Context, in <-chan EnrichedLog, count *atomic.Int64) <-chan FormattedLog {
	out := make(chan FormattedLog)
	go func() {
		defer close(out)
		defer fmt.Println("  [format] стадия завершена")
		for enriched := range orDone(ctx, in) {
			formatted := FormattedLog{
				ID: enriched.ID,
				Output: fmt.Sprintf("%s [%s] %s | %s",
					enriched.Timestamp.Format("15:04:05.000"),
					enriched.Level,
					enriched.Source,
					enriched.Message,
				),
			}
			count.Add(1)
			select {
			case out <- formatted:
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}

func main() {
	fmt.Println("=== Конвейер логов с graceful drain ===\n")

	// Замеряем количество горутин до запуска
	goroutinesBefore := runtime.NumGoroutine()
	fmt.Printf("Горутин до запуска: %d\n", goroutinesBefore)

	// Контекст с отменой через 2 секунды
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Счётчики обработанных логов на каждой стадии
	var parseCount, enrichCount, formatCount atomic.Int64

	// Строим конвейер: generate -> parse -> enrich -> format
	logs := generateLogs(ctx)
	parsed := stageParse(ctx, logs, &parseCount)
	enriched := stageEnrich(ctx, parsed, &enrichCount)
	formatted := stageFormat(ctx, enriched, &formatCount)

	// Читаем финальные результаты из конвейера
	var totalProcessed int
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for f := range formatted {
			totalProcessed++
			// Выводим каждый 50-й лог, чтобы не засорять вывод
			if totalProcessed%50 == 1 {
				fmt.Printf("  лог #%d: %s\n", f.ID, f.Output)
			}
		}
	}()

	// Ждём завершения потребителя (канал formatted закроется после отмены)
	wg.Wait()

	// Даём горутинам время завершиться
	time.Sleep(100 * time.Millisecond)

	fmt.Printf("\n--- Итоги ---\n")
	fmt.Printf("Всего обработано логов: %d\n", totalProcessed)
	fmt.Printf("  Стадия parse:   %d\n", parseCount.Load())
	fmt.Printf("  Стадия enrich:  %d\n", enrichCount.Load())
	fmt.Printf("  Стадия format:  %d\n", formatCount.Load())

	// Проверяем, что горутины не утекли
	goroutinesAfter := runtime.NumGoroutine()
	fmt.Printf("\nГорутин после завершения: %d (было: %d)\n", goroutinesAfter, goroutinesBefore)
	if goroutinesAfter <= goroutinesBefore+1 {
		fmt.Println("Утечек горутин не обнаружено!")
	} else {
		fmt.Printf("ВНИМАНИЕ: возможная утечка горутин (+%d)\n", goroutinesAfter-goroutinesBefore)
	}
}
