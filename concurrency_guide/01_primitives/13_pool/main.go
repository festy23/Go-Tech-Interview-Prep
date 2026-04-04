/*
	sync.Pool — пул временных объектов для снижения нагрузки на GC

	Pool — это потокобезопасный кеш временных объектов. Главная цель —
	переиспользовать аллокации вместо создания новых, уменьшая давление на GC.

	Ключевые особенности:
	  1. Объекты могут быть удалены в ЛЮБОЙ момент при сборке мусора.
	     Pool — это НЕ кеш данных! Нельзя полагаться на то, что объект
	     останется в пуле.
	  2. Поле New — функция для создания нового объекта, если пул пуст.
	  3. Get() — берёт объект из пула (или создаёт новый через New).
	  4. Put() — возвращает объект в пул.
	  5. ВАЖНО: всегда сбрасывайте состояние объекта перед Put()!
	     Иначе следующий Get() получит «грязный» объект.

	Где используется в стандартной библиотеке:
	  - fmt: пул буферов для форматирования
	  - encoding/json: пул буферов для Encoder
	  - net/http: пул буферов для чтения/записи

	Когда НЕ использовать:
	  - Для объектов, которые должны сохраняться (сессии, соединения к БД)
	  - Для небольших объектов (overhead пула > экономия)
	  - Когда нет проблем с GC (преждевременная оптимизация)
*/
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"runtime"
	"sync"
)

// ─────────────────────────────────────────────────────────────────────────────
// 1. Базовое использование Pool
// ─────────────────────────────────────────────────────────────────────────────

func basicPool() {
	fmt.Println("=== Базовый sync.Pool ===")

	pool := &sync.Pool{
		New: func() any {
			fmt.Println("  [pool] создаём новый объект")
			return make([]byte, 0, 1024)
		},
	}

	// Первый Get — пул пуст, вызывается New
	buf1 := pool.Get().([]byte)
	fmt.Printf("  получили буфер: len=%d, cap=%d\n", len(buf1), cap(buf1))

	// Используем буфер
	buf1 = append(buf1, "hello"...)

	// ВАЖНО: сбрасываем состояние перед возвратом!
	buf1 = buf1[:0]
	pool.Put(buf1)

	// Второй Get — объект из пула (New НЕ вызывается)
	buf2 := pool.Get().([]byte)
	fmt.Printf("  получили буфер повторно: len=%d, cap=%d\n", len(buf2), cap(buf2))
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Практика: пул буферов для JSON-кодирования
// ─────────────────────────────────────────────────────────────────────────────

// jsonBufPool — пул bytes.Buffer для JSON-сериализации.
// Такой паттерн широко используется в реальных проектах и стандартной библиотеке.
var jsonBufPool = sync.Pool{
	New: func() any {
		return new(bytes.Buffer)
	},
}

type user struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Age   int    `json:"age"`
}

// marshalJSON — сериализует объект в JSON, переиспользуя буфер из пула.
func marshalJSON(v any) ([]byte, error) {
	buf := jsonBufPool.Get().(*bytes.Buffer)
	defer func() {
		buf.Reset() // ОБЯЗАТЕЛЬНО: сбрасываем буфер перед возвратом
		jsonBufPool.Put(buf)
	}()

	enc := json.NewEncoder(buf)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}

	// Копируем результат — буфер вернётся в пул
	result := make([]byte, buf.Len())
	copy(result, buf.Bytes())
	return result, nil
}

