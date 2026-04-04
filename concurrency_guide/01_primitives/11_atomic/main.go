/*
	sync/atomic — атомарные операции без блокировок

	Атомарные операции выполняются за одну неделимую инструкцию процессора.
	Они быстрее мьютексов для простых операций (инкремент, загрузка, сохранение),
	но подходят только для примитивных типов.

	Стили API:
	  1. Старый (функциональный): atomic.AddInt64(&counter, 1)
	     — требует указатели, легко ошибиться, нет типобезопасности.
	  2. Новый (Go 1.19+): atomic.Int64, atomic.Bool, atomic.Pointer[T]
	     — типобезопасные методы, предпочтительный стиль.

	Ключевые типы (Go 1.19+):
	  - atomic.Int32, atomic.Int64, atomic.Uint32, atomic.Uint64
	  - atomic.Bool
	  - atomic.Pointer[T]  — типобезопасная замена atomic.Value для указателей
	  - atomic.Value        — хранит любой тип (interface{})

	CAS (Compare-And-Swap) — основа lock-free алгоритмов:
	  «Замени значение на новое, ТОЛЬКО если текущее равно ожидаемому».
*/
package main

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// 1. Старый стиль vs новый стиль (Go 1.19+)
// ─────────────────────────────────────────────────────────────────────────────

func oldVsNewStyle() {
	fmt.Println("=== Старый vs новый стиль atomic ===")

	// ── Старый стиль (НЕ рекомендуется) ──
	var counterOld int64
	atomic.AddInt64(&counterOld, 1)
	val := atomic.LoadInt64(&counterOld)
	fmt.Printf("  старый стиль: %d\n", val)

	// ── Новый стиль (Go 1.19+, рекомендуется) ──
	var counterNew atomic.Int64 // нулевое значение готово к использованию
	counterNew.Add(1)
	fmt.Printf("  новый стиль:  %d\n", counterNew.Load())
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Атомарный счётчик vs мьютекс
// ─────────────────────────────────────────────────────────────────────────────

func atomicVsMutexCounter() {
	fmt.Println("=== Счётчик: atomic vs mutex ===")
	const goroutines = 1000

	// ── Вариант 1: atomic (быстрее) ──
	var atomicCounter atomic.Int64
	var wg sync.WaitGroup

	start := time.Now()
	for range goroutines {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 1000 {
				atomicCounter.Add(1)
			}
		}()
	}
	wg.Wait()
	atomicDur := time.Since(start)

	// ── Вариант 2: mutex (медленнее) ──
	var mu sync.Mutex
	var mutexCounter int64

	start = time.Now()
	for range goroutines {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 1000 {
				mu.Lock()
				mutexCounter++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	mutexDur := time.Since(start)

	fmt.Printf("  atomic: %d за %v\n", atomicCounter.Load(), atomicDur)
	fmt.Printf("  mutex:  %d за %v\n", mutexCounter, mutexDur)
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. atomic.Bool — флаг для graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────

func atomicBoolExample() {
	fmt.Println("=== atomic.Bool: флаг остановки ===")

	var shutdown atomic.Bool // по умолчанию false

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := range 100 {
			if shutdown.Load() {
				fmt.Printf("  воркер остановлен на итерации %d\n", i)
				return
			}
			time.Sleep(time.Millisecond)
		}
	}()

	time.Sleep(20 * time.Millisecond)
	shutdown.Store(true) // сигнализируем об остановке
	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. atomic.Value — хранение произвольного типа (config reload)
// ─────────────────────────────────────────────────────────────────────────────

type appConfig struct {
	LogLevel string
	Workers  int
}

func atomicValueExample() {
	fmt.Println("=== atomic.Value: горячая перезагрузка конфигурации ===")

	var cfg atomic.Value
	cfg.Store(appConfig{LogLevel: "info", Workers: 4})

	var wg sync.WaitGroup

	// Читатели — безопасно загружают текущую конфигурацию
	for i := range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// Load() возвращает any — нужен type assertion
			c := cfg.Load().(appConfig)
			fmt.Printf("  читатель %d: LogLevel=%s, Workers=%d\n", i, c.LogLevel, c.Workers)
		}()
	}

	// Писатель — атомарно заменяет конфигурацию
	cfg.Store(appConfig{LogLevel: "debug", Workers: 8})
	fmt.Println("  конфигурация обновлена на debug/8")

	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. atomic.Pointer[T] — типобезопасная замена atomic.Value (Go 1.19+)
// ─────────────────────────────────────────────────────────────────────────────

type serviceConfig struct {
	Endpoint string
	Timeout  time.Duration
}

func atomicPointerExample() {
	fmt.Println("=== atomic.Pointer[T]: типобезопасный указатель (Go 1.19+) ===")

	var cfgPtr atomic.Pointer[serviceConfig]

	// Начальная конфигурация
	initial := &serviceConfig{Endpoint: "https://api.v1.example.com", Timeout: 5 * time.Second}
	cfgPtr.Store(initial)

	var wg sync.WaitGroup

	// Читатели — загружают указатель атомарно
	for i := range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c := cfgPtr.Load() // возвращает *serviceConfig — без type assertion!
			fmt.Printf("  читатель %d: endpoint=%s\n", i, c.Endpoint)
		}()
	}

	// Атомарная замена конфигурации (lock-free!)
	newCfg := &serviceConfig{Endpoint: "https://api.v2.example.com", Timeout: 10 * time.Second}
	old := cfgPtr.Swap(newCfg)
	fmt.Printf("  заменили конфигурацию: %s → %s\n", old.Endpoint, newCfg.Endpoint)

	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CAS (Compare-And-Swap) — lock-free обновление
// ─────────────────────────────────────────────────────────────────────────────

func casExample() {
	fmt.Println("=== CAS (Compare-And-Swap) ===")

	var counter atomic.Int64
	counter.Store(10)

	var wg sync.WaitGroup

	// Несколько горутин пытаются атомарно увеличить счётчик через CAS.
	// CAS-цикл: читаем текущее значение, вычисляем новое, пытаемся записать.
	// Если другая горутина успела изменить значение — повторяем.
	for i := range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				old := counter.Load()
				newVal := old + 1
				// CompareAndSwap: «если текущее == old, замени на newVal»
				if counter.CompareAndSwap(old, newVal) {
					fmt.Printf("  горутина %d: %d → %d\n", i, old, newVal)
					break // успешно обновили
				}
				// Не получилось — другая горутина успела раньше, пробуем снова
			}
		}()
	}
	wg.Wait()
	fmt.Printf("  итого: %d (ожидали 15)\n", counter.Load())
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Практика: lock-free перезагрузка конфигурации с CAS
// ─────────────────────────────────────────────────────────────────────────────

