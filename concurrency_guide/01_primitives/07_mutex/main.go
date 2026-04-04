/*
=== MUTEX (sync.Mutex) ===

Мьютекс (Mutual Exclusion) — примитив синхронизации, гарантирующий,
что только ОДНА горутина в каждый момент времени выполняет критическую секцию.

sync.Mutex:
  - Lock()   — захватывает мьютекс (блокируется, если уже захвачен другой горутиной)
  - Unlock() — освобождает мьютекс

Золотые правила:
  1. ВСЕГДА используйте defer mu.Unlock() сразу после Lock().
     Это гарантирует освобождение даже при panic.
  2. Критическая секция должна быть КАК МОЖНО МЕНЬШЕ.
     Не делайте I/O, сетевые вызовы или долгие вычисления под мьютексом.
  3. Мьютекс НЕ реентерабельный: если горутина вызовет Lock() дважды — DEADLOCK.
     Go намеренно не поддерживает рекурсивные мьютексы (это anti-pattern).
  4. Копирование мьютекса — это БАГ. `go vet` обнаруживает это.
     Мьютекс привязан к конкретному экземпляру — копия создаёт независимый мьютекс.
  5. Детектор гонок: `go run -race main.go` или `go test -race`.
     ВСЕГДА тестируйте с -race в CI. Гонки данных — это undefined behavior.

Когда использовать Mutex vs каналы:
  Mutex — когда нужно защитить доступ к общему состоянию (map, counter, struct).
  Каналы — когда нужно передать данные между горутинами (communication).
  Мнемоника: "Don't communicate by sharing memory; share memory by communicating."
  НО: иногда мьютекс проще и эффективнее. Не нужно догматизировать.
*/
package main

import (
	"fmt"
	"sync"
	"time"
)

