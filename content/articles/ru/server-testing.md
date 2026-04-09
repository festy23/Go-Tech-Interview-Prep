---
title: Тестирование Go-серверов
blockId: server-testing
parentBlockId: server
---

# Тестирование Go-серверов

Тестирование — первоклассный гражданин в экосистеме Go. Пакет `testing` встроен, `httptest` позволяет тестировать HTTP-обработчики без реального сетевого соединения, а начиная с Go 1.24 появились `t.Context()` и `b.Loop()`, которые упрощают написание тестов и бенчмарков. На собеседованиях тестирование Go-серверов проверяют через практические задачи и обсуждение архитектурных решений.

## httptest.NewRecorder: unit-тесты обработчиков

`httptest.ResponseRecorder` — это `http.ResponseWriter`, который сохраняет всё что в него записано: статус-код, заголовки, тело. Идеально для тестирования одного обработчика в изоляции:

```go
import (
    "net/http"
    "net/http/httptest"
    "testing"
)

func TestHealthHandler(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/health", nil)
    w := httptest.NewRecorder()

    HealthHandler(w, req)

    res := w.Result()
    defer res.Body.Close()

    if res.StatusCode != http.StatusOK {
        t.Errorf("got status %d, want %d", res.StatusCode, http.StatusOK)
    }
}
```

Что проверяем:
- `w.Code` — статус-код (эквивалент `res.StatusCode`).
- `w.Body.String()` — тело ответа как строка.
- `w.Header()` — заголовки ответа.
- `w.Result()` — полный `*http.Response` для более сложных проверок.

## t.Context() в Go 1.24

До Go 1.24 каждый тест требовал ручного создания контекста с cancel:

```go
// Старый стиль (до Go 1.24)
ctx, cancel := context.WithCancel(context.Background())
defer cancel()
req = req.WithContext(ctx)
```

С Go 1.24 `t.Context()` возвращает контекст, автоматически отменяемый по завершении теста (включая очистку через `t.Cleanup`):

```go
func TestGetUser(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/api/users/42", nil).
        WithContext(t.Context()) // контекст отменится, когда тест закончится

    w := httptest.NewRecorder()
    handler.getUser(w, req)

    if w.Code != http.StatusOK {
        t.Errorf("got %d, want %d", w.Code, http.StatusOK)
    }
}
```

Это особенно удобно для тестов с горутинами или долгими операциями — не нужно думать о cleanup.

## Табличные тесты (table-driven tests)

Идиоматичный паттерн Go для проверки нескольких сценариев:

```go
func TestCreateUser(t *testing.T) {
    tests := []struct {
        name       string
        body       string
        wantStatus int
        wantCode   string
    }{
        {
            name:       "valid request",
            body:       `{"name":"Alice","email":"alice@example.com","password":"secret123"}`,
            wantStatus: http.StatusCreated,
        },
        {
            name:       "missing name",
            body:       `{"email":"alice@example.com","password":"secret123"}`,
            wantStatus: http.StatusUnprocessableEntity,
            wantCode:   "VALIDATION_ERROR",
        },
        {
            name:       "invalid email",
            body:       `{"name":"Alice","email":"not-an-email","password":"secret123"}`,
            wantStatus: http.StatusUnprocessableEntity,
            wantCode:   "VALIDATION_ERROR",
        },
        {
            name:       "empty body",
            body:       `{}`,
            wantStatus: http.StatusUnprocessableEntity,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            body := strings.NewReader(tt.body)
            req := httptest.NewRequest(http.MethodPost, "/api/users", body).
                WithContext(t.Context())
            req.Header.Set("Content-Type", "application/json")

            w := httptest.NewRecorder()
            handler.createUser(w, req)

            if w.Code != tt.wantStatus {
                t.Errorf("status: got %d, want %d\nbody: %s",
                    w.Code, tt.wantStatus, w.Body.String())
            }

            if tt.wantCode != "" {
                var resp map[string]any
                if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
                    t.Fatalf("unmarshal response: %v", err)
                }
                if got := resp["code"]; got != tt.wantCode {
                    t.Errorf("code: got %v, want %v", got, tt.wantCode)
                }
            }
        })
    }
}
```

