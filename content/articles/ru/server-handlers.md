---
title: Обработчики и маршрутизация в Go
blockId: server-handlers
parentBlockId: server
---

# Обработчики и маршрутизация в Go

Обработчики — сердце любого Go-сервера. Всё, что происходит при обработке HTTP-запроса: разбор пути, валидация, бизнес-логика, формирование ответа — проходит через них. Понимание интерфейса `http.Handler`, нового `ServeMux` и паттерна middleware обязательно для любого Go-разработчика, работающего с серверной стороной.

## Интерфейс http.Handler

Весь HTTP-стек Go строится вокруг одного интерфейса:

```go
type Handler interface {
    ServeHTTP(ResponseWriter, *Request)
}
```

Любой тип, реализующий `ServeHTTP`, может быть обработчиком. Это может быть структура с зависимостями, функция-адаптер или целый роутер. Именно минимализм интерфейса делает middleware в Go таким элегантным: обёртка над `Handler` сама является `Handler`.

`http.ResponseWriter` — интерфейс записи ответа. Основные методы:
- `Header() http.Header` — доступ к заголовкам ответа (устанавливайте до `WriteHeader`).
- `WriteHeader(statusCode int)` — отправка статус-кода (можно вызвать только один раз).
- `Write([]byte) (int, error)` — запись тела ответа.

`*http.Request` — структура входящего запроса. Содержит метод, URL, заголовки, тело и, с Go 1.22, методы для работы с переменными пути.

## HandlerFunc: функции как обработчики

Для простых случаев, когда не нужна структура, `http.HandlerFunc` адаптирует функцию к интерфейсу `Handler`:

```go
type HandlerFunc func(ResponseWriter, *Request)

func (f HandlerFunc) ServeHTTP(w ResponseWriter, r *Request) {
    f(w, r)
}
```

Это позволяет использовать обычные функции там, где требуется `http.Handler`:

```go
mux.Handle("GET /users", http.HandlerFunc(listUsers))
// или короче:
mux.HandleFunc("GET /users", listUsers)
```

## ServeMux в Go 1.22: расширенные паттерны

До Go 1.22 стандартный `ServeMux` умел только префиксную маршрутизацию по пути — метод HTTP не учитывался. Начиная с Go 1.22, синтаксис паттернов значительно расширен:

```go
mux := http.NewServeMux()

// Метод + путь
mux.HandleFunc("GET /api/users", listUsers)
mux.HandleFunc("POST /api/users", createUser)
mux.HandleFunc("DELETE /api/users/{id}", deleteUser)

// Только путь (все методы)
mux.HandleFunc("/health", healthCheck)

// Wildcard в конце (префиксный матч)
mux.HandleFunc("/static/", serveStatic)
```

Новые возможности паттернов:
- **Метод в начале**: `GET /path`, `POST /path`, `DELETE /path/{id}`.
- **Переменные пути**: `{name}` — захватывает один сегмент.
- **Wildcard**: `{name...}` — захватывает оставшуюся часть пути.
- **Trailing slash**: `/api/users/` — префиксный матч для всех подпутей.

Приоритет: более специфичный паттерн побеждает. `GET /api/users/{id}` имеет приоритет над `GET /api/users/`.

## r.PathValue(): извлечение переменных пути

Метод `r.PathValue(name string) string` появился в Go 1.22 вместе с расширенным `ServeMux`:

```go
mux.HandleFunc("GET /api/users/{id}", func(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    if id == "" {
        http.Error(w, "missing id", http.StatusBadRequest)
        return
    }
    // id — строка, нужно преобразовать при необходимости
    userID, err := strconv.Atoi(id)
    if err != nil {
        http.Error(w, "invalid id", http.StatusBadRequest)
        return
    }
    // ...
})
```

Если переменная не найдена или паттерн не содержит указанного имени — возвращается пустая строка. Не паникует.

Wildcard-захват:

