/*
=============================================================================
 ПАТТЕРН: Timeout & Cancellation (Таймауты и отмена операций)
=============================================================================

 СУТЬ ПАТТЕРНА:
   Управление временем жизни конкурентных операций через пакет context.
   Мы можем задать таймаут (context.WithTimeout), дедлайн
   (context.WithDeadline) или ручную отмену (context.WithCancel).
   При отмене родительского контекста автоматически отменяются все дочерние —
   это называется каскадная отмена (cascade cancellation).

 КОГДА ИСПОЛЬЗОВАТЬ:
   - HTTP-запросы к внешним сервисам с ограничением по времени
   - Параллельный поиск: запускаем N горутин, берём первый результат,
     отменяем остальные
   - Любая долгая операция, которую нужно прервать по сигналу
   - Микросервисная архитектура: propagation таймаутов между сервисами

 РЕАЛЬНЫЕ ПРИМЕНЕНИЯ:
   - gRPC: контекст передаётся между сервисами, таймаут каскадируется
   - database/sql: все методы принимают context для отмены запросов
   - net/http: Request.Context() позволяет клиенту отменить запрос
   - Параллельный поиск по нескольким бэкендам (Google, Bing, Yahoo)

 КЛЮЧЕВЫЕ ПРИНЦИПЫ:
   1. Всегда вызывай cancel() через defer — иначе утечка горутин
   2. Проверяй ctx.Done() в select внутри рабочих горутин
   3. Родительский контекст отменён → все дочерние тоже отменены
   4. context.WithTimeout = context.WithDeadline с относительным временем

 Go 1.22: используем range по числу, безопасные переменные цикла.
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

// SearchResult — результат поиска от одного "движка"
type SearchResult struct {
	Engine  string        // название движка
	Result  string        // найденный результат
	Latency time.Duration // задержка ответа
}

// search имитирует поиск по одному движку.
// Горутина уважает отмену контекста: при ctx.Done() немедленно завершается.
func search(ctx context.Context, engine string, query string) (SearchResult, error) {
	// Имитируем случайную задержку от 50 до 500 мс
	latency := time.Duration(50+rand.IntN(450)) * time.Millisecond

	select {
	case <-time.After(latency):
		// Поиск завершился успешно
		return SearchResult{
			Engine:  engine,
			Result:  fmt.Sprintf("Результат от %s по запросу %q", engine, query),
			Latency: latency,
		}, nil

	case <-ctx.Done():
		// Контекст отменён (таймаут или ручная отмена) —
		// немедленно прекращаем работу и освобождаем ресурсы
		return SearchResult{}, ctx.Err()
	}
}

// parallelSearch запускает поиск по нескольким движкам одновременно.
// Возвращает ПЕРВЫЙ успешный результат и отменяет остальные горутины.
func parallelSearch(ctx context.Context, query string, engines []string) (SearchResult, error) {
	// Создаём дочерний контекст с ручной отменой —
	// при получении первого результата отменяем все остальные горутины
	ctx, cancel := context.WithCancel(ctx)
	defer cancel() // гарантируем очистку при любом исходе

	// Канал для результатов: буферизованный на len(engines),
	// чтобы горутины не зависли при отправке после отмены
	resultCh := make(chan SearchResult, len(engines))
	errCh := make(chan error, len(engines))

	// Запускаем горутину на каждый поисковый движок
	for _, engine := range engines {
		go func() {
			result, err := search(ctx, engine, query)
			if err != nil {
				errCh <- err
				return
			}
			resultCh <- result
		}()
	}

	// Ждём первый успешный результат или отмену всех
	var lastErr error
	for range len(engines) {
		select {
		case result := <-resultCh:
			// Получили первый результат — cancel() отменит оставшиеся горутины
			fmt.Printf("  [победитель] %s ответил за %v\n", result.Engine, result.Latency)
			return result, nil

		case err := <-errCh:
			lastErr = err
			// Продолжаем ждать — может другой движок ещё ответит

		case <-ctx.Done():
			// Внешний таймаут истёк
			return SearchResult{}, ctx.Err()
		}
	}

	// Все движки вернули ошибки
	return SearchResult{}, fmt.Errorf("все движки завершились с ошибкой: %w", lastErr)
}

// demonstrateTimeoutBasics показывает базовое использование WithTimeout
func demonstrateTimeoutBasics() {
	fmt.Println("=== 1. Базовый context.WithTimeout ===")

	// Создаём контекст с таймаутом 200 мс
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel() // ВСЕГДА вызывай defer cancel()!

	// Имитируем медленную операцию (300 мс)
	select {
	case <-time.After(300 * time.Millisecond):
		fmt.Println("  Операция завершена (не должно произойти)")
	case <-ctx.Done():
		fmt.Printf("  Операция отменена: %v\n", ctx.Err())
		// Выведет: context deadline exceeded
	}
	fmt.Println()
}

// demonstrateCascadeCancel демонстрирует каскадную отмену контекстов
func demonstrateCascadeCancel() {
	fmt.Println("=== 2. Каскадная отмена (parent → children) ===")

	// Родительский контекст
	parentCtx, parentCancel := context.WithCancel(context.Background())

	// Дочерний контекст 1 (с таймаутом)
	child1Ctx, child1Cancel := context.WithTimeout(parentCtx, 5*time.Second)
	defer child1Cancel()

	// Дочерний контекст 2 (с ручной отменой)
	child2Ctx, child2Cancel := context.WithCancel(parentCtx)
	defer child2Cancel()

	// Внук (дочерний от child1)
	grandchildCtx, grandchildCancel := context.WithCancel(child1Ctx)
	defer grandchildCancel()

	var wg sync.WaitGroup

	// Запускаем горутины, каждая слушает свой контекст
	contexts := map[string]context.Context{
		"child1":     child1Ctx,
		"child2":     child2Ctx,
		"grandchild": grandchildCtx,
	}

	for name, ctx := range contexts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-ctx.Done()
			fmt.Printf("  [%s] отменён: %v\n", name, ctx.Err())
		}()
	}

	// Отменяем родительский контекст — все дочерние отменятся
	fmt.Println("  Отменяем родительский контекст...")
	parentCancel()

	wg.Wait()
	fmt.Println("  Все горутины завершились!")
	fmt.Println()
}

// demonstrateParallelSearchWithTimeout — главный пример:
// параллельный поиск с общим таймаутом
func demonstrateParallelSearchWithTimeout() {
	fmt.Println("=== 3. Параллельный поиск с таймаутом ===")

	engines := []string{"Google", "Yandex", "Bing", "DuckDuckGo", "Yahoo"}

	// Общий таймаут 300 мс на весь поиск
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()

	fmt.Printf("  Поиск по %d движкам (таймаут: 300 мс)...\n", len(engines))
	start := time.Now()

	result, err := parallelSearch(ctx, "Golang concurrency", engines)
	elapsed := time.Since(start)

	if err != nil {
		fmt.Printf("  Ошибка: %v (прошло %v)\n", err, elapsed)
	} else {
		fmt.Printf("  Лучший результат: %s (общее время: %v)\n", result.Result, elapsed)
	}
	fmt.Println()
}

// demonstrateResourceCleanup показывает корректную очистку ресурсов при отмене
func demonstrateResourceCleanup() {
	fmt.Println("=== 4. Очистка ресурсов при отмене ===")

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	var wg sync.WaitGroup

	// Запускаем воркеры, каждый из которых "держит ресурс"
	for i := range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()

			// Имитация: захватили ресурс (открыли файл, соединение с БД и т.д.)
			resourceName := fmt.Sprintf("ресурс-%d", i)
			fmt.Printf("  [воркер %d] захватил %s\n", i, resourceName)

			// Рабочий цикл: выполняем работу, пока контекст активен
			ticker := time.NewTicker(50 * time.Millisecond)
			defer ticker.Stop() // очистка таймера

			iterations := 0
			for {
				select {
				case <-ticker.C:
					iterations++
					// Имитация полезной работы
				case <-ctx.Done():
					// Контекст отменён — корректно освобождаем ресурс
					fmt.Printf("  [воркер %d] освободил %s после %d итераций (причина: %v)\n",
						i, resourceName, iterations, ctx.Err())
					return
				}
			}
		}()
	}

	wg.Wait()
	fmt.Println("  Все воркеры завершились, все ресурсы освобождены!")
	fmt.Println()
}

func main() {
	fmt.Println("╔══════════════════════════════════════════════════╗")
	fmt.Println("║   Timeout & Cancellation — продвинутые паттерны ║")
	fmt.Println("╚══════════════════════════════════════════════════╝")
	fmt.Println()

	demonstrateTimeoutBasics()
	demonstrateCascadeCancel()
	demonstrateParallelSearchWithTimeout()
	demonstrateResourceCleanup()

	fmt.Println("Программа завершена. Утечек горутин нет!")
}
