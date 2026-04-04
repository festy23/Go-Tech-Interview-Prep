/*
	context.Context — передача дедлайнов, отмены и request-scoped данных

	Контекст — один из ключевых паттернов Go для управления жизненным циклом
	операций. Каждая функция, выполняющая I/O или длительную работу, должна
	принимать context.Context первым параметром.

	Основные функции:
	  - context.Background()   — корневой контекст (для main, init, тестов)
	  - context.TODO()         — заглушка «ещё не решили, какой контекст»
	  - WithCancel(parent)     — ручная отмена
	  - WithTimeout(parent, d) — автоматическая отмена через duration
	  - WithDeadline(parent, t)— автоматическая отмена в момент t
	  - WithValue(parent, k, v)— передача request-scoped данных

	Go 1.20+:
	  - WithCancelCause(parent) — отмена с причиной (error)
	  - context.Cause(ctx)      — получить причину отмены

	Go 1.21+:
	  - AfterFunc(ctx, f)          — запустить f при отмене контекста
	  - WithTimeoutCause(parent, d, err) — таймаут с причиной
	  - WithDeadlineCause(parent, t, err) — дедлайн с причиной

	Конвенции:
	  1. ctx — ПЕРВЫЙ параметр функции: func DoWork(ctx context.Context, ...)
	  2. Не храните контекст в структурах (кроме особых случаев вроде http.Request)
	  3. WithValue — только для request-scoped данных (trace ID, auth token),
	     НЕ для передачи бизнес-параметров
*/
package main

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// 1. WithCancel — ручная отмена
// ─────────────────────────────────────────────────────────────────────────────

func withCancelExample() {
	fmt.Println("=== WithCancel: ручная отмена ===")

	ctx, cancel := context.WithCancel(context.Background())

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := range 100 {
			select {
			case <-ctx.Done():
				// ctx.Err() возвращает context.Canceled
				fmt.Printf("  воркер остановлен на итерации %d: %v\n", i, ctx.Err())
				return
			default:
				time.Sleep(10 * time.Millisecond)
			}
		}
	}()

	time.Sleep(50 * time.Millisecond)
	cancel() // сигнализируем об отмене
	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. WithTimeout — автоматическая отмена по таймауту
// ─────────────────────────────────────────────────────────────────────────────

