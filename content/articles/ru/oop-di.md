---
title: Dependency Injection в Go
blockId: oop-di
parentBlockId: oop
---

# Dependency Injection в Go

Dependency Injection (DI) — это паттерн, при котором объект получает свои зависимости извне, а не создаёт их сам. В языках с богатыми фреймворками (Spring в Java, Symfony в PHP) DI-контейнеры считаются само собой разумеющимися. В Go принята другая философия: **явный код лучше магии**. Большинство Go-проектов обходятся конструкторным DI без какого-либо фреймворка.

## Что такое зависимость и зачем её инжектировать

Зависимость — любой внешний ресурс или сервис, от которого зависит ваш код: база данных, HTTP-клиент, логгер, файловая система, внешнее API.

Без DI:

```go
type OrderService struct{}

func (s *OrderService) CreateOrder(userID int64) error {
    db, _ := sql.Open("postgres", os.Getenv("DATABASE_URL")) // создаём здесь
    // ...
    return nil
}
```

Проблемы: невозможно подменить в тестах, сложно переконфигурировать, каждый вызов открывает новое соединение с БД.

С DI:

```go
type OrderService struct {
    db     *sql.DB
    logger *slog.Logger
}

func NewOrderService(db *sql.DB, logger *slog.Logger) *OrderService {
    return &OrderService{db: db, logger: logger}
}
```

Теперь зависимости передаются при создании — один раз, явно.

## Конструкторный DI — основной паттерн

Конструкторный DI (constructor injection) — доминирующий подход в Go. Все зависимости передаются в конструктор `New...`:

```go
// Слой репозитория
type UserRepository interface {
    FindByID(ctx context.Context, id int64) (*User, error)
    Save(ctx context.Context, user *User) error
}

type postgresUserRepo struct {
    db *sql.DB
}

func NewUserRepository(db *sql.DB) UserRepository {
    return &postgresUserRepo{db: db}
}

func (r *postgresUserRepo) FindByID(ctx context.Context, id int64) (*User, error) {
    var u User
    err := r.db.QueryRowContext(ctx,
        "SELECT id, name, email FROM users WHERE id = $1", id,
    ).Scan(&u.ID, &u.Name, &u.Email)
    if err != nil {
        return nil, fmt.Errorf("find user %d: %w", id, err)
    }
    return &u, nil
}

// Слой сервиса
type UserService struct {
    repo   UserRepository
    mailer Mailer
    logger *slog.Logger
}

func NewUserService(repo UserRepository, mailer Mailer, logger *slog.Logger) *UserService {
    return &UserService{repo: repo, mailer: mailer, logger: logger}
}

func (s *UserService) GetUser(ctx context.Context, id int64) (*User, error) {
    s.logger.Info("fetching user", "id", id)
    return s.repo.FindByID(ctx, id)
}

// Слой обработчика
type UserHandler struct {
    svc *UserService
}

func NewUserHandler(svc *UserService) *UserHandler {
    return &UserHandler{svc: svc}
}
```

## Инициализация в main()

Весь граф зависимостей собирается в `main()` вручную:

```go
func main() {
    // инфраструктура
    db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
    mailer := email.NewSMTPMailer(os.Getenv("SMTP_HOST"))

    // сборка слоёв
    userRepo    := NewUserRepository(db)
    userService := NewUserService(userRepo, mailer, logger)
    userHandler := NewUserHandler(userService)

    // HTTP сервер
    mux := http.NewServeMux()
    mux.HandleFunc("GET /users/{id}", userHandler.Get)

    log.Fatal(http.ListenAndServe(":8080", mux))
}
```

Это называется **Composition Root** — единое место, где собирается весь граф зависимостей. Для небольших и средних приложений это оптимально: всё явно, легко читается, легко отлаживается.

## DI-интерфейсы и тестирование

Главная ценность интерфейсного DI — тестируемость. Мок реализуется в несколько строк:

```go
// file: user_service_test.go

type mockUserRepo struct {
    users map[int64]*User
    err   error
}

func (m *mockUserRepo) FindByID(_ context.Context, id int64) (*User, error) {
    if m.err != nil {
        return nil, m.err
    }
    u, ok := m.users[id]
    if !ok {
        return nil, ErrNotFound
    }
    return u, nil
}

func (m *mockUserRepo) Save(_ context.Context, u *User) error {
    m.users[u.ID] = u
    return m.err
}

func TestGetUser_Success(t *testing.T) {
    repo := &mockUserRepo{
        users: map[int64]*User{
            1: {ID: 1, Name: "Alice", Email: "alice@example.com"},
        },
    }
    svc := NewUserService(repo, &mockMailer{}, slog.Default())

    user, err := svc.GetUser(context.Background(), 1)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if user.Name != "Alice" {
        t.Errorf("got %q, want %q", user.Name, "Alice")
    }
}

func TestGetUser_NotFound(t *testing.T) {
    repo := &mockUserRepo{users: map[int64]*User{}}
    svc := NewUserService(repo, &mockMailer{}, slog.Default())

    _, err := svc.GetUser(context.Background(), 999)
    if !errors.Is(err, ErrNotFound) {
        t.Errorf("expected ErrNotFound, got %v", err)
    }
}
```

