/*
	sync.Map — конкурентная map без явной блокировки

	sync.Map оптимизирована для двух сценариев:
	  1. Ключи записываются один раз, а читаются многократно (кеш, реестр).
	  2. Множество горутин работают с непересекающимися наборами ключей.

	Когда НЕ использовать (обычный map + sync.RWMutex будет быстрее):
	  - Частые записи в одни и те же ключи
	  - Нужен точный len() или итерация с гарантией консистентности
	  - Нужна типобезопасность (sync.Map хранит any)

	API (все методы потокобезопасны):
	  - Store(key, value)                    — записать
	  - Load(key) (value, ok)                — прочитать
	  - LoadOrStore(key, value) (actual, loaded) — прочитать или записать
	  - LoadAndDelete(key) (value, loaded)   — прочитать и удалить
	  - Delete(key)                          — удалить
	  - Range(func(key, value any) bool)     — итерация (не атомарна!)
	  - Swap(key, value) (previous, loaded)  — Go 1.20: атомарная замена
	  - CompareAndSwap(key, old, new) bool   — Go 1.20: CAS
	  - CompareAndDelete(key, old) bool      — Go 1.20: условное удаление

	Go 1.22: используем range over int и безопасные переменные цикла.
*/
package main

import (
	"fmt"
	"sync"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// 1. Базовое использование sync.Map
// ─────────────────────────────────────────────────────────────────────────────

func basicSyncMap() {
	fmt.Println("=== Базовый sync.Map ===")

	var m sync.Map // нулевое значение готово к использованию

	// Store — записываем пары ключ-значение
	m.Store("name", "Алиса")
	m.Store("age", 30)
	m.Store("city", "Москва")

	// Load — читаем значение по ключу
	if name, ok := m.Load("name"); ok {
		fmt.Printf("  name = %v\n", name)
	}

	// Ключ не существует
	if _, ok := m.Load("missing"); !ok {
		fmt.Println("  missing: ключ не найден")
	}

	// Delete — удаляем ключ
	m.Delete("city")

	// Range — итерация по всем ключам
	fmt.Println("  все ключи:")
	m.Range(func(key, value any) bool {
		fmt.Printf("    %v = %v\n", key, value)
		return true // false — прервать итерацию
	})
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LoadOrStore — атомарный «получи или создай»
// ─────────────────────────────────────────────────────────────────────────────

func loadOrStoreExample() {
	fmt.Println("=== LoadOrStore: получи или создай ===")

	var m sync.Map
	var wg sync.WaitGroup

	// Несколько горутин пытаются одновременно записать один ключ
	for i := range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// LoadOrStore: если ключ есть — возвращает существующее значение (loaded=true).
			// Если ключа нет — сохраняет новое значение (loaded=false).
			actual, loaded := m.LoadOrStore("winner", fmt.Sprintf("горутина_%d", i))
			if loaded {
				fmt.Printf("  горутина %d: ключ уже был, значение = %v\n", i, actual)
			} else {
				fmt.Printf("  горутина %d: я записала первой! значение = %v\n", i, actual)
			}
		}()
	}
	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LoadAndDelete — прочитать и удалить атомарно
// ─────────────────────────────────────────────────────────────────────────────

func loadAndDeleteExample() {
	fmt.Println("=== LoadAndDelete: атомарное чтение + удаление ===")

	var m sync.Map
	m.Store("token", "abc123")

	// Первый вызов — получим значение
	if val, loaded := m.LoadAndDelete("token"); loaded {
		fmt.Printf("  первый вызов: token = %v\n", val)
	}

	// Второй вызов — ключ уже удалён
	if _, loaded := m.LoadAndDelete("token"); !loaded {
		fmt.Println("  второй вызов: ключ уже удалён")
	}
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Практика: конкурентный кеш сервисов
// ─────────────────────────────────────────────────────────────────────────────

// serviceRegistry — реестр сервисов (пишется редко, читается часто).
// Идеальный сценарий для sync.Map.
type serviceRegistry struct {
	services sync.Map // map[string]string (имя → адрес)
}

func (r *serviceRegistry) register(name, addr string) {
	r.services.Store(name, addr)
}

func (r *serviceRegistry) lookup(name string) (string, bool) {
	val, ok := r.services.Load(name)
	if !ok {
		return "", false
	}
	return val.(string), true
}

func (r *serviceRegistry) listAll() {
	r.services.Range(func(key, value any) bool {
		fmt.Printf("    %s → %s\n", key, value)
		return true
	})
}

func serviceRegistryExample() {
	fmt.Println("=== Практика: реестр сервисов ===")

	reg := &serviceRegistry{}

	// Регистрируем сервисы (пишем — редко)
	reg.register("auth", "localhost:8001")
	reg.register("users", "localhost:8002")
	reg.register("orders", "localhost:8003")

	// Читаем из множества горутин (читаем — часто)
	var wg sync.WaitGroup
	services := []string{"auth", "users", "orders", "missing"}
	for _, name := range services {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if addr, ok := reg.lookup(name); ok {
				fmt.Printf("  %s → %s\n", name, addr)
			} else {
				fmt.Printf("  %s → не найден\n", name)
			}
		}()
	}
	wg.Wait()

	fmt.Println("  все сервисы:")
	reg.listAll()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Сравнение: sync.Map vs map + RWMutex
// ─────────────────────────────────────────────────────────────────────────────

func benchmarkComparison() {
	fmt.Println("=== Сравнение: sync.Map vs map+RWMutex ===")

	const goroutines = 100
	const opsPerGoroutine = 1000

	// ── sync.Map ──
	var sm sync.Map
	var wg sync.WaitGroup

	start := time.Now()
	for g := range goroutines {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range opsPerGoroutine {
				key := fmt.Sprintf("key_%d_%d", g, i)
				sm.Store(key, i)   // запись
				sm.Load(key)       // чтение
			}
		}()
	}
	wg.Wait()
	syncMapDur := time.Since(start)

	// ── map + RWMutex ──
	var mu sync.RWMutex
	regularMap := make(map[string]int)

	start = time.Now()
	for g := range goroutines {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range opsPerGoroutine {
				key := fmt.Sprintf("key_%d_%d", g, i)

				mu.Lock()
				regularMap[key] = i
				mu.Unlock()

				mu.RLock()
				_ = regularMap[key]
				mu.RUnlock()
			}
		}()
	}
	wg.Wait()
	rwMutexDur := time.Since(start)

	fmt.Printf("  sync.Map:     %v\n", syncMapDur)
	fmt.Printf("  map+RWMutex:  %v\n", rwMutexDur)
	fmt.Println("  (при частых записях map+RWMutex обычно быстрее)")
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Типобезопасная обёртка над sync.Map
// ─────────────────────────────────────────────────────────────────────────────

// TypedMap — обобщённая типобезопасная обёртка (Go 1.18+ generics).
// Решает главную проблему sync.Map: отсутствие типобезопасности.
type TypedMap[K comparable, V any] struct {
	m sync.Map
}

func (tm *TypedMap[K, V]) Store(key K, val V) {
	tm.m.Store(key, val)
}

func (tm *TypedMap[K, V]) Load(key K) (V, bool) {
	val, ok := tm.m.Load(key)
	if !ok {
		var zero V
		return zero, false
	}
	return val.(V), true
}

func (tm *TypedMap[K, V]) LoadOrStore(key K, val V) (V, bool) {
	actual, loaded := tm.m.LoadOrStore(key, val)
	return actual.(V), loaded
}

func (tm *TypedMap[K, V]) Delete(key K) {
	tm.m.Delete(key)
}

func (tm *TypedMap[K, V]) Range(f func(K, V) bool) {
	tm.m.Range(func(key, value any) bool {
		return f(key.(K), value.(V))
	})
}

func typedMapExample() {
	fmt.Println("=== Типобезопасная обёртка TypedMap[K, V] ===")

	var cache TypedMap[string, int]

	cache.Store("hits", 100)
	cache.Store("errors", 5)

	// Типобезопасно — не нужен type assertion на стороне вызова
	if hits, ok := cache.Load("hits"); ok {
		fmt.Printf("  hits = %d (типизированное значение int)\n", hits)
	}

	cache.Range(func(key string, val int) bool {
		fmt.Printf("  %s = %d\n", key, val)
		return true
	})
	fmt.Println()
}

func main() {
	basicSyncMap()
	loadOrStoreExample()
	loadAndDeleteExample()
	serviceRegistryExample()
	benchmarkComparison()
	typedMapExample()
}