```go
mux.HandleFunc("GET /files/{path...}", func(w http.ResponseWriter, r *http.Request) {
    filePath := r.PathValue("path") // "docs/api/v1/index.html"
    // ...
})
```

## Жизненный цикл запроса

Понимание пути запроса от `net.Listener` до обработчика критично для отладки и написания middleware:

1. **Accept** — `net.Listener` принимает TCP-соединение.
2. **Goroutine** — для каждого соединения запускается горутина `http.(*conn).serve`.
3. **Read** — читается HTTP-запрос, формируется `*http.Request`.
4. **Dispatch** — `ServeMux.ServeHTTP` ищет наиболее специфичный паттерн.
5. **Handler chain** — middleware обёртки вызываются по цепочке.
6. **Business logic** — конечный обработчик формирует ответ.
7. **Write** — `ResponseWriter` записывает заголовки и тело в TCP-соединение.

Важные детали:
- После первого вызова `Write` или `WriteHeader` заголовки уже отправлены — изменить их нельзя.
- `r.Body` нужно читать и закрывать явно, иначе соединение не вернётся в пул.
- Паника в обработчике, не перехваченная middleware, завершит горутину, но не весь сервер.

## Паттерн middleware

Middleware — функция, принимающая `http.Handler` и возвращающая новый `http.Handler`. Она добавляет логику вокруг существующего обработчика:

```go
func Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Логика ДО обработчика
        next.ServeHTTP(w, r)
        // Логика ПОСЛЕ обработчика
    })
}
```

Несколько middleware можно цепочить. Ручной способ:

```go
handler := AuthMiddleware(LoggingMiddleware(mux))
```

Для более чистой записи часто пишут `Chain` или `Use`:

```go
func Chain(h http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
    for i := len(middlewares) - 1; i >= 0; i-- {
        h = middlewares[i](h)
    }
    return h
}

handler := Chain(mux, LoggingMiddleware, AuthMiddleware, RecoveryMiddleware)
```

### Важные middleware

**Logging middleware** — записывает метод, путь, статус, duration:

```go
type responseWriter struct {
    http.ResponseWriter
    status int
}

func (rw *responseWriter) WriteHeader(code int) {
    rw.status = code
    rw.ResponseWriter.WriteHeader(code)
}

func LoggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
        start := time.Now()
        next.ServeHTTP(rw, r)
        slog.Info("http",
            "method", r.Method,
            "path", r.URL.Path,
            "status", rw.status,
            "duration", time.Since(start),
        )
    })
}
```

**Recovery middleware** — перехватывает паники:

```go
func RecoveryMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if rec := recover(); rec != nil {
                slog.Error("panic recovered", "error", rec,
                    "stack", debug.Stack())
                http.Error(w, "internal server error",
                    http.StatusInternalServerError)
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

**Context middleware** — добавляет данные в контекст запроса:

```go
type contextKey string

const requestIDKey contextKey = "requestID"

func RequestIDMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        id := uuid.New().String()
        ctx := context.WithValue(r.Context(), requestIDKey, id)
        w.Header().Set("X-Request-ID", id)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

// В обработчике:
id := r.Context().Value(requestIDKey).(string)
```

## Передача зависимостей через структуру

Глобальные переменные нарушают тестируемость и являются антипаттерном в Go. Правильный подход — зависимости через структуру сервера:

```go
type Handler struct {
    db    *sql.DB
    log   *slog.Logger
    cache *redis.Client
}

func NewHandler(db *sql.DB, log *slog.Logger, cache *redis.Client) *Handler {
    return &Handler{db: db, log: log, cache: cache}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
    mux.HandleFunc("GET /api/users", h.listUsers)
    mux.HandleFunc("POST /api/users", h.createUser)
    mux.HandleFunc("GET /api/users/{id}", h.getUser)
    mux.HandleFunc("DELETE /api/users/{id}", h.deleteUser)
}