Тест не использует реальную БД. Скорость выполнения — микросекунды.

### errors.AsType (Go 1.26)

Когда репозиторий возвращает типизированную ошибку, Go 1.26 предлагает более лаконичный способ её извлечения — `errors.AsType[T]`:

```go
// До Go 1.26 — errors.As с промежуточной переменной
var dbErr *DBError
if errors.As(err, &dbErr) {
    log.Printf("db error code: %d", dbErr.Code)
}

// Go 1.26 — errors.AsType[T] без промежуточной переменной
if dbErr, ok := errors.AsType[*DBError](err); ok {
    log.Printf("db error code: %d", dbErr.Code)
}
```

`errors.AsType` особенно удобен в тестах при проверке деталей ошибки без необходимости объявлять переменную заранее.

## Wire — кодогенерация графа зависимостей

По мере роста приложения `main()` с ручной сборкой разрастается. Google Wire решает эту проблему через **кодогенерацию** — вы описываете «провайдеры» (конструкторы), Wire генерирует код сборки.

Установка:

```bash
go install github.com/google/wire/cmd/wire@latest
```

Провайдеры (обычные конструкторы):

```go
// file: providers.go

func NewDB(cfg *Config) (*sql.DB, error) {
    return sql.Open("postgres", cfg.DatabaseURL)
}

func NewLogger() *slog.Logger {
    return slog.New(slog.NewJSONHandler(os.Stdout, nil))
}

// провайдер-сет: группировка провайдеров
var UserSet = wire.NewSet(
    NewUserRepository,
    NewUserService,
    NewUserHandler,
)
```

Wire injector (описание желаемого):

```go
// file: wire.go — только для кодогенерации, в бинарь не попадает

//go:build wireinject

package main

import "github.com/google/wire"

func InitializeApp(cfg *Config) (*App, error) {
    wire.Build(
        NewDB,
        NewLogger,
        email.NewSMTPMailer,
        UserSet,
        NewApp,
    )
    return nil, nil  // Wire заменит это сгенерированным кодом
}
```

После `wire gen` в пакете появится файл `wire_gen.go` с реальным кодом инициализации.

Wire не использует рефлексию в runtime — только кодогенерацию. Это означает: нет накладных расходов, компилятор проверяет типы, нет магии.

## fx — DI-контейнер от Uber

`go.uber.org/fx` — более полноценный DI-контейнер. В отличие от Wire, fx работает в runtime через рефлексию.

```go
import "go.uber.org/fx"

func main() {
    app := fx.New(
        fx.Provide(
            NewDB,
            NewLogger,
            NewUserRepository,
            NewUserService,
            NewUserHandler,
        ),
        fx.Invoke(func(handler *UserHandler, lc fx.Lifecycle) {
            lc.Append(fx.Hook{
                OnStart: func(ctx context.Context) error {
                    go http.ListenAndServe(":8080", handler.Mux())
                    return nil
                },
                OnStop: func(ctx context.Context) error {
                    return handler.Shutdown(ctx)
                },
            })
        }),
    )
    app.Run()
}
```

fx автоматически управляет жизненным циклом (lifecycle hooks), порядком запуска и остановки. Подходит для крупных приложений со сложным порядком инициализации.

Когда использовать fx vs Wire:

| | Wire | fx |
|---|---|---|
| Тип | Кодогенерация | Runtime |
| Производительность | Нулевые накладные расходы | Небольшие (рефлексия при старте) |
| Lifecycle hooks | Нет | Есть |
| Размер приложения | Малые/средние | Средние/крупные |
| Прозрачность | Высокая (читаем сгенерированный код) | Средняя |

## Почему Go обходится без DI-фреймворков

В Java Spring DI-контейнер популярен во многом потому, что без него инициализация сложного графа зависимостей превращается в многостраничный boilerplate. В Go благодаря нескольким факторам ручная сборка остаётся управляемой:

1. **Нет XML/аннотаций.** Нет overhead на конфигурацию контейнера.
2. **Компилятор проверяет типы.** Нет runtime-ошибок «bean not found».
3. **Явность ценится.** Go-культура: «явное лучше неявного».
4. **Интерфейсы дёшевы.** Создать мок для теста — несколько строк кода.

Для большинства проектов рецепт прост: конструкторы + интерфейсы + `main()` как Composition Root. Wire добавляется при росте графа. fx — когда нужны lifecycle hooks или у команды большой опыт с DI-контейнерами.

## Итого

| Подход | Когда использовать |
|---|---|
| Ручной конструкторный DI | Всегда как базовый подход |
| Wire | Граф стал большим и запутанным |
| fx | Нужны lifecycle hooks, крупный сервис |
| Глобальные переменные | Никогда (кроме `var log = slog.Default()`) |
