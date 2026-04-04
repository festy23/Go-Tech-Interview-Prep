/*
=== RWMutex (sync.RWMutex) ===

sync.RWMutex — мьютекс для чтения и записи с разделением:
  - RLock() / RUnlock() — блокировка на ЧТЕНИЕ (множество читателей одновременно)
  - Lock()  / Unlock()  — блокировка на ЗАПИСЬ (один писатель, исключает всех)

Правила:
  - Множество горутин могут одновременно держать RLock (параллельное чтение).
  - Только ОДНА горутина может держать Lock (эксклюзивная запись).
  - Lock блокируется, пока ВСЕ RLock не будут освобождены.
  - Когда Lock ожидает — НОВЫЕ RLock тоже блокируются!
    Это предотвращает "голодание писателя" (writer starvation).

Когда использовать RWMutex vs Mutex:
  ✓ RWMutex — когда чтений ЗНАЧИТЕЛЬНО больше, чем записей (config, cache, справочники).
  ✗ Если записи частые — RWMutex может быть МЕДЛЕННЕЕ обычного Mutex из-за оверхеда.
  ✗ Если критическая секция очень короткая — Mutex проще и достаточен.

Типичные сценарии для RWMutex:
  - Конфигурация, которую читают 1000 горутин, а обновляют раз в минуту.
  - In-memory кеш с частым чтением и редкой инвалидацией.
  - Справочные данные, загруженные при старте.
*/
package main

import (
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"
)

