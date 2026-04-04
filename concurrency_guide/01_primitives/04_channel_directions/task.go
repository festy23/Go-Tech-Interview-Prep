/*
Задача: Конвейер преобразований строк

Построить конвейер (pipeline) из нескольких стадий обработки строк,
где каждая стадия — отдельная горутина, а каналы строго типизированы
по направлению (<-chan и chan<-).

Требуется реализовать:
  - generate(items ...string) <-chan string — генератор входных данных
  - filter(in <-chan string, predicate func(string) bool) <-chan string — фильтрация
  - toUpper(in <-chan string) <-chan string — перевод в верхний регистр
  - addPrefix(in <-chan string, prefix string) <-chan string — добавление префикса

Цепочка: генератор → фильтр(длина > 3) → toUpper → addPrefix(">>> ")

Цель: понять направленность каналов (channel directions) и паттерн конвейера,
где каждая функция принимает read-only канал и возвращает read-only канал.
*/
package main

import (
	"fmt"
	"strings"
)

// generate создаёт канал и отправляет в него переданные строки.
// Возвращает read-only канал — потребитель может только читать.
func generate(items ...string) <-chan string {
	out := make(chan string)
	go func() {
		for _, item := range items {
			out <- item
		}
		close(out)
	}()
	return out
}

// filter пропускает только те строки, для которых predicate возвращает true.
// Принимает read-only канал, возвращает read-only канал.
func filter(in <-chan string, predicate func(string) bool) <-chan string {
	out := make(chan string)
	go func() {
		for s := range in {
			if predicate(s) {
				out <- s
			}
		}
		close(out)
	}()
	return out
}

// toUpper переводит каждую строку в верхний регистр.
// Принимает read-only канал, возвращает read-only канал.
func toUpper(in <-chan string) <-chan string {
	out := make(chan string)
	go func() {
		for s := range in {
			out <- strings.ToUpper(s)
		}
		close(out)
	}()
	return out
}

// addPrefix добавляет заданный префикс к каждой строке.
// Принимает read-only канал, возвращает read-only канал.
func addPrefix(in <-chan string, prefix string) <-chan string {
	out := make(chan string)
	go func() {
		for s := range in {
			out <- prefix + s
		}
		close(out)
	}()
	return out
}

func main() {
	// Входные данные: слова разной длины
	words := []string{
		"go", "concurrency", "is", "fun", "channels",
		"are", "typed", "by", "direction", "ok",
		"pipeline", "io", "net",
	}

	fmt.Println("Входные данные:")
	for _, w := range words {
		fmt.Printf("  %q (длина %d)\n", w, len(w))
	}
	fmt.Println()

	// Строим конвейер: генератор → фильтр → toUpper → addPrefix
	// Каждая стадия запускает горутину и возвращает read-only канал
	stage1 := generate(words...)
	stage2 := filter(stage1, func(s string) bool {
		return len(s) > 3 // Пропускаем только слова длиннее 3 символов
	})
	stage3 := toUpper(stage2)
	stage4 := addPrefix(stage3, ">>> ")

	// Читаем результат из последней стадии конвейера
	fmt.Println("Результат конвейера (длина > 3 → UPPER → prefix):")
	count := 0
	for result := range stage4 {
		count++
		fmt.Printf("  %s\n", result)
	}

	fmt.Printf("\nОбработано строк: %d из %d\n", count, len(words))
	fmt.Println()
	fmt.Println("Направленность каналов (<-chan и chan<-) гарантирует на уровне")
	fmt.Println("компилятора, что каждая стадия конвейера может только читать")
	fmt.Println("из входного канала и только писать в выходной.")
}
