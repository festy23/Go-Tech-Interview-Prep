/*
Задача: Конкурентный конфиг с hot-reload

Структура Config защищена sync.RWMutex и хранит map[string]string.
Множество горутин-читателей постоянно обращаются к конфигу,
а горутина-reloader периодически полностью заменяет данные.

Требуется:
  - Get(key) — под RLock (несколько читателей одновременно)
  - Reload(newData) — под Lock (эксклюзивная запись, полная замена данных)
  - Горутина-reloader: каждые 500ms «перезагружает» конфиг новыми данными
  - 20 горутин-читателей постоянно читают случайные ключи
  - Показать, что читатели не блокируют друг друга, но блокируются при Reload

Цель: понять разницу между Mutex и RWMutex — RLock допускает
параллельные чтения, а Lock блокирует всех до завершения записи.
*/
package main

import (
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"
)

// Config — потокобезопасное хранилище конфигурации с поддержкой hot-reload.
type Config struct {
	mu      sync.RWMutex
	data    map[string]string
	version int
}

// NewConfig создаёт конфигурацию с начальными данными.
func NewConfig(initial map[string]string) *Config {
	copied := make(map[string]string, len(initial))
	for k, v := range initial {
		copied[k] = v
	}
	return &Config{data: copied, version: 1}
}

// Get читает значение по ключу. Использует RLock — несколько горутин
// могут читать одновременно, не блокируя друг друга.
func (c *Config) Get(key string) (string, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	val, ok := c.data[key]
	return val, ok
}

// GetVersion возвращает текущую версию конфигурации.
func (c *Config) GetVersion() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.version
}

// Reload полностью заменяет данные конфигурации. Использует Lock —
// эксклюзивная блокировка, все читатели ждут завершения.
func (c *Config) Reload(newData map[string]string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Имитация длительной перезагрузки (парсинг файла, валидация)
	time.Sleep(50 * time.Millisecond)

	c.data = make(map[string]string, len(newData))
	for k, v := range newData {
		c.data[k] = v
	}
	c.version++
	fmt.Printf("  [reloader] конфиг обновлён до версии %d (%d ключей)\n",
		c.version, len(c.data))
}

func main() {
	// Начальная конфигурация
	cfg := NewConfig(map[string]string{
		"db_host":     "localhost",
		"db_port":     "5432",
		"cache_ttl":   "300",
		"log_level":   "info",
		"max_conns":   "100",
		"timeout":     "30s",
		"feature_x":   "enabled",
		"api_version": "v2",
	})

	const (
		numReaders   = 20
		testDuration = 3 * time.Second
		reloadEvery  = 500 * time.Millisecond
	)

	var totalReads, totalReloads atomic.Int64

	stop := make(chan struct{})
	var wg sync.WaitGroup

	fmt.Printf("Запуск: %d читателей, reloader каждые %v, длительность %v\n",
		numReaders, reloadEvery, testDuration)
	fmt.Println("---")

	// Горутина-reloader: периодически обновляет конфиг
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(reloadEvery)
		defer ticker.Stop()
		reloadNum := 0
		for {
			select {
			case <-ticker.C:
				reloadNum++
				newData := map[string]string{
					"db_host":   fmt.Sprintf("host-%d.example.com", reloadNum),
					"db_port":   "5432",
					"cache_ttl": fmt.Sprintf("%d", 300+reloadNum*10),
					"log_level": "debug",
					"max_conns": fmt.Sprintf("%d", 100+reloadNum),
					"timeout":   fmt.Sprintf("%ds", 30+reloadNum),
				}
				cfg.Reload(newData)
				totalReloads.Add(1)
			case <-stop:
				return
			}
		}
	}()

	// Горутины-читатели
	for r := 0; r < numReaders; r++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(id)))
			keys := []string{"db_host", "db_port", "cache_ttl", "log_level",
				"max_conns", "timeout", "feature_x", "api_version"}

			for {
				select {
				case <-stop:
					return
				default:
					key := keys[rng.Intn(len(keys))]
					_, _ = cfg.Get(key)
					totalReads.Add(1)
					// Небольшая пауза, имитирующая обработку
					time.Sleep(time.Duration(rng.Intn(5)) * time.Millisecond)
				}
			}
		}(r)
	}

	// Ждём заданное время и останавливаем
	time.Sleep(testDuration)
	close(stop)
	wg.Wait()

	fmt.Println("---")
	fmt.Printf("Всего чтений:      %d\n", totalReads.Load())
	fmt.Printf("Всего перезагрузок: %d\n", totalReloads.Load())
	fmt.Printf("Финальная версия:   %d\n", cfg.GetVersion())
	fmt.Println()
	fmt.Println("sync.RWMutex позволяет:")
	fmt.Println("  - RLock: множество горутин читают параллельно")
	fmt.Println("  - Lock:  эксклюзивный доступ для записи, все читатели ждут")
	fmt.Println("  Это значительно эффективнее обычного Mutex, когда чтений")
	fmt.Println("  гораздо больше, чем записей (типичный сценарий для конфигов).")
	fmt.Println()
	fmt.Println("Проверьте отсутствие гонок: go run -race task.go")
}
