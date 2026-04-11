---
title: Go and SQL — database/sql, sqlx, pgx, Migrations
blockId: sql-go-driver
parentBlockId: sql
---

# Go and SQL — database/sql, sqlx, pgx, Migrations

The `database/sql` package is the standard for working with relational databases in Go. It provides a unified interface for any SQL backend, manages a connection pool, and guarantees goroutine safety. Its API is deliberately minimal; the `sqlx` and `pgx` libraries build on top of it for developer convenience.

## Architecture of database/sql

The `database/sql` package operates on two layers:

1. **database/sql** — the standard interface (Go code).
2. **Driver** — a concrete implementation for PostgreSQL, MySQL, SQLite, etc. Registered via a side-effect import: `import _ "github.com/lib/pq"`.

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

    // Verify connectivity
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    if err := db.PingContext(ctx); err != nil {
        return nil, fmt.Errorf("ping db: %w", err)
    }
    return db, nil
}
```

`sql.Open` does not open a connection — it opens lazily on the first query or an explicit `Ping`. The `*sql.DB` itself is a connection pool, goroutine-safe and intended to be shared across the entire application.

## Connection Pool

`*sql.DB` manages the connection pool automatically. Four configuration parameters:

```go
db.SetMaxOpenConns(25)                  // max connections to the database
db.SetMaxIdleConns(5)                   // max idle connections in the pool
db.SetConnMaxLifetime(5 * time.Minute)  // max lifetime of a connection
db.SetConnMaxIdleTime(10 * time.Minute) // max idle time before closing
```

**MaxOpenConns** is the primary parameter. Set it to the maximum load the database can handle. PostgreSQL typically allows 100–200 connections; with PgBouncer it can be much higher.

**MaxIdleConns** should be less than or equal to MaxOpenConns. Idle connections consume resources on both the Go and PostgreSQL sides.

**ConnMaxLifetime** prevents the use of connections that may have been silently dropped by a firewall or load balancer.

```go
// Typical production settings
func configurePool(db *sql.DB) {
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)
    db.SetConnMaxLifetime(5 * time.Minute)
    db.SetConnMaxIdleTime(1 * time.Minute)
}
```

### Pool Monitoring

```go
// Log pool state periodically
stats := db.Stats()
log.Printf("db pool: open=%d idle=%d inUse=%d waitCount=%d",
    stats.OpenConnections,
    stats.Idle,
    stats.InUse,
    stats.WaitCount,
)
```

A high `WaitCount` or `WaitDuration` indicates the pool is saturated — increase `MaxOpenConns` or optimize queries.

## sql.DB, sql.Conn, and sql.Tx

Three types in `database/sql` for working with connections:

**`*sql.DB`** — the connection pool. Each method call (`Query`, `Exec`) borrows a connection from the pool, executes the operation, and returns it. Consecutive calls are not guaranteed to use the same connection.

**`*sql.Conn`** — a single specific connection from the pool. Useful when session state is needed (temporary tables, SET parameters).

```go
conn, err := db.Conn(ctx)
if err != nil {
    return err
}
defer conn.Close()

// All calls through conn use the same physical connection
_, err = conn.ExecContext(ctx, "SET search_path TO myschema")
```

**`*sql.Tx`** — a transaction on a single connection. Guarantees all operations in the transaction use the same connection.

```go
tx, err := db.BeginTx(ctx, &sql.TxOptions{
    Isolation: sql.LevelRepeatableRead,
    ReadOnly:  false,
})
if err != nil {
    return err
}
defer tx.Rollback() // safe after Commit — returns ErrTxDone

// operations through tx...
return tx.Commit()
```

## Prepared Statements

A prepared statement is compiled by the database once and executed repeatedly with different parameters. Benefits: SQL injection prevention, reduced parse time on the database side.

```go
stmt, err := db.PrepareContext(ctx, `
    INSERT INTO orders (user_id, total, status) VALUES ($1, $2, $3)
`)
if err != nil {
    return err
}
defer stmt.Close()

