---
title: SQL Queries — JOINs, Window Functions, CTEs
blockId: sql-queries
parentBlockId: sql
---

# SQL Queries — JOINs, Window Functions, CTEs

The ability to write complex queries separates a developer who is "familiar with SQL" from one who commands it confidently. Go interviews frequently include live coding tasks: write a multi-join query with aggregation, compute a rolling average using a window function, traverse a hierarchy with a recursive CTE — and explain why the query is fast or slow.

## JOIN — Combining Tables

A JOIN combines rows from two tables based on a condition. The resulting row is composed of columns from both tables.

### INNER JOIN

Returns only rows that have a matching row in both tables.

```sql
SELECT u.id, u.name, o.id AS order_id, o.total
FROM   users u
INNER JOIN orders o ON o.user_id = u.id;
```

Users without orders are excluded. So are orders without a matching user.

### LEFT JOIN

Returns all rows from the left table; for the right table it produces NULL when there is no match. Use this when you want all entities regardless of whether related data exists.

```sql
SELECT u.name,
       COUNT(o.id) AS order_count
FROM   users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP  BY u.id, u.name;
```

A user with no orders will have `order_count = 0` rather than being omitted entirely.

### RIGHT JOIN and FULL OUTER JOIN

RIGHT JOIN is the mirror of LEFT JOIN. It is used infrequently because it can always be rewritten as a LEFT JOIN by swapping the tables.

FULL OUTER JOIN returns all rows from both tables, with NULLs in columns from the side that has no match.

```sql
SELECT a.id AS a_id, b.id AS b_id
FROM   table_a a
FULL OUTER JOIN table_b b ON b.a_id = a.id;
```

### Multiple JOINs

```sql
SELECT u.name,
       p.title AS product,
       o.created_at,
       oi.quantity,
       oi.price
FROM   order_items oi
JOIN   orders o  ON o.id  = oi.order_id
JOIN   users  u  ON u.id  = o.user_id
JOIN   products p ON p.id = oi.product_id
WHERE  o.created_at >= '2025-01-01'
ORDER  BY o.created_at DESC;
```

The order of JOINs affects readability, but the PostgreSQL optimizer chooses the actual join order based on table statistics.

## Subqueries

A subquery is a query nested inside another query. It can appear in `WHERE`, `FROM` (as a derived table), or `SELECT` (as a scalar subquery).

```sql
-- Users whose total order value exceeds the average across all users
SELECT user_id, SUM(total) AS user_total
FROM   orders
GROUP  BY user_id
HAVING SUM(total) > (
    SELECT AVG(user_sum)
    FROM (
        SELECT SUM(total) AS user_sum
        FROM   orders
        GROUP  BY user_id
    ) sub
);
```

Subqueries are either **correlated** (reference the outer query — executed once per outer row) or **uncorrelated** (computed once). Correlated subqueries in `WHERE` are a frequent source of performance problems.

## GROUP BY and HAVING

`GROUP BY` groups rows with identical column values. After `GROUP BY`, the `SELECT` list may only reference grouping columns and aggregate functions.

`HAVING` filters the already-formed groups. The key difference from `WHERE`: `WHERE` is applied before grouping (to individual rows); `HAVING` is applied after (to groups).

```sql
SELECT   product_id,
         DATE_TRUNC('month', created_at) AS month,
         SUM(quantity)                   AS total_sold
FROM     order_items
WHERE    created_at >= '2024-01-01'     -- row-level filter
GROUP BY product_id, DATE_TRUNC('month', created_at)
HAVING   SUM(quantity) > 100            -- group-level filter
ORDER BY total_sold DESC;
```

## CTEs (Common Table Expressions)

A CTE is a named subquery defined with `WITH`. It makes complex queries readable by breaking them into steps. Since PostgreSQL 12, a CTE is **not** an optimization fence by default.

```sql
WITH monthly_revenue AS (
    SELECT DATE_TRUNC('month', created_at) AS month,
           SUM(total)                       AS revenue
    FROM   orders
    WHERE  status = 'completed'
    GROUP  BY 1
),
ranked AS (
    SELECT month,
           revenue,
           RANK() OVER (ORDER BY revenue DESC) AS rnk
    FROM   monthly_revenue
)
SELECT month, revenue
FROM   ranked
WHERE  rnk <= 3;
```

### Recursive CTEs

A recursive CTE traverses hierarchical data — category trees, dependency graphs, task chains. It has an **anchor member** (base rows) and a **recursive member** (a self-referencing union step).

```sql
-- All employees reporting to manager id=1 at any depth
WITH RECURSIVE subordinates AS (
    -- anchor: direct reports
    SELECT id, name, manager_id, 1 AS depth
    FROM   employees
    WHERE  manager_id = 1

    UNION ALL

    -- recursive step: their reports
    SELECT e.id, e.name, e.manager_id, s.depth + 1
    FROM   employees e
    JOIN   subordinates s ON s.id = e.manager_id
)
SELECT id, name, depth
FROM   subordinates
ORDER  BY depth, name;
```

