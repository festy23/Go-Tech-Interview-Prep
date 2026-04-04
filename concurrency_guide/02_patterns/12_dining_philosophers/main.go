/*
=============================================================================
 ПАТТЕРН: Dining Philosophers (задача обедающих философов)
=============================================================================

 КЛАССИЧЕСКАЯ ЗАДАЧА КОНКУРЕНТНОСТИ (Dijkstra, 1965):
   5 философов сидят за круглым столом. Между каждой парой — одна вилка
   (всего 5 вилок). Каждый философ попеременно думает и ест.
   Чтобы есть, нужны ДВЕ вилки — левая и правая.

 ПРОБЛЕМА — DEADLOCK:
   Если каждый философ одновременно возьмёт левую вилку и будет ждать правую,
   все заблокируются навсегда (циклическое ожидание).

 РЕШЕНИЕ 1 — Упорядочивание ресурсов (Resource Ordering):
   Всегда берём вилку с МЕНЬШИМ номером первой.
   Философ 4 берёт вилку 4 потом 0? Нет! Сначала 0, потом 4.
   Это разрывает цикл — deadlock невозможен.

 РЕШЕНИЕ 2 — Арбитр (Waiter/Arbitrator):
   Центральный "официант" ограничивает количество одновременно едящих
   философов (максимум N-1). Реализуется через буферизованный канал
   (семафор) или через мьютекс.

 КАК ЭТО СВЯЗАНО С РЕАЛЬНЫМ МИРОМ:
   - Философы = горутины/потоки
   - Вилки = мьютексы/ресурсы (БД-соединения, файлы, порты)
   - Deadlock = взаимная блокировка при захвате нескольких ресурсов
   - Resource ordering = всегда захватывай локи в одном порядке
   - Арбитр = connection pool с ограниченным размером

 Go 1.22: range по числу, безопасные переменные цикла.
=============================================================================
*/

package main

import (
	"context"
	"fmt"
	"math/rand/v2"
	"sync"
	"sync/atomic"
	"time"
)

const (
	numPhilosophers = 5  // количество философов (и вилок)
	mealsPerPhil    = 3  // сколько раз каждый должен поесть
)

// Fork — вилка (мьютекс)
type Fork struct {
	mu sync.Mutex
	id int
}

// Philosopher — философ
type Philosopher struct {
	id        int
	name      string
	leftFork  *Fork
	rightFork *Fork
	meals     atomic.Int32 // сколько раз поел
}

// ============================================================================
// РЕШЕНИЕ 1: Resource Ordering (упорядочивание ресурсов)
// ============================================================================

// eatWithOrdering — философ ест, беря вилки в порядке возрастания ID.
// Это ГАРАНТИРОВАННО предотвращает deadlock.
func (p *Philosopher) eatWithOrdering(ctx context.Context, wg *sync.WaitGroup) {
	defer wg.Done()

	// Определяем порядок захвата: всегда сначала меньший ID
	first, second := p.leftFork, p.rightFork
	if first.id > second.id {
		first, second = second, first
	}

	for p.meals.Load() < int32(mealsPerPhil) {
		// Фаза 1: Думаем
		p.think(ctx)

		select {
		case <-ctx.Done():
			return
		default:
		}

		// Фаза 2: Берём вилки в правильном порядке (меньший ID первый)
		first.mu.Lock()
		fmt.Printf("  [%s] взял вилку #%d (первая)\n", p.name, first.id)

		second.mu.Lock()
		fmt.Printf("  [%s] взял вилку #%d (вторая) — ЕСТ!\n", p.name, second.id)

		// Фаза 3: Едим
		p.eat(ctx)

		// Фаза 4: Кладём вилки (порядок не важен)
		second.mu.Unlock()
		first.mu.Unlock()
		fmt.Printf("  [%s] положил вилки, поел %d/%d раз\n",
			p.name, p.meals.Load(), mealsPerPhil)
	}
}

// ============================================================================
// РЕШЕНИЕ 2: Арбитр (Waiter/Arbitrator)
// ============================================================================

// Waiter — "официант", ограничивающий число одновременно едящих.
// Реализован как семафор через буферизованный канал.
type Waiter struct {
	seats chan struct{} // семафор: максимум N-1 философов едят одновременно
}

