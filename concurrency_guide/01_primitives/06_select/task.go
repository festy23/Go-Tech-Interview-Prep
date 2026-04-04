/*
Задача: Первый ответивший сервис (first response wins)

Имитация запросов к 5 сервисам с разной случайной задержкой.
Каждый «сервис» — горутина, которая «обрабатывает» запрос и отправляет
результат в общий канал.

Требуется:
  - Запустить 5 горутин-сервисов с разной задержкой (rand)
  - Использовать select для получения первого ответа
  - Добавить общий таймаут: если никто не ответил за 500ms — сообщить об этом
  - Вывести, какой сервис ответил первым, его результат и время ответа

Цель: понять оператор select — мультиплексирование каналов,
неблокирующий выбор между несколькими операциями и реализацию таймаутов.
*/
package main

import (
	"fmt"
	"math/rand"
	"time"
)

// serviceResponse содержит ответ от одного сервиса.
type serviceResponse struct {
	name     string
	result   string
	duration time.Duration
}

// queryService имитирует запрос к сервису с задержкой от minDelay до maxDelay.
// Результат отправляется в канал ответов.
func queryService(name string, minDelay, maxDelay time.Duration, responses chan<- serviceResponse) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(len(name))))
	delay := minDelay + time.Duration(rng.Int63n(int64(maxDelay-minDelay)))

	start := time.Now()
	time.Sleep(delay) // Имитация работы сервиса

	responses <- serviceResponse{
		name:     name,
		result:   fmt.Sprintf("данные от %s", name),
		duration: time.Since(start),
	}
}

func main() {
	const timeout = 500 * time.Millisecond

	// Канал для ответов от всех сервисов
	responses := make(chan serviceResponse, 5)

	fmt.Println("Отправляем запросы к 5 сервисам...")
	fmt.Printf("Таймаут: %v\n", timeout)
	fmt.Println("---")

	start := time.Now()

	// Запускаем 5 «сервисов» с разными диапазонами задержек
	go queryService("БД-мастер", 100*time.Millisecond, 400*time.Millisecond, responses)
	go queryService("БД-реплика", 50*time.Millisecond, 300*time.Millisecond, responses)
	go queryService("Кеш-Redis", 10*time.Millisecond, 200*time.Millisecond, responses)
	go queryService("API-партнёр", 200*time.Millisecond, 600*time.Millisecond, responses)
	go queryService("Локальный-кеш", 5*time.Millisecond, 150*time.Millisecond, responses)

	// select ждёт первый из двух событий:
	// 1) ответ от любого сервиса
	// 2) истечение общего таймаута
	select {
	case resp := <-responses:
		elapsed := time.Since(start)
		fmt.Printf("Первый ответ от: %s\n", resp.name)
		fmt.Printf("Результат:       %s\n", resp.result)
		fmt.Printf("Время сервиса:   %v\n", resp.duration)
		fmt.Printf("Общее время:     %v\n", elapsed)

	case <-time.After(timeout):
		fmt.Printf("ТАЙМАУТ: ни один сервис не ответил за %v\n", timeout)
	}

	fmt.Println("---")

	// Дополнительно: собираем оставшиеся ответы (с коротким таймаутом)
	fmt.Println("\nОстальные ответы (ждём ещё 1 секунду):")
	deadline := time.After(1 * time.Second)
	remaining := 0
	for {
		select {
		case resp := <-responses:
			remaining++
			fmt.Printf("  %d. %s — %v\n", remaining, resp.name, resp.duration)
		case <-deadline:
			if remaining == 0 {
				fmt.Println("  (больше ответов не поступило)")
			}
			fmt.Println()
			fmt.Println("select позволяет:")
			fmt.Println("  - Ждать данные из нескольких каналов одновременно")
			fmt.Println("  - Реализовать таймауты через time.After")
			fmt.Println("  - Брать первый доступный результат (fan-in паттерн)")
			return
		}
	}
}
