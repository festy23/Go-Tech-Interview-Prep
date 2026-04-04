/*
=============================================================================
 ПАТТЕРН: Graceful Shutdown (корректное завершение)
=============================================================================

 СУТЬ ПАТТЕРНА:
   При получении сигнала завершения (SIGINT, SIGTERM) программа не
   обрывается мгновенно, а выполняет последовательность:
     1. Прекращает принимать новую работу
     2. Дожидается завершения текущих задач (in-flight)
     3. Освобождает ресурсы (закрывает соединения, файлы и т.д.)
     4. Завершается с кодом 0

   Если graceful shutdown не укладывается в таймаут — принудительный выход.

 КЛЮЧЕВЫЕ КОМПОНЕНТЫ:
   - signal.Notify: перехват SIGINT/SIGTERM
   - context.WithCancel: главный контекст приложения
   - sync.WaitGroup: ожидание завершения in-flight задач
   - Таймаут на shutdown: если не успели — force exit

 РЕАЛЬНЫЕ ПРИМЕНЕНИЯ:
   - HTTP-серверы: http.Server.Shutdown(ctx) (стандартная библиотека)
   - gRPC-серверы: server.GracefulStop()
   - Воркеры очередей (Kafka/RabbitMQ): дочитать текущий batch, закоммитить
   - Базы данных: db.Close() для корректного закрытия пула соединений
   - Kubernetes: Pod termination grace period (SIGTERM → 30s → SIGKILL)

 Go 1.22: range по числу, безопасные переменные цикла,
          signal.NotifyContext для упрощения.
=============================================================================
*/

package main

