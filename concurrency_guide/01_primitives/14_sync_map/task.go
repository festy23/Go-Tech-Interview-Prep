/*
ЗАДАЧА: Кеш DNS-резолвера

Реализовать кеш DNS-резолвера на основе sync.Map с атомарным "взять или записать".

Требования:
  - sync.Map как кеш: hostname → IP-адрес
  - 50 горутин "резолвят" имена из пула в 10 уникальных хостов
  - При первом запросе — "долгий" resolve (sleep), результат кладётся в кеш
  - Последующие запросы берут из кеша мгновенно
  - Использовать LoadOrStore для атомарного "взять или записать"
  - Показать статистику: cache hits vs cache misses (через atomic-счётчики)
*/

package main

import (
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"
)

// DNSCache — потокобезопасный кеш DNS-записей
type DNSCache struct {
	cache  sync.Map
	hits   atomic.Int64 // попадания в кеш
	misses atomic.Int64 // промахи — пришлось "резолвить"
}

// Resolve возвращает IP-адрес для хоста.
// При первом обращении — выполняет "долгий" DNS-запрос, при повторном — берёт из кеша.
func (d *DNSCache) Resolve(hostname string) string {
	// LoadOrStore атомарно: если ключ есть — возвращает значение,
	// если нет — записывает новое и возвращает его.
	// loaded == true означает, что значение уже было в кеше.
	ip, loaded := d.cache.LoadOrStore(hostname, "") // placeholder

	if loaded && ip.(string) != "" {
		// Значение уже в кеше и оно не пустое — cache hit
		d.hits.Add(1)
		return ip.(string)
	}

	// Cache miss — нужно "резолвить"
	// ПРИМЕЧАНИЕ: в реальном коде здесь может быть race condition с placeholder.
	// Для production лучше использовать singleflight. Здесь — демонстрация sync.Map.
	d.misses.Add(1)

	// Имитация медленного DNS-запроса (50-150ms)
	delay := time.Duration(50+rand.Intn(100)) * time.Millisecond
	time.Sleep(delay)

	// Генерируем "IP-адрес" на основе хоста
	resolvedIP := generateIP(hostname)

	// Записываем настоящий результат в кеш
	d.cache.Store(hostname, resolvedIP)

	return resolvedIP
}

// Stats возвращает статистику кеша
func (d *DNSCache) Stats() (hits, misses int64) {
	return d.hits.Load(), d.misses.Load()
}

// generateIP генерирует детерминированный "IP-адрес" на основе имени хоста
func generateIP(hostname string) string {
	// Простая хеш-функция для генерации IP
	hash := 0
	for _, ch := range hostname {
		hash = hash*31 + int(ch)
	}
	if hash < 0 {
		hash = -hash
	}
	return fmt.Sprintf("%d.%d.%d.%d",
		10+hash%240, (hash/256)%256, (hash/65536)%256, 1+(hash/16777216)%254)
}

func main() {
	fmt.Println("=== Кеш DNS-резолвера (sync.Map) ===\n")

	// Пул уникальных хостов
	hosts := []string{
		"api.example.com",
		"cdn.images.io",
		"db.production.local",
		"cache.redis.internal",
		"queue.rabbitmq.svc",
		"auth.oauth.provider",
		"metrics.grafana.cloud",
		"logs.elastic.search",
		"storage.s3.aws",
		"mail.smtp.relay",
	}

	cache := &DNSCache{}

	const numGoroutines = 50
	const requestsPerGoroutine = 5

	var wg sync.WaitGroup
	start := time.Now()

	fmt.Printf("Запускаем %d горутин, каждая делает %d DNS-запросов...\n",
		numGoroutines, requestsPerGoroutine)
	fmt.Printf("Уникальных хостов: %d\n\n", len(hosts))

	for i := range numGoroutines {
		wg.Add(1)
		go func(goroutineID int) {
			defer wg.Done()

			for j := range requestsPerGoroutine {
				// Выбираем случайный хост из пула
				hostname := hosts[rand.Intn(len(hosts))]
				ip := cache.Resolve(hostname)

				// Выводим только часть запросов (чтобы не засорять вывод)
				if goroutineID < 3 && j < 2 {
					fmt.Printf("  [Горутина %02d] %s → %s\n", goroutineID, hostname, ip)
				}
			}
		}(i)
	}

	wg.Wait()
	elapsed := time.Since(start)

	// Статистика
	hits, misses := cache.Stats()
	totalRequests := hits + misses
	hitRate := float64(hits) / float64(totalRequests) * 100

	fmt.Println("\n=== СТАТИСТИКА DNS-КЕША ===")
	fmt.Printf("Всего запросов:     %d\n", totalRequests)
	fmt.Printf("Cache hits:         %d\n", hits)
	fmt.Printf("Cache misses:       %d\n", misses)
	fmt.Printf("Hit rate:           %.1f%%\n", hitRate)
	fmt.Printf("Общее время:        %s\n", elapsed.Round(time.Millisecond))

	// Содержимое кеша
	fmt.Println("\n--- Содержимое кеша ---")
	cache.cache.Range(func(key, value any) bool {
		fmt.Printf("  %-30s → %s\n", key.(string), value.(string))
		return true
	})

	fmt.Println("\n=== Готово ===")
}