// Reuse the same prepared statement multiple times
for _, order := range orders {
    _, err := stmt.ExecContext(ctx, order.UserID, order.Total, order.Status)
    if err != nil {
        return fmt.Errorf("insert order %d: %w", order.ID, err)
    }
}
```

Note: in `database/sql`, prepared statements are bound to a specific connection. If the connection closes, `*sql.Stmt` automatically re-prepares on a new connection.

## Context Propagation

Since Go 1.8 all `database/sql` methods have `Context` variants. The context allows cancelling a query when a timeout fires or the request is cancelled by the caller.

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

When the context is cancelled, PostgreSQL receives a cancel signal via the protocol. This frees resources on both the Go and database sides.

## sqlx — Extension for database/sql

`github.com/jmoiron/sqlx` adds convenient struct scanning through `db` struct tags.

```go
import "github.com/jmoiron/sqlx"

type User struct {
    ID        int64     `db:"id"    json:"id"`
    Name      string    `db:"name"  json:"name"`
    Email     string    `db:"email" json:"email"`
    CreatedAt time.Time `db:"created_at" json:"created_at,omitzero"`
}

db, _ := sqlx.Connect("postgres", dsn)

// Get a single object
var u User
err := db.GetContext(ctx, &u, "SELECT * FROM users WHERE id = $1", id)

// Get a list of objects
var users []User
err = db.SelectContext(ctx, &users, "SELECT * FROM users ORDER BY created_at DESC")

// Named queries: parameters by name instead of $1, $2
result, err := db.NamedExecContext(ctx, `
    INSERT INTO users (name, email) VALUES (:name, :email)
`, u)
```

`sqlx` does not hide `*sql.DB` — it wraps and embeds it. Transitioning between them is trivial.

## pgx — Native PostgreSQL Driver

`github.com/jackc/pgx/v5` is a PostgreSQL driver written in pure Go without CGO. It offers significantly more capabilities than `lib/pq`:

```go
import (
    "context"
    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgxpool"
)

// pgx connection pool
pool, err := pgxpool.New(ctx, "postgres://localhost:5432/mydb")
if err != nil {
    return err
}
defer pool.Close()

// Pool configuration
config, _ := pgxpool.ParseConfig("postgres://localhost:5432/mydb")
config.MaxConns = 25
config.MinConns = 5
config.MaxConnLifetime = 5 * time.Minute
pool, _ = pgxpool.NewWithConfig(ctx, config)
```

pgx advantages over `lib/pq`:
- **Copy protocol** for bulk data insertion (significantly faster than batch INSERT).
- **Native PostgreSQL types**: arrays, JSONB, UUID, hstore.
- **Pipeline mode**: send multiple queries without waiting for each response.
- **Batch queries**: group multiple queries into a single round-trip.

```go
// pgx batch: multiple operations in one round-trip
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

### pgx with the database/sql Interface

pgx can be used as a driver for the standard `database/sql`:

```go
import (
    _ "github.com/jackc/pgx/v5/stdlib"
)

db, err := sql.Open("pgx", "postgres://localhost:5432/mydb")
```

This allows pgx as the transport while maintaining compatibility with libraries that expect `*sql.DB`.

## Migrations: goose and golang-migrate

Migrations manage schema changes in a versioned, repeatable way. Two popular libraries:

### goose

```bash
go install github.com/pressly/goose/v3/cmd/goose@latest
goose -dir migrations postgres "$DATABASE_URL" up
```

Migration file `migrations/00001_create_users.sql`:

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

goose supports Go migrations for complex logic:

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

Each migration uses a pair of files:
- `000001_create_users.up.sql`
- `000001_create_users.down.sql`

Running migrations programmatically at application startup:

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

Embedding via `//go:embed` bundles SQL files directly into the binary — no need to worry about file presence on the server.

## Repository Pattern with database/sql

A typical code organization pattern:

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

Define an interface for testability:

```go
type DB interface {
    QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
    QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
    ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
    BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
}
```

With this interface, the repository can be tested with mocks or against a real test database via `testcontainers-go`.
