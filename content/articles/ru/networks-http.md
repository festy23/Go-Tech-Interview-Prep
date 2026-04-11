---
title: HTTP
blockId: networks-http
parentBlockId: networks
---

# HTTP

HTTP — протокол, на котором держится весь современный веб. Для Go-разработчика это не просто теория: пакет `net/http` используется в каждом сервисе, а понимание версий протокола и механизмов соединений напрямую влияет на производительность. Разбираем структуру сообщений, эволюцию от HTTP/1.1 до HTTP/3 и то, как всё это выглядит изнутри Go.

## Структура HTTP-сообщения

HTTP работает поверх TCP (в HTTP/3 — поверх QUIC). Каждое взаимодействие состоит из **запроса** (Request) и **ответа** (Response).

### Запрос

```
POST /api/users HTTP/1.1
Host: example.com
Content-Type: application/json
Authorization: Bearer eyJhbGc...
Content-Length: 42

{"name": "Alice", "email": "alice@example.com"}
```

Структура:
- **Стартовая строка**: метод, URI, версия.
- **Заголовки**: пары ключ-значение, регистронезависимые ключи.
- **Пустая строка**: разделитель заголовков и тела.
- **Тело**: опционально, зависит от метода.

### Ответ

```
HTTP/1.1 201 Created
Content-Type: application/json
Location: /api/users/42
X-Request-Id: a1b2c3

{"id": 42, "name": "Alice"}
```

Структура аналогична: стартовая строка содержит версию, код состояния и текстовое описание.

## HTTP-методы

| Метод | Идемпотентный | Безопасный | Тело |
|-------|---------------|------------|------|
| GET | Да | Да | Нет |
| HEAD | Да | Да | Нет |
| POST | Нет | Нет | Да |
| PUT | Да | Нет | Да |
| PATCH | Нет | Нет | Да |
| DELETE | Да | Нет | Нет |
| OPTIONS | Да | Да | Нет |

**Идемпотентный** — повторный вызов с теми же параметрами даёт тот же результат. PUT /users/42 с одним и тем же телом всегда приводит к одному состоянию. POST /users создаёт нового пользователя при каждом вызове.

**Безопасный** — не изменяет состояние сервера (только чтение).

## Коды состояния

**1xx — информационные**: 100 Continue, 101 Switching Protocols.

**2xx — успех**: 200 OK, 201 Created, 202 Accepted, 204 No Content.

**3xx — перенаправление**: 301 Moved Permanently, 302 Found, 304 Not Modified, 307 Temporary Redirect.

**4xx — ошибки клиента**: 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 429 Too Many Requests.

**5xx — ошибки сервера**: 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout.

На собеседованиях часто путают 401 и 403: 401 означает «не аутентифицирован» (нет или неверный токен), 403 — «аутентифицирован, но нет доступа».

## Заголовки

### Общие

- `Content-Type: application/json; charset=utf-8` — тип тела.
- `Content-Length: 42` — длина тела в байтах.
- `Transfer-Encoding: chunked` — тело передаётся чанками без известной длины заранее.
- `Accept: application/json` — клиент указывает желаемый формат.
- `Accept-Encoding: gzip, br` — поддерживаемые сжатия.
- `Content-Encoding: gzip` — применённое сжатие тела.

### Кэширование

- `Cache-Control: max-age=3600, public` — директивы кэширования.
- `ETag: "abc123"` — версионный тег ресурса.
- `Last-Modified: Thu, 01 Jan 2026 00:00:00 GMT`.
- `If-None-Match: "abc123"` — условный GET, ответ 304 если ETag совпадает.

### Безопасность

