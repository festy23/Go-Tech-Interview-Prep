/*
Задача: Батчер (batch collector)

Горутина-продюсер генерирует элементы по одному (имитация потока событий).
Горутина-батчер собирает элементы в батч размером N или по таймауту
(что наступит раньше).
Требуется:
  - Продюсер шлёт события в буферизованный канал с переменной задержкой
  - Батчер накапливает элементы и отдаёт готовый батч, когда:
    а) набралось batchSize элементов, или
    б) прошёл flushTimeout с момента получения первого элемента в текущем батче
  - Собранные батчи отправляются в канал результатов
  - Показать: буферизованный канал как промежуточный накопитель

Цель: понять разницу между буферизованным и небуферизованным каналами,
увидеть паттерн «батчинг» с таймаутом.
*/
package main

import (
	"fmt"
	"math/rand"
	"time"
)

// produce генерирует totalEvents событий с переменной задержкой
// и отправляет их в буферизованный канал.
func produce(ch chan<- string, totalEvents int) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	for i := 1; i <= totalEvents; i++ {
		event := fmt.Sprintf("event_%d", i)
		// Имитация неравномерного потока: задержка от 50 до 300 мс
		delay := time.Duration(50+rng.Intn(250)) * time.Millisecond
		time.Sleep(delay)
		ch <- event
		fmt.Printf("  [продюсер] отправил: %s (задержка %v)\n", event, delay)
	}
	close(ch)
}

// batchCollector собирает элементы в батчи и отправляет готовые батчи в results.
// Батч формируется по размеру (batchSize) или по таймауту (flushTimeout).
func batchCollector(input <-chan string, results chan<- []string, batchSize int, flushTimeout time.Duration) {
	var batch []string
	var timer <-chan time.Time // Таймер сброса, nil пока батч пуст

	for {
		select {
		case event, ok := <-input:
			if !ok {
				// Канал закрыт — отправляем остаток, если есть
				if len(batch) > 0 {
					results <- batch
				}
				close(results)
				return
			}

			batch = append(batch, event)

			// Запускаем таймер при получении первого элемента в батче
			if len(batch) == 1 {
				timer = time.After(flushTimeout)
			}

			// Батч заполнен — отправляем
			if len(batch) >= batchSize {
				results <- batch
				batch = nil
				timer = nil // Сбрасываем таймер
			}

		case <-timer:
			// Таймаут — отправляем неполный батч
			if len(batch) > 0 {
				results <- batch
				batch = nil
				timer = nil
			}
		}
	}
}

func main() {
	const (
		totalEvents  = 15
		batchSize    = 4
		flushTimeout = 400 * time.Millisecond
		bufferSize   = 8 // Размер буфера промежуточного канала
	)

	fmt.Printf("Параметры: событий=%d, размер батча=%d, таймаут=%v, буфер канала=%d\n",
		totalEvents, batchSize, flushTimeout, bufferSize)
	fmt.Println("---")

	// Буферизованный канал — продюсер не блокируется, пока буфер не заполнен
	eventsCh := make(chan string, bufferSize)
	resultsCh := make(chan []string, 4)

	go produce(eventsCh, totalEvents)
	go batchCollector(eventsCh, resultsCh, batchSize, flushTimeout)

	// Читаем готовые батчи
	batchNum := 0
	for batch := range resultsCh {
		batchNum++
		fmt.Printf("\n[батч #%d] размер=%d, содержимое: %v\n", batchNum, len(batch), batch)

		if len(batch) < batchSize {
			fmt.Println("  ^ отправлен по таймауту (батч не заполнился вовремя)")
		} else {
			fmt.Println("  ^ отправлен по заполнению")
		}
	}

	fmt.Println("---")
	fmt.Printf("Всего собрано батчей: %d\n", batchNum)
	fmt.Println()
	fmt.Println("Буферизованный канал позволяет продюсеру не блокироваться")
	fmt.Println("при отправке, пока в буфере есть место. Это развязывает")
	fmt.Println("скорости продюсера и потребителя.")
}