func main() {
	// =====================================================
	// Пример 1: Гонка данных (data race) — сломанный счётчик
	// =====================================================
	fmt.Println("=== Пример 1: Гонка данных — сломанный счётчик ===")
	fmt.Println("  Запустите с: go run -race main.go — увидите WARNING: DATA RACE")

	var unsafeCounter int
	var wg sync.WaitGroup

	for range 1000 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			unsafeCounter++ // DATA RACE! Чтение + запись без синхронизации
		}()
	}

	wg.Wait()
	// Ожидаем 1000, но получим меньше из-за гонки (потерянные инкременты)
	fmt.Printf("  Результат БЕЗ мьютекса: %d (ожидали 1000)\n", unsafeCounter)
	fmt.Println()

	// =====================================================
	// Пример 2: Исправленный счётчик с sync.Mutex
	// =====================================================
	fmt.Println("=== Пример 2: Исправленный счётчик с sync.Mutex ===")

	var (
		safeCounter int
		mu          sync.Mutex
		wg2         sync.WaitGroup
	)

	for range 1000 {
		wg2.Add(1)
		go func() {
			defer wg2.Done()
			mu.Lock()
			defer mu.Unlock() // ВСЕГДА defer Unlock после Lock!
			safeCounter++     // теперь безопасно: только одна горутина внутри
		}()
	}

	wg2.Wait()
	fmt.Printf("  Результат С мьютексом: %d (всегда 1000)\n", safeCounter)
	fmt.Println()

	// =====================================================
	// Пример 3: Мьютекс НЕ реентерабельный (deadlock)
	// =====================================================
	fmt.Println("=== Пример 3: Нереентерабельность (deadlock при двойном Lock) ===")
	fmt.Println("  Раскомментируйте код ниже — программа зависнет навсегда:")
	fmt.Println("  // var mu sync.Mutex")
	fmt.Println("  // mu.Lock()")
	fmt.Println("  // mu.Lock() // DEADLOCK: та же горутина уже держит мьютекс!")
	fmt.Println()

	// =====================================================
	// Пример 4: Копирование мьютекса — БАГ
	// =====================================================
	fmt.Println("=== Пример 4: Копирование мьютекса — баг ===")
	fmt.Println("  type Counter struct {")
	fmt.Println("      mu sync.Mutex")
	fmt.Println("      n  int")
	fmt.Println("  }")
	fmt.Println("  c1 := Counter{}")
	fmt.Println("  c2 := c1 // КОПИРУЕТ мьютекс! go vet выдаст предупреждение.")
	fmt.Println("  // c1 и c2 имеют РАЗНЫЕ мьютексы — нет синхронизации между ними.")
	fmt.Println("  Решение: используйте указатели (*Counter) или встраивайте *sync.Mutex.")
	fmt.Println()

	// =====================================================
	// Пример 5: Потокобезопасная обёртка над map
	// =====================================================
	fmt.Println("=== Пример 5: Потокобезопасная обёртка над map ===")

	sm := NewSafeMap()
	var wg3 sync.WaitGroup

	// 10 горутин пишут
	for i := range 10 {
		wg3.Add(1)
		go func() {
			defer wg3.Done()
			key := fmt.Sprintf("ключ-%d", i)
			sm.Set(key, i*100)
		}()
	}

	wg3.Wait()

	// Читаем результаты
	for i := range 10 {
		key := fmt.Sprintf("ключ-%d", i)
		if val, ok := sm.Get(key); ok {
			fmt.Printf("  %s = %d\n", key, val)
		}
	}

	fmt.Printf("  Размер map: %d\n", sm.Len())
	fmt.Println()

	// =====================================================
	// Пример 6: Критическая секция — минимизируйте!
	// =====================================================
	fmt.Println("=== Пример 6: Минимальная критическая секция ===")

	var mu6 sync.Mutex
	var data []int

	// ПЛОХО: долгая работа под мьютексом
	fmt.Println("  ПЛОХО (не делайте так):")
	fmt.Println("    mu.Lock()")
	fmt.Println("    result := heavyComputation() // БЛОКИРУЕТ другие горутины!")
	fmt.Println("    data = append(data, result)")
	fmt.Println("    mu.Unlock()")
	fmt.Println()

	// ХОРОШО: мьютекс только для доступа к общим данным
	fmt.Println("  ХОРОШО (правильный подход):")
	start := time.Now()

	var wg6 sync.WaitGroup
	for i := range 5 {
		wg6.Add(1)
		go func() {
			defer wg6.Done()
			// Тяжёлая работа ВНЕ мьютекса — горутины работают параллельно
			result := heavyComputation(i)

			// Мьютекс ТОЛЬКО для записи в общие данные
			mu6.Lock()
			data = append(data, result)
			mu6.Unlock()
		}()
	}

	wg6.Wait()
	fmt.Printf("  Результаты: %v (за %v)\n", data, time.Since(start))
	fmt.Println()

	// =====================================================
	// Пример 7: Практический пример — конкурентный кеш
	// =====================================================
	fmt.Println("=== Пример 7: Конкурентный кеш ===")

	cache := NewCache()

	var wg7 sync.WaitGroup
	// Несколько горутин одновременно пишут и читают
	for i := range 10 {
		wg7.Add(2)

		// Писатель
		go func() {
			defer wg7.Done()
			key := fmt.Sprintf("user:%d", i)
			cache.Set(key, fmt.Sprintf("User #%d", i), 500*time.Millisecond)
		}()

		// Читатель (с небольшой задержкой)
		go func() {
			defer wg7.Done()
			time.Sleep(10 * time.Millisecond)
			key := fmt.Sprintf("user:%d", i)
			if val, ok := cache.Get(key); ok {
				fmt.Printf("  кеш[%s] = %s\n", key, val)
			}
		}()
	}

	wg7.Wait()

	// Проверяем истечение TTL
	fmt.Println("  Ждём истечения TTL (600ms)...")
	time.Sleep(600 * time.Millisecond)
	if _, ok := cache.Get("user:0"); !ok {
		fmt.Println("  user:0 — истёк! TTL работает.")
	}

	fmt.Println("\n=== Все примеры завершены ===")
}

// heavyComputation имитирует тяжёлое вычисление (БЕЗ мьютекса).
func heavyComputation(n int) int {
	time.Sleep(50 * time.Millisecond) // имитация работы
	return n * n
}

// ===== SafeMap — потокобезопасная обёртка над map =====

// SafeMap — потокобезопасная map.
// Мьютекс и данные хранятся вместе — это идиоматично в Go.
type SafeMap struct {
	mu   sync.Mutex // встроенный мьютекс (НЕ указатель — не нужно инициализировать)
	data map[string]int
}

func NewSafeMap() *SafeMap {
	return &SafeMap{
		data: make(map[string]int),
	}
}

func (s *SafeMap) Set(key string, value int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[key] = value
}

func (s *SafeMap) Get(key string) (int, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	val, ok := s.data[key]
	return val, ok
}

func (s *SafeMap) Len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.data)
}

// ===== Cache — кеш с TTL =====

type cacheEntry struct {
	value     string
	expiresAt time.Time
}

type Cache struct {
	mu      sync.Mutex
	entries map[string]cacheEntry
}

func NewCache() *Cache {
	return &Cache{
		entries: make(map[string]cacheEntry),
	}
}

func (c *Cache) Set(key, value string, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = cacheEntry{
		value:     value,
		expiresAt: time.Now().Add(ttl),
	}
}

func (c *Cache) Get(key string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry, ok := c.entries[key]
	if !ok {
		return "", false
	}

	// Проверяем TTL
	if time.Now().After(entry.expiresAt) {
		delete(c.entries, key) // ленивое удаление
		return "", false
	}

	return entry.value, true
}
