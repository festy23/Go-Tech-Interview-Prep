/*
Задача: Микросервис с graceful shutdown

Условие:
- Worker pool из 5 воркеров обрабатывает "запросы" из очереди.
- Health checker горутина (проверяет раз в секунду, пишет статус).
- Metrics collector горутина (считает обработанные запросы).
- Через 3 секунды — имитация SIGTERM (через timer).
- Порядок shutdown:
  1) перестать принимать новые запросы,
  2) дождаться завершения in-flight запросов,
  3) остановить health checker,
  4) flush метрик,
  5) выход.
- Таймаут на shutdown: 5 секунд, после чего — force kill.
- Показать лог каждого шага shutdown.

Паттерн: многофазный graceful shutdown с упорядоченным завершением компонентов.
*/

package main

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"
)

// MetricsCollector собирает метрики обработанных запросов
type MetricsCollector struct {
	processed atomic.Int64
	failed    atomic.Int64
	mu        sync.Mutex
	logs      []string
}

// Record фиксирует успешную обработку
func (m *MetricsCollector) Record(workerID int, requestID int) {
	m.processed.Add(1)
	m.mu.Lock()
	m.logs = append(m.logs, fmt.Sprintf("worker-%d обработал запрос #%d", workerID, requestID))
	m.mu.Unlock()
}

// RecordFailure фиксирует неудачную обработку
func (m *MetricsCollector) RecordFailure() {
	m.failed.Add(1)
}

// Flush выводит итоговые метрики (имитация отправки в систему мониторинга)
func (m *MetricsCollector) Flush() {
	fmt.Printf("    [метрики] Обработано: %d, Ошибок: %d\n",
		m.processed.Load(), m.failed.Load())
	m.mu.Lock()
	fmt.Printf("    [метрики] Всего записей в логе: %d\n", len(m.logs))
	m.mu.Unlock()
}

// worker — обработчик запросов из очереди
func worker(id int, ctx context.Context, jobs <-chan int, wg *sync.WaitGroup, metrics *MetricsCollector) {
	defer wg.Done()
	rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(id)))
	for {
		select {
		case job, ok := <-jobs:
			if !ok {
				// Канал закрыт — новых запросов не будет
				fmt.Printf("    [worker-%d] канал закрыт, завершаюсь\n", id)
				return
			}
			// Имитация обработки запроса (50-200мс)
			duration := time.Duration(50+rng.Intn(150)) * time.Millisecond
			time.Sleep(duration)
			metrics.Record(id, job)
			if job%20 == 0 {
				fmt.Printf("    [worker-%d] обработал запрос #%d (%v)\n", id, job, duration)
			}
		case <-ctx.Done():
			fmt.Printf("    [worker-%d] контекст отменён, завершаюсь\n", id)
			return
		}
	}
}

// healthChecker периодически проверяет "здоровье" сервиса
func healthChecker(ctx context.Context, done chan<- struct{}, metrics *MetricsCollector) {
	defer func() {
		fmt.Println("    [health] checker остановлен")
		done <- struct{}{}
	}()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			processed := metrics.processed.Load()
			fmt.Printf("    [health] статус: OK | обработано: %d\n", processed)
		case <-ctx.Done():
			return
		}
	}
}

// requestGenerator генерирует запросы в очередь
func requestGenerator(ctx context.Context, jobs chan<- int) {
	id := 0
	for {
		id++
		select {
		case jobs <- id:
		case <-ctx.Done():
			fmt.Printf("    [генератор] остановлен, последний ID: %d\n", id-1)
			return
		}
		time.Sleep(20 * time.Millisecond) // ~50 запросов в секунду
	}
}

func main() {
	fmt.Println("=== Микросервис с graceful shutdown ===\n")

	const numWorkers = 5
	const shutdownTimeout = 5 * time.Second

	metrics := &MetricsCollector{}
	jobs := make(chan int, 50) // буферизированная очередь запросов

	// Контекст для всего сервиса
	serviceCtx, serviceCancel := context.WithCancel(context.Background())

	// Контекст для health checker (отменяется отдельно, позже воркеров)
	healthCtx, healthCancel := context.WithCancel(context.Background())
	healthDone := make(chan struct{})

	// --- Запуск компонентов ---
	fmt.Println("[старт] Запускаем компоненты сервиса...")

	// 1. Запуск health checker
	go healthChecker(healthCtx, healthDone, metrics)
	fmt.Println("[старт] Health checker запущен")

	// 2. Запуск worker pool
	var workerWg sync.WaitGroup
	for i := 1; i <= numWorkers; i++ {
		workerWg.Add(1)
		go worker(i, serviceCtx, jobs, &workerWg, metrics)
	}
	fmt.Printf("[старт] Worker pool запущен (%d воркеров)\n", numWorkers)

	// 3. Запуск генератора запросов
	go requestGenerator(serviceCtx, jobs)
	fmt.Println("[старт] Генератор запросов запущен")
	fmt.Println()

	// --- Имитация SIGTERM через 3 секунды ---
	sigterm := time.NewTimer(3 * time.Second)
	<-sigterm.C
	fmt.Println("\n[SIGTERM] Получен сигнал завершения! Начинаем graceful shutdown...\n")

	// Таймаут на весь процесс shutdown
	shutdownTimer := time.NewTimer(shutdownTimeout)
	shutdownComplete := make(chan struct{})

	go func() {
		// === ШАГ 1: Перестаём принимать новые запросы ===
		fmt.Println("[shutdown 1/5] Останавливаем генератор запросов...")
		serviceCancel() // отменяет контекст генератора
		time.Sleep(50 * time.Millisecond)
		fmt.Println("[shutdown 1/5] Генератор остановлен")

		// === ШАГ 2: Дожидаемся обработки in-flight запросов ===
		fmt.Println("[shutdown 2/5] Закрываем очередь, ждём завершения in-flight запросов...")
		close(jobs) // закрываем канал — воркеры дочитают оставшиеся задачи
		workerWg.Wait()
		fmt.Println("[shutdown 2/5] Все воркеры завершены")

		// === ШАГ 3: Останавливаем health checker ===
		fmt.Println("[shutdown 3/5] Останавливаем health checker...")
		healthCancel()
		<-healthDone
		fmt.Println("[shutdown 3/5] Health checker остановлен")

		// === ШАГ 4: Flush метрик ===
		fmt.Println("[shutdown 4/5] Сохраняем метрики...")
		metrics.Flush()
		fmt.Println("[shutdown 4/5] Метрики сохранены")

		// === ШАГ 5: Завершение ===
		fmt.Println("[shutdown 5/5] Все компоненты остановлены")
		close(shutdownComplete)
	}()

	// Ожидаем завершения shutdown или таймаут
	select {
	case <-shutdownComplete:
		fmt.Println("\n=== Graceful shutdown завершён успешно ===")
	case <-shutdownTimer.C:
		fmt.Println("\n=== FORCE KILL: таймаут shutdown истёк! ===")
	}
}