func main() {
	// =====================================================
	// Пример 1: Базовое использование RWMutex
	// =====================================================
	fmt.Println("=== Пример 1: Базовое использование RWMutex ===")

	var (
		rwmu    sync.RWMutex
		data    = "начальное значение"
		wgBasic sync.WaitGroup
	)

	// Запускаем 5 читателей и 1 писателя
	for i := range 5 {
		wgBasic.Add(1)
		go func() {
			defer wgBasic.Done()
			rwmu.RLock() // множество читателей одновременно
			defer rwmu.RUnlock()
			fmt.Printf("  читатель %d: %s\n", i, data)
			time.Sleep(50 * time.Millisecond) // имитация чтения
		}()
	}

	wgBasic.Add(1)
	go func() {
		defer wgBasic.Done()
		time.Sleep(10 * time.Millisecond) // небольшая задержка
		rwmu.Lock()                       // ждёт, пока все читатели освободят RLock
		defer rwmu.Unlock()
		data = "обновлённое значение"
		fmt.Println("  писатель: данные обновлены!")
	}()

	wgBasic.Wait()

	// Проверяем, что данные обновились
	fmt.Printf("  Итоговое значение: %s\n", data)
	fmt.Println()

	// =====================================================
	// Пример 2: Множественные читатели работают параллельно
	// =====================================================
	fmt.Println("=== Пример 2: Параллельное чтение ===")

	var rwmu2 sync.RWMutex
	var wg2 sync.WaitGroup
	var maxConcurrentReaders atomic.Int32
	var currentReaders atomic.Int32

	for i := range 10 {
		wg2.Add(1)
		go func() {
			defer wg2.Done()
			rwmu2.RLock()
			defer rwmu2.RUnlock()

			// Считаем одновременных читателей
			curr := currentReaders.Add(1)
			// Обновляем максимум атомарно
			for {
				old := maxConcurrentReaders.Load()
				if curr <= old || maxConcurrentReaders.CompareAndSwap(old, curr) {
					break
				}
			}

			fmt.Printf("  читатель %d: активен (одновременных: %d)\n", i, curr)
			time.Sleep(100 * time.Millisecond) // все читатели работают ПАРАЛЛЕЛЬНО

			currentReaders.Add(-1)
		}()
	}

	wg2.Wait()
	fmt.Printf("  Максимум одновременных читателей: %d (из 10)\n", maxConcurrentReaders.Load())
	fmt.Println()

	// =====================================================
	// Пример 3: Предотвращение голодания писателя
	// =====================================================
	fmt.Println("=== Пример 3: Writer starvation prevention ===")
	fmt.Println("  Когда писатель ждёт Lock — НОВЫЕ RLock тоже блокируются!")

	var rwmu3 sync.RWMutex
	var wg3 sync.WaitGroup

	// Читатель 1 захватывает RLock
	rwmu3.RLock()
	fmt.Println("  читатель 1: RLock захвачен")

	// Писатель хочет Lock — будет ждать
	wg3.Add(1)
	go func() {
		defer wg3.Done()
		fmt.Println("  писатель: жду Lock...")
		rwmu3.Lock()
		fmt.Println("  писатель: Lock получен!")
		rwmu3.Unlock()
	}()

	time.Sleep(50 * time.Millisecond) // даём писателю встать в очередь

	// Читатель 2 хочет RLock — тоже заблокируется, потому что писатель ждёт!
	wg3.Add(1)
	go func() {
		defer wg3.Done()
		fmt.Println("  читатель 2: жду RLock (заблокирован, т.к. писатель в очереди)...")
		rwmu3.RLock()
		fmt.Println("  читатель 2: RLock получен! (после писателя)")
		rwmu3.RUnlock()
	}()

	time.Sleep(100 * time.Millisecond) // даём читателю 2 встать в очередь

	// Освобождаем первый RLock — теперь писатель получит Lock
	fmt.Println("  читатель 1: освобождаю RLock")
	rwmu3.RUnlock()

	wg3.Wait()
	fmt.Println("  Порядок: читатель 1 → писатель → читатель 2 (писатель НЕ голодает)")
	fmt.Println()

	// =====================================================
	// Пример 4: Практический пример — конфиг-кеш
	// =====================================================
	fmt.Println("=== Пример 4: Config cache (частое чтение, редкая запись) ===")

	config := NewConfigCache()
	config.Update(map[string]string{
		"db_host":    "localhost",
		"db_port":    "5432",
		"max_conns":  "100",
		"log_level":  "info",
		"cache_ttl":  "60s",
	})

	var wg4 sync.WaitGroup

	// 20 читателей
	for i := range 20 {
		wg4.Add(1)
		go func() {
			defer wg4.Done()
			host := config.Get("db_host")
			_ = host // используем значение
			if i == 0 {
				fmt.Printf("  читатель %d: db_host=%s\n", i, host)
			}
		}()
	}

	// 1 писатель (обновление конфига)
	wg4.Add(1)
	go func() {
		defer wg4.Done()
		time.Sleep(10 * time.Millisecond)
		config.Update(map[string]string{
			"db_host":    "prod-server",
			"db_port":    "5432",
			"max_conns":  "200",
			"log_level":  "warn",
			"cache_ttl":  "120s",
		})
		fmt.Println("  писатель: конфиг обновлён!")
	}()

	wg4.Wait()
	fmt.Printf("  Текущий db_host: %s\n", config.Get("db_host"))
	fmt.Printf("  Все ключи: %v\n", config.Keys())
	fmt.Println()

	// =====================================================
	// Пример 5: Бенчмарк — RWMutex vs Mutex при чтении
	// =====================================================
	fmt.Println("=== Пример 5: Сравнение производительности Mutex vs RWMutex ===")

	const (
		numReaders    = 100
		readsPerGoroutine = 1000
	)
	sharedValue := 42

	// --- Тест с sync.Mutex ---
	var plainMu sync.Mutex
	var wgBench sync.WaitGroup

	startMu := time.Now()
	for range numReaders {
		wgBench.Add(1)
		go func() {
			defer wgBench.Done()
			for range readsPerGoroutine {
				plainMu.Lock()
				_ = sharedValue // чтение
				plainMu.Unlock()
			}
		}()
	}
	wgBench.Wait()
	mutexDuration := time.Since(startMu)

	// --- Тест с sync.RWMutex ---
	var rwMu sync.RWMutex
	var wgBench2 sync.WaitGroup

	startRW := time.Now()
	for range numReaders {
		wgBench2.Add(1)
		go func() {
			defer wgBench2.Done()
			for range readsPerGoroutine {
				rwMu.RLock()
				_ = sharedValue // чтение
				rwMu.RUnlock()
			}
		}()
	}
	wgBench2.Wait()
	rwDuration := time.Since(startRW)

	fmt.Printf("  %d читателей × %d чтений:\n", numReaders, readsPerGoroutine)
	fmt.Printf("  sync.Mutex:   %v\n", mutexDuration)
	fmt.Printf("  sync.RWMutex: %v\n", rwDuration)
	if rwDuration < mutexDuration {
		speedup := float64(mutexDuration) / float64(rwDuration)
		fmt.Printf("  RWMutex быстрее в %.1fx раз (при read-heavy нагрузке)\n", speedup)
	} else {
		fmt.Println("  На малых нагрузках разница может быть незначительной.")
	}
	fmt.Println()

	// =====================================================
	// Пример 6: RWMutex с реальной нагрузкой (смешанная read/write)
	// =====================================================
	fmt.Println("=== Пример 6: Смешанная нагрузка (95% чтение, 5% запись) ===")

	store := NewDataStore()
	// Предзаполняем данные
	for i := range 100 {
		store.Write(fmt.Sprintf("key-%d", i), rand.Intn(1000))
	}

	var wg6 sync.WaitGroup
	var reads, writes atomic.Int64

	start6 := time.Now()
	for range 50 {
		wg6.Add(1)
		go func() {
			defer wg6.Done()
			for range 1000 {
				key := fmt.Sprintf("key-%d", rand.Intn(100))
				if rand.Intn(100) < 95 { // 95% чтений
					store.Read(key)
					reads.Add(1)
				} else { // 5% записей
					store.Write(key, rand.Intn(1000))
					writes.Add(1)
				}
			}
		}()
	}

	wg6.Wait()
	fmt.Printf("  Выполнено за %v: чтений=%d, записей=%d\n",
		time.Since(start6), reads.Load(), writes.Load())
	fmt.Println("  При такой нагрузке RWMutex значительно эффективнее Mutex,")
	fmt.Println("  т.к. 95%% операций (чтение) выполняются параллельно.")

	fmt.Println("\n=== Все примеры завершены ===")
}

