/*
	sync.Once — гарантированное однократное выполнение функции

	Once гарантирует, что переданная в Do() функция выполнится РОВНО ОДИН РАЗ,
	даже если Do() вызывается из множества горутин одновременно. Все остальные
	вызовы блокируются до завершения первого.

	Типичные применения:
	  - Инициализация синглтона (пул соединений к БД, конфигурация)
	  - Ленивая (lazy) инициализация тяжёлых ресурсов

	Важные нюансы:
	  1. Если функция внутри Do() паникует, Once считает её ВЫПОЛНЕННОЙ —
	     повторного вызова НЕ БУДЕТ. Паника пробрасывается вызывающему.
	  2. Вызов Do() внутри Do() с тем же Once — DEADLOCK.

	Go 1.21 добавил удобные обёртки:
	  - sync.OnceFunc(f)           — возвращает func(), которая вызовет f ровно один раз
	  - sync.OnceValue[T](f)      — возвращает func() T, f вызовется один раз
	  - sync.OnceValues[T1,T2](f) — возвращает func() (T1, T2), идеально для (T, error)
*/
package main

import (
	"fmt"
	"sync"
)

// ─────────────────────────────────────────────────────────────────────────────
// 1. Классический sync.Once — инициализация «синглтона»
// ─────────────────────────────────────────────────────────────────────────────

type dbPool struct {
	dsn string
}

var (
	pool     *dbPool
	poolOnce sync.Once
)

// getPool — классический паттерн ленивой инициализации.
func getPool() *dbPool {
	poolOnce.Do(func() {
		fmt.Println("  [init] создаём пул соединений (вызовется ОДИН раз)")
		pool = &dbPool{dsn: "postgres://localhost:5432/mydb"}
	})
	return pool
}

func classicOnce() {
	fmt.Println("=== Классический sync.Once ===")

	var wg sync.WaitGroup
	for range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p := getPool()
			fmt.Printf("  горутина получила пул: %s\n", p.dsn)
		}()
	}
	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Once.Do блокирует все вызовы до завершения первого
// ─────────────────────────────────────────────────────────────────────────────

func blockingBehavior() {
	fmt.Println("=== Once.Do блокирует все вызовы ===")

	var once sync.Once
	var wg sync.WaitGroup

	for i := range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fmt.Printf("  горутина %d: жду Once.Do...\n", i)
			once.Do(func() {
				// Тяжёлая инициализация — остальные горутины ждут
				fmt.Println("  [init] выполняю тяжёлую инициализацию...")
			})
			fmt.Printf("  горутина %d: Once.Do вернулся\n", i)
		}()
	}
	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Паника в Once.Do — функция считается выполненной!
// ─────────────────────────────────────────────────────────────────────────────

func oncePanicBehavior() {
	fmt.Println("=== Паника в Once.Do ===")

	var once sync.Once

	// Первый вызов — паникует
	func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("  перехватили панику: %v\n", r)
			}
		}()
		once.Do(func() {
			panic("ошибка инициализации!")
		})
	}()

	// Второй вызов — функция НЕ будет вызвана повторно
	once.Do(func() {
		fmt.Println("  это сообщение НИКОГДА не появится")
	})

	fmt.Println("  вывод: после паники Once считает функцию выполненной")
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Go 1.21: sync.OnceFunc — удобная обёртка
// ─────────────────────────────────────────────────────────────────────────────

func onceFuncExample() {
	fmt.Println("=== sync.OnceFunc (Go 1.21+) ===")

	// Оборачиваем функцию — получаем «вызываемый-один-раз» замыкание
	initCache := sync.OnceFunc(func() {
		fmt.Println("  [init] инициализация кеша (один раз)")
	})

	var wg sync.WaitGroup
	for i := range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			initCache() // вызовет внутреннюю функцию только при первом вызове
			fmt.Printf("  горутина %d: кеш готов\n", i)
		}()
	}
	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Go 1.21: sync.OnceValue[T] — однократная функция, возвращающая значение
// ─────────────────────────────────────────────────────────────────────────────

type config struct {
	AppName string
	Debug   bool
}

func onceValueExample() {
	fmt.Println("=== sync.OnceValue[T] (Go 1.21+) ===")

	// OnceValue вызывает функцию один раз и кеширует результат.
	// Все последующие вызовы возвращают закешированное значение.
	getConfig := sync.OnceValue(func() config {
		fmt.Println("  [init] загружаем конфигурацию (один раз)")
		return config{AppName: "MyApp", Debug: true}
	})

	var wg sync.WaitGroup
	for i := range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cfg := getConfig() // первый вызов инициализирует, остальные — кеш
			fmt.Printf("  горутина %d: AppName=%s, Debug=%v\n", i, cfg.AppName, cfg.Debug)
		}()
	}
	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Go 1.21: sync.OnceValues[T1, T2] — для паттерна (T, error)
// ─────────────────────────────────────────────────────────────────────────────

func onceValuesExample() {
	fmt.Println("=== sync.OnceValues[T1, T2] (Go 1.21+) ===")

	// Идеально для инициализации, которая может вернуть ошибку.
	// Если первый вызов вернул ошибку — она закешируется навсегда!
	connectDB := sync.OnceValues(func() (*dbPool, error) {
		fmt.Println("  [init] подключаемся к БД (один раз)")
		// Имитируем успешное подключение
		return &dbPool{dsn: "postgres://localhost/production"}, nil
	})

	var wg sync.WaitGroup
	for i := range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			db, err := connectDB()
			if err != nil {
				fmt.Printf("  горутина %d: ошибка: %v\n", i, err)
				return
			}
			fmt.Printf("  горутина %d: подключены к %s\n", i, db.dsn)
		}()
	}
	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Практический пример: lazy-загрузка словаря
// ─────────────────────────────────────────────────────────────────────────────

func practicalLazyLoad() {
	fmt.Println("=== Практика: lazy-загрузка справочника ===")

	// Справочник загружается при первом обращении и кешируется
	loadCountries := sync.OnceValue(func() map[string]string {
		fmt.Println("  [init] загружаем справочник стран...")
		return map[string]string{
			"RU": "Россия",
			"US": "США",
			"DE": "Германия",
		}
	})

	// Имитируем обработку нескольких запросов
	var wg sync.WaitGroup
	codes := []string{"RU", "US", "DE", "RU"}
	for _, code := range codes {
		wg.Add(1)
		go func() {
			defer wg.Done()
			countries := loadCountries()
			fmt.Printf("  %s → %s\n", code, countries[code])
		}()
	}
	wg.Wait()
	fmt.Println()
}

func main() {
	classicOnce()
	blockingBehavior()
	oncePanicBehavior()
	onceFuncExample()
	onceValueExample()
	onceValuesExample()
	practicalLazyLoad()
}