import (
	"context"
	"fmt"
	"math/rand/v2"
	"os"
	"os/signal"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// Job — единица работы
type Job struct {
	ID       int
	Duration time.Duration // сколько "выполняется"
}

// WorkerPool — пул воркеров с поддержкой graceful shutdown
type WorkerPool struct {
	jobCh       chan Job        // канал входящих задач
	wg          sync.WaitGroup // ожидание завершения воркеров
	numWorkers  int
	processed   atomic.Int64   // счётчик обработанных задач
	rejected    atomic.Int64   // счётчик отклонённых задач
	accepting   atomic.Bool    // принимаем ли новые задачи
}

// NewWorkerPool создаёт пул воркеров
func NewWorkerPool(numWorkers, queueSize int) *WorkerPool {
	wp := &WorkerPool{
		jobCh:      make(chan Job, queueSize),
		numWorkers: numWorkers,
	}
	wp.accepting.Store(true)
	return wp
}

// Start запускает воркеров. Каждый воркер слушает jobCh и ctx.Done().
func (wp *WorkerPool) Start(ctx context.Context) {
	for i := range wp.numWorkers {
		wp.wg.Add(1)
		go func() {
			defer wp.wg.Done()
			fmt.Printf("  [воркер %d] запущен\n", i)

			for {
				select {
				case job, ok := <-wp.jobCh:
					if !ok {
						// Канал закрыт — больше задач не будет
						fmt.Printf("  [воркер %d] канал закрыт, завершаюсь\n", i)
						return
					}
					// Выполняем задачу (может быть прервана контекстом)
					wp.processJob(ctx, i, job)

				case <-ctx.Done():
					// Контекст отменён, но нужно дочитать оставшиеся задачи из канала!
					// Это и есть "drain" — обработка in-flight задач.
					fmt.Printf("  [воркер %d] контекст отменён, дочитываю очередь...\n", i)
					wp.drainQueue(i)
					return
				}
			}
		}()
	}
}

// processJob обрабатывает одну задачу
func (wp *WorkerPool) processJob(_ context.Context, workerID int, job Job) {
	fmt.Printf("  [воркер %d] обрабатывает задачу #%d (длительность: %v)\n",
		workerID, job.ID, job.Duration)

	// Имитация работы
	time.Sleep(job.Duration)

	wp.processed.Add(1)
	fmt.Printf("  [воркер %d] задача #%d завершена ✓\n", workerID, job.ID)
}

// drainQueue дочитывает оставшиеся задачи из буфера канала
func (wp *WorkerPool) drainQueue(workerID int) {
	for {
		select {
		case job, ok := <-wp.jobCh:
			if !ok {
				return
			}
			fmt.Printf("  [воркер %d] drain: задача #%d\n", workerID, job.ID)
			time.Sleep(job.Duration)
			wp.processed.Add(1)
		default:
			// Буфер пуст
			return
		}
	}
}

// Submit отправляет задачу в пул. Возвращает false если пул не принимает.
func (wp *WorkerPool) Submit(job Job) bool {
	if !wp.accepting.Load() {
		wp.rejected.Add(1)
		return false
	}

	select {
	case wp.jobCh <- job:
		return true
	default:
		// Буфер полон
		wp.rejected.Add(1)
		return false
	}
}

// StopAccepting прекращает приём новых задач
func (wp *WorkerPool) StopAccepting() {
	wp.accepting.Store(false)
}

// Wait ожидает завершения всех воркеров
func (wp *WorkerPool) Wait() {
	close(wp.jobCh) // сигнализируем воркерам, что задач больше не будет
	wp.wg.Wait()
}

// Stats возвращает статистику
func (wp *WorkerPool) Stats() (processed, rejected int64) {
	return wp.processed.Load(), wp.rejected.Load()
}

// Server имитирует HTTP-подобный сервер
type Server struct {
	pool *WorkerPool
}

// NewServer создаёт сервер
func NewServer(numWorkers, queueSize int) *Server {
	return &Server{
		pool: NewWorkerPool(numWorkers, queueSize),
	}
}

func main() {
	fmt.Println("╔══════════════════════════════════════════════════╗")
	fmt.Println("║   Graceful Shutdown — корректное завершение      ║")
	fmt.Println("╚══════════════════════════════════════════════════╝")
	fmt.Println()

	// ─── Шаг 1: Перехват сигналов ОС ────────────────────────────
	// signal.NotifyContext (Go 1.16+) — удобная обёртка,
	// создаёт контекст, который отменяется при получении сигнала.
	ctx, stop := signal.NotifyContext(context.Background(),
		syscall.SIGINT,  // Ctrl+C
		syscall.SIGTERM, // kill / Kubernetes
	)
	defer stop()

	fmt.Println("=== Сервер запускается ===")
	fmt.Println("  Нажмите Ctrl+C для graceful shutdown")
	fmt.Println("  (или подождите — через 3 секунды автоматический стоп)")
	fmt.Println()

	// ─── Шаг 2: Создаём и запускаем сервер ──────────────────────
	server := NewServer(3, 10) // 3 воркера, очередь на 10 задач
	server.pool.Start(ctx)

	// ─── Шаг 3: Генератор нагрузки (имитация входящих запросов) ─
	// Запускаем в отдельной горутине
	go func() {
		jobID := 0
		for {
			select {
			case <-ctx.Done():
				return
			case <-time.After(100 * time.Millisecond):
				jobID++
				job := Job{
					ID:       jobID,
					Duration: time.Duration(100+rand.IntN(300)) * time.Millisecond,
				}
				if ok := server.pool.Submit(job); ok {
					fmt.Printf("  [генератор] задача #%d добавлена\n", job.ID)
				} else {
					fmt.Printf("  [генератор] задача #%d отклонена (сервер не принимает)\n", job.ID)
				}
			}
		}
	}()

	// ─── Автоматический стоп через 3 секунды (для демонстрации) ─
	// В реальном приложении этого не будет — ждём только сигнал.
	go func() {
		time.Sleep(3 * time.Second)
		fmt.Println("\n  >>> Автоматический стоп (имитация SIGTERM) <<<")
		// Имитируем сигнал через отправку в канал
		p, _ := os.FindProcess(os.Getpid())
		p.Signal(syscall.SIGTERM)
	}()

	// ─── Шаг 4: Ждём сигнал (блокируемся) ──────────────────────
	<-ctx.Done()
	stop() // сбрасываем перехват, повторный Ctrl+C = force kill

	fmt.Println()
	fmt.Println("=== Начинаем Graceful Shutdown ===")

	// ─── Шаг 5: Shutdown с таймаутом ────────────────────────────
	shutdownCtx, shutdownCancel := context.WithTimeout(
		context.Background(), 5*time.Second,
	)
	defer shutdownCancel()

	// Прекращаем приём новых задач
	server.pool.StopAccepting()
	fmt.Println("  [shutdown] Новые задачи больше не принимаются")

	// Ждём завершения in-flight задач с таймаутом
	doneCh := make(chan struct{})
	go func() {
		server.pool.Wait()
		close(doneCh)
	}()

	select {
	case <-doneCh:
		fmt.Println("  [shutdown] Все воркеры завершились корректно")
	case <-shutdownCtx.Done():
		fmt.Println("  [shutdown] ТАЙМАУТ! Принудительное завершение")
	}

	// ─── Шаг 6: Очистка ресурсов ────────────────────────────────
	fmt.Println()
	fmt.Println("=== Очистка ресурсов ===")
	fmt.Println("  [cleanup] Закрытие соединений с БД... done")
	fmt.Println("  [cleanup] Flush логов... done")
	fmt.Println("  [cleanup] Закрытие файлов... done")

	// ─── Финальная статистика ────────────────────────────────────
	processed, rejected := server.pool.Stats()
	fmt.Println()
	fmt.Println("=== Финальная статистика ===")
	fmt.Printf("  Обработано задач: %d\n", processed)
	fmt.Printf("  Отклонено задач: %d\n", rejected)
	fmt.Println()
	fmt.Println("Сервер корректно завершён. Код выхода: 0")
}