- `Authorization: Bearer <token>` — JWT или OAuth-токен.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` — HSTS.
- `X-Content-Type-Options: nosniff`.
- `Access-Control-Allow-Origin: *` — CORS.

## HTTP/1.1: Keep-Alive и ограничения

В HTTP/1.0 каждый запрос открывал новое TCP-соединение. HTTP/1.1 добавил **keep-alive** — соединение остаётся открытым для следующих запросов.

```
Connection: keep-alive
Keep-Alive: timeout=5, max=100
```

Проблема HTTP/1.1 — **head-of-line blocking на уровне протокола**: следующий запрос не может начаться, пока не получен ответ на предыдущий (даже при pipelining ответы должны возвращаться в порядке запросов).

Браузеры обходят это, открывая 6–8 параллельных соединений к одному домену, но это создаёт нагрузку на сервер.

## HTTP/2: Мультиплексирование и HPACK

HTTP/2 (RFC 7540) решает head-of-line blocking за счёт **бинарного фреймирования** и **мультиплексирования потоков**.

### Ключевые концепции

**Поток (Stream)**: независимый двунаправленный канал в рамках одного TCP-соединения. Каждый запрос получает уникальный `stream_id`. Десятки запросов мультиплексируются поверх одного соединения.

**Фрейм (Frame)**: минимальная единица передачи данных. Типы: HEADERS, DATA, SETTINGS, WINDOW_UPDATE, PING, RST_STREAM.

**HPACK-сжатие**: заголовки сжимаются с помощью статической таблицы (61 предопределённый заголовок) и динамической таблицы (обновляется в ходе сессии). Часто повторяющийся `Content-Type: application/json` передаётся как один индекс вместо полной строки.

**Server Push**: сервер может превентивно отправить ресурс до того, как клиент его запросит. На практике Server Push оказался менее эффективным, чем ожидалось, и HTTP/3 убрал его как обязательную фичу.

**Приоритизация**: каждый поток имеет приоритет и вес. Сервер может обрабатывать важные запросы первыми.

```go
// Go автоматически использует HTTP/2 при TLS
// Явная настройка:
import "golang.org/x/net/http2"

srv := &http.Server{Addr: ":443", Handler: mux}
http2.ConfigureServer(srv, &http2.Server{
    MaxConcurrentStreams: 250,
    MaxReadFrameSize:     1 << 20,
})
```

### Отличие от HTTP/1.1

| Аспект | HTTP/1.1 | HTTP/2 |
|--------|----------|--------|
| Формат | Текстовый | Бинарный |
| Соединения | Много (параллельные) | Одно (мультиплексирование) |
| Сжатие заголовков | Нет | HPACK |
| Порядок ответов | Строгий | Произвольный |
| Server Push | Нет | Да |

## HTTP/3: QUIC и устранение TCP-bottleneck

HTTP/3 (RFC 9114) переходит с TCP на **QUIC** — протокол транспортного уровня поверх UDP, разработанный Google.

### Проблема HTTP/2, которую решает HTTP/3

HTTP/2 устранил head-of-line blocking на уровне протокола, но TCP по-прежнему является единой последовательностью байт. При потере одного пакета **все** потоки HTTP/2 блокируются, пока TCP не выполнит retransmission. Это TCP head-of-line blocking.

QUIC решает это: каждый поток независим, потеря пакета одного потока не блокирует остальные.

### Преимущества QUIC

- **0-RTT и 1-RTT handshake**: QUIC объединяет транспортное и TLS-рукопожатие. Повторные соединения могут использовать 0-RTT (данные отправляются с первым пакетом).
- **Connection Migration**: соединение идентифицируется по Connection ID, а не по паре IP:port. Смена Wi-Fi на мобильный интернет не разрывает соединение.
- **Встроенное шифрование**: QUIC всегда использует TLS 1.3, незашифрованный QUIC невозможен.
- **Независимые потоки**: потеря пакета влияет только на один поток.

```go
// HTTP/3 в Go через quic-go
import (
    "github.com/quic-go/quic-go/http3"
)

srv := &http3.Server{
    Addr:    ":443",
    Handler: mux,
}
log.Fatal(srv.ListenAndServeTLS("cert.pem", "key.pem"))
```

### Сравнение версий

| Характеристика | HTTP/1.1 | HTTP/2 | HTTP/3 |
|----------------|----------|--------|--------|
| Транспорт | TCP | TCP | QUIC (UDP) |
| HoL blocking (протокол) | Да | Нет | Нет |
| HoL blocking (транспорт) | Да | Да | Нет |
| TLS | Опционально | Обычно | Обязательно |
| Handshake RTT | 1-3 | 1-3 | 0-1 |
| Поддержка в Go std | Да | Да | Нет (quic-go) |

## HTTP в Go: практика

### Сервер

```go
package main

import (
    "encoding/json"
    "log/slog"
    "net/http"
    "time"
)

