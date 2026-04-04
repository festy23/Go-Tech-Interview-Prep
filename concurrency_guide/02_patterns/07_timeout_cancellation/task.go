/*
Задача: Агрегатор цен с таймаутом (Price Aggregator)

Условие:
- Есть 5 "поставщиков", каждый возвращает цену на товар (горутина с задержкой 100-800мс).
- Общий таймаут на сбор цен: 500мс.
- Нужно собрать все ответы, которые пришли до истечения таймаута.
- Если получено хотя бы 2 ответа — вычислить среднюю цену.
- Если менее 2 ответов — вернуть ошибку "недостаточно данных".
- Показать, какие поставщики успели ответить, а какие — нет.
- Все горутины поставщиков должны корректно завершиться через контекст (без утечек).

Паттерн: context.WithTimeout + select + агрегация результатов через канал.
*/

package main

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"time"
)

// Результат запроса к поставщику
type SupplierResult struct {
	Name  string        // имя поставщика
	Price float64       // цена товара
	Delay time.Duration // фактическая задержка ответа
}

// fetchPrice имитирует запрос к поставщику. Горутина завершается при отмене контекста.
func fetchPrice(ctx context.Context, name string, delay time.Duration, price float64, results chan<- SupplierResult) {
	select {
	case <-time.After(delay):
		// Поставщик успел ответить в пределах своей задержки
		select {
		case results <- SupplierResult{Name: name, Price: price, Delay: delay}:
		case <-ctx.Done():
			// Контекст отменён — не отправляем результат, выходим
			fmt.Printf("  [%s] контекст отменён при отправке результата\n", name)
		}
	case <-ctx.Done():
		// Контекст отменён раньше, чем поставщик успел ответить
		fmt.Printf("  [%s] отменён по таймауту (задержка была бы %v)\n", name, delay)
	}
}

// aggregatePrices собирает цены от поставщиков с общим таймаутом.
// Возвращает полученные результаты, список не успевших поставщиков и ошибку.
func aggregatePrices(timeout time.Duration, suppliers map[string]struct {
	delay time.Duration
	price float64
}) ([]SupplierResult, []string, error) {
	// Создаём контекст с таймаутом — он отменит все горутины по истечении срока
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	results := make(chan SupplierResult, len(suppliers))
	var wg sync.WaitGroup

	// Запускаем горутину для каждого поставщика
	for name, info := range suppliers {
		wg.Add(1)
		go func(n string, d time.Duration, p float64) {
			defer wg.Done()
			fetchPrice(ctx, n, d, p, results)
		}(name, info.delay, info.price)
	}

	// Отдельная горутина ждёт завершения всех поставщиков и закрывает канал
	go func() {
		wg.Wait()
		close(results)
	}()

	// Собираем результаты до закрытия канала (либо по таймауту, либо все ответили)
	var received []SupplierResult
	for r := range results {
		received = append(received, r)
	}

	// Определяем, кто не успел
	respondedSet := make(map[string]bool)
	for _, r := range received {
		respondedSet[r.Name] = true
	}
	var timedOut []string
	for name := range suppliers {
		if !respondedSet[name] {
			timedOut = append(timedOut, name)
		}
	}

	// Проверяем, достаточно ли данных для расчёта средней цены
	if len(received) < 2 {
		return received, timedOut, fmt.Errorf("недостаточно данных: получено %d ответов (нужно минимум 2)", len(received))
	}

	return received, timedOut, nil
}

func main() {
	// Фиксируем seed для воспроизводимости (в реальности не нужно)
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	// Определяем 5 поставщиков с разными задержками и ценами
	type supplierInfo struct {
		delay time.Duration
		price float64
	}
	suppliers := map[string]supplierInfo{
		"АльфаПоставки":  {delay: 100 * time.Millisecond, price: 1200.0 + rng.Float64()*100},
		"БетаОпт":        {delay: 200 * time.Millisecond, price: 1150.0 + rng.Float64()*100},
		"ГаммаТрейд":     {delay: 350 * time.Millisecond, price: 1300.0 + rng.Float64()*100},
		"ДельтаЛогистик": {delay: 600 * time.Millisecond, price: 1100.0 + rng.Float64()*100},
		"ЭпсилонМаркет":  {delay: 800 * time.Millisecond, price: 1250.0 + rng.Float64()*100},
	}

	timeout := 500 * time.Millisecond
	fmt.Printf("=== Агрегатор цен ===\n")
	fmt.Printf("Таймаут: %v\n", timeout)
	fmt.Printf("Количество поставщиков: %d\n\n", len(suppliers))

	fmt.Println("Запрашиваем цены у поставщиков...")
	start := time.Now()

	// Преобразуем в нужный тип для передачи в функцию
	suppMap := make(map[string]struct {
		delay time.Duration
		price float64
	})
	for k, v := range suppliers {
		suppMap[k] = struct {
			delay time.Duration
			price float64
		}{v.delay, v.price}
	}

	received, timedOut, err := aggregatePrices(timeout, suppMap)
	elapsed := time.Since(start)

	fmt.Printf("\n--- Результаты (за %v) ---\n", elapsed.Round(time.Millisecond))

	// Выводим ответы поставщиков, которые успели
	fmt.Printf("\nУспели ответить (%d):\n", len(received))
	var totalPrice float64
	for _, r := range received {
		fmt.Printf("  ✓ %s: %.2f руб. (задержка %v)\n", r.Name, r.Price, r.Delay)
		totalPrice += r.Price
	}

	// Выводим поставщиков, которые не уложились в таймаут
	fmt.Printf("\nНе успели (%d):\n", len(timedOut))
	for _, name := range timedOut {
		fmt.Printf("  ✗ %s\n", name)
	}

	// Итог: средняя цена или ошибка
	fmt.Println()
	if err != nil {
		fmt.Printf("ОШИБКА: %v\n", err)
	} else {
		avgPrice := totalPrice / float64(len(received))
		fmt.Printf("Средняя цена (по %d поставщикам): %.2f руб.\n", len(received), avgPrice)
		fmt.Printf("Минимальная: %.2f руб.\n", minPrice(received))
		fmt.Printf("Максимальная: %.2f руб.\n", maxPrice(received))
	}

	// Небольшая пауза, чтобы убедиться, что все горутины завершились
	time.Sleep(50 * time.Millisecond)
	fmt.Println("\nВсе горутины поставщиков корректно завершены.")
}

// minPrice находит минимальную цену среди результатов
func minPrice(results []SupplierResult) float64 {
	min := results[0].Price
	for _, r := range results[1:] {
		if r.Price < min {
			min = r.Price
		}
	}
	return min
}

// maxPrice находит максимальную цену среди результатов
func maxPrice(results []SupplierResult) float64 {
	max := results[0].Price
	for _, r := range results[1:] {
		if r.Price > max {
			max = r.Price
		}
	}
	return max
}
