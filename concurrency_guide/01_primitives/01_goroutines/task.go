/*
Задача: Параллельный подсчёт суммы

Дан слайс из 1_000_000 случайных чисел.
Требуется:
  - Разбить слайс на N частей, где N = runtime.NumCPU()
  - Запустить N горутин, каждая считает сумму своей части
  - Собрать частичные суммы в итоговую
  - Выполнить последовательный подсчёт суммы для проверки корректности
  - Замерить время обоих подходов через time.Since и сравнить

Цель: понять, как горутины позволяют распараллелить вычисления,
и увидеть реальный выигрыш по времени на многоядерной машине.
*/
package main

import (
	"fmt"
	"math/rand"
	"runtime"
	"time"
)

// sequentialSum считает сумму элементов слайса последовательно.
func sequentialSum(nums []int) int64 {
	var sum int64
	for _, n := range nums {
		sum += int64(n)
	}
	return sum
}

// parallelSum разбивает слайс на numParts частей и считает сумму параллельно.
// Каждая горутина записывает свой результат в слайс частичных сумм по индексу,
// что позволяет избежать гонки данных без мьютексов.
func parallelSum(nums []int, numParts int) int64 {
	partials := make([]int64, numParts)
	chunkSize := len(nums) / numParts

	// Канал используется только для ожидания завершения всех горутин
	done := make(chan struct{}, numParts)

	for i := 0; i < numParts; i++ {
		start := i * chunkSize
		end := start + chunkSize
		// Последняя горутина забирает остаток (если длина не делится нацело)
		if i == numParts-1 {
			end = len(nums)
		}

		go func(idx int, slice []int) {
			var sum int64
			for _, n := range slice {
				sum += int64(n)
			}
			partials[idx] = sum
			done <- struct{}{}
		}(i, nums[start:end])
	}

	// Ждём завершения всех горутин
	for i := 0; i < numParts; i++ {
		<-done
	}

	// Складываем частичные суммы
	var total int64
	for _, p := range partials {
		total += p
	}
	return total
}

func main() {
	const size = 1_000_000

	// Генерируем слайс случайных чисел
	nums := make([]int, size)
	rng := rand.New(rand.NewSource(42))
	for i := range nums {
		nums[i] = rng.Intn(1000)
	}

	numCPU := runtime.NumCPU()
	fmt.Printf("Размер слайса: %d\n", size)
	fmt.Printf("Количество CPU: %d\n", numCPU)
	fmt.Println()

	// Последовательный подсчёт
	startSeq := time.Now()
	sumSeq := sequentialSum(nums)
	durSeq := time.Since(startSeq)
	fmt.Printf("Последовательная сумма: %d (за %v)\n", sumSeq, durSeq)

	// Параллельный подсчёт
	startPar := time.Now()
	sumPar := parallelSum(nums, numCPU)
	durPar := time.Since(startPar)
	fmt.Printf("Параллельная сумма:     %d (за %v)\n", sumPar, durPar)

	// Проверка корректности
	fmt.Println()
	if sumSeq == sumPar {
		fmt.Println("Результаты совпадают — параллельный подсчёт корректен.")
	} else {
		fmt.Printf("ОШИБКА: суммы не совпадают! seq=%d, par=%d\n", sumSeq, sumPar)
	}

	// Сравнение производительности
	if durPar < durSeq {
		fmt.Printf("Параллельный подход быстрее в %.2fx\n", float64(durSeq)/float64(durPar))
	} else {
		fmt.Println("Последовательный подход оказался не медленнее (слишком мало данных или накладные расходы на горутины).")
	}
}
