/*
ЗАДАЧА: Lock-free счётчик метрик

Реализовать систему сбора метрик без мьютексов, используя только atomic-операции.

Требования:
  - Структура Metrics с atomic-полями: RequestCount (Int64), ErrorCount (Int64),
    LastLatency (Int64, наносекунды), IsHealthy (Bool)
  - atomic.Pointer[Config] для горячей подмены конфигурации без остановки
  - 10 горутин-воркеров инкрементируют метрики
  - 1 горутина-репортер выводит метрики каждые 200ms
  - 1 горутина меняет Config через atomic.Pointer (Store)
  - Всё работает без единого mutex
*/

package main

import (
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"
)

// Config — конфигурация приложения, подменяется на лету
type Config struct {
	MaxRPS      int
	Timeout     time.Duration
	ServiceName string
	Version     int
}

func (c *Config) String() string {
	return fmt.Sprintf("{service=%s, v%d, maxRPS=%d, timeout=%s}",
		c.ServiceName, c.Version, c.MaxRPS, c.Timeout)
}

// Metrics — lock-free метрики на atomic-типах
type Metrics struct {
	RequestCount atomic.Int64  // общее количество запросов
	ErrorCount   atomic.Int64  // количество ошибок
	LastLatency  atomic.Int64  // последняя задержка в наносекундах
	IsHealthy    atomic.Bool   // текущий статус здоровья
}

func main() {
	fmt.Println("=== Lock-free счётчик метрик (atomic) ===\n")

	metrics := &Metrics{}
	metrics.IsHealthy.Store(true) // изначально сервис здоров

	// Горячая конфигурация через atomic.Pointer
	var currentConfig atomic.Pointer[Config]
	initialCfg := &Config{
		MaxRPS:      1000,
		Timeout:     5 * time.Second,
		ServiceName: "payment-api",
		Version:     1,
	}
	currentConfig.Store(initialCfg)

	var wg sync.WaitGroup
	stop := make(chan struct{})

	// --- 10 горутин-воркеров: имитируют обработку запросов ---
	const numWorkers = 10
	for i := range numWorkers {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					// Имитация обработки запроса
					latency := time.Duration(5+rand.Intn(50)) * time.Millisecond
					time.Sleep(latency)

					// Атомарно обновляем метрики — без блокировок
					metrics.RequestCount.Add(1)
					metrics.LastLatency.Store(int64(latency))

					// Примерно 5% запросов — ошибки
					if rand.Intn(100) < 5 {
						metrics.ErrorCount.Add(1)
					}

					// Читаем текущую конфигурацию (атомарно)
					cfg := currentConfig.Load()
					_ = cfg.MaxRPS // используем конфигурацию
					_ = workerID
				}
			}
		}(i)
	}

	// --- 1 горутина-репортер: выводит метрики каждые 200ms ---
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(200 * time.Millisecond)
		defer ticker.Stop()
		reportNum := 0
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				reportNum++
				reqs := metrics.RequestCount.Load()
				errs := metrics.ErrorCount.Load()
				lat := time.Duration(metrics.LastLatency.Load())
				healthy := metrics.IsHealthy.Load()
				cfg := currentConfig.Load()

				healthStr := "OK"
				if !healthy {
					healthStr = "DEGRADED"
				}

				fmt.Printf("[Отчёт #%d] requests=%d errors=%d latency=%s health=%s config=%s\n",
					reportNum, reqs, errs, lat.Round(time.Millisecond), healthStr, cfg)
			}
		}
	}()

	// --- 1 горутина: горячая подмена конфигурации ---
	wg.Add(1)
	go func() {
		defer wg.Done()
		versions := []Config{
			{MaxRPS: 2000, Timeout: 3 * time.Second, ServiceName: "payment-api", Version: 2},
			{MaxRPS: 500, Timeout: 10 * time.Second, ServiceName: "payment-api", Version: 3},
			{MaxRPS: 3000, Timeout: 2 * time.Second, ServiceName: "payment-api", Version: 4},
		}

		for i, cfg := range versions {
			select {
			case <-stop:
				return
			case <-time.After(400 * time.Millisecond):
				newCfg := cfg // копия для безопасного указателя
				currentConfig.Store(&newCfg)
				fmt.Printf("\n  >>> Конфигурация обновлена до v%d <<<\n\n", cfg.Version)

				// При версии 3 — помечаем сервис как деградированный
				if i == 1 {
					metrics.IsHealthy.Store(false)
					fmt.Println("  >>> Сервис помечен как DEGRADED <<<")
				}
				// При версии 4 — восстанавливаем
				if i == 2 {
					metrics.IsHealthy.Store(true)
					fmt.Println("  >>> Сервис восстановлен: OK <<<")
				}
			}
		}
	}()

	// Даём системе поработать 2 секунды
	time.Sleep(2 * time.Second)
	close(stop)
	wg.Wait()

	// Финальный отчёт
	fmt.Println("\n=== ФИНАЛЬНЫЕ МЕТРИКИ ===")
	fmt.Printf("Всего запросов:    %d\n", metrics.RequestCount.Load())
	fmt.Printf("Всего ошибок:      %d\n", metrics.ErrorCount.Load())
	fmt.Printf("Последняя задержка: %s\n", time.Duration(metrics.LastLatency.Load()).Round(time.Millisecond))
	fmt.Printf("Статус:            healthy=%v\n", metrics.IsHealthy.Load())
	fmt.Printf("Текущий конфиг:    %s\n", currentConfig.Load())
	fmt.Println("\nВсё работает без единого mutex!")
}