type User struct {
    ID   int    `json:"id"`
    Name string `json:"name"`
}

func main() {
    mux := http.NewServeMux()

    mux.HandleFunc("GET /users/{id}", func(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id") // Go 1.22+: именованные параметры пути
        user := User{ID: 1, Name: "Alice"}
        _ = id

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(user)
    })

    srv := &http.Server{
        Addr:         ":8080",
        Handler:      mux,
        ReadTimeout:  5 * time.Second,
        WriteTimeout: 10 * time.Second,
        IdleTimeout:  120 * time.Second,
    }

    slog.Info("starting server", "addr", srv.Addr)
    if err := srv.ListenAndServe(); err != nil {
        slog.Error("server error", "err", err)
    }
}
```

Начиная с Go 1.22, `http.ServeMux` поддерживает именованные параметры пути и указание HTTP-метода прямо в паттерне: `"GET /users/{id}"`.

### Клиент

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

// Создаём клиент один раз — он потокобезопасен и переиспользует соединения.
var httpClient = &http.Client{
    Timeout: 10 * time.Second,
    Transport: &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 10,
        IdleConnTimeout:     90 * time.Second,
    },
}

func getUser(ctx context.Context, id int) (*User, error) {
    req, err := http.NewRequestWithContext(ctx, http.MethodGet,
        fmt.Sprintf("https://api.example.com/users/%d", id), nil)
    if err != nil {
        return nil, fmt.Errorf("create request: %w", err)
    }
    req.Header.Set("Accept", "application/json")

    resp, err := httpClient.Do(req)
    if err != nil {
        return nil, fmt.Errorf("do request: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
    }

    var user User
    if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
        return nil, fmt.Errorf("decode response: %w", err)
    }
    return &user, nil
}
```

### Middleware

Go 1.22+ `http.Handler` позволяет строить цепочки middleware через замыкания:

```go
func logging(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next.ServeHTTP(w, r)
        slog.Info("request",
            "method", r.Method,
            "path", r.URL.Path,
            "duration", time.Since(start),
        )
    })
}

// Применение
mux.Handle("GET /users/{id}", logging(http.HandlerFunc(getUserHandler)))
```

## Сжатие и производительность

Включение gzip-сжатия ответов снижает трафик на 60–80% для JSON:

```go
import "compress/gzip"

func gzipMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
            next.ServeHTTP(w, r)
            return
        }
        gz := gzip.NewWriter(w)
        defer gz.Close()
        w.Header().Set("Content-Encoding", "gzip")
        w.Header().Del("Content-Length") // длина неизвестна до сжатия
        next.ServeHTTP(&gzipResponseWriter{Writer: gz, ResponseWriter: w}, r)
    })
}
```

На практике чаще используют готовые библиотеки (например, `github.com/klauspost/compress/gzhttp`), которые корректно обрабатывают все edge cases.

## Частые вопросы на собеседованиях

**Чем POST отличается от PUT?** POST — создание ресурса, не идемпотентен. PUT — замена ресурса целиком, идемпотентен. PATCH — частичное обновление.

**Что такое CORS и когда он нужен?** Cross-Origin Resource Sharing — механизм браузера, запрещающий JavaScript-коду на `a.com` делать запросы к `b.com` без явного разрешения сервера `b.com` через заголовки `Access-Control-Allow-Origin`.

**В чём разница между 401 и 403?** 401 Unauthorized — пользователь не аутентифицирован (нет или невалидный токен). 403 Forbidden — пользователь аутентифицирован, но у него нет прав на ресурс.

**Зачем нужен `Keep-Alive`?** Переиспользование TCP-соединения для нескольких запросов экономит latency (нет нового handshake) и ресурсы сервера.

**Что такое chunked transfer encoding?** Способ отправки тела ответа, когда длина неизвестна заранее — например, при стриминге. Тело разбивается на чанки, каждый с указанием своего размера, последний чанк имеет размер 0.

**Как HTTP/2 решает head-of-line blocking?** Мультиплексирование потоков: несколько запросов отправляются по одному TCP-соединению одновременно, ответы могут прийти в любом порядке. Но потеря пакета на уровне TCP всё равно блокирует все потоки — это решает HTTP/3.
