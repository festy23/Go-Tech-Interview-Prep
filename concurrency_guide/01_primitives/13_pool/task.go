/*
ЗАДАЧА: Pool буферов для обработки логов

Имитация потока логов с использованием sync.Pool для переиспользования bytes.Buffer.
Сравнение производительности: с Pool vs без Pool (new каждый раз).

Требования:
  - Поток из 1000 лог-сообщений
  - sync.Pool для переиспользования bytes.Buffer
  - Цикл обработки: Get буфер → форматировать лог → "записать" → Reset → Put обратно
  - Сравнить аллокации с Pool и без Pool через runtime.MemStats (Mallocs)
  - 10 горутин обрабатывают логи конкурентно
*/

package main

import (
	"bytes"
	"fmt"
	"math/rand"
	"runtime"
	"sync"
	"time"
)

const totalMessages = 1000
const numWorkers = 10

// Уровни логирования для имитации
var logLevels = []string{"INFO", "WARN", "ERROR", "DEBUG", "TRACE"}

// Сообщения для имитации
var logMessages = []string{
	"запрос обработан",
	"подключение к БД установлено",
	"кеш обновлён",
	"файл загружен",
	"пользователь авторизован",
	"таймаут операции",
	"недостаточно памяти",
	"конфигурация перезагружена",
	"задача поставлена в очередь",
	"метрики отправлены",
}

// formatLog форматирует лог-сообщение в буфер
func formatLog(buf *bytes.Buffer, msgID int) {
	level := logLevels[rand.Intn(len(logLevels))]
	msg := logMessages[rand.Intn(len(logMessages))]
	ts := time.Now().Format("2006-01-02T15:04:05.000")

	fmt.Fprintf(buf, "[%s] %s | msg_id=%d | %s | src=worker pid=%d",
		ts, level, msgID, msg, rand.Intn(1000))

	// Имитация "записи" лога — просто читаем содержимое буфера
	_ = buf.Bytes()
}

// processWithPool обрабатывает сообщения с использованием sync.Pool
func processWithPool() {
	pool := &sync.Pool{
		New: func() any {
			// Создаём новый буфер, если в пуле пусто
			return new(bytes.Buffer)
		},
	}

	var wg sync.WaitGroup
	msgCh := make(chan int, totalMessages)

	// Заполняем канал сообщениями
	for i := range totalMessages {
		msgCh <- i
	}
	close(msgCh)

	// Запускаем воркеров
	for range numWorkers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for msgID := range msgCh {
				// Берём буфер из пула
				buf := pool.Get().(*bytes.Buffer)
				buf.Reset() // очищаем перед использованием

				formatLog(buf, msgID)

				// Возвращаем буфер в пул для переиспользования
				pool.Put(buf)
			}
		}()
	}
	wg.Wait()
}

// processWithoutPool обрабатывает сообщения БЕЗ пула (new каждый раз)
func processWithoutPool() {
	var wg sync.WaitGroup
	msgCh := make(chan int, totalMessages)

	for i := range totalMessages {
		msgCh <- i
	}
	close(msgCh)

	for range numWorkers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for msgID := range msgCh {
				// Каждый раз создаём новый буфер
				buf := new(bytes.Buffer)

				formatLog(buf, msgID)

				// Буфер уходит в GC — никакого переиспользования
				_ = buf
			}
		}()
	}
	wg.Wait()
}

// getMemStats возвращает текущую статистику аллокаций
func getMemStats() runtime.MemStats {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return m
}

func main() {
	fmt.Println("=== Pool буферов для обработки логов ===\n")
	fmt.Printf("Сообщений: %d | Воркеров: %d\n\n", totalMessages, numWorkers)

	// --- Тест БЕЗ пула ---
	runtime.GC() // принудительная сборка мусора перед замером
	beforeNoPool := getMemStats()
	startNoPool := time.Now()

	processWithoutPool()

	durationNoPool := time.Since(startNoPool)
	afterNoPool := getMemStats()

	allocsNoPool := afterNoPool.Mallocs - beforeNoPool.Mallocs
	bytesNoPool := afterNoPool.TotalAlloc - beforeNoPool.TotalAlloc

	// --- Тест С пулом ---
	runtime.GC()
	beforePool := getMemStats()
	startPool := time.Now()

	processWithPool()

	durationPool := time.Since(startPool)
	afterPool := getMemStats()

	allocsPool := afterPool.Mallocs - beforePool.Mallocs
	bytesPool := afterPool.TotalAlloc - beforePool.TotalAlloc

	// --- Результаты ---
	fmt.Println("=== СРАВНЕНИЕ РЕЗУЛЬТАТОВ ===")
	fmt.Println()

	fmt.Println("Без sync.Pool (new каждый раз):")
	fmt.Printf("  Время:       %s\n", durationNoPool.Round(time.Microsecond))
	fmt.Printf("  Аллокации:   %d\n", allocsNoPool)
	fmt.Printf("  Память:      %s\n", formatBytes(bytesNoPool))
	fmt.Println()

	fmt.Println("С sync.Pool (переиспользование буферов):")
	fmt.Printf("  Время:       %s\n", durationPool.Round(time.Microsecond))
	fmt.Printf("  Аллокации:   %d\n", allocsPool)
	fmt.Printf("  Память:      %s\n", formatBytes(bytesPool))
	fmt.Println()

	if allocsNoPool > allocsPool {
		saved := float64(allocsNoPool-allocsPool) / float64(allocsNoPool) * 100
		fmt.Printf("sync.Pool сэкономил ~%.0f%% аллокаций\n", saved)
	}
}

// formatBytes форматирует количество байт в человекочитаемый вид
func formatBytes(b uint64) string {
	switch {
	case b >= 1024*1024:
		return fmt.Sprintf("%.2f MB", float64(b)/(1024*1024))
	case b >= 1024:
		return fmt.Sprintf("%.2f KB", float64(b)/1024)
	default:
		return fmt.Sprintf("%d B", b)
	}
}
