/*
ЗАДАЧА: HTTP-запрос с каскадной отменой

Имитация цепочки микросервисов: клиент → API Gateway → Service A → Service B.
Каждый уровень создаёт производный контекст. Если нижний уровень не успевает —
отмена каскадно поднимается наверх.

Требования:
  - Клиент устанавливает общий таймаут 2 секунды
  - API Gateway добавляет WithValue (request_id)
  - Service A делает WithTimeout(1s) для подзапроса к Service B
  - Service B "работает" 1.5 секунды (не успевает в таймаут Service A)
  - Показать каскадную отмену: B не успел → A получает ошибку → Gateway возвращает 504
  - Использовать context.Cause (Go 1.20) для получения причины отмены
*/

package main

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Пользовательские ошибки для каждого уровня
var (
	ErrServiceBTimeout = errors.New("Service B: превышено время обработки")
	ErrServiceAFailed  = errors.New("Service A: зависимый сервис не ответил")
	ErrGatewayTimeout  = errors.New("API Gateway: таймаут запроса (504)")
)

// Тип-ключ для context.Value (избегаем коллизий строковых ключей)
type ctxKey string

const requestIDKey ctxKey = "request_id"

// serviceB — самый "глубокий" сервис. Работает 1.5 секунды.
func serviceB(ctx context.Context) (string, error) {
	fmt.Println("  [Service B] Запрос получен. Начинаю тяжёлую обработку (1.5с)...")

	// Достаём request_id из контекста — он прошёл через всю цепочку
	reqID := ctx.Value(requestIDKey)
	fmt.Printf("  [Service B] request_id из контекста: %v\n", reqID)

	workDuration := 1500 * time.Millisecond

	select {
	case <-ctx.Done():
		// Контекст отменён до завершения работы
		cause := context.Cause(ctx)
		fmt.Printf("  [Service B] ОТМЕНА! ctx.Err()=%v, Cause=%v\n", ctx.Err(), cause)
		return "", fmt.Errorf("%w: %v", ErrServiceBTimeout, ctx.Err())

	case <-time.After(workDuration):
		// Успели выполнить работу (в нашем сценарии сюда НЕ попадём)
		fmt.Println("  [Service B] Обработка завершена успешно.")
		return `{"result": "данные из Service B"}`, nil
	}
}

// serviceA вызывает Service B с собственным таймаутом в 1 секунду.
func serviceA(ctx context.Context) (string, error) {
	fmt.Println(" [Service A] Запрос получен. Создаю подзапрос к Service B (таймаут 1с)...")

	// Service A даёт Service B только 1 секунду (меньше, чем нужно B)
	ctxB, cancelB := context.WithTimeoutCause(
		ctx,
		1*time.Second,
		ErrServiceAFailed, // причина отмены для context.Cause
	)
	defer cancelB()

	// Вызываем Service B
	result, err := serviceB(ctxB)
	if err != nil {
		fmt.Printf(" [Service A] Service B вернул ошибку: %v\n", err)
		return "", fmt.Errorf("%w: %v", ErrServiceAFailed, err)
	}

	return result, nil
}

// apiGateway — точка входа. Добавляет request_id в контекст.
func apiGateway(ctx context.Context) (int, string) {
	// Добавляем request_id в контекст — он будет доступен всем сервисам ниже
	requestID := "req-abc-123-xyz"
	ctxWithID := context.WithValue(ctx, requestIDKey, requestID)

	fmt.Printf("[API Gateway] Обработка запроса (request_id=%s)\n", requestID)

	// Вызываем Service A
	result, err := serviceA(ctxWithID)
	if err != nil {
		fmt.Printf("[API Gateway] Service A вернул ошибку: %v\n", err)

		// Проверяем, был ли это таймаут
		if errors.Is(ctx.Err(), context.DeadlineExceeded) ||
			errors.Is(err, ErrServiceAFailed) {
			return 504, fmt.Sprintf(`{"error": "Gateway Timeout", "request_id": "%s"}`, requestID)
		}
		return 500, fmt.Sprintf(`{"error": "Internal Server Error", "request_id": "%s"}`, requestID)
	}

	return 200, result
}

func main() {
	fmt.Println("=== HTTP-запрос с каскадной отменой (context) ===\n")

	// --- Сценарий 1: Service B не успевает ---
	fmt.Println(">>> СЦЕНАРИЙ 1: Service B не укладывается в таймаут Service A <<<\n")

	// Клиент устанавливает общий таймаут 2 секунды
	ctxClient, cancelClient := context.WithTimeoutCause(
		context.Background(),
		2*time.Second,
		ErrGatewayTimeout,
	)
	defer cancelClient()

	start := time.Now()

	// Запускаем цепочку: Client → Gateway → Service A → Service B
	statusCode, body := apiGateway(ctxClient)

	elapsed := time.Since(start)

	fmt.Printf("\n[Клиент] Получен ответ:\n")
	fmt.Printf("  HTTP статус: %d\n", statusCode)
	fmt.Printf("  Тело: %s\n", body)
	fmt.Printf("  Время ответа: %s\n", elapsed.Round(time.Millisecond))

	// --- Демонстрация context.Cause ---
	fmt.Println("\n--- Анализ причин отмены (context.Cause) ---")
	fmt.Printf("  ctx клиента: Err()=%v, Cause()=%v\n",
		ctxClient.Err(), context.Cause(ctxClient))

	// --- Сценарий 2: Успешный запрос (Service B быстрее) ---
	fmt.Println("\n>>> СЦЕНАРИЙ 2: Демонстрация цепочки контекстов <<<\n")

	ctx2 := context.Background()
	ctx2 = context.WithValue(ctx2, requestIDKey, "req-fast-001")

	// Создаём цепочку таймаутов
	ctx2, cancel2 := context.WithTimeout(ctx2, 5*time.Second)
	defer cancel2()

	// Проверяем, что значение проходит через всю цепочку
	ctx3, cancel3 := context.WithTimeout(ctx2, 3*time.Second)
	defer cancel3()

	ctx4 := context.WithValue(ctx3, ctxKey("trace_id"), "trace-789")

	fmt.Printf("  Из ctx4 можно достать:\n")
	fmt.Printf("    request_id = %v\n", ctx4.Value(requestIDKey))
	fmt.Printf("    trace_id   = %v\n", ctx4.Value(ctxKey("trace_id")))

	deadline, ok := ctx4.Deadline()
	if ok {
		fmt.Printf("    deadline   = через %s\n", time.Until(deadline).Round(time.Millisecond))
	}

	fmt.Println("\n=== Каскадная отмена продемонстрирована ===")
	fmt.Println("Порядок отмены: Service B таймаут → Service A ошибка → Gateway 504")
}
