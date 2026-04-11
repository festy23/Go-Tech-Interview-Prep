---
title: SQL Transactions — ACID, Isolation, Locking
blockId: sql-transactions
parentBlockId: sql
---

# SQL Transactions — ACID, Isolation, Locking

Transactions are one of the cornerstones of reliable systems. Without a solid understanding of isolation levels, subtle bugs surface in production only under load and are nearly impossible to trace. In interviews this topic can fill 30–40 minutes: ACID, read anomalies, PostgreSQL MVCC, deadlocks, optimistic vs pessimistic locking.

## ACID — Four Transaction Guarantees

**Atomicity**. A transaction is an indivisible unit: either all operations succeed or none do. If a failure occurs mid-transaction, the database rolls back all changes to the state before the transaction began.

```sql
BEGIN;
UPDATE accounts SET balance = balance - 500 WHERE id = 1;
UPDATE accounts SET balance = balance + 500 WHERE id = 2;
COMMIT; -- both UPDATEs commit or neither does
```

**Consistency**. A transaction moves the database from one valid state to another. All constraints (CHECK, FOREIGN KEY, UNIQUE) must be satisfied at the time of COMMIT.

**Isolation**. Concurrent transactions do not see each other's intermediate results. The degree of isolation is controlled by isolation levels.

**Durability**. Committed data survives power failures or process crashes. PostgreSQL achieves this through WAL (Write-Ahead Log): changes are written to the log before being applied to data files.

## Read Anomalies

Three classical anomalies that can occur when transactions run concurrently:

### Dirty Read

Transaction A reads data modified by transaction B that has not yet committed. If B rolls back, A was operating on phantom data.

```
T1: UPDATE orders SET status = 'shipped' WHERE id = 1;
T2: SELECT status FROM orders WHERE id = 1;  -- sees 'shipped'
T1: ROLLBACK;  -- 'shipped' disappears; T2 read a value that never existed
```

### Non-Repeatable Read

Transaction A reads the same row twice and gets different results because transaction B modified and committed the row between the two reads.

```
T1: SELECT balance FROM accounts WHERE id = 1;  -- 1000
T2: UPDATE accounts SET balance = 900 WHERE id = 1; COMMIT;
T1: SELECT balance FROM accounts WHERE id = 1;  -- 900 (changed!)
```

### Phantom Read

Transaction A runs the same range query twice and gets different row sets because transaction B inserted or deleted rows in that range.

```
T1: SELECT COUNT(*) FROM orders WHERE user_id = 5;  -- 3
T2: INSERT INTO orders (user_id, ...) VALUES (5, ...); COMMIT;
T1: SELECT COUNT(*) FROM orders WHERE user_id = 5;  -- 4 (phantom!)
```

## Isolation Levels

The SQL standard defines four levels, each preventing a specific set of anomalies:

| Level | Dirty Read | Non-Repeatable | Phantom Read |
|-------|-----------|----------------|--------------|
| Read Uncommitted | Possible | Possible | Possible |
| Read Committed | No | Possible | Possible |
| Repeatable Read | No | No | Possible* |
| Serializable | No | No | No |

*In PostgreSQL, Repeatable Read also prevents Phantom Reads due to MVCC.

**Read Committed** is the PostgreSQL default. Each `SELECT` sees a snapshot of committed data taken at the start of that specific statement (not the transaction).

**Repeatable Read** — each `SELECT` sees the snapshot taken at the start of the transaction. The same rows will look the same throughout the transaction.

**Serializable** — transactions execute as if they were run serially, even when physically concurrent. PostgreSQL implements SSI (Serializable Snapshot Isolation) — an optimistic approach without read locks.

```sql
-- Set isolation level for a transaction
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts WHERE id = 1;
-- ... other operations ...
COMMIT;
```

## MVCC in PostgreSQL

PostgreSQL implements isolation through MVCC (Multi-Version Concurrency Control). Instead of locking rows on read, it creates a **snapshot** of the database state. Each row can exist in multiple versions simultaneously.

Every row in PostgreSQL stores:
- `xmin` — ID of the transaction that created the row.
- `xmax` — ID of the transaction that deleted the row (0 if the row is current).

When reading, PostgreSQL only sees rows where `xmin` is less than the current snapshot's transaction ID and `xmax` is 0 or greater than the snapshot.

Consequences of MVCC:
- **Readers do not block writers** — `SELECT` acquires no locks and does not interfere with `UPDATE`.
- **Dead versions accumulate** — old row versions must be periodically cleaned up by `VACUUM`.
- **Table bloat** — tables can grow large under heavy updates due to accumulated dead tuples.

## Deadlocks

A deadlock occurs when two transactions each wait for a lock held by the other.

```
T1: UPDATE accounts SET balance = balance - 100 WHERE id = 1;
    -- T1 holds lock on row 1
T2: UPDATE accounts SET balance = balance - 100 WHERE id = 2;
    -- T2 holds lock on row 2
T1: UPDATE accounts SET balance = balance + 100 WHERE id = 2;
    -- T1 waits for T2
T2: UPDATE accounts SET balance = balance + 100 WHERE id = 1;
    -- T2 waits for T1 → DEADLOCK
```

