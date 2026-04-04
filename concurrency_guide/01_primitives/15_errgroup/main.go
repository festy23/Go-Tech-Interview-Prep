/*
	errgroup.Group — WaitGroup + propagation ошибок

	Пакет golang.org/x/sync/errgroup предоставляет удобную обёртку
	над sync.WaitGroup с поддержкой ошибок и контекста.

	Для установки выполните:
	  go get golang.org/x/sync/errgroup

	Основные возможности:
	  1. g.Go(func() error)    — запускает горутину, возвращающую ошибку.
	  2. g.Wait() error        — ждёт все горутины, возвращает ПЕРВУЮ ошибку.
	  3. errgroup.WithContext() — создаёт группу с shared-контекстом.
	     Контекст отменяется при первой ошибке → fail-fast паттерн.
	  4. g.SetLimit(n)         — ограничение параллелизма (семафор).
	  5. g.TryGo(func() error) — запускает, если есть свободный слот.

	Go 1.22: используем range over int, безопасные переменные цикла.
*/
package main

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"time"

	"golang.org/x/sync/errgroup"
)

// ─────────────────────────────────────────────────────────────────────────────
// 1. Базовый errgroup: параллельные задачи с ошибками
// ─────────────────────────────────────────────────────────────────────────────

func basicErrgroup() {
	fmt.Println("=== Базовый errgroup ===")

	var g errgroup.Group

	urls := []string{
		"https://api.example.com/users",
		"https://api.example.com/orders",
		"https://api.example.com/products",
	}

	for _, url := range urls {
		g.Go(func() error {
			// Go 1.22: url безопасно захвачена
			return fakeFetch(url)
		})
	}

	// Wait ждёт все горутины и возвращает первую ошибку (или nil)
	if err := g.Wait(); err != nil {
		fmt.Printf("  ошибка: %v\n", err)
	} else {
		fmt.Println("  все запросы успешны")
	}
	fmt.Println()
}

// fakeFetch имитирует HTTP-запрос.
func fakeFetch(url string) error {
	time.Sleep(time.Duration(rand.IntN(100)) * time.Millisecond)
	fmt.Printf("  загружен: %s\n", url)
	return nil
}

// fakeFetchWithError имитирует запрос, который может упасть.
func fakeFetchWithError(url string, shouldFail bool) error {
	time.Sleep(time.Duration(rand.IntN(100)) * time.Millisecond)
	if shouldFail {
		return fmt.Errorf("ошибка загрузки %s", url)
	}
	fmt.Printf("  загружен: %s\n", url)
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. errgroup.WithContext — fail-fast при первой ошибке
// ─────────────────────────────────────────────────────────────────────────────

func errgroupWithContext() {
	fmt.Println("=== WithContext: fail-fast ===")

	// WithContext создаёт группу + derived-контекст.
	// При первой ошибке контекст отменяется → другие горутины могут проверить ctx.
	g, ctx := errgroup.WithContext(context.Background())

	urls := []string{
		"https://api.example.com/fast",
		"https://api.example.com/will-fail",
		"https://api.example.com/slow",
	}

	for i, url := range urls {
		shouldFail := i == 1 // вторая задача упадёт
		g.Go(func() error {
			// Проверяем, не отменён ли контекст другой горутиной
			select {
			case <-ctx.Done():
				fmt.Printf("  %s: отменена (контекст закрыт)\n", url)
				return ctx.Err()
			default:
			}
			return fakeFetchWithError(url, shouldFail)
		})
	}

	if err := g.Wait(); err != nil {
		fmt.Printf("  группа завершилась с ошибкой: %v\n", err)
	}
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SetLimit — ограничение параллелизма
// ─────────────────────────────────────────────────────────────────────────────

func errgroupSetLimit() {
	fmt.Println("=== SetLimit: ограничение параллелизма ===")

	var g errgroup.Group
	g.SetLimit(3) // максимум 3 одновременных горутины

	for i := range 10 {
		g.Go(func() error {
			fmt.Printf("  задача %d: старт\n", i)
			time.Sleep(50 * time.Millisecond)
			fmt.Printf("  задача %d: готово\n", i)
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		fmt.Printf("  ошибка: %v\n", err)
	}
	fmt.Println("  все 10 задач выполнены (макс. 3 одновременно)")
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Практика: параллельные API-вызовы со сбором результатов
// ─────────────────────────────────────────────────────────────────────────────

type apiResponse struct {
	endpoint string
	data     string
}

func parallelAPIWithResults() {
	fmt.Println("=== Практика: параллельные API-вызовы + сбор результатов ===")

	endpoints := []string{"/users", "/orders", "/products", "/stats"}
	results := make([]apiResponse, len(endpoints))

	g, ctx := errgroup.WithContext(context.Background())
	g.SetLimit(2) // не более 2 параллельных запросов

	for i, ep := range endpoints {
		g.Go(func() error {
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}

			// Имитация API-вызова
			time.Sleep(time.Duration(rand.IntN(50)) * time.Millisecond)

			// Безопасно: каждая горутина пишет в свой индекс
			results[i] = apiResponse{
				endpoint: ep,
				data:     fmt.Sprintf("данные от %s", ep),
			}
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		fmt.Printf("  ошибка: %v\n", err)
		return
	}

	for _, r := range results {
		fmt.Printf("  %s → %s\n", r.endpoint, r.data)
	}
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Практика: pipeline с errgroup
// ─────────────────────────────────────────────────────────────────────────────

func errgroupPipeline() {
	fmt.Println("=== Pipeline: генерация → обработка → вывод ===")

	g, ctx := errgroup.WithContext(context.Background())

	// Канал между стадиями
	numbers := make(chan int, 5)
	results := make(chan string, 5)

	// Стадия 1: генерация чисел
	g.Go(func() error {
		defer close(numbers)
		for i := range 5 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case numbers <- i:
			}
		}
		return nil
	})

	// Стадия 2: обработка (удвоение)
	g.Go(func() error {
		defer close(results)
		for n := range numbers {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case results <- fmt.Sprintf("%d×2=%d", n, n*2):
			}
		}
		return nil
	})

	// Стадия 3: вывод
	g.Go(func() error {
		for r := range results {
			fmt.Printf("  результат: %s\n", r)
		}
		return nil
	})

	if err := g.Wait(); err != nil {
		fmt.Printf("  pipeline ошибка: %v\n", err)
	}
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Обработка нескольких ошибок (errgroup + errors.Join)
// ─────────────────────────────────────────────────────────────────────────────

func multipleErrors() {
	fmt.Println("=== Сбор нескольких ошибок ===")
	fmt.Println("  errgroup.Wait() возвращает только ПЕРВУЮ ошибку.")
	fmt.Println("  Для сбора всех ошибок — используем канал:")
	fmt.Println()

	errCh := make(chan error, 5)
	var g errgroup.Group

	for i := range 5 {
		g.Go(func() error {
			if i%2 == 0 {
				err := fmt.Errorf("задача %d упала", i)
				errCh <- err
				return err
			}
			return nil
		})
	}

	_ = g.Wait()
	close(errCh)

	// Собираем все ошибки
	var errs []error
	for e := range errCh {
		errs = append(errs, e)
	}

	if combined := errors.Join(errs...); combined != nil {
		fmt.Printf("  все ошибки:\n%v\n", combined)
	}
	fmt.Println()
}

func main() {
	basicErrgroup()
	errgroupWithContext()
	errgroupSetLimit()
	parallelAPIWithResults()
	errgroupPipeline()
	multipleErrors()
}