// NewWaiter создаёт официанта с ограничением по количеству мест
func NewWaiter(maxEaters int) *Waiter {
	return &Waiter{
		seats: make(chan struct{}, maxEaters),
	}
}

// RequestPermission — философ просит разрешения сесть за стол
func (w *Waiter) RequestPermission(ctx context.Context) bool {
	select {
	case w.seats <- struct{}{}:
		return true
	case <-ctx.Done():
		return false
	}
}

// Done — философ закончил есть, освобождает место
func (w *Waiter) Done() {
	<-w.seats
}

// eatWithWaiter — философ ест с разрешения официанта.
// Официант не даёт всем 5 сесть одновременно → нет deadlock.
func (p *Philosopher) eatWithWaiter(ctx context.Context, wg *sync.WaitGroup, waiter *Waiter) {
	defer wg.Done()

	for p.meals.Load() < int32(mealsPerPhil) {
		// Фаза 1: Думаем
		p.think(ctx)

		select {
		case <-ctx.Done():
			return
		default:
		}

		// Фаза 2: Просим разрешения у официанта
		if !waiter.RequestPermission(ctx) {
			return // контекст отменён
		}

		// Фаза 3: Берём обе вилки (порядок уже не важен — арбитр защищает)
		p.leftFork.mu.Lock()
		p.rightFork.mu.Lock()
		fmt.Printf("  [%s] получил разрешение, взял обе вилки — ЕСТ!\n", p.name)

		// Фаза 4: Едим
		p.eat(ctx)

		// Фаза 5: Кладём вилки и освобождаем место
		p.rightFork.mu.Unlock()
		p.leftFork.mu.Unlock()
		waiter.Done()

		fmt.Printf("  [%s] положил вилки, поел %d/%d раз\n",
			p.name, p.meals.Load(), mealsPerPhil)
	}
}

// think — философ думает (случайная пауза)
func (p *Philosopher) think(ctx context.Context) {
	duration := time.Duration(10+rand.IntN(50)) * time.Millisecond
	select {
	case <-time.After(duration):
	case <-ctx.Done():
	}
}

// eat — философ ест (случайная пауза + увеличиваем счётчик)
func (p *Philosopher) eat(ctx context.Context) {
	duration := time.Duration(20+rand.IntN(80)) * time.Millisecond
	select {
	case <-time.After(duration):
	case <-ctx.Done():
	}
	p.meals.Add(1)
}

// ============================================================================
// Утилиты для создания стола
// ============================================================================

// createTable создаёт вилки и философов за круглым столом
func createTable() ([]*Fork, []*Philosopher) {
	names := []string{"Сократ", "Платон", "Аристотель", "Декарт", "Спиноза"}

	// Создаём вилки
	forks := make([]*Fork, numPhilosophers)
	for i := range numPhilosophers {
		forks[i] = &Fork{id: i}
	}

	// Создаём философов
	// Левая вилка = forks[i], правая вилка = forks[(i+1)%5]
	philosophers := make([]*Philosopher, numPhilosophers)
	for i := range numPhilosophers {
		philosophers[i] = &Philosopher{
			id:        i,
			name:      names[i],
			leftFork:  forks[i],
			rightFork: forks[(i+1)%numPhilosophers],
		}
	}

	return forks, philosophers
}

// printResults выводит результаты
func printResults(philosophers []*Philosopher) {
	fmt.Println("  Результаты:")
	allFed := true
	for _, p := range philosophers {
		meals := p.meals.Load()
		status := "сыт"
		if meals < int32(mealsPerPhil) {
			status = "ГОЛОДЕН"
			allFed = false
		}
		fmt.Printf("    %s: поел %d/%d раз [%s]\n", p.name, meals, mealsPerPhil, status)
	}
	if allFed {
		fmt.Println("  Все философы сыты! Deadlock не произошёл.")
	} else {
		fmt.Println("  Не все философы поели (таймаут или отмена).")
	}
}

// ============================================================================
// Демонстрация
// ============================================================================