func (h *Handler) listUsers(w http.ResponseWriter, r *http.Request) {
    users, err := h.db.QueryContext(r.Context(), "SELECT id, name FROM users")
    if err != nil {
        h.log.Error("query users", "error", err)
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }
    defer users.Close()
    // ...
}
```

## Чтение и запись JSON

Стандартный паттерн для JSON API:

```go
func respond(w http.ResponseWriter, status int, v any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    if err := json.NewEncoder(w).Encode(v); err != nil {
        slog.Error("encode response", "error", err)
    }
}

func decode[T any](r *http.Request) (T, error) {
    var v T
    if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
        return v, fmt.Errorf("decode body: %w", err)
    }
    return v, nil
}

// Использование
func (h *Handler) createUser(w http.ResponseWriter, r *http.Request) {
    input, err := decode[CreateUserRequest](r)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    // ...
    respond(w, http.StatusCreated, user)
}
```

Ограничение размера тела: `r.Body = http.MaxBytesReader(w, r.Body, 1<<20)` (1 МБ) — защита от DoS.

## Сравнение: stdlib vs chi vs gin

**Стандартная библиотека (Go 1.22+)**:
- Плюсы: нет зависимостей, стабильный API, Go 1.22 паттерны закрывают 80% потребностей.
- Минусы: нет групп маршрутов, нет встроенного биндинга параметров, middleware надо цепочить вручную.

**chi**:
- Плюсы: middleware-стек (`Use`), группы маршрутов (`Route`), параметры через `chi.URLParam`, совместим с `net/http` обработчиками.
- Минусы: внешняя зависимость, функциональность мало отличается от stdlib после Go 1.22.

```go
r := chi.NewRouter()
r.Use(middleware.Logger)
r.Use(middleware.Recoverer)

r.Route("/api", func(r chi.Router) {
    r.Get("/users", listUsers)
    r.Post("/users", createUser)
    r.Get("/users/{id}", getUser)
})
```

**gin**:
- Плюсы: высокая производительность, встроенный биндинг (`c.ShouldBindJSON`), валидация через теги, богатая экосистема.
- Минусы: собственный тип контекста (`*gin.Context`), не совместим с `net/http` middleware напрямую, больший размер бинарника.

```go
r := gin.Default()
r.GET("/api/users/:id", func(c *gin.Context) {
    id := c.Param("id")
    // ...
    c.JSON(http.StatusOK, user)
})
```

**Когда что выбирать**: для новых проектов стандартный `ServeMux` + ручные middleware достаточны для большинства API. chi имеет смысл при сложной иерархии маршрутов. gin — когда нужна максимальная производительность или большая команда, знакомая с ним.

## Типичные ошибки

**1. Запись в ResponseWriter после завершения обработчика.** Если middleware вызывает `next.ServeHTTP(w, r)` и после этого пытается записать заголовок — уже поздно. Используйте обёртку над `ResponseWriter` для фиксации статуса.

**2. Игнорирование `r.Body.Close()`.** Тело запроса читать и закрывать — ответственность обработчика. `defer r.Body.Close()` в начале обработчика.

**3. Отсутствие ограничения размера тела.** Без `MaxBytesReader` клиент может отправить гигабайт данных и занять память сервера.

**4. Гонки при параллельных записях в ResponseWriter.** `ResponseWriter` не thread-safe. Не пишите в него из нескольких горутин одновременно.

**5. Паника вместо возврата ошибки.** В обработчике на ошибку нужно отправить ответ и вернуться (`return`), а не паниковать. Паника — только для действительно неожиданных ситуаций.

## Итог

Стандартная библиотека Go 1.22+ покрывает подавляющее большинство потребностей маршрутизации без дополнительных зависимостей. Интерфейс `http.Handler` плюс паттерн middleware дают гибкую и тестируемую архитектуру. Передача зависимостей через структуру вместо глобальных переменных — обязательный принцип идиоматичного Go-сервера.