PostgreSQL automatically detects deadlocks and rolls back one of the transactions with `ERROR: deadlock detected`.

**Preventing deadlocks:**

1. **Consistent lock ordering** — always update rows in the same order (e.g., ascending ID).
2. **Short transactions** — the shorter a transaction holds locks, the lower the conflict probability.
3. **Explicit `SELECT FOR UPDATE`** — acquire the row lock before reading.

```go
// Deadlock prevention: always lock in the same order
func transfer(ctx context.Context, db *sql.DB, fromID, toID int64, amount float64) error {
    // Sort IDs to always acquire locks in the same order
    first, second := fromID, toID
    if fromID > toID {
        first, second = toID, fromID
    }

    tx, err := db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()

    // Lock both rows in deterministic order
    var b1, b2 float64
    if err := tx.QueryRowContext(ctx,
        "SELECT balance FROM accounts WHERE id = $1 FOR UPDATE", first,
    ).Scan(&b1); err != nil {
        return err
    }
    if err := tx.QueryRowContext(ctx,
        "SELECT balance FROM accounts WHERE id = $1 FOR UPDATE", second,
    ).Scan(&b2); err != nil {
        return err
    }

    if fromID == first {
        if b1 < amount {
            return errors.New("insufficient funds")
        }
    } else {
        if b2 < amount {
            return errors.New("insufficient funds")
        }
    }

    _, err = tx.ExecContext(ctx,
        "UPDATE accounts SET balance = balance - $1 WHERE id = $2", amount, fromID)
    if err != nil {
        return err
    }
    _, err = tx.ExecContext(ctx,
        "UPDATE accounts SET balance = balance + $1 WHERE id = $2", amount, toID)
    if err != nil {
        return err
    }
    return tx.Commit()
}
```

## SELECT FOR UPDATE and Row Locks

`SELECT FOR UPDATE` locks the selected rows for modification. Other transactions block until the lock is released.

```sql
-- Pessimistic lock: acquire row lock before modifying
BEGIN;
SELECT id, balance FROM accounts WHERE id = $1 FOR UPDATE;
-- other transactions cannot modify this row
UPDATE accounts SET balance = balance - $2 WHERE id = $1;
COMMIT;
```

Variants:
- `FOR UPDATE` — write lock.
- `FOR SHARE` — read lock (others can read, cannot write).
- `FOR UPDATE SKIP LOCKED` — skip already-locked rows (useful for job queues).
- `FOR UPDATE NOWAIT` — return an error immediately instead of waiting.

```sql
-- Job queue pattern: grab the next available job
SELECT id, payload
FROM   jobs
WHERE  status = 'pending'
ORDER  BY created_at
LIMIT  1
FOR UPDATE SKIP LOCKED;
```

## Advisory Locks

PostgreSQL provides application-level advisory locks — named locks not tied to specific rows. They are useful for distributed operations that cannot be protected by regular row locks.

```sql
-- Transaction-scoped advisory lock (released on COMMIT/ROLLBACK)
SELECT pg_advisory_xact_lock(42);  -- lock with key 42

-- Session-scoped advisory lock (must be released explicitly)
SELECT pg_advisory_lock(42);
-- ... critical section ...
SELECT pg_advisory_unlock(42);
```

In Go, advisory locks are convenient for cross-service synchronization:

```go
func withAdvisoryLock(ctx context.Context, db *sql.DB, key int64, fn func() error) error {
    tx, err := db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()

    if _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock($1)", key); err != nil {
        return fmt.Errorf("acquire lock: %w", err)
    }

    if err := fn(); err != nil {
        return err
    }
    return tx.Commit()
}
```

## Optimistic vs Pessimistic Locking

**Pessimistic locking** (`SELECT FOR UPDATE`) assumes conflict will occur and acquires the lock upfront. Simple, reliable, but reduces concurrency.

**Optimistic locking** assumes conflicts are rare. The row is not locked on read; on update, the code checks whether the row has changed.

Implementation with a `version` column:

```sql
-- Schema
ALTER TABLE products ADD COLUMN version INT DEFAULT 0;

-- Update with version check
UPDATE products
SET    name = $1, version = version + 1
WHERE  id = $2 AND version = $3;
-- If affected rows = 0 → someone changed the row → conflict
```

```go
func updateProduct(ctx context.Context, db *sql.DB, p Product) error {
    result, err := db.ExecContext(ctx, `
        UPDATE products
        SET    name = $1, price = $2, version = version + 1
        WHERE  id = $3 AND version = $4
    `, p.Name, p.Price, p.ID, p.Version)
    if err != nil {
        return err
    }

    n, err := result.RowsAffected()
    if err != nil {
        return err
    }
    if n == 0 {
        return ErrConflict // another transaction modified the row
    }
    return nil
}
```

Optimistic locking is appropriate when conflicts are rare (low write concurrency). Under high concurrency, pessimistic locking is more efficient — fewer retries.
