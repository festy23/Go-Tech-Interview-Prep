---
title: Go и SQL — database/sql, sqlx, pgx, миграции
blockId: sql-go-driver
parentBlockId: sql
---

# Go и SQL — database/sql, sqlx, pgx, миграции

Пакет `database/sql` — стандарт работы с реляционными базами в Go. Он предоставляет единый интерфейс для любого SQL-хранилища, управляет пулом соединений и обеспечивает потокобезопасность. Но его API намеренно минималистичен: для удобства разработки поверх него строятся библиотеки `sqlx` и `pgx`.

## Архитектура database/sql

Пакет `database/sql` построен на двух уровнях:

1. **database/sql** — стандартный интерфейс (Go-код).
2. **Драйвер** — конкретная реализация для PostgreSQL, MySQL, SQLite и т.д. Регистрируется через side-effect import: `import _ "github.com/lib/pq"`.

```go
import (
    "context"
    "database/sql"
    "fmt"
    "time"

    _ "github.com/lib/pq"
)

func NewDB(dsn string) (*sql.DB, error) {
    db, err := sql.Open("postgres", dsn)
    if err != nil {
        return nil, fmt.Errorf("open db: %w", err)
    }

    // Проверка подключения
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    if err := db.PingContext(ctx); err != nil {
        return nil, fmt.Errorf("ping db: %w", err)
    }
    return db, nil
}
```

`sql.Open` не открывает соединение — оно открывается лениво при первом запросе или явном `Ping`. Сам `*sql.DB` — это пул соединений, потокобезопасный, предназначен для использования во всём приложении.

## Пул соединений

`*sql.DB` управляет пулом соединений автоматически. Три параметра настройки:

```go
db.SetMaxOpenConns(25)           // максимум открытых соединений (к БД)
db.SetMaxIdleConns(5)            // максимум «простаивающих» соединений в пуле
db.SetConnMaxLifetime(5 * time.Minute) // время жизни соединения
db.SetConnMaxIdleTime(10 * time.Minute) // максимальное время простоя
```

**MaxOpenConns** — главный параметр. Ставьте его равным максимальной нагрузке, которую может выдержать база. PostgreSQL обычно допускает 100–200 соединений; с PgBouncer — значительно больше.

**MaxIdleConns** должно быть меньше или равно MaxOpenConns. Простаивающие соединения занимают ресурсы как на стороне Go, так и на стороне PostgreSQL.

**ConnMaxLifetime** предотвращает использование соединений, которые могут быть разорваны файрволом или балансировщиком нагрузки за сетевым слоем.

```go
// Типичные настройки для production
func configurePool(db *sql.DB) {
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)
    db.SetConnMaxLifetime(5 * time.Minute)
    db.SetConnMaxIdleTime(1 * time.Minute)
}
```

### Мониторинг пула

```go
// Периодически логировать состояние пула
stats := db.Stats()
log.Printf("db pool: open=%d idle=%d inUse=%d waitCount=%d",
    stats.OpenConnections,
    stats.Idle,
    stats.InUse,
    stats.WaitCount,
)
```

Высокий `WaitCount` или `WaitDuration` говорят о том, что пул перегружен — нужно увеличить `MaxOpenConns` или оптимизировать запросы.

## sql.DB, sql.Conn и sql.Tx

Три типа в `database/sql` для работы с соединениями:

**`*sql.DB`** — пул соединений. Каждый вызов метода (`Query`, `Exec`) берёт соединение из пула, выполняет операцию и возвращает соединение обратно. Не гарантирует, что последовательные вызовы используют одно соединение.

**`*sql.Conn`** — одно конкретное соединение из пула. Полезно когда нужно состояние сессии (временные таблицы, SET-параметры).

```go
conn, err := db.Conn(ctx)
if err != nil {
    return err
}
defer conn.Close()

// Все вызовы через conn используют одно физическое соединение
_, err = conn.ExecContext(ctx, "SET search_path TO myschema")
```

**`*sql.Tx`** — транзакция на одном соединении. Гарантирует, что все операции внутри транзакции идут через одно соединение.

