/*
ЗАДАЧА: Параллельная валидация данных

Параллельная валидация списка записей с помощью errgroup:
при первой ошибке — остальные горутины отменяются через контекст.

Требования:
  - Список из 10 "записей" для валидации
  - errgroup с SetLimit(3) — максимум 3 валидатора одновременно
  - errgroup.WithContext — при первой ошибке остальные отменяются
  - Каждый валидатор проверяет запись и может вернуть ошибку
  - Записи 3 и 7 — "битые" (вернут ошибку)
  - Показать, что после первой ошибки остальные горутины получают отменённый контекст

ПРИМЕЧАНИЕ: требуется внешний пакет golang.org/x/sync/errgroup
  go get golang.org/x/sync/errgroup
*/

package main

import (
	"context"
	"fmt"
	"math/rand"
	"sync/atomic"
	"time"

	"golang.org/x/sync/errgroup"
)

// Record — запись для валидации
type Record struct {
	ID    int
	Name  string
	Email string
	Score int
}

// Счётчики для статистики
var (
	validated atomic.Int64 // успешно провалидированных
	skipped   atomic.Int64 // пропущенных из-за отмены контекста
	failed    atomic.Int64 // завершившихся ошибкой
)

// validateRecord проверяет одну запись. Учитывает контекст для отмены.
func validateRecord(ctx context.Context, r Record) error {
	// Проверяем, не отменён ли контекст ДО начала работы
	select {
	case <-ctx.Done():
		skipped.Add(1)
		fmt.Printf("  [Запись %d] пропущена — контекст отменён: %v\n", r.ID, ctx.Err())
		return ctx.Err()
	default:
	}

	// Имитация валидации — разная длительность
	delay := time.Duration(100+rand.Intn(200)) * time.Millisecond
	fmt.Printf("  [Запись %d] \"%s\" — валидация началась (займёт %s)...\n",
		r.ID, r.Name, delay.Round(time.Millisecond))

	// Ждём с учётом контекста — если отменят, прервёмся досрочно
	select {
	case <-ctx.Done():
		skipped.Add(1)
		fmt.Printf("  [Запись %d] прервана во время работы — контекст отменён\n", r.ID)
		return ctx.Err()
	case <-time.After(delay):
		// Валидация "завершена" — проверяем правила
	}

	// Записи с ID 3 и 7 — "битые"
	if r.ID == 3 {
		failed.Add(1)
		return fmt.Errorf("запись %d (%s): невалидный email '%s'", r.ID, r.Name, r.Email)
	}
	if r.ID == 7 {
		failed.Add(1)
		return fmt.Errorf("запись %d (%s): score %d вне допустимого диапазона [0, 100]", r.ID, r.Name, r.Score)
	}

	validated.Add(1)
	fmt.Printf("  [Запись %d] \"%s\" — OK ✓\n", r.ID, r.Name)
	return nil
}

func main() {
	fmt.Println("=== Параллельная валидация данных (errgroup) ===\n")

	// Список записей для валидации
	records := []Record{
		{ID: 1, Name: "Иванов", Email: "ivanov@mail.ru", Score: 85},
		{ID: 2, Name: "Петров", Email: "petrov@yandex.ru", Score: 92},
		{ID: 3, Name: "Сидоров", Email: "не-email!!!", Score: 76},      // <-- битая
		{ID: 4, Name: "Козлова", Email: "kozlova@gmail.com", Score: 64},
		{ID: 5, Name: "Новикова", Email: "novikova@corp.io", Score: 88},
		{ID: 6, Name: "Морозов", Email: "morozov@test.com", Score: 71},
		{ID: 7, Name: "Волков", Email: "volkov@example.com", Score: -5}, // <-- битая
		{ID: 8, Name: "Соколова", Email: "sokolova@work.ru", Score: 95},
		{ID: 9, Name: "Лебедев", Email: "lebedev@domain.org", Score: 53},
		{ID: 10, Name: "Кузнецов", Email: "kuznetsov@inbox.ru", Score: 79},
	}

	fmt.Printf("Записей для валидации: %d\n", len(records))
	fmt.Println("Битые записи: #3, #7")
	fmt.Println("Лимит одновременных валидаторов: 3")
	fmt.Println()

	// errgroup.WithContext — при первой ошибке контекст отменяется
	g, ctx := errgroup.WithContext(context.Background())

	// Ограничиваем параллелизм — максимум 3 горутины одновременно
	g.SetLimit(3)

	start := time.Now()

	for _, rec := range records {
		rec := rec // захват переменной цикла (для Go < 1.22 безопасности)
		g.Go(func() error {
			return validateRecord(ctx, rec)
		})
	}

	// Ждём завершения всех горутин. Возвращается ПЕРВАЯ ошибка.
	err := g.Wait()

	elapsed := time.Since(start)

	fmt.Println("\n=== РЕЗУЛЬТАТ ===")
	if err != nil {
		fmt.Printf("ОШИБКА ВАЛИДАЦИИ: %v\n", err)
	} else {
		fmt.Println("Все записи валидны.")
	}

	fmt.Printf("\nСтатистика:\n")
	fmt.Printf("  Успешно:     %d\n", validated.Load())
	fmt.Printf("  Ошибки:      %d\n", failed.Load())
	fmt.Printf("  Пропущено:   %d (контекст отменён)\n", skipped.Load())
	fmt.Printf("  Общее время: %s\n", elapsed.Round(time.Millisecond))

	fmt.Println("\nОбратите внимание: после первой ошибки оставшиеся горутины")
	fmt.Println("получают отменённый контекст и не выполняют бесполезную работу.")
}
