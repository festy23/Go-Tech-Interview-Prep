/*
	sync.Cond — условная переменная (condition variable)

	Cond позволяет горутинам ожидать наступления определённого условия,
	а другим горутинам — сигнализировать об его выполнении.

	Создание: cond := sync.NewCond(&mu)  — привязывается к sync.Locker (Mutex/RWMutex)

	Методы:
	  - Wait()      — атомарно разблокирует мьютекс, усыпляет горутину,
	                   при пробуждении снова захватывает мьютекс.
	  - Signal()    — будит ОДНУ ожидающую горутину.
	  - Broadcast() — будит ВСЕ ожидающие горутины.

	ВАЖНО: условие ВСЕГДА проверяется в цикле for, а не в if!
	  for !condition {
	      cond.Wait()
	  }
	Причина: возможны «ложные пробуждения» (spurious wakeups), а также
	другая горутина могла изменить состояние между Signal и пробуждением.

	Когда использовать Cond:
	  - Несколько горутин ждут одного условия (Broadcast будит всех)
	  - Сложные условия, которые нельзя выразить одним каналом

	В Go каналы обычно предпочтительнее — Cond нужен в редких случаях
	(bounded buffer, барьеры синхронизации, сложные condition-протоколы).
*/
package main

import (
	"fmt"
	"math/rand/v2"
	"sync"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// 1. Базовый пример: Signal — будим одну горутину
// ─────────────────────────────────────────────────────────────────────────────

func basicSignal() {
	fmt.Println("=== Signal: пробуждение одной горутины ===")

	var mu sync.Mutex
	cond := sync.NewCond(&mu)
	ready := false

	// Ожидающая горутина
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		mu.Lock()
		// Проверяем условие в ЦИКЛЕ (не if!) — защита от spurious wakeup
		for !ready {
			fmt.Println("  [ожидающий] условие не выполнено, засыпаю...")
			cond.Wait() // атомарно: Unlock → sleep → Lock
		}
		fmt.Println("  [ожидающий] условие выполнено, продолжаю!")
		mu.Unlock()
	}()

	// Даём горутине время заснуть
	time.Sleep(50 * time.Millisecond)

	// Устанавливаем условие и сигнализируем
	mu.Lock()
	ready = true
	mu.Unlock()
	cond.Signal() // будим одну горутину

	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Broadcast — будим все горутины
// ─────────────────────────────────────────────────────────────────────────────

func broadcastExample() {
	fmt.Println("=== Broadcast: пробуждение всех горутин ===")

	var mu sync.Mutex
	cond := sync.NewCond(&mu)
	started := false

	var wg sync.WaitGroup

	// Несколько горутин ждут сигнала «старт»
	for i := range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			mu.Lock()
			for !started {
				cond.Wait()
			}
			mu.Unlock()
			fmt.Printf("  горутина %d: стартовала!\n", i)
		}()
	}

	time.Sleep(50 * time.Millisecond)

	// Командуем всем горутинам стартовать
	mu.Lock()
	started = true
	mu.Unlock()
	fmt.Println("  [main] Broadcast — командуем всем старт!")
	cond.Broadcast() // будим ВСЕХ

	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Практика: ограниченный буфер (producer-consumer с Cond)
// ─────────────────────────────────────────────────────────────────────────────

// boundedBuffer — кольцевой буфер фиксированного размера.
// Продюсер блокируется, если буфер полон.
// Консюмер блокируется, если буфер пуст.
type boundedBuffer struct {
	mu       sync.Mutex
	notEmpty *sync.Cond // сигнал: буфер не пуст
	notFull  *sync.Cond // сигнал: буфер не полон
	buf      []int
	capacity int
}

func newBoundedBuffer(cap int) *boundedBuffer {
	bb := &boundedBuffer{
		buf:      make([]int, 0, cap),
		capacity: cap,
	}
	bb.notEmpty = sync.NewCond(&bb.mu)
	bb.notFull = sync.NewCond(&bb.mu)
	return bb
}