// ===== ConfigCache — конфигурация с RWMutex =====

// ConfigCache — потокобезопасный кеш конфигурации.
// Оптимизирован для частого чтения и редкого обновления.
type ConfigCache struct {
	mu   sync.RWMutex
	data map[string]string
}

func NewConfigCache() *ConfigCache {
	return &ConfigCache{
		data: make(map[string]string),
	}
}

// Get — чтение значения (RLock — множество горутин одновременно).
func (c *ConfigCache) Get(key string) string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.data[key]
}

// Keys — возвращает все ключи (RLock).
func (c *ConfigCache) Keys() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	keys := make([]string, 0, len(c.data))
	for k := range c.data {
		keys = append(keys, k)
	}
	return keys
}

// Update — полное обновление конфигурации (Lock — эксклюзивный доступ).
func (c *ConfigCache) Update(newData map[string]string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	// Заменяем всю map целиком (атомарное обновление конфига)
	c.data = make(map[string]string, len(newData))
	for k, v := range newData {
		c.data[k] = v
	}
}

// ===== DataStore — хранилище с RWMutex =====

// DataStore — хранилище данных с разделением чтения и записи.
type DataStore struct {
	mu   sync.RWMutex
	data map[string]int
}

func NewDataStore() *DataStore {
	return &DataStore{
		data: make(map[string]int),
	}
}

func (ds *DataStore) Read(key string) (int, bool) {
	ds.mu.RLock()
	defer ds.mu.RUnlock()
	val, ok := ds.data[key]
	return val, ok
}

func (ds *DataStore) Write(key string, value int) {
	ds.mu.Lock()
	defer ds.mu.Unlock()
	ds.data[key] = value
}
