---
title: SQL Indexes — B-tree, Composite, Covering
blockId: sql-indexes
parentBlockId: sql
---

# SQL Indexes — B-tree, Composite, Covering

Indexes are the fastest way to fix a slow query and one of the most common database topics in technical interviews. A developer needs more than just knowing `CREATE INDEX` — they must understand the internal structure, read `EXPLAIN ANALYZE` output, choose the right index type, and explain when an index is harmful.

## How a B-tree Index Works

B-tree (balanced tree) is the default index structure in PostgreSQL. The tree consists of pages: root → interior pages → leaf pages. Each leaf page holds an ordered list of key values and pointers to the physical row location (TID — tuple identifier).

When searching `WHERE salary = 85000`:
1. PostgreSQL starts at the root.
2. At each level it selects the appropriate child node using binary search within the page.
3. At the leaf level it finds all TIDs for the value `85000`.
4. It fetches the corresponding rows from the heap (the main table storage).

Search complexity: O(log N), where N is the number of rows. For a ten-million-row table that is roughly 23 steps compared to 10 million for a sequential scan.

B-tree supports: `=`, `<`, `<=`, `>`, `>=`, `BETWEEN`, `IN`, `IS NULL/NOT NULL`, `LIKE 'prefix%'`.

Does not support: `LIKE '%suffix'`, `LIKE '%middle%'`, or regular expressions without a specialized index.

## Composite Indexes

A composite index covers multiple columns. Column order is critical: PostgreSQL can use the index only when the query filters on a **prefix** of the column list.

```sql
CREATE INDEX idx_orders_user_date ON orders (user_id, created_at);
```

This index will be used for:
- `WHERE user_id = 5`
- `WHERE user_id = 5 AND created_at > '2025-01-01'`
- `ORDER BY user_id, created_at`

It will not be used for:
- `WHERE created_at > '2025-01-01'` (without `user_id`)

The **"most selective column first"** rule applies in most cases. However, if the first column appears only in a range predicate while the second appears in an equality predicate, placing the equality column first can be advantageous.

```sql
-- Better: equality column first
CREATE INDEX idx_orders_status_date ON orders (status, created_at)
-- For query: WHERE status = 'pending' AND created_at > '2025-01-01'
```

## Covering Indexes

A covering index includes all columns needed by a query. In that case PostgreSQL can perform an **index-only scan** — data comes directly from the index without touching the heap.

```sql
CREATE INDEX idx_users_email_name ON users (email) INCLUDE (name, created_at);
```

`INCLUDE` adds columns to the leaf pages of the index without making them part of the sort key. This saves space and allows the index to serve queries like:

```sql
SELECT name, created_at FROM users WHERE email = 'alice@example.com';
-- → Index Only Scan using idx_users_email_name
```

Without the covering index, PostgreSQL would locate the row through the B-tree and then fetch the heap page to retrieve `name` and `created_at`.

## Partial Indexes

A partial index is built only over rows that satisfy a `WHERE` condition. It is smaller and faster to maintain.

```sql
-- Index only for pending orders
CREATE INDEX idx_orders_pending ON orders (created_at)
WHERE status = 'pending';
```

PostgreSQL will use this index only when the query contains `status = 'pending'`. It will not apply for completed or cancelled orders.

Uses for partial indexes:
- Indexing only non-null values (`WHERE column IS NOT NULL`).
- Indexing only "active" records.
- Speeding up soft-delete patterns (`WHERE deleted_at IS NULL`).

```sql
CREATE UNIQUE INDEX idx_users_email_active
ON users (email)
WHERE deleted_at IS NULL;
-- Guarantees email uniqueness only among non-deleted users
```

## Index-Only Scan and Row Visibility

An index-only scan works when the index covers all needed columns. But PostgreSQL does not always choose it even with a covering index. The reason is the **visibility map**: the database must verify that a row is visible to the current transaction. If a page is not marked "all rows visible", a heap fetch happens anyway.

`VACUUM` updates the visibility map. On tables with frequent updates, `autovacuum` may fall behind, causing index-only scans to degrade to regular index scans.

```sql
-- Force VACUUM for a clean test
VACUUM ANALYZE orders;
EXPLAIN (ANALYZE, BUFFERS) SELECT user_id, total FROM orders WHERE user_id = 42;
-- Look for: Index Only Scan vs Index Scan
```

