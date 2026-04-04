/*
ЗАДАЧА: Ленивое подключение к БД (lazy singleton)

Реализовать ленивую инициализацию подключения к базе данных с использованием
sync.OnceValue и sync.OnceFunc (Go 1.21+).

Требования:
  - Структура DBPool с sync.OnceValue для инициализации соединения
  - Метод GetConnection() возвращает *Connection (инициализируется при первом вызове)
  - 20 горутин одновременно вызывают GetConnection
  - Показать, что инициализация вызвана ровно 1 раз
  - Добавить sync.OnceFunc для логирования "система запущена" (вызывается из разных мест)
  - Использовать OnceValue/OnceFunc вместо устаревшего паттерна Once.Do
*/

package main

import (
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"
)

// Connection — имитация подключения к базе данных
type Connection struct {
	ID       int
	Host     string
	Port     int
	PoolSize int
}

func (c *Connection) String() string {
	return fmt.Sprintf("Connection{id=%d, host=%s, port=%d, pool=%d}", c.ID, c.Host, c.Port, c.PoolSize)
}

// initCounter отслеживает количество вызовов инициализации
var initCounter atomic.Int64

// DBPool — пул подключений к БД с ленивой инициализацией
type DBPool struct {
	// OnceValue гарантирует, что функция инициализации вызовется ровно один раз,
	// и все последующие вызовы получат тот же результат
	getConn func() *Connection
}

// NewDBPool создаёт новый пул с ленивой инициализацией
func NewDBPool(host string, port int) *DBPool {
	pool := &DBPool{}

	// sync.OnceValue — вызывает функцию один раз, запоминает и возвращает результат
	pool.getConn = sync.OnceValue(func() *Connection {
		count := initCounter.Add(1)
		fmt.Printf("[INIT] Инициализация подключения к БД (вызов #%d)...\n", count)

		// Имитация долгой инициализации
		time.Sleep(200 * time.Millisecond)

		conn := &Connection{
			ID:       rand.Intn(10000),
			Host:     host,
			Port:     port,
			PoolSize: 10,
		}
		fmt.Printf("[INIT] Подключение создано: %s\n", conn)
		return conn
	})

	return pool
}

// GetConnection возвращает соединение (создаётся при первом вызове)
func (p *DBPool) GetConnection() *Connection {
	return p.getConn()
}

func main() {
	fmt.Println("=== Ленивое подключение к БД (sync.OnceValue / sync.OnceFunc) ===")
	fmt.Println()

	// --- Часть 1: sync.OnceFunc для одноразового логирования ---
	fmt.Println("--- sync.OnceFunc: одноразовое логирование ---")

	var logCount atomic.Int64 // считаем фактические вызовы тела функции
	logStartup := sync.OnceFunc(func() {
		logCount.Add(1)
		fmt.Println("[LOG] === СИСТЕМА ЗАПУЩЕНА ===")
		fmt.Printf("[LOG] Время запуска: %s\n", time.Now().Format("15:04:05.000"))
	})

	// Вызываем из нескольких "подсистем" — тело сработает только один раз
	var wgLog sync.WaitGroup
	subsystems := []string{"AuthService", "CacheManager", "TaskScheduler", "MetricsExporter", "APIGateway"}
	for _, name := range subsystems {
		wgLog.Add(1)
		go func(sub string) {
			defer wgLog.Done()
			fmt.Printf("  [%s] вызывает logStartup()\n", sub)
			logStartup() // только первый вызов выполнит тело
		}(name)
	}
	wgLog.Wait()

	fmt.Printf("  Тело logStartup вызвано: %d раз(а)\n\n", logCount.Load())

	// --- Часть 2: sync.OnceValue для ленивого подключения ---
	fmt.Println("--- sync.OnceValue: ленивая инициализация DBPool ---")

	pool := NewDBPool("db.production.local", 5432)

	var wg sync.WaitGroup
	const numGoroutines = 20

	// Канал для синхронного старта всех горутин
	start := make(chan struct{})

	fmt.Printf("Запускаем %d горутин, каждая вызывает GetConnection()...\n", numGoroutines)

	for i := range numGoroutines {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			<-start // все стартуют одновременно

			conn := pool.GetConnection()

			// Каждая горутина использует одно и то же соединение
			fmt.Printf("  Горутина #%02d получила Connection.ID=%d\n", id, conn.ID)
		}(i)
	}

	// Даём сигнал старта — все горутины ринутся за соединением
	close(start)
	wg.Wait()

	fmt.Printf("\nИнициализация вызвана: %d раз(а) (должно быть 1)\n", initCounter.Load())

	// Повторный вызов — мгновенный, без инициализации
	conn := pool.GetConnection()
	fmt.Printf("Повторный вызов GetConnection(): %s\n", conn)

	fmt.Println("\n=== Готово ===")
}