## Мокирование через интерфейсы

Зависимости (БД, внешние сервисы) нужно изолировать через интерфейсы:

```go
// Интерфейс репозитория
type UserRepository interface {
    GetByID(ctx context.Context, id int64) (*User, error)
    Create(ctx context.Context, u *User) error
    Update(ctx context.Context, u *User) error
    Delete(ctx context.Context, id int64) error
}

// Мок для тестов
type mockUserRepo struct {
    getByID func(ctx context.Context, id int64) (*User, error)
    create  func(ctx context.Context, u *User) error
}

func (m *mockUserRepo) GetByID(ctx context.Context, id int64) (*User, error) {
    if m.getByID != nil {
        return m.getByID(ctx, id)
    }
    return nil, nil
}

func (m *mockUserRepo) Create(ctx context.Context, u *User) error {
    if m.create != nil {
        return m.create(ctx, u)
    }
    return nil
}

// Неиспользуемые методы возвращают nil/zero
func (m *mockUserRepo) Update(_ context.Context, _ *User) error  { return nil }
func (m *mockUserRepo) Delete(_ context.Context, _ int64) error { return nil }

// Тест с моком
func TestGetUserHandler_NotFound(t *testing.T) {
    repo := &mockUserRepo{
        getByID: func(ctx context.Context, id int64) (*User, error) {
            return nil, ErrUserNotFound
        },
    }
    h := NewHandler(repo, slog.Default())

    req := httptest.NewRequest(http.MethodGet, "/api/users/99", nil).
        WithContext(t.Context())
    // Устанавливаем path value вручную для тестов без ServeMux
    req.SetPathValue("id", "99")

    w := httptest.NewRecorder()
    h.getUser(w, req)

    if w.Code != http.StatusNotFound {
        t.Errorf("got %d, want %d", w.Code, http.StatusNotFound)
    }
}
```

Обратите внимание: `req.SetPathValue("id", "99")` — метод, доступный с Go 1.22, позволяет устанавливать переменные пути в тестах без реального `ServeMux`.

## httptest.NewServer: интеграционные тесты

Для тестирования поведения клиент-сервер или проверки HTTP-клиентов используют реальный тестовый сервер:

```go
func TestAPIIntegration(t *testing.T) {
    // Создаём реальный HTTP-сервер на случайном порту
    mux := http.NewServeMux()
    mux.HandleFunc("GET /api/users/{id}", handler.getUser)
    mux.HandleFunc("POST /api/users", handler.createUser)

    ts := httptest.NewServer(mux)
    defer ts.Close()

    // Клиент автоматически направляет запросы на тестовый сервер
    client := ts.Client()

    t.Run("create and retrieve user", func(t *testing.T) {
        // Создаём пользователя
        body := `{"name":"Bob","email":"bob@example.com","password":"pass1234"}`
        resp, err := client.Post(
            ts.URL+"/api/users",
            "application/json",
            strings.NewReader(body),
        )
        if err != nil {
            t.Fatalf("POST /api/users: %v", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode != http.StatusCreated {
            t.Errorf("create: got %d, want %d", resp.StatusCode, http.StatusCreated)
        }

        var created User
        json.NewDecoder(resp.Body).Decode(&created)

        // Получаем пользователя
        resp2, err := client.Get(
            fmt.Sprintf("%s/api/users/%d", ts.URL, created.ID))
        if err != nil {
            t.Fatalf("GET /api/users/%d: %v", created.ID, err)
        }
        defer resp2.Body.Close()

        if resp2.StatusCode != http.StatusOK {
            t.Errorf("get: got %d, want %d", resp2.StatusCode, http.StatusOK)
        }
    })
}
```

