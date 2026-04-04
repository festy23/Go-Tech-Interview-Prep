/*
Задача: Пинг-понг между горутинами

Две горутины перебрасывают значение через два небуферизованных канала.
Требуется:
  - Создать два unbuffered канала: pingCh и pongCh
  - Горутина "Ping" отправляет значение в pingCh, затем ждёт ответа из pongCh
  - Горутина "Pong" ждёт значение из pingCh, инкрементирует и отправляет в pongCh
  - Остановить после N итераций (10 перебросов)
  - Вывести, кто передал последним и финальное значение счётчика

Цель: показать синхронную природу unbuffered каналов —
отправитель блокируется, пока получатель не примет значение.
*/
package main

import (
	"fmt"
)

// ping читает из pongCh, инкрементирует и отправляет в pingCh.
// Останавливается, когда счётчик достигает maxCount.
func ping(pingCh chan<- int, pongCh <-chan int, maxCount int, done chan<- string) {
	// Первый «удар» — начинаем игру
	counter := 1
	fmt.Printf("[Ping] отправляет %d\n", counter)
	pingCh <- counter

	for {
		// Ждём ответа от Pong
		counter = <-pongCh
		fmt.Printf("[Ping] получил %d от Pong\n", counter)

		if counter >= maxCount {
			done <- "Pong"
			return
		}

		counter++
		fmt.Printf("[Ping] отправляет %d\n", counter)
		pingCh <- counter
	}
}

// pong читает из pingCh, инкрементирует и отправляет в pongCh.
// Останавливается, когда счётчик достигает maxCount.
func pong(pingCh <-chan int, pongCh chan<- int, maxCount int, done chan<- string) {
	for {
		// Ждём удара от Ping
		counter := <-pingCh
		fmt.Printf("[Pong] получил %d от Ping\n", counter)

		if counter >= maxCount {
			done <- "Ping"
			return
		}

		counter++
		fmt.Printf("[Pong] отправляет %d\n", counter)
		pongCh <- counter
	}
}

func main() {
	const maxCount = 10

	// Два небуферизованных канала — каждая отправка блокируется до приёма
	pingCh := make(chan int) // Ping -> Pong
	pongCh := make(chan int) // Pong -> Ping

	// Канал для сигнала завершения
	done := make(chan string, 2)

	fmt.Printf("Запускаем пинг-понг на %d итераций\n", maxCount)
	fmt.Println("---")

	go ping(pingCh, pongCh, maxCount, done)
	go pong(pingCh, pongCh, maxCount, done)

	// Ждём, пока одна из горутин сообщит о завершении
	lastSender := <-done
	fmt.Println("---")
	fmt.Printf("Последним передал: %s\n", lastSender)
	fmt.Printf("Финальное значение счётчика: %d\n", maxCount)
	fmt.Println()
	fmt.Println("Обратите внимание: каждая операция отправки/получения строго")
	fmt.Println("чередуется — это следствие синхронной природы unbuffered каналов.")
}