```go
tx, err := db.BeginTx(ctx, &sql.TxOptions{
    Isolation: sql.LevelRepeatableRead,
    ReadOnly:  false,
})
if err != nil {
    return err
}
defer tx.Rollback() // безопасен после Commit — возвращает ErrTxDone

// операции через tx...
return tx.Commit()
```

## Подготовленные запросы (Prepared Statements)

Подготовленный запрос компилируется базой данных один раз и затем вызывается многократно с разными параметрами. Преимущества: защита от SQL-инъекций, экономия времени на парсинг на стороне БД.

```go
stmt, err := db.PrepareContext(ctx, `
    INSERT INTO orders (user_id, total, status) VALUES ($1, $2, $3)
`)
if err != nil {
    return err
}
defer stmt.Close()

// Многократное использование одного подготовленного запроса
for _, order := range orders {
    _, err := stmt.ExecContext(ctx, order.UserID, order.Total, order.Status)
    if err != nil {
        return fmt.Errorf("insert order %d: %w", order.ID, err)
    }
}
```

Важно: в `database/sql` подготовленные запросы привязаны к конкретному соединению. Если соединение закрылось, `*sql.Stmt` автоматически переподготавливается на новом соединении.

## Передача контекста

Начиная с Go 1.8 все методы `database/sql` имеют версии с `Context`. Контекст позволяет отменить запрос при превышении таймаута или отмене запроса пользователем.

```go
func getUser(ctx context.Context, db *sql.DB, id int64) (*User, error) {
    var u User
    err := db.QueryRowContext(ctx, `
        SELECT id, name, email, created_at
        FROM users WHERE id = $1
    `, id).Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt)

    if errors.Is(err, sql.ErrNoRows) {
        return nil, ErrNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("get user %d: %w", id, err)
    }
    return &u, nil
}
```

При отмене контекста PostgreSQL получает сигнал отмены запроса через протокол. Это освобождает ресурсы как на стороне Go, так и на стороне базы данных.

## sqlx — расширение database/sql

`github.com/jmoiron/sqlx` добавляет удобный маппинг результатов в структуры через теги `db`.

```go
import "github.com/jmoiron/sqlx"

type User struct {
    ID        int64     `db:"id"    json:"id"`
    Name      string    `db:"name"  json:"name"`
    Email     string    `db:"email" json:"email"`
    CreatedAt time.Time `db:"created_at" json:"created_at,omitzero"`
}

db, _ := sqlx.Connect("postgres", dsn)

// Получить один объект
var u User
err := db.GetContext(ctx, &u, "SELECT * FROM users WHERE id = $1", id)

// Получить список объектов
var users []User
err = db.SelectContext(ctx, &users, "SELECT * FROM users ORDER BY created_at DESC")

// Named queries: параметры по имени вместо $1, $2
result, err := db.NamedExecContext(ctx, `
    INSERT INTO users (name, email) VALUES (:name, :email)
`, u)
```

`sqlx` не скрывает `*sql.DB` — это обёртка, которая его встраивает. Можно легко переходить между ними.

## pgx — нативный драйвер PostgreSQL

`github.com/jackc/pgx/v5` — драйвер PostgreSQL, написанный на чистом Go без CGO. Предоставляет значительно больше возможностей, чем `lib/pq`:

```go
import (
    "context"
    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgxpool"
)

// Пул соединений pgx
pool, err := pgxpool.New(ctx, "postgres://localhost:5432/mydb")
if err != nil {
    return err
}
defer pool.Close()

// Конфигурация пула
config, _ := pgxpool.ParseConfig("postgres://localhost:5432/mydb")
config.MaxConns = 25
config.MinConns = 5
config.MaxConnLifetime = 5 * time.Minute
pool, _ = pgxpool.NewWithConfig(ctx, config)
```

Преимущества pgx перед `lib/pq`:
- **Copy protocol** для массовой вставки данных (значительно быстрее batch INSERT).
- **Нативные типы PostgreSQL**: arrays, JSONB, UUID, hstore.
- **Pipeline mode**: отправка нескольких запросов без ожидания ответа на каждый.
- **Batch queries**: группировка нескольких запросов в один round-trip.