func withTimeoutExample() {
	fmt.Println("=== WithTimeout: автоматическая отмена ===")

	// Контекст автоматически отменится через 80ms
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel() // ВАЖНО: всегда вызывайте cancel для освобождения ресурсов

	// Имитируем «медленную операцию»
	select {
	case <-time.After(200 * time.Millisecond):
		fmt.Println("  операция завершена (не увидим)")
	case <-ctx.Done():
		fmt.Printf("  таймаут! ошибка: %v\n", ctx.Err()) // context.DeadlineExceeded
	}

	// Проверяем дедлайн
	if deadline, ok := ctx.Deadline(); ok {
		fmt.Printf("  дедлайн был установлен на: %v\n", deadline.Format(time.RFC3339Nano))
	}
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. WithDeadline — отмена к определённому моменту времени
// ─────────────────────────────────────────────────────────────────────────────

func withDeadlineExample() {
	fmt.Println("=== WithDeadline: отмена к моменту времени ===")

	deadline := time.Now().Add(60 * time.Millisecond)
	ctx, cancel := context.WithDeadline(context.Background(), deadline)
	defer cancel()

	start := time.Now()
	<-ctx.Done()
	elapsed := time.Since(start)

	fmt.Printf("  контекст отменён через %v: %v\n", elapsed.Round(time.Millisecond), ctx.Err())
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Go 1.20: WithCancelCause — отмена с причиной
// ─────────────────────────────────────────────────────────────────────────────

var errShutdown = errors.New("сервер выключается")

func withCancelCauseExample() {
	fmt.Println("=== WithCancelCause (Go 1.20+): отмена с причиной ===")

	ctx, cancel := context.WithCancelCause(context.Background())

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		<-ctx.Done()
		// context.Cause(ctx) возвращает причину отмены (наш custom error)
		fmt.Printf("  контекст отменён: err=%v, cause=%v\n", ctx.Err(), context.Cause(ctx))
	}()

	time.Sleep(30 * time.Millisecond)
	cancel(errShutdown) // передаём причину отмены
	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Go 1.21: WithTimeoutCause / WithDeadlineCause
// ─────────────────────────────────────────────────────────────────────────────

var errAPITimeout = errors.New("API не ответил вовремя")

func withTimeoutCauseExample() {
	fmt.Println("=== WithTimeoutCause (Go 1.21+) ===")

	ctx, cancel := context.WithTimeoutCause(
		context.Background(),
		50*time.Millisecond,
		errAPITimeout, // причина, если сработает таймаут
	)
	defer cancel()

	<-ctx.Done()
	// Если таймаут — Cause вернёт errAPITimeout (а не generic DeadlineExceeded)
	fmt.Printf("  err=%v, cause=%v\n", ctx.Err(), context.Cause(ctx))
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Go 1.21: AfterFunc — выполнить cleanup при отмене контекста
// ─────────────────────────────────────────────────────────────────────────────

func afterFuncExample() {
	fmt.Println("=== AfterFunc (Go 1.21+): cleanup при отмене ===")

	ctx, cancel := context.WithCancel(context.Background())

	var cleanupDone sync.WaitGroup
	cleanupDone.Add(1)

	// AfterFunc вызовет функцию в отдельной горутине при отмене ctx.
	// Возвращает stop-функцию для отмены регистрации.
	stop := context.AfterFunc(ctx, func() {
		defer cleanupDone.Done()
		fmt.Println("  [AfterFunc] контекст отменён — выполняю cleanup!")
	})
	_ = stop // stop() отменил бы AfterFunc, если вызвать до отмены ctx

	cancel() // отменяем → AfterFunc сработает
	cleanupDone.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. WithValue — request-scoped данные
// ─────────────────────────────────────────────────────────────────────────────

// contextKey — именованный тип для ключей контекста.
// Избегаем коллизий между пакетами.
type contextKey string

const (
	keyRequestID contextKey = "request_id"
	keyUserID    contextKey = "user_id"
)

func processRequest(ctx context.Context) {
	// Извлекаем значения из контекста
	reqID, _ := ctx.Value(keyRequestID).(string)
	userID, _ := ctx.Value(keyUserID).(int)
	fmt.Printf("  обработка: requestID=%s, userID=%d\n", reqID, userID)
}

func withValueExample() {
	fmt.Println("=== WithValue: request-scoped данные ===")

	ctx := context.Background()

	// Каждый WithValue создаёт новый «слой» контекста
	ctx = context.WithValue(ctx, keyRequestID, "req-abc-123")
	ctx = context.WithValue(ctx, keyUserID, 42)

	processRequest(ctx)

	fmt.Println()
	fmt.Println("  ВАЖНО: WithValue — только для request-scoped данных:")
	fmt.Println("    ✓ trace ID, request ID")
	fmt.Println("    ✓ auth token / user info")
	fmt.Println("    ✗ НЕ для бизнес-параметров (передавайте как аргументы функции)")
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Практика: HTTP-обработчик с таймаутом и отменой
// ─────────────────────────────────────────────────────────────────────────────

// fetchFromDB имитирует медленный запрос к БД.
func fetchFromDB(ctx context.Context, query string) (string, error) {
	// Имитируем работу, уважая контекст
	select {
	case <-time.After(100 * time.Millisecond):
		return fmt.Sprintf("результат для %q", query), nil
	case <-ctx.Done():
		return "", fmt.Errorf("запрос %q отменён: %w", query, ctx.Err())
	}
}

// callExternalAPI имитирует вызов внешнего API.
func callExternalAPI(ctx context.Context, endpoint string) (string, error) {
	select {
	case <-time.After(150 * time.Millisecond):
		return fmt.Sprintf("API ответ от %s", endpoint), nil
	case <-ctx.Done():
		return "", fmt.Errorf("API %s: %w", endpoint, ctx.Err())
	}
}

func httpHandlerExample() {
	fmt.Println("=== Практика: HTTP-обработчик с таймаутом ===")

	// Имитируем HTTP-запрос с таймаутом 120ms.
	// Клиент может отключиться (cancel) или истечёт дедлайн.
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Millisecond)
	defer cancel()

	// Запускаем параллельные подзапросы с тем же контекстом.
	// Если один истечёт по таймауту — все увидят отмену.
	type result struct {
		source string
		data   string
		err    error
	}

	ch := make(chan result, 2)

	go func() {
		data, err := fetchFromDB(ctx, "SELECT * FROM users")
		ch <- result{"DB", data, err}
	}()

	go func() {
		data, err := callExternalAPI(ctx, "/recommendations")
		ch <- result{"API", data, err}
	}()

	// Собираем результаты
	for range 2 {
		r := <-ch
		if r.err != nil {
			fmt.Printf("  %s: ОШИБКА — %v\n", r.source, r.err)
		} else {
			fmt.Printf("  %s: %s\n", r.source, r.data)
		}
	}
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Правильный select с ctx.Done()
// ─────────────────────────────────────────────────────────────────────────────

func selectWithContext() {
	fmt.Println("=== Правильный select с ctx.Done() ===")

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	ticker := time.NewTicker(30 * time.Millisecond)
	defer ticker.Stop()

	iteration := 0
	for {
		select {
		case <-ctx.Done():
			// Контекст отменён — выходим из цикла
			fmt.Printf("  выход: %v (после %d итераций)\n", ctx.Err(), iteration)
			fmt.Println()
			return
		case t := <-ticker.C:
			iteration++
			fmt.Printf("  тик %d: %v\n", iteration, t.Format("15:04:05.000"))
		}
	}
}

func main() {
	withCancelExample()
	withTimeoutExample()
	withDeadlineExample()
	withCancelCauseExample()
	withTimeoutCauseExample()
	afterFuncExample()
	withValueExample()
	httpHandlerExample()
	selectWithContext()
}