func demonstrateDeadlockRisk() {
	fmt.Println("=== 1. Почему наивный подход ведёт к DEADLOCK ===")
	fmt.Println()
	fmt.Println("  Наивный алгоритм:")
	fmt.Println("    Каждый философ берёт левую вилку, потом правую.")
	fmt.Println()
	fmt.Println("  Сценарий deadlock:")
	fmt.Println("    Сократ   взял вилку #0, ждёт вилку #1")
	fmt.Println("    Платон   взял вилку #1, ждёт вилку #2")
	fmt.Println("    Аристотель взял вилку #2, ждёт вилку #3")
	fmt.Println("    Декарт   взял вилку #3, ждёт вилку #4")
	fmt.Println("    Спиноза  взял вилку #4, ждёт вилку #0  ← ЦИКЛ!")
	fmt.Println()
	fmt.Println("  Все ждут друг друга → программа зависла навсегда.")
	fmt.Println("  (Мы не запускаем этот код — он гарантированно зависнет)")
	fmt.Println()
}

func demonstrateResourceOrdering() {
	fmt.Println("=== 2. Решение: Resource Ordering ===")
	fmt.Println("  Правило: всегда берём вилку с МЕНЬШИМ номером первой.")
	fmt.Println("  Спиноза (вилки 4,0) берёт сначала 0, потом 4.")
	fmt.Println("  Это разрывает цикл — deadlock невозможен!")
	fmt.Println()

	_, philosophers := createTable()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	start := time.Now()

	for _, p := range philosophers {
		wg.Add(1)
		go p.eatWithOrdering(ctx, &wg)
	}

	wg.Wait()
	elapsed := time.Since(start)

	fmt.Println()
	printResults(philosophers)
	fmt.Printf("  Время: %v\n\n", elapsed.Round(time.Millisecond))
}

func demonstrateWaiterPattern() {
	fmt.Println("=== 3. Решение: Waiter/Arbitrator (семафор) ===")
	fmt.Println("  Официант разрешает максимум 4 из 5 философов есть.")
	fmt.Println("  Хотя бы один всегда ждёт → циклическое ожидание невозможно.")
	fmt.Println()

	_, philosophers := createTable()
	waiter := NewWaiter(numPhilosophers - 1) // максимум N-1 едят

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	start := time.Now()

	for _, p := range philosophers {
		wg.Add(1)
		go p.eatWithWaiter(ctx, &wg, waiter)
	}

	wg.Wait()
	elapsed := time.Since(start)

	fmt.Println()
	printResults(philosophers)
	fmt.Printf("  Время: %v\n\n", elapsed.Round(time.Millisecond))
}

func demonstrateComparison() {
	fmt.Println("=== 4. Сравнение подходов ===")
	fmt.Println()
	fmt.Println("  ┌─────────────────────┬──────────────────┬──────────────────┐")
	fmt.Println("  │ Подход              │ Resource Ordering│ Waiter/Arbitrator│")
	fmt.Println("  ├─────────────────────┼──────────────────┼──────────────────┤")
	fmt.Println("  │ Deadlock-free       │ Да               │ Да               │")
	fmt.Println("  │ Starvation-free     │ Нет (возможен)   │ Зависит от реал. │")
	fmt.Println("  │ Параллелизм         │ Высокий          │ N-1 максимум     │")
	fmt.Println("  │ Сложность           │ Низкая           │ Средняя          │")
	fmt.Println("  │ Централизация       │ Нет              │ Да (арбитр)      │")
	fmt.Println("  │ Реальный аналог     │ Lock ordering    │ Connection pool  │")
	fmt.Println("  └─────────────────────┴──────────────────┴──────────────────┘")
	fmt.Println()
	fmt.Println("  Рекомендации:")
	fmt.Println("  - Resource Ordering: используй если можешь упорядочить ресурсы")
	fmt.Println("    (например, всегда захватывай мьютексы в порядке адресов)")
	fmt.Println("  - Waiter: используй когда нужен пул ресурсов с ограничением")
	fmt.Println("    (database connection pool, rate limiter)")
	fmt.Println("  - В Go часто лучше: redesign через каналы вместо мьютексов!")
	fmt.Println()
}

func main() {
	fmt.Println("╔═══════════════════════════════════════════════════════╗")
	fmt.Println("║   Dining Philosophers — классика конкурентности       ║")
	fmt.Println("╚═══════════════════════════════════════════════════════╝")
	fmt.Println()

	demonstrateDeadlockRisk()
	demonstrateResourceOrdering()
	demonstrateWaiterPattern()
	demonstrateComparison()

	fmt.Println("Все философы поели, программа завершена!")
}