A recursive CTE must terminate. Guard against infinite cycles with a depth limit (`WHERE depth < 10`) or by tracking visited nodes.

## Window Functions

Window functions compute a value for each row based on a set of related rows (the "window") without collapsing rows the way aggregates do.

Syntax: `function() OVER (PARTITION BY ... ORDER BY ... ROWS/RANGE ...)`.

### ROW_NUMBER, RANK, DENSE_RANK

```sql
SELECT name,
       department,
       salary,
       ROW_NUMBER()  OVER w AS row_num,   -- unique number, no ties
       RANK()        OVER w AS rnk,       -- skips numbers on ties
       DENSE_RANK()  OVER w AS dense_rnk  -- no skipping on ties
FROM   employees
WINDOW w AS (PARTITION BY department ORDER BY salary DESC);
```

Difference on tied salaries:
- Two employees with the same salary get `RANK` 1 and 1; the next employee gets 3.
- `DENSE_RANK` assigns 1 and 1; the next employee gets 2.
- `ROW_NUMBER` assigns 1 and 2 (arbitrarily).

### LAG and LEAD

`LAG` returns the value from the **previous** row in the window; `LEAD` returns the value from the **next** row. Useful for computing deltas and trends.

```sql
SELECT order_date,
       revenue,
       LAG(revenue)  OVER (ORDER BY order_date) AS prev_day_revenue,
       LEAD(revenue) OVER (ORDER BY order_date) AS next_day_revenue,
       revenue - LAG(revenue) OVER (ORDER BY order_date) AS delta
FROM   daily_revenue
ORDER  BY order_date;
```

### Aggregate Functions as Window Functions

Any aggregate function can work as a window function:

```sql
SELECT name,
       department,
       salary,
       AVG(salary) OVER (PARTITION BY department) AS dept_avg,
       salary - AVG(salary) OVER (PARTITION BY department) AS diff_from_avg,
       SUM(salary) OVER (PARTITION BY department ORDER BY salary
                         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
FROM   employees;
```

`ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` specifies a running total from the start of the partition to the current row.

## EXPLAIN ANALYZE — Reading the Query Plan

PostgreSQL exposes execution plans via `EXPLAIN ANALYZE`. Reading them is a mandatory skill for any developer working with a database.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT u.name, COUNT(o.id)
FROM   users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP  BY u.id;
```

Sample output:
```
HashAggregate  (cost=245.00..265.00 rows=2000 width=40)
               (actual time=15.234..16.891 rows=2000 loops=1)
  ->  Hash Left Join  (cost=68.00..205.00 rows=8000 width=16)
                      (actual time=2.123..11.456 rows=8000 loops=1)
        Hash Cond: (o.user_id = u.id)
        ->  Seq Scan on orders  (cost=0.00..120.00 rows=8000 width=8)
                                (actual time=0.012..3.210 rows=8000 loops=1)
        ->  Hash  (cost=43.00..43.00 rows=2000 width=12)
                  (actual time=1.890..1.890 rows=2000 loops=1)
              ->  Seq Scan on users  (cost=0.00..43.00 rows=2000 width=12)
                                     (actual time=0.009..0.987 rows=2000 loops=1)
Planning Time: 0.234 ms
Execution Time: 17.456 ms
```

What to look for:
- **Seq Scan** on a large table — potential problem, may need an index.
- **actual rows** significantly different from estimated **rows** — stale statistics, run `ANALYZE`.
- **Nested Loop** on a large row set — can be slow; fine when the inner set is small.
- **Hash Join** — optimal for large tables without supporting indexes.
- **Buffers: shared hit** vs **read** — data from cache vs disk.

## Query Patterns in Go

When handling JOIN results in Go, the common challenge is mapping nested objects (user → list of orders). The standard approach with `sqlx` or `pgx` is to collect nesting manually:

```go
type UserWithOrders struct {
    UserID   int64    `db:"user_id"`
    UserName string   `db:"user_name"`
    OrderID  *int64   `db:"order_id"`
    Total    *float64 `db:"total"`
}

rows, err := db.QueryContext(ctx, `
    SELECT u.id AS user_id, u.name AS user_name,
           o.id AS order_id, o.total
    FROM   users u
    LEFT JOIN orders o ON o.user_id = u.id
    ORDER  BY u.id
`)
if err != nil {
    return nil, err
}
defer rows.Close()

users := map[int64]*User{}
for rows.Next() {
    var r UserWithOrders
    if err := rows.Scan(&r.UserID, &r.UserName, &r.OrderID, &r.Total); err != nil {
        return nil, err
    }
    u, ok := users[r.UserID]
    if !ok {
        u = &User{ID: r.UserID, Name: r.UserName}
        users[r.UserID] = u
    }
    if r.OrderID != nil {
        u.Orders = append(u.Orders, Order{ID: *r.OrderID, Total: *r.Total})
    }
}
return users, rows.Err()
```

Always check `rows.Err()` after the loop — streaming errors surface there, not in the initial `QueryContext` call.
