/*
Задача: Слияние N отсортированных каналов (merge sorted)

N горутин, каждая отправляет отсортированную последовательность чисел
в свой канал и закрывает его по завершении.

Требуется:
  - Реализовать функцию mergeSorted, которая принимает несколько каналов
    и возвращает один канал с полностью отсортированным потоком
  - Алгоритм: хранить по одному значению из каждого канала,
    отправлять минимальное, подтянуть следующее из того же канала
  - Использовать close для сигнализации завершения каждого источника
  - Использовать range для чтения из результирующего канала

Цель: понять семантику close (сигнал «больше данных не будет»)
и идиому range по каналу для чтения до закрытия.
*/
package main

import (
	"fmt"
	"math"
)

// sortedSource создаёт канал, отправляет в него отсортированные числа и закрывает.
func sortedSource(name string, nums []int) <-chan int {
	ch := make(chan int)
	go func() {
		for _, n := range nums {
			ch <- n
		}
		// Закрытие канала сигнализирует: «данных больше не будет»
		close(ch)
		fmt.Printf("  [источник %s] закрыт\n", name)
	}()
	return ch
}

// элемент буфера: значение из канала и сам канал для подтягивания следующего
type chanItem struct {
	value int
	ch    <-chan int
	valid bool // false, если канал исчерпан
}

// mergeSorted принимает несколько каналов с отсортированными данными
// и возвращает один канал, содержащий все элементы в отсортированном порядке.
func mergeSorted(channels ...<-chan int) <-chan int {
	out := make(chan int)

	go func() {
		// Инициализация: читаем по одному значению из каждого канала
		items := make([]chanItem, len(channels))
		for i, ch := range channels {
			val, ok := <-ch
			items[i] = chanItem{value: val, ch: ch, valid: ok}
		}

		for {
			// Находим минимальное значение среди текущих элементов
			minIdx := -1
			minVal := math.MaxInt
			for i, item := range items {
				if item.valid && item.value < minVal {
					minVal = item.value
					minIdx = i
				}
			}

			// Если нет валидных элементов — все каналы исчерпаны
			if minIdx == -1 {
				break
			}

			// Отправляем минимальный элемент
			out <- minVal

			// Подтягиваем следующее значение из того же канала
			val, ok := <-items[minIdx].ch
			items[minIdx] = chanItem{value: val, ch: items[minIdx].ch, valid: ok}
		}

		// Закрываем выходной канал — сигнал потребителю
		close(out)
	}()

	return out
}

func main() {
	// Создаём несколько источников отсортированных данных
	ch1 := sortedSource("A", []int{1, 5, 9, 13, 17})
	ch2 := sortedSource("B", []int{2, 6, 10, 14})
	ch3 := sortedSource("C", []int{3, 4, 7, 11, 15, 18, 20})
	ch4 := sortedSource("D", []int{8, 12, 16, 19})

	fmt.Println("Запускаем слияние 4 отсортированных каналов...")
	fmt.Println()

	// Сливаем все каналы в один отсортированный поток
	merged := mergeSorted(ch1, ch2, ch3, ch4)

	// Читаем через range — цикл завершится, когда канал будет закрыт
	fmt.Print("Результат слияния: ")
	count := 0
	prev := math.MinInt
	sorted := true
	for val := range merged {
		if count > 0 {
			fmt.Print(", ")
		}
		fmt.Print(val)
		if val < prev {
			sorted = false
		}
		prev = val
		count++
	}
	fmt.Println()
	fmt.Println()

	fmt.Printf("Всего элементов: %d\n", count)
	if sorted {
		fmt.Println("Порядок: корректный (отсортировано по возрастанию)")
	} else {
		fmt.Println("ОШИБКА: порядок нарушен!")
	}
	fmt.Println()
	fmt.Println("close() сигнализирует получателю, что данных больше не будет.")
	fmt.Println("range по каналу автоматически завершается при закрытии канала.")
}
