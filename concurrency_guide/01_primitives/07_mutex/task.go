/*
Задача: Потокобезопасный кеш с TTL

Реализовать обобщённую структуру TTLCache[K comparable, V any],
защищённую sync.Mutex, с автоматическим удалением просроченных записей.

Требуется:
  - Методы: Set(key, value, ttl), Get(key) (V, bool), Delete(key), Len() int
  - Фоновая горутина-очистщик удаляет просроченные записи каждые N секунд
  - Запустить 10 горутин-писателей и 10 горутин-читателей одновременно
  - Показать корректность работы под конкурентной нагрузкой (без гонок данных)

Цель: понять sync.Mutex — исключительную блокировку для защиты
общего состояния от одновременного доступа из нескольких горутин.
*/
package main

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

// cacheEntry хранит значение и момент истечения срока жизни.
type cacheEntry[V any] struct {
	value     V
	expiresAt time.Time
}

// TTLCache — потокобезопасный кеш с автоматическим удалением по TTL.
type TTLCache[K comparable, V any] struct {
	mu      sync.Mutex
	items   map[K]cacheEntry[V]
	stopGC  chan struct{} // Сигнал остановки фоновой очистки
}

// NewTTLCache создаёт кеш и запускает фоновую очистку с заданным интервалом.
func NewTTLCache[K comparable, V any](gcInterval time.Duration) *TTLCache[K, V] {
	c := &TTLCache[K, V]{
		items:  make(map[K]cacheEntry[V]),
		stopGC: make(chan struct{}),
	}
	go c.gcLoop(gcInterval)
	return c
}

// gcLoop — фоновая горутина, периодически удаляющая просроченные записи.
func (c *TTLCache[K, V]) gcLoop(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			c.evictExpired()
		case <-c.stopGC:
			return
		}
	}
}

// evictExpired удаляет все записи с истёкшим TTL.
func (c *TTLCache[K, V]) evictExpired() {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	evicted := 0
	for k, entry := range c.items {
		if now.After(entry.expiresAt) {
			delete(c.items, k)
			evicted++
		}
	}
	if evicted > 0 {
		fmt.Printf("  [GC] удалено просроченных записей: %d\n", evicted)
	}
}

// Set добавляет или обновляет запись с указанным временем жизни.
func (c *TTLCache[K, V]) Set(key K, value V, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = cacheEntry[V]{
		value:     value,
		expiresAt: time.Now().Add(ttl),
	}
}

// Get возвращает значение по ключу. Если запись просрочена — удаляет и возвращает false.
func (c *TTLCache[K, V]) Get(key K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, exists := c.items[key]
	if !exists {
		var zero V
		return zero, false
	}
	if time.Now().After(entry.expiresAt) {
		delete(c.items, key)
		var zero V
		return zero, false
	}
	return entry.value, true
}

// Delete удаляет запись по ключу.
func (c *TTLCache[K, V]) Delete(key K) { c.mu.Lock(); delete(c.items, key); c.mu.Unlock() }

// Len возвращает текущее количество записей.
func (c *TTLCache[K, V]) Len() int { c.mu.Lock(); defer c.mu.Unlock(); return len(c.items) }

// Stop останавливает фоновую горутину очистки.
func (c *TTLCache[K, V]) Stop() { close(c.stopGC) }

func main() {
	cache := NewTTLCache[string, int](500 * time.Millisecond)
	defer cache.Stop()

	var wg sync.WaitGroup
	const (
		numWriters    = 10
		numReaders    = 10
		opsPerWorker  = 50
	)

	fmt.Println("Запускаем нагрузочный тест кеша с TTL...")
	fmt.Printf("Писателей: %d, Читателей: %d, Операций на горутину: %d\n",
		numWriters, numReaders, opsPerWorker)
	fmt.Println("---")

	// Запускаем писателей
	for w := 0; w < numWriters; w++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(id)))
			for i := 0; i < opsPerWorker; i++ {
				key := fmt.Sprintf("key_%d", rng.Intn(20))
				ttl := time.Duration(200+rng.Intn(800)) * time.Millisecond
				cache.Set(key, rng.Intn(1000), ttl)
				time.Sleep(time.Duration(rng.Intn(10)) * time.Millisecond)
			}
		}(w)
	}

	// Запускаем читателей
	hits := make([]int, numReaders)
	misses := make([]int, numReaders)
	for r := 0; r < numReaders; r++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(id+100)))
			for i := 0; i < opsPerWorker; i++ {
				key := fmt.Sprintf("key_%d", rng.Intn(20))
				_, found := cache.Get(key)
				if found {
					hits[id]++
				} else {
					misses[id]++
				}
				time.Sleep(time.Duration(rng.Intn(10)) * time.Millisecond)
			}
		}(r)
	}

	wg.Wait()

	// Подводим итоги
	totalHits, totalMisses := 0, 0
	for i := 0; i < numReaders; i++ {
		totalHits += hits[i]
		totalMisses += misses[i]
	}

	fmt.Println("---")
	fmt.Printf("Записей в кеше: %d | Hits: %d | Misses: %d | Hit rate: %.1f%%\n",
		cache.Len(), totalHits, totalMisses,
		float64(totalHits)/float64(totalHits+totalMisses)*100)
	fmt.Println()
	fmt.Println("sync.Mutex гарантирует, что только одна горутина одновременно")
	fmt.Println("читает или модифицирует данные кеша. Проверка: go run -race task.go")
}
