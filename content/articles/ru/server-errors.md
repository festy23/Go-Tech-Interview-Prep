---
title: Обработка ошибок в Go-серверах
blockId: server-errors
parentBlockId: server
---

# Обработка ошибок в Go-серверах

Обработка ошибок — область, где Go выделяется среди других языков. Нет исключений, нет скрытых try/catch, нет «магических» фреймворков. Каждая ошибка возвращается явно, обрабатывается в месте возникновения или передаётся выше. На серверах это порождает конкретные паттерны: как превратить Go-ошибку в правильный HTTP-ответ, как сохранить цепочку ошибок для отладки, как не допустить падения сервера из-за паники.

## Базовые принципы

Go-ошибка — это значение, реализующее интерфейс `error`:

```go
type error interface {
    Error() string
}
```

В отличие от исключений, ошибка — обычное возвращаемое значение. Это значит:
- Компилятор заставляет вас проверить её (если вы игнорируете `error`, линтеры предупреждают).
- Цепочка вызовов явная — видно, где ошибка возникла и как она поднялась вверх.
- Нет перехвата «сбоку» — ошибка идёт только туда, куда вы её передали.

На серверах типичный путь ошибки: слой БД → слой сервиса → обработчик HTTP → HTTP-ответ клиенту.

## Кастомные типы ошибок

Для серверных ошибок полезно создавать типы, несущие HTTP-статус:

```go
// HTTPError — ошибка с HTTP-статусом
type HTTPError struct {
    Status  int    `json:"status"`
    Code    string `json:"code"`
    Message string `json:"message"`
}

func (e *HTTPError) Error() string {
    return fmt.Sprintf("HTTP %d %s: %s", e.Status, e.Code, e.Message)
}

// Конструкторы для частых случаев
func NewNotFound(resource, id string) *HTTPError {
    return &HTTPError{
        Status:  http.StatusNotFound,
        Code:    "NOT_FOUND",
        Message: fmt.Sprintf("%s %q not found", resource, id),
    }
}

func NewBadRequest(msg string) *HTTPError {
    return &HTTPError{
        Status:  http.StatusBadRequest,
        Code:    "BAD_REQUEST",
        Message: msg,
    }
}

func NewUnauthorized() *HTTPError {
    return &HTTPError{
        Status:  http.StatusUnauthorized,
        Code:    "UNAUTHORIZED",
        Message: "authentication required",
    }
}

func NewForbidden() *HTTPError {
    return &HTTPError{
        Status:  http.StatusForbidden,
        Code:    "FORBIDDEN",
        Message: "insufficient permissions",
    }
}
```

Кастомный тип позволяет использовать `errors.As` для извлечения в обработчике ошибок.

## Обёртка ошибок: fmt.Errorf и %w

Обёртка через `%w` сохраняет цепочку ошибок. Это позволяет добавлять контекст, не теряя оригинальную ошибку:

```go
func getUserByID(ctx context.Context, id int64) (*User, error) {
    user, err := db.QueryUserByID(ctx, id)
    if err != nil {
        // Добавляем контекст: где и с какими данными возникла ошибка
        return nil, fmt.Errorf("getUserByID id=%d: %w", id, err)
    }
    return user, nil
}

// В сервисном слое
func (s *UserService) GetProfile(ctx context.Context, id int64) (*Profile, error) {
    user, err := getUserByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("GetProfile: %w", err)
    }
    // ...
}
```

Цепочка ошибок: `GetProfile: getUserByID id=42: sql: no rows in result set`

Теперь в обработчике HTTP можно проверить исходный тип:

```go
if errors.Is(err, sql.ErrNoRows) {
    http.Error(w, "not found", http.StatusNotFound)
    return
}
```

## errors.Is и errors.As

**`errors.Is(err, target)`** — проверяет, содержит ли цепочка ошибок конкретное значение. Работает с сентинель-ошибками:

```go
var ErrUserNotFound = errors.New("user not found")

// В репозитории
if rows == 0 {
    return nil, fmt.Errorf("queryUser: %w", ErrUserNotFound)
}

// В обработчике
if errors.Is(err, ErrUserNotFound) {
    respond(w, http.StatusNotFound,
        map[string]string{"error": "user not found"})
    return
}
```

**`errors.As(err, &target)`** — извлекает первый элемент цепочки нужного типа:

```go
var httpErr *HTTPError
if errors.As(err, &httpErr) {
    respond(w, httpErr.Status, httpErr)
    return
}
```

Разница: `errors.Is` для конкретных значений (sentinel errors), `errors.As` для типов с данными.

## Централизованный обработчик ошибок

Антипаттерн — разная обработка ошибок в каждом обработчике. Лучше единая функция:

```go
// writeError — преобразует Go-ошибку в HTTP-ответ
func writeError(w http.ResponseWriter, r *http.Request, err error) {
    // 1. HTTPError с явным статусом
    var httpErr *HTTPError
    if errors.As(err, &httpErr) {
        respond(w, httpErr.Status, httpErr)
        return
    }

    // 2. Ошибки валидации
    var validErr *ValidationError
    if errors.As(err, &validErr) {
        respond(w, http.StatusUnprocessableEntity, map[string]any{
            "status":  http.StatusUnprocessableEntity,
            "code":    "VALIDATION_ERROR",
            "errors":  validErr.Fields,
        })
        return
    }

    // 3. Специфичные sentinel-ошибки
    if errors.Is(err, ErrUserNotFound) {
        respond(w, http.StatusNotFound,
            map[string]string{"error": "user not found"})
        return
    }

    // 4. Прочие ошибки — 500, детали не раскрываем клиенту
    slog.Error("unhandled error",
        "error", err,
        "path", r.URL.Path,
        "method", r.Method,
    )
    respond(w, http.StatusInternalServerError,
        map[string]string{"error": "internal server error"})
}
```

Обработчики становятся чистыми:

```go
func (h *Handler) getUser(w http.ResponseWriter, r *http.Request) {
    id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
    if err != nil {
        writeError(w, r, NewBadRequest("invalid user id"))
        return
    }

    user, err := h.service.GetUser(r.Context(), id)
    if err != nil {
        writeError(w, r, err)
        return
    }

    respond(w, http.StatusOK, user)
}
```

## Ошибки валидации

Валидация запроса — отдельная категория ошибок. Клиенту нужно знать, какие поля содержат ошибки:

```go
type FieldError struct {
    Field   string `json:"field"`
    Message string `json:"message"`
}

type ValidationError struct {
    Fields []FieldError `json:"fields"`
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation failed: %d field(s)", len(e.Fields))
}

func (e *ValidationError) Add(field, message string) {
    e.Fields = append(e.Fields, FieldError{Field: field, Message: message})
}

func (e *ValidationError) HasErrors() bool {
    return len(e.Fields) > 0
}

// Использование
func validateCreateUser(req CreateUserRequest) error {
    ve := &ValidationError{}

    if req.Name == "" {
        ve.Add("name", "name is required")
    }
    if len(req.Name) > 100 {
        ve.Add("name", "name must be at most 100 characters")
    }
    if !isValidEmail(req.Email) {
        ve.Add("email", "invalid email format")
    }
    if len(req.Password) < 8 {
        ve.Add("password", "password must be at least 8 characters")
    }

    if ve.HasErrors() {
        return ve
    }
    return nil
}
```

Ответ клиенту:
```json
{
  "status": 422,
  "code": "VALIDATION_ERROR",
  "errors": [
    {"field": "email", "message": "invalid email format"},
    {"field": "password", "message": "password must be at least 8 characters"}
  ]
}
```

## Panic recovery middleware

Паника в обработчике — нештатная ситуация, но она не должна уронить весь сервер. Middleware с `recover()` перехватывает паники и возвращает 500:

```go
import "runtime/debug"

func RecoveryMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if rec := recover(); rec != nil {
                // Полный стектрейс в лог
                slog.Error("panic recovered",
                    "error", rec,
                    "stack", string(debug.Stack()),
                    "method", r.Method,
                    "path", r.URL.Path,
                )

                // Если заголовки ещё не отправлены — ответить 500
                // (проверка нужна, т.к. ResponseWriter может быть частично записан)
                if rw, ok := w.(interface{ Written() bool }); !ok || !rw.Written() {
                    http.Error(w, "internal server error",
                        http.StatusInternalServerError)
                }
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

Важно: паника — это именно исключительная ситуация (nil pointer, out of bounds). Ожидаемые ошибки бизнес-логики возвращаются как `error`, не паника.

## Структурированные ошибки и коды

На практике клиенты API (особенно мобильные) привязываются к машиночитаемым кодам ошибок, а не к HTTP-статусам. Машиночитаемые коды позволяют выводить корректный текст на любом языке:

```go
const (
    CodeNotFound       = "NOT_FOUND"
    CodeUnauthorized   = "UNAUTHORIZED"
    CodeForbidden      = "FORBIDDEN"
    CodeBadRequest     = "BAD_REQUEST"
    CodeValidation     = "VALIDATION_ERROR"
    CodeConflict       = "CONFLICT"
    CodeRateLimit      = "RATE_LIMIT_EXCEEDED"
    CodeInternal       = "INTERNAL_ERROR"
)