func jsonPoolExample() {
	fmt.Println("=== Практика: пул буферов для JSON ===")

	users := []user{
		{Name: "Алиса", Email: "alice@example.com", Age: 30},
		{Name: "Борис", Email: "boris@example.com", Age: 25},
		{Name: "Виктор", Email: "victor@example.com", Age: 35},
	}

	var wg sync.WaitGroup
	for _, u := range users {
		wg.Add(1)
		go func() {
			defer wg.Done()
			data, err := marshalJSON(u)
			if err != nil {
				fmt.Printf("  ошибка: %v\n", err)
				return
			}
			fmt.Printf("  %s", data) // Encode добавляет \n
		}()
	}
	wg.Wait()
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ВАЖНО: сбрасывайте состояние перед Put!
// ─────────────────────────────────────────────────────────────────────────────

func resetBeforePut() {
	fmt.Println("=== Сброс состояния перед Put ===")

	pool := &sync.Pool{
		New: func() any { return new(bytes.Buffer) },
	}

	// Получаем буфер и записываем данные
	buf := pool.Get().(*bytes.Buffer)
	buf.WriteString("секретные данные")

	// ── НЕПРАВИЛЬНО: возвращаем без сброса ──
	// pool.Put(buf) // следующий Get() получит «секретные данные»!

	// ── ПРАВИЛЬНО: сбрасываем перед возвратом ──
	buf.Reset()
	pool.Put(buf)

	// Проверяем: буфер чистый
	buf2 := pool.Get().(*bytes.Buffer)
	fmt.Printf("  буфер после Reset+Put: %q (пустой — корректно)\n", buf2.String())
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GC удаляет объекты из пула
// ─────────────────────────────────────────────────────────────────────────────

func gcInteraction() {
	fmt.Println("=== GC и sync.Pool ===")

	created := 0
	pool := &sync.Pool{
		New: func() any {
			created++
			return fmt.Sprintf("объект_%d", created)
		},
	}

	// Кладём несколько объектов
	pool.Put("объект_A")
	pool.Put("объект_B")
	pool.Put("объект_C")

	// До GC — объекты доступны
	fmt.Printf("  до GC: Get() = %v\n", pool.Get())

	// Принудительный GC — пул очищается
	runtime.GC()

	// После GC — пул пуст, вызывается New
	obj := pool.Get().(string)
	fmt.Printf("  после GC: Get() = %v (создан заново через New)\n", obj)
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Параллельное использование пула
// ─────────────────────────────────────────────────────────────────────────────

func concurrentPoolUsage() {
	fmt.Println("=== Параллельное использование Pool ===")

	var allocated int64
	pool := &sync.Pool{
		New: func() any {
			allocated++
			return make([]byte, 0, 4096)
		},
	}

	var wg sync.WaitGroup
	const workers = 10
	const iterations = 100

	for w := range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range iterations {
				// Берём буфер из пула
				buf := pool.Get().([]byte)

				// Имитируем работу
				buf = append(buf, byte(w))

				// Сбрасываем и возвращаем
				buf = buf[:0]
				pool.Put(buf)
			}
		}()
	}
	wg.Wait()

	fmt.Printf("  %d воркеров × %d итераций = %d операций\n", workers, iterations, workers*iterations)
	fmt.Printf("  реально аллоцировано объектов: %d (значительно меньше!)\n", allocated)
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Когда НЕ использовать Pool
// ─────────────────────────────────────────────────────────────────────────────

func whenNotToUsePool() {
	fmt.Println("=== Когда НЕ использовать sync.Pool ===")
	fmt.Println("  1. Для долгоживущих объектов (DB connections, sessions)")
	fmt.Println("     → GC может удалить их в любой момент")
	fmt.Println("  2. Для маленьких объектов")
	fmt.Println("     → Overhead пула > экономия на аллокации")
	fmt.Println("  3. Когда нет проблем с GC")
	fmt.Println("     → Преждевременная оптимизация — корень зла")
	fmt.Println("  4. Для гарантированного кеширования")
	fmt.Println("     → Используйте sync.Map или обычный map+mutex")
	fmt.Println()
	fmt.Println("  Хорошие случаи для Pool:")
	fmt.Println("    ✓ Буферы (bytes.Buffer, []byte)")
	fmt.Println("    ✓ Encoder/Decoder объекты")
	fmt.Println("    ✓ Временные структуры в горячем пути (hot path)")
}

func main() {
	basicPool()
	jsonPoolExample()
	resetBeforePut()
	gcInteraction()
	concurrentPoolUsage()
	whenNotToUsePool()
}
