---
title: SQL for Go Developers
blockId: sql
parentBlockId: null
---

# SQL for Go Developers

SQL is more than fifty years old and remains mandatory on every backend interview. Go developers often assume knowing the `database/sql` package is enough, but interviewers test understanding of the query language itself: indexes, transactions, execution plans, and the patterns that determine system performance.

## Why SQL Matters for Go Developers

Most Go services store data in PostgreSQL or MySQL. ORMs in Go are intentionally minimal (GORM, sqlc, sqlx), and many teams prefer raw SQL for readability and predictable performance. This means developers need to understand what is actually happening in the database rather than hiding behind ORM magic.

SQL questions in interviews fall into three categories:

1. **Conceptual questions** — "what is ACID", "what isolation levels exist", "how do B-tree indexes work".
2. **Writing queries** — JOINs, window functions, CTEs, aggregations.
3. **Performance analysis** — reading EXPLAIN ANALYZE, spotting N+1 issues, choosing indexes.

## Relational Model Basics

In a relational database, data is organized in **tables** (relations) of rows and columns. Each row is uniquely identified by a **primary key**. Relationships between tables are expressed through **foreign keys**.

The three normal forms most commonly asked about:

- **1NF** — atomic column values, no repeating column groups.
- **2NF** — 1NF + every non-key attribute fully depends on the primary key.
- **3NF** — 2NF + no transitive dependencies between non-key attributes.

Normalization reduces update anomalies, but denormalization is sometimes justified for read performance.

## Core Query Types

### SELECT and Filtering

The basic syntax is familiar, but understanding the logical execution order matters:

```sql
SELECT department, COUNT(*) AS headcount
FROM   employees
WHERE  salary > 80000
GROUP  BY department
HAVING COUNT(*) > 5
ORDER  BY headcount DESC
LIMIT  10;
```

Logical execution order: `FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT`. This explains why you cannot use a `SELECT`-level alias in a `WHERE` clause.

### JOIN

A JOIN combines rows from two tables based on a condition. Four main types:

- **INNER JOIN** — only rows that have a match in both tables.
- **LEFT JOIN** — all rows from the left table plus matching rows from the right (NULL if no match).
- **RIGHT JOIN** — mirror of LEFT JOIN.
- **FULL OUTER JOIN** — all rows from both tables.

```sql
SELECT u.name, o.total
FROM   users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE  o.created_at > NOW() - INTERVAL '30 days';
```

### Aggregations and GROUP BY

Aggregate functions (`COUNT`, `SUM`, `AVG`, `MAX`, `MIN`) collapse groups of rows into single values. Filtering aggregated results uses `HAVING`, not `WHERE`.

## Indexes — the Key to Performance

An index is a separate data structure (usually a B-tree) that allows the database to find rows without scanning the entire table. Without an index, any `WHERE id = 42` becomes a sequential scan of the whole table.

Main index types in PostgreSQL:

- **B-tree** (default) — for `=`, `<`, `>`, `BETWEEN`, `LIKE 'prefix%'`.
- **Hash** — equality only, slightly faster than B-tree for exact lookups.
- **GIN** — for composite types: arrays, JSONB, full-text search.
- **GiST** — for geometric types and range types.

It is equally important to know when an index does **not** help: applying a function to an indexed column (`WHERE LOWER(email) = ...`), low selectivity (a column with two distinct values), or very small tables.

## Transactions and ACID

A transaction is a group of operations executed atomically. ACID defines the guarantees a database provides for transactions:

- **Atomicity** — either all operations succeed or none do.
- **Consistency** — a transaction moves the database from one valid state to another.
- **Isolation** — concurrent transactions do not see each other's intermediate results (depending on isolation level).
- **Durability** — committed data survives crashes.

SQL isolation levels from weakest to strongest: Read Uncommitted, Read Committed, Repeatable Read, Serializable. PostgreSQL defaults to Read Committed.

## The database/sql Package in Go

The standard `database/sql` package provides an abstraction over any driver:

```go
import (
    "context"
    "database/sql"
    _ "github.com/lib/pq" // registers the PostgreSQL driver
)

db, err := sql.Open("postgres", dsn)
if err != nil {
    return err
}
defer db.Close()

// Connection pool tuning
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(5)
db.SetConnMaxLifetime(5 * time.Minute)
```

`sql.DB` is a connection pool, not a single connection. Go 1.25 guarantees the pool is goroutine-safe: a single `*sql.DB` can be shared freely across goroutines.

Core methods:

- `db.QueryContext` — fetch multiple rows.
- `db.QueryRowContext` — fetch exactly one row.
- `db.ExecContext` — INSERT/UPDATE/DELETE without row results.
- `db.BeginTx` — start a transaction.
- `db.PrepareContext` — prepare a reusable statement.

## What Interviewers Test

Typical SQL block questions:

1. Write a query with multiple JOINs and an aggregation.
2. Explain the difference between `WHERE` and `HAVING`.
3. Describe what an index is and how it speeds up a query.
4. Explain ACID and isolation levels.
5. Show how to work with transactions in Go.
6. Identify an N+1 problem in code and propose a fix.

The remaining articles in this block cover each topic in depth with Go 1.25 code examples.