## When NOT to Index

An index speeds up reads but slows down writes. Every `INSERT`, `UPDATE`, and `DELETE` must update all of the table's indexes. Unnecessary indexes are not just wasted space — they actively hurt write performance.

**Do not index:**

1. **Small tables** (< 1000 rows). A sequential scan is faster: fewer access points, everything fits in cache.
2. **Low-cardinality columns** (booleans, status columns with 3–5 values). An index on a boolean column accesses half the table — the planner will prefer a seq scan.
3. **Frequently updated columns**. Every `UPDATE` rebuilds the index. Multiple indexes on a hot table can kill write throughput.
4. **Columns always used inside a function**: `WHERE LOWER(email) = ...` does not use a plain index on `email`.

**Solution for function-based searches** — an expression index:

```sql
CREATE INDEX idx_users_email_lower ON users (LOWER(email));
-- Now WHERE LOWER(email) = 'alice@example.com' uses the index
```

## Reading EXPLAIN Output

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT name FROM users WHERE email = 'alice@example.com';
```

```
Index Scan using idx_users_email on users
  (cost=0.43..8.45 rows=1 width=32)
  (actual time=0.034..0.036 rows=1 loops=1)
  Index Cond: (email = 'alice@example.com')
  Buffers: shared hit=3
Planning Time: 0.089 ms
Execution Time: 0.056 ms
```

Key fields:
- `cost=0.43..8.45` — estimated cost (start-up..total) in arbitrary units.
- `rows=1` — planner estimate; `actual rows=1` — real row count.
- `loops=1` — how many times this plan node ran.
- `Buffers: shared hit=3` — 3 pages served from shared buffer cache (no disk I/O).

**Common plan node types:**

| Node | When used |
|------|-----------|
| Seq Scan | No index, or planner decided seq scan is cheaper |
| Index Scan | Index used, heap fetch required |
| Index Only Scan | Covering index, no heap needed |
| Bitmap Heap Scan | Many rows match; bitmap collected first, then heap |
| Nested Loop | JOIN of small sets |
| Hash Join | JOIN of large sets without a supporting index |
| Merge Join | JOIN of pre-sorted sets |

## The N+1 Problem and Indexes

N+1 is an antipattern where loading N child objects triggers N additional queries instead of a single JOIN.

```go
// N+1 — bad
users, _ := db.QueryContext(ctx, "SELECT id, name FROM users")
for rows.Next() {
    var u User
    rows.Scan(&u.ID, &u.Name)
    // Separate query for every user!
    orderRows, _ := db.QueryContext(ctx,
        "SELECT id, total FROM orders WHERE user_id = $1", u.ID)
    // ...
}
```

Even with a perfect index on `orders.user_id`, this is 1 + N database round-trips. For 1 000 users that is 1 001 trips instead of one.

```go
// Solution 1: single JOIN query
rows, _ := db.QueryContext(ctx, `
    SELECT u.id, u.name, o.id, o.total
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
`)

// Solution 2: two queries + IN (avoids Cartesian explosion with multiple 1-to-many joins)
userIDs := []int64{...}
rows, _ := db.QueryContext(ctx,
    "SELECT id, user_id, total FROM orders WHERE user_id = ANY($1)",
    pq.Array(userIDs))
```

The index `idx_orders_user_id` on `user_id` is critical for both solutions — for the JOIN and for `WHERE user_id = ANY(...)`.

## Monitoring Index Usage

PostgreSQL collects index usage statistics in `pg_stat_user_indexes`:

```sql
SELECT schemaname,
       tablename,
       indexname,
       idx_scan,       -- how many times the index was used for a scan
       idx_tup_read,
       idx_tup_fetch
FROM   pg_stat_user_indexes
WHERE  schemaname = 'public'
ORDER  BY idx_scan ASC;
```

Indexes with `idx_scan = 0` are candidates for removal. Before dropping, verify that statistics have not been reset and the table is not used only in rare batch jobs.

```sql
-- Unused indexes (excluding primary keys)
SELECT indexname, tablename, pg_size_pretty(pg_relation_size(indexname::regclass)) AS size
FROM   pg_stat_user_indexes
WHERE  idx_scan = 0
  AND  indexname NOT LIKE '%_pkey';
```