`httptest.NewTLSServer` — вариант с HTTPS для тестирования TLS-логики.

## testcontainers: реальная БД в тестах

Для интеграционных тестов, требующих реальной базы данных, `testcontainers-go` запускает Docker-контейнер прямо в тесте:

```go
import (
    "github.com/testcontainers/testcontainers-go"
    "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestWithRealDB(t *testing.T) {
    ctx := t.Context()

    // Запускаем PostgreSQL в Docker
    pgContainer, err := postgres.Run(ctx,
        "postgres:16",
        postgres.WithDatabase("testdb"),
        postgres.WithUsername("test"),
        postgres.WithPassword("test"),
        testcontainers.WithWaitStrategy(
            wait.ForLog("database system is ready to accept connections").
                WithOccurrence(2),
        ),
    )
    if err != nil {
        t.Fatalf("start postgres: %v", err)
    }
    t.Cleanup(func() {
        pgContainer.Terminate(ctx)
    })

    connStr, _ := pgContainer.ConnectionString(ctx, "sslmode=disable")
    db, err := sql.Open("postgres", connStr)
    if err != nil {
        t.Fatalf("open db: %v", err)
    }
    defer db.Close()

    // Теперь тестируем реальный SQL
    repo := NewUserRepository(db)
    runMigrations(db)

    user := &User{Name: "Alice", Email: "alice@test.com"}
    if err := repo.Create(ctx, user); err != nil {
        t.Fatalf("create user: %v", err)
    }

    found, err := repo.GetByID(ctx, user.ID)
    if err != nil {
        t.Fatalf("get user: %v", err)
    }
    if found.Email != user.Email {
        t.Errorf("email: got %q, want %q", found.Email, user.Email)
    }
}
```

Важно: testcontainers требует Docker. В CI убедитесь, что Docker доступен.

## Golden files: snapshot-тестирование

Для тестирования сложных JSON-ответов используют «золотые файлы» — эталонный вывод, зафиксированный заранее:

```go
func TestUserResponseGolden(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/api/users/1", nil).
        WithContext(t.Context())
    w := httptest.NewRecorder()
    handler.getUser(w, req)

    got := w.Body.Bytes()

    goldenPath := filepath.Join("testdata", t.Name()+".golden.json")

    // Обновление файла через флаг: go test -update
    if *update {
        os.MkdirAll("testdata", 0755)
        os.WriteFile(goldenPath, got, 0644)
        return
    }

    want, err := os.ReadFile(goldenPath)
    if err != nil {
        t.Fatalf("read golden file %s: %v\nRun with -update to create it", goldenPath, err)
    }

    if !bytes.Equal(got, want) {
        t.Errorf("response mismatch:\ngot:  %s\nwant: %s", got, want)
    }
}

var update = flag.Bool("update", false, "update golden files")
```

Golden files особенно удобны для endpoint'ов с большим и сложным JSON-ответом — вручную писать ожидаемый результат утомительно.

## Бенчмарки с b.Loop() в Go 1.24

До Go 1.24 бенчмарки писали с `for range b.N`. Go 1.24 вводит `b.Loop()` — метод, который возвращает `true` пока бенчмарк должен продолжаться, корректно учитывает setup и не включает его в измерение:

```go
func BenchmarkHandlerJSON(b *testing.B) {
    body := `{"name":"Alice","email":"alice@example.com","password":"pass123"}`
    handler := NewHandler(newTestRepo(), slog.Default())

    // Setup — не входит в измерение
    b.ResetTimer()

    for b.Loop() {  // Go 1.24: заменяет for range b.N
        req := httptest.NewRequest(http.MethodPost, "/api/users",
            strings.NewReader(body))
        req.Header.Set("Content-Type", "application/json")
        w := httptest.NewRecorder()

        handler.createUser(w, req)

        if w.Code != http.StatusCreated {
            b.Fatalf("unexpected status %d", w.Code)
        }
    }
}
```