type runtimeConfig struct {
	MaxConns    int
	RateLimit   int
	Description string
}

func lockFreeConfigReload() {
	fmt.Println("=== Практика: lock-free config reload с atomic.Pointer + CAS ===")

	var cfgPtr atomic.Pointer[runtimeConfig]
	cfgPtr.Store(&runtimeConfig{MaxConns: 100, RateLimit: 1000, Description: "initial"})

	var wg sync.WaitGroup

	// Обновитель: увеличивает MaxConns через CAS
	for i := range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				old := cfgPtr.Load()
				updated := &runtimeConfig{
					MaxConns:    old.MaxConns + 10,
					RateLimit:   old.RateLimit,
					Description: fmt.Sprintf("обновление от горутины %d", i),
				}
				if cfgPtr.CompareAndSwap(old, updated) {
					fmt.Printf("  горутина %d: MaxConns %d → %d\n", i, old.MaxConns, updated.MaxConns)
					break
				}
				// CAS не прошёл — повторяем
			}
		}()
	}

	wg.Wait()
	final := cfgPtr.Load()
	fmt.Printf("  итоговая конфигурация: MaxConns=%d, описание=%q\n", final.MaxConns, final.Description)
	fmt.Println()
}

func main() {
	oldVsNewStyle()
	atomicVsMutexCounter()
	atomicBoolExample()
	atomicValueExample()
	atomicPointerExample()
	casExample()
	lockFreeConfigReload()
}