func (bb *boundedBuffer) put(val int) {
	bb.mu.Lock()
	defer bb.mu.Unlock()

	// Ждём, пока появится место в буфере
	for len(bb.buf) == bb.capacity {
		bb.notFull.Wait()
	}

	bb.buf = append(bb.buf, val)
	bb.notEmpty.Signal() // сигнализируем консюмеру
}

func (bb *boundedBuffer) get() int {
	bb.mu.Lock()
	defer bb.mu.Unlock()

	// Ждём, пока в буфере появятся данные
	for len(bb.buf) == 0 {
		bb.notEmpty.Wait()
	}

	val := bb.buf[0]
	bb.buf = bb.buf[1:]
	bb.notFull.Signal() // сигнализируем продюсеру
	return val
}

func producerConsumer() {
	fmt.Println("=== Bounded Buffer: producer-consumer ===")

	bb := newBoundedBuffer(3) // буфер на 3 элемента
	var wg sync.WaitGroup

	// Продюсер
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := range 8 {
			bb.put(i)
			fmt.Printf("  [producer] положил: %d\n", i)
			time.Sleep(time.Duration(rand.IntN(30)) * time.Millisecond)
		}
	}()

	// Консюмер
	wg.Add(1)
	go func() {
		defer wg.Done()
		for range 8 {
			val := bb.get()
			fmt.Printf("  [consumer] взял: %d\n", val)
			time.Sleep(time.Duration(rand.IntN(50)) * time.Millisecond)
		}
	}()

	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Почему for, а не if — демонстрация spurious wakeup
// ─────────────────────────────────────────────────────────────────────────────

func whyForNotIf() {
	fmt.Println("=== Почему for, а не if (spurious wakeup) ===")
	fmt.Println("  // НЕПРАВИЛЬНО:")
	fmt.Println("  // mu.Lock()")
	fmt.Println("  // if !condition {     // ← БАГ: после Wake условие может быть снова false!")
	fmt.Println("  //     cond.Wait()")
	fmt.Println("  // }")
	fmt.Println("  // // используем ресурс")
	fmt.Println("  // mu.Unlock()")
	fmt.Println()
	fmt.Println("  // ПРАВИЛЬНО:")
	fmt.Println("  // mu.Lock()")
	fmt.Println("  // for !condition {    // ← перепроверяем после каждого пробуждения")
	fmt.Println("  //     cond.Wait()")
	fmt.Println("  // }")
	fmt.Println("  // // используем ресурс")
	fmt.Println("  // mu.Unlock()")
	fmt.Println()
	fmt.Println("  Причины:")
	fmt.Println("  1. Между Signal и пробуждением другая горутина может забрать ресурс")
	fmt.Println("  2. Broadcast будит всех, но ресурс может быть только для одного")
	fmt.Println("  3. ОС может разбудить горутину без Signal (spurious wakeup)")
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cond vs каналы — когда что использовать
// ─────────────────────────────────────────────────────────────────────────────

func condVsChannels() {
	fmt.Println("=== Cond vs каналы ===")
	fmt.Println("  Каналы (предпочтительнее в Go):")
	fmt.Println("    ✓ Проще и идиоматичнее")
	fmt.Println("    ✓ select с несколькими каналами")
	fmt.Println("    ✓ close() как broadcast для всех читателей")
	fmt.Println()
	fmt.Println("  sync.Cond (редко, но бывает нужен):")
	fmt.Println("    ✓ Сложные условия с shared state")
	fmt.Println("    ✓ Bounded buffer с двумя условиями (notFull + notEmpty)")
	fmt.Println("    ✓ Signal будит ровно одного (канал с буфером 1 — не то же самое)")
	fmt.Println("    ✓ Множественные Broadcast без создания нового канала")
	fmt.Println()
}

func main() {
	basicSignal()
	broadcastExample()
	producerConsumer()
	whyForNotIf()
	condVsChannels()
}