Запуск: `go test -bench=BenchmarkHandlerJSON -benchmem -count=5`

`-benchmem` добавляет статистику аллокаций (allocs/op, B/op).

## Параллельные тесты

Пометка `t.Parallel()` позволяет тесту работать параллельно с другими параллельными тестами:

```go
func TestHandlers(t *testing.T) {
    t.Parallel() // этот тест идёт параллельно с другими Parallel-тестами

    tests := []struct {
        name string
        // ...
    }{
        // ...
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            t.Parallel() // и подтесты тоже параллельны

            // тест...
        })
    }
}
```

Важно: при параллельных подтестах в цикле, начиная с Go 1.22, не нужно захватывать `tt := tt` — переменная итерации уникальна.

## Структура тестовых файлов

Рекомендуемая структура пакета с тестами:

```
handlers/
├── handler.go          # основная логика
├── handler_test.go     # unit-тесты (пакет handlers)
├── integration_test.go # интеграционные тесты (пакет handlers_test)
└── testdata/
    ├── fixtures/       # тестовые данные (JSON, SQL)
    └── golden/         # golden files
```

Пакет `handlers_test` (с суффиксом `_test`) тестирует только публичный API — это предпочтительно для интеграционных тестов. Пакет `handlers` (без суффикса) имеет доступ к приватным методам — полезно для unit-тестов.

## Test helpers и subtests

Для повторяющейся логики используют хелперы с `t.Helper()`:

```go
func assertStatus(t *testing.T, got, want int) {
    t.Helper() // этот вызов не появится в трейсе ошибки
    if got != want {
        t.Errorf("status: got %d, want %d", got, want)
    }
}

func assertJSON(t *testing.T, body *bytes.Buffer, v any) {
    t.Helper()
    if err := json.Unmarshal(body.Bytes(), v); err != nil {
        t.Fatalf("unmarshal response: %v\nbody: %s", err, body.String())
    }
}

// Использование
func TestGetUser(t *testing.T) {
    w := httptest.NewRecorder()
    handler.getUser(w, req)

    assertStatus(t, w.Code, http.StatusOK)

    var user User
    assertJSON(t, w.Body, &user)

    if user.ID != 42 {
        t.Errorf("ID: got %d, want 42", user.ID)
    }
}
```

## Типичные вопросы на собеседовании

**Чем отличается `httptest.NewRecorder` от `httptest.NewServer`?** Recorder — in-process, без реального TCP. NewServer — реальный HTTP-сервер на localhost. Recorder для unit-тестов обработчиков, NewServer для интеграционных тестов или тестирования HTTP-клиентов.

**Как тестировать middleware?** Middleware принимает `http.Handler` и возвращает `http.Handler`. В тесте передайте mock-обработчик, который просто записывает факт вызова, и проверьте поведение middleware.

**Когда использовать testcontainers?** Когда тест проверяет реальные SQL-запросы, миграции или поведение, специфичное для конкретной СУБД. Не нужен для тестов, где можно замокать репозиторий.

**Что такое `b.Loop()` и чем он лучше `for range b.N`?** `b.Loop()` — новый метод в Go 1.24. В отличие от `for range b.N`, он корректно обрабатывает ситуацию, когда setup-код перед бенчмарком занимает значительное время, и не включает его в итоговое измерение.

## Итог

Полноценное тестирование Go-сервера строится из нескольких слоёв: unit-тесты обработчиков с `httptest.NewRecorder`, интеграционные тесты с `httptest.NewServer`, тесты с реальной БД через testcontainers, golden files для snapshot-проверок и бенчмарки с `b.Loop()`. `t.Context()` (Go 1.24) убирает шаблонный код с ручным управлением контекстом. Все слои покрывают разные грани поведения и вместе дают уверенность в корректности сервера.