type ErrorResponse struct {
    Status  int    `json:"status"`
    Code    string `json:"code"`
    Message string `json:"message"`
    // RequestID для трассировки
    TraceID string `json:"trace_id,omitempty"`
}
```

Клиент получает:
```json
{
  "status": 404,
  "code": "NOT_FOUND",
  "message": "user \"42\" not found",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Идемпотентность и повторные попытки

Серверные ошибки бывают временными. Различайте:
- **4xx** — ошибка клиента, повторять бессмысленно (кроме 429 Too Many Requests).
- **5xx** — ошибка сервера, можно повторить с экспоненциальным backoff.

Для безопасного повтора операции вставки/обновления используйте идемпотентность: уникальный `idempotency_key` от клиента, проверяемый на сервере.

## Логирование ошибок

Не все ошибки равны. Дифференцированное логирование:

```go
func writeError(w http.ResponseWriter, r *http.Request, err error) {
    var httpErr *HTTPError
    if errors.As(err, &httpErr) {
        // 4xx — предупреждение (ошибка клиента, ожидаема)
        if httpErr.Status >= 400 && httpErr.Status < 500 {
            slog.Warn("client error",
                "status", httpErr.Status,
                "code", httpErr.Code,
                "path", r.URL.Path,
            )
        }
        respond(w, httpErr.Status, httpErr)
        return
    }

    // 5xx — ошибка (неожиданная, нужно расследовать)
    slog.Error("server error",
        "error", err,
        "path", r.URL.Path,
        "method", r.Method,
        "trace_id", traceIDFromContext(r.Context()),
    )
    respond(w, http.StatusInternalServerError, map[string]string{
        "error": "internal server error",
    })
}
```

Правило: не логируйте 4xx как Error — иначе алерты будут срабатывать на ошибки клиентов.

## Timeout и контекст

Ошибка `context.DeadlineExceeded` — частный случай серверной ошибки. Обрабатывайте её явно:

```go
func (h *Handler) slowEndpoint(w http.ResponseWriter, r *http.Request) {
    result, err := h.service.SlowOperation(r.Context())
    if err != nil {
        if errors.Is(err, context.DeadlineExceeded) ||
            errors.Is(err, context.Canceled) {
            // Клиент ушёл или истёк таймаут
            http.Error(w, "request timeout", http.StatusGatewayTimeout)
            return
        }
        writeError(w, r, err)
        return
    }
    respond(w, http.StatusOK, result)
}
```

## Типичные вопросы на собеседовании

**Чем `errors.Is` отличается от `errors.As`?** `errors.Is` сравнивает значения в цепочке с целевым значением — используется для sentinel errors. `errors.As` ищет в цепочке тип и записывает его в target — используется для типов с данными.

**Нужно ли логировать ошибку на каждом уровне?** Нет. Логируйте один раз на верхнем уровне (в обработчике HTTP). На нижних уровнях — только обёртка с контекстом. Иначе одна ошибка будет залогирована 5 раз.

**Можно ли паниковать в обработчике?** Лучше нет — возвращайте ошибку. Паника оправдана для программных ошибок (nil pointer, нарушение инвариантов), а не для бизнес-логики. Recovery middleware — страховочная сетка, а не основной механизм.

## Итог

Архитектура ошибок в Go-сервере: кастомные типы с HTTP-статусом → обёртка с `%w` на каждом слое → `errors.Is/As` в централизованном обработчике → дифференцированное логирование → panic recovery middleware. Это даёт читаемые ошибки для клиента, полную цепочку для разработчика и устойчивый сервер, который не падает при неожиданных ситуациях.