```go
// Batch-запрос pgx: несколько операций за один round-trip
batch := &pgx.Batch{}
for _, id := range userIDs {
    batch.Queue("SELECT id, name FROM users WHERE id = $1", id)
}

results := pool.SendBatch(ctx, batch)
defer results.Close()

for range userIDs {
    var u User
    if err := results.QueryRow().Scan(&u.ID, &u.Name); err != nil {
        return nil, err
    }
    users = append(users, u)
}
```

### pgx с интерфейсом database/sql

pgx можно использовать как драйвер для стандартного `database/sql`:

```go
import (
    _ "github.com/jackc/pgx/v5/stdlib"
)

db, err := sql.Open("pgx", "postgres://localhost:5432/mydb")
```

Это позволяет использовать pgx как транспорт, сохраняя совместимость с библиотеками, ожидающими `*sql.DB`.

## Миграции: goose и golang-migrate

Миграции — управление изменениями схемы базы данных. Две популярные библиотеки:

### goose

```bash
go install github.com/pressly/goose/v3/cmd/goose@latest
goose -dir migrations postgres "$DATABASE_URL" up
```

Файл миграции `migrations/00001_create_users.sql`:

```sql
-- +goose Up
CREATE TABLE users (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- +goose Down
DROP TABLE users;
```

goose поддерживает Go-миграции для сложной логики:

```go
// migrations/00002_seed_admin.go
func init() {
    goose.AddMigration(upSeedAdmin, downSeedAdmin)
}

func upSeedAdmin(tx *sql.Tx) error {
    _, err := tx.Exec(`INSERT INTO users (name, email) VALUES ('admin', 'admin@example.com')`)
    return err
}

func downSeedAdmin(tx *sql.Tx) error {
    _, err := tx.Exec(`DELETE FROM users WHERE email = 'admin@example.com'`)
    return err
}
```

### golang-migrate

```bash
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
migrate -path migrations -database "$DATABASE_URL" up
```

Пара файлов для каждой миграции:
- `000001_create_users.up.sql`
- `000001_create_users.down.sql`

Встроенное применение миграций в Go-приложении:

```go
import (
    "github.com/golang-migrate/migrate/v4"
    _ "github.com/golang-migrate/migrate/v4/database/postgres"
    "github.com/golang-migrate/migrate/v4/source/iofs"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func runMigrations(dsn string) error {
    src, err := iofs.New(migrationsFS, "migrations")
    if err != nil {
        return err
    }
    m, err := migrate.NewWithSourceInstance("iofs", src, dsn)
    if err != nil {
        return err
    }
    if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
        return fmt.Errorf("migration: %w", err)
    }
    return nil
}
```

Встраивание через `//go:embed` позволяет включать SQL-файлы прямо в бинарник — не нужно беспокоиться об их наличии на сервере.

## Паттерн репозитория с database/sql

Типичный паттерн организации кода:

```go
type UserRepository struct {
    db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
    return &UserRepository{db: db}
}

func (r *UserRepository) Create(ctx context.Context, u User) (int64, error) {
    var id int64
    err := r.db.QueryRowContext(ctx, `
        INSERT INTO users (name, email, created_at)
        VALUES ($1, $2, NOW())
        RETURNING id
    `, u.Name, u.Email).Scan(&id)
    if err != nil {
        return 0, fmt.Errorf("create user: %w", err)
    }
    return id, nil
}

func (r *UserRepository) ListByIDs(ctx context.Context, ids []int64) ([]User, error) {
    rows, err := r.db.QueryContext(ctx, `
        SELECT id, name, email, created_at
        FROM   users
        WHERE  id = ANY($1)
        ORDER  BY id
    `, pq.Array(ids))
    if err != nil {
        return nil, fmt.Errorf("list users: %w", err)
    }
    defer rows.Close()

    var users []User
    for rows.Next() {
        var u User
        if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt); err != nil {
            return nil, err
        }
        users = append(users, u)
    }
    return users, rows.Err()
}
```

Интерфейс для тестирования:

```go
type DB interface {
    QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
    QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
    ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
    BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
}
```

Следуя этому интерфейсу, репозиторий можно тестировать с моками или с реальной тестовой базой через `testcontainers-go`.
