# Go Middle Interview Tasks

Ниже 20 задач в формате "допиши код".

Как решать:
1. Открывай пакет задачи `taskXX_*`
2. Дорабатывай `task.go`
3. Запускай `go test ./...`

Каждая задача изначально падает в тестах специально.

## Задачи

| #  | Пакет | Тема | Сложность |
|----|-------|------|-----------|
| 01 | `task01_reverse_utf8` | Разворот строки по рунам (UTF-8) | ⭐ |
| 02 | `task02_valid_parentheses` | Проверка скобок (стек) | ⭐ |
| 03 | `task03_two_sum` | Два числа с заданной суммой (hashmap) | ⭐ |
| 04 | `task04_top_k_frequent` | K самых частых слов (сортировка) | ⭐⭐ |
| 05 | `task05_merge_intervals` | Слияние интервалов | ⭐⭐ |
| 06 | `task06_channel_fanin` | Fan-in каналов (горутины) | ⭐⭐ |
| 07 | `task07_context_timeout` | Запуск с таймаутом (context) | ⭐⭐ |
| 08 | `task08_lru_cache` | LRU-кеш (hashmap + linked list) | ⭐⭐⭐ |
| 09 | `task09_retry` | Повтор с задержкой | ⭐ |
| 10 | `task10_http_middleware` | HTTP-мидлвара авторизации | ⭐⭐ |
| 11 | `task11_worker_pool` | Пул воркеров (каналы + горутины) | ⭐⭐ |
| 12 | `task12_rate_limiter` | Rate limiter (скользящее окно) | ⭐⭐⭐ |
| 13 | `task13_safe_map` | Потокобезопасный map (mutex) | ⭐⭐ |
| 14 | `task14_pipeline` | Конвейер через каналы | ⭐⭐ |
| 15 | `task15_graceful_shutdown` | Graceful shutdown (context + drain) | ⭐⭐⭐ |
| 16 | `task16_binary_search` | Поиск диапазона в отсортированном массиве | ⭐⭐ |
| 17 | `task17_linked_list_cycle` | Обнаружение цикла в списке (Floyd) | ⭐⭐ |
| 18 | `task18_json_stream` | Потоковый JSON-декодер с фильтрацией | ⭐⭐ |
| 19 | `task19_semaphore` | Семафор на каналах | ⭐⭐ |
| 20 | `task20_errgroup` | Параллельный fetch с отменой по ошибке | ⭐⭐⭐ |
