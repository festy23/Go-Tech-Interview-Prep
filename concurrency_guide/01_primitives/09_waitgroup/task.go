/*
ЗАДАЧА: Параллельный загрузчик файлов

Реализовать параллельную загрузку файлов по списку URL-ов с использованием sync.WaitGroup.

Требования:
  - Список из 10 URL-ов (имитация — просто строки)
  - WaitGroup для ожидания завершения всех "загрузок"
  - Каждая горутина имитирует загрузку (sleep 100-500ms, случайно)
  - Результаты (имя файла + размер + время загрузки) собираются в потокобезопасный слайс
  - После завершения всех загрузок выводится итоговая таблица
  - Прогресс отображается через atomic-счётчик завершённых загрузок
*/

package main

import (
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"
)

// DownloadResult — результат загрузки одного файла
type DownloadResult struct {
	URL      string
	FileName string
	Size     int           // размер в байтах (имитация)
	Duration time.Duration // время загрузки
}

// SafeResults — потокобезопасная обёртка над слайсом результатов
type SafeResults struct {
	mu      sync.Mutex
	results []DownloadResult
}

// Add безопасно добавляет результат в слайс
func (sr *SafeResults) Add(r DownloadResult) {
	sr.mu.Lock()
	defer sr.mu.Unlock()
	sr.results = append(sr.results, r)
}

// GetAll возвращает копию всех результатов
func (sr *SafeResults) GetAll() []DownloadResult {
	sr.mu.Lock()
	defer sr.mu.Unlock()
	cp := make([]DownloadResult, len(sr.results))
	copy(cp, sr.results)
	return cp
}

func main() {
	// Список URL-ов для "загрузки"
	urls := []string{
		"https://example.com/report_2024.pdf",
		"https://cdn.images.io/photo_001.jpg",
		"https://releases.go.dev/go1.22.linux-amd64.tar.gz",
		"https://data.gov/dataset_export.csv",
		"https://mirrors.kernel.org/linux-5.15.tar.xz",
		"https://fonts.google.com/roboto-v30.zip",
		"https://storage.cloud.io/backup_db.sql.gz",
		"https://docs.example.com/manual_ru.docx",
		"https://packages.debian.org/libssl3_3.0.deb",
		"https://artifacts.ci.io/build_12345.log",
	}

	var wg sync.WaitGroup
	var completed atomic.Int64 // атомарный счётчик завершённых загрузок
	total := len(urls)

	results := &SafeResults{}

	fmt.Printf("Начинаем загрузку %d файлов...\n\n", total)

	// Запускаем горутину для отображения прогресса
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-done:
				return
			default:
				cur := completed.Load()
				fmt.Printf("\r  Прогресс: %d/%d завершено", cur, total)
				time.Sleep(50 * time.Millisecond)
			}
		}
	}()

	startAll := time.Now()

	// Запускаем загрузку каждого URL в отдельной горутине
	for _, url := range urls {
		wg.Add(1)
		go func(u string) {
			defer wg.Done()

			start := time.Now()

			// Имитация загрузки — случайная задержка от 100 до 500 мс
			delay := time.Duration(100+rand.Intn(401)) * time.Millisecond
			time.Sleep(delay)

			// Имитация размера файла (от 50 КБ до 50 МБ)
			size := 50_000 + rand.Intn(50_000_000)

			// Извлекаем "имя файла" из URL (после последнего '/')
			fileName := u
			for i := len(u) - 1; i >= 0; i-- {
				if u[i] == '/' {
					fileName = u[i+1:]
					break
				}
			}

			elapsed := time.Since(start)

			results.Add(DownloadResult{
				URL:      u,
				FileName: fileName,
				Size:     size,
				Duration: elapsed,
			})

			// Увеличиваем счётчик завершённых загрузок
			completed.Add(1)
		}(url)
	}

	// Ожидаем завершения всех горутин
	wg.Wait()
	close(done)

	totalTime := time.Since(startAll)

	// Выводим итоговую таблицу
	fmt.Printf("\r                                        \n")
	fmt.Println("=== ИТОГОВАЯ ТАБЛИЦА ЗАГРУЗОК ===")
	fmt.Printf("%-35s %12s %12s\n", "Файл", "Размер", "Время")
	fmt.Println("-----------------------------------------------------------")

	allResults := results.GetAll()
	var totalSize int
	for _, r := range allResults {
		totalSize += r.Size
		sizeStr := formatSize(r.Size)
		fmt.Printf("%-35s %12s %12s\n", r.FileName, sizeStr, r.Duration.Round(time.Millisecond))
	}

	fmt.Println("-----------------------------------------------------------")
	fmt.Printf("Всего файлов: %d\n", len(allResults))
	fmt.Printf("Общий размер: %s\n", formatSize(totalSize))
	fmt.Printf("Общее время (параллельно): %s\n", totalTime.Round(time.Millisecond))
}

// formatSize форматирует размер в человекочитаемый вид
func formatSize(bytes int) string {
	switch {
	case bytes >= 1_000_000:
		return fmt.Sprintf("%.1f MB", float64(bytes)/1_000_000)
	case bytes >= 1_000:
		return fmt.Sprintf("%.1f KB", float64(bytes)/1_000)
	default:
		return fmt.Sprintf("%d B", bytes)
	}
}
