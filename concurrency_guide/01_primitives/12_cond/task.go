/*
ЗАДАЧА: Барьер синхронизации (barrier)

Реализовать барьер, при котором N горутин выполняют работу в фазах:
каждая горутина завершает фазу и ждёт, пока ВСЕ остальные тоже завершат.
Только когда все готовы — все одновременно переходят к следующей фазе.

Требования:
  - Реализация через sync.Cond + Broadcast
  - 5 горутин, 3 фазы
  - Каждая горутина выполняет "работу" (случайная задержка)
  - Вывести, кто завершил какую фазу
  - Все переходят к следующей фазе строго вместе
*/

package main

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

// Barrier — барьер синхронизации на основе sync.Cond
type Barrier struct {
	mu       sync.Mutex
	cond     *sync.Cond
	total    int // общее количество участников
	waiting  int // количество горутин, дожидающихся на барьере
	phase    int // текущая фаза (увеличивается при прорыве барьера)
}

// NewBarrier создаёт барьер для n участников
func NewBarrier(n int) *Barrier {
	b := &Barrier{
		total: n,
		phase: 0,
	}
	b.cond = sync.NewCond(&b.mu)
	return b
}

// Wait блокирует горутину до тех пор, пока все n участников не вызовут Wait.
// Когда последний участник приходит — барьер "прорывается", все продолжают.
func (b *Barrier) Wait() {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Запоминаем текущую фазу — чтобы отличить от следующего прорыва
	currentPhase := b.phase
	b.waiting++

	if b.waiting == b.total {
		// Последняя горутина пришла — прорываем барьер
		b.waiting = 0
		b.phase++
		// Будим ВСЕХ ожидающих (Broadcast, не Signal!)
		b.cond.Broadcast()
	} else {
		// Ждём, пока фаза не сменится (т.е. барьер не будет прорван)
		for b.phase == currentPhase {
			b.cond.Wait()
		}
	}
}

func main() {
	fmt.Println("=== Барьер синхронизации (sync.Cond + Broadcast) ===\n")

	const numWorkers = 5
	const numPhases = 3

	barrier := NewBarrier(numWorkers)
	var wg sync.WaitGroup

	for i := range numWorkers {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()

			for phase := 1; phase <= numPhases; phase++ {
				// Имитация работы — у каждого своя скорость
				workTime := time.Duration(50+rand.Intn(200)) * time.Millisecond
				time.Sleep(workTime)

				fmt.Printf("  [Горутина %d] завершила фазу %d (работала %s)\n",
					workerID, phase, workTime.Round(time.Millisecond))

				// Ждём на барьере — пока ВСЕ не завершат эту фазу
				barrier.Wait()

				// Только после прорыва барьера все продолжают
				// Первая горутина, которая проснётся, печатает разделитель
				// (не критично, если напечатают несколько — это демо)
				if workerID == 0 {
					fmt.Printf("\n>>> Все горутины завершили фазу %d — переход к следующей <<<\n\n", phase)
				}

				// Небольшая пауза, чтобы разделитель успел напечататься
				time.Sleep(10 * time.Millisecond)
			}

			fmt.Printf("  [Горутина %d] завершила все фазы!\n", workerID)
		}(i)
	}

	wg.Wait()

	fmt.Println("\n=== Все горутины прошли все фазы синхронно ===")
}
