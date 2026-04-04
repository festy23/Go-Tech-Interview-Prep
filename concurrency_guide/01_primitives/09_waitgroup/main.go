/*
	sync.WaitGroup — ожидание завершения группы горутин

	WaitGroup — простейший примитив синхронизации: мы говорим «жди N горутин»,
	каждая горутина по завершении вызывает Done(), а главная горутина блокируется
	на Wait() до тех пор, пока счётчик не станет равен нулю.

	Ключевые правила:
	  1. wg.Add(n) ОБЯЗАТЕЛЬНО вызывается ДО запуска горутины (go func()),
	     а не внутри неё. Иначе — гонка: Wait() может завершиться раньше,
	     чем Add() успеет увеличить счётчик.
	  2. WaitGroup передаётся ТОЛЬКО по указателю. Копирование — баг,
	     который ловит go vet.
	  3. Повторное использование допустимо, но только после того, как
	     предыдущий Wait() вернулся.

	Go 1.22: используем `for i := range n` вместо `for i := 0; i < n; i++`.
*/
package main

import (
	"fmt"
	"math/rand/v2"
	"sync"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// 1. Базовый паттерн Add/Done/Wait
// ─────────────────────────────────────────────────────────────────────────────

func basicWaitGroup() {
	fmt.Println("=== Базовый WaitGroup ===")

	var wg sync.WaitGroup

	for i := range 5 { // Go 1.22: range over int
		wg.Add(1) // ← ПЕРЕД go func(), не внутри!
		go func() {
			defer wg.Done()
			// Go 1.22: переменная цикла i безопасна — у каждой итерации своя копия
			time.Sleep(time.Duration(rand.IntN(100)) * time.Millisecond)
			fmt.Printf("  горутина %d завершилась\n", i)
		}()
	}

	wg.Wait() // блокируемся до Done() от всех 5 горутин
	fmt.Println("  все горутины завершены")
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. БАГ: Add() внутри горутины — гонка с Wait()
// ─────────────────────────────────────────────────────────────────────────────

func bugAddInsideGoroutine() {
	fmt.Println("=== БАГ: Add() внутри горутины (НЕ ДЕЛАЙТЕ ТАК) ===")
	fmt.Println("  // Закомментировано, т.к. может привести к panic/некорректному поведению")
	fmt.Println("  // var wg sync.WaitGroup")
	fmt.Println("  // for i := range 5 {")
	fmt.Println("  //     go func() {")
	fmt.Println("  //         wg.Add(1) // ← ГОНКА! Wait() может вернуться до этого вызова")
	fmt.Println("  //         defer wg.Done()")
	fmt.Println("  //         fmt.Println(i)")
	fmt.Println("  //     }()")
	fmt.Println("  // }")
	fmt.Println("  // wg.Wait() // может завершиться сразу, не дождавшись горутин")
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. БАГ: копирование WaitGroup (go vet ловит)
// ─────────────────────────────────────────────────────────────────────────────

func bugCopyWaitGroup() {
	fmt.Println("=== БАГ: копирование WaitGroup ===")
	fmt.Println("  // func worker(wg sync.WaitGroup) { // ← КОПИЯ! Done() уменьшает копию")
	fmt.Println("  //     defer wg.Done()")
	fmt.Println("  //     // ... работа ...")
	fmt.Println("  // }")
	fmt.Println("  //")
	fmt.Println("  // Правильно: передавать по указателю")
	fmt.Println("  // func worker(wg *sync.WaitGroup) {")
	fmt.Println("  //     defer wg.Done()")
	fmt.Println("  //     // ... работа ...")
	fmt.Println("  // }")
	fmt.Println()
}

// workerCorrect — правильная передача WaitGroup по указателю.
func workerCorrect(wg *sync.WaitGroup, id int) {
	defer wg.Done()
	time.Sleep(time.Duration(rand.IntN(50)) * time.Millisecond)
	fmt.Printf("  worker %d завершён\n", id)
}

func correctPointerPassing() {
	fmt.Println("=== Передача WaitGroup по указателю ===")
	var wg sync.WaitGroup

	for i := range 3 {
		wg.Add(1)
		go workerCorrect(&wg, i) // передаём указатель
	}

	wg.Wait()
	fmt.Println("  все воркеры завершены")
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Практика: параллельные «HTTP-запросы», ожидание всех
// ─────────────────────────────────────────────────────────────────────────────

// fakeHTTPGet имитирует HTTP-запрос с задержкой.
func fakeHTTPGet(url string) (string, error) {
	time.Sleep(time.Duration(rand.IntN(200)) * time.Millisecond)
	return fmt.Sprintf("ответ от %s", url), nil
}

func parallelRequests() {
	fmt.Println("=== Параллельные HTTP-запросы ===")

	urls := []string{
		"https://api.example.com/users",
		"https://api.example.com/orders",
		"https://api.example.com/products",
		"https://api.example.com/stats",
	}

	var wg sync.WaitGroup

	for _, url := range urls {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// Go 1.22: url безопасно захватывается — каждая итерация имеет свою переменную
			resp, err := fakeHTTPGet(url)
			if err != nil {
				fmt.Printf("  ОШИБКА %s: %v\n", url, err)
				return
			}
			fmt.Printf("  %s\n", resp)
		}()
	}

	wg.Wait()
	fmt.Println("  все запросы завершены")
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. WaitGroup + каналы: сбор результатов из горутин
// ─────────────────────────────────────────────────────────────────────────────

// result — структура для сбора ответов от горутин.
type result struct {
	url  string
	body string
	err  error
}

func collectResults() {
	fmt.Println("=== WaitGroup + каналы: сбор результатов ===")

	urls := []string{
		"https://api.example.com/a",
		"https://api.example.com/b",
		"https://api.example.com/c",
	}

	// Буферизованный канал по числу запросов — не заблокируется
	results := make(chan result, len(urls))
	var wg sync.WaitGroup

	for _, url := range urls {
		wg.Add(1)
		go func() {
			defer wg.Done()
			body, err := fakeHTTPGet(url)
			results <- result{url: url, body: body, err: err}
		}()
	}

	// Закрываем канал после завершения всех горутин.
	// Это делаем в отдельной горутине, чтобы не блокировать чтение.
	go func() {
		wg.Wait()
		close(results)
	}()

	// Читаем результаты из канала до его закрытия
	for r := range results {
		if r.err != nil {
			fmt.Printf("  ОШИБКА %s: %v\n", r.url, r.err)
		} else {
			fmt.Printf("  %s → %s\n", r.url, r.body)
		}
	}

	fmt.Println("  все результаты собраны")
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Паттерн: WaitGroup + слайс результатов (без каналов)
// ─────────────────────────────────────────────────────────────────────────────

func collectToSlice() {
	fmt.Println("=== WaitGroup + слайс (каждая горутина пишет в свой индекс) ===")

	const n = 5
	results := make([]string, n) // заранее аллоцированный слайс
	var wg sync.WaitGroup

	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// Каждая горутина пишет в СВОЙ индекс — гонки нет
			time.Sleep(time.Duration(rand.IntN(100)) * time.Millisecond)
			results[i] = fmt.Sprintf("результат_%d", i)
		}()
	}

	wg.Wait()

	// Безопасно читаем после Wait()
	for i, r := range results {
		fmt.Printf("  [%d] %s\n", i, r)
	}
	fmt.Println()
}

func main() {
	basicWaitGroup()
	bugAddInsideGoroutine()
	bugCopyWaitGroup()
	correctPointerPassing()
	parallelRequests()
	collectResults()
	collectToSlice()
}
