---
title: SQL-запросы — JOIN, оконные функции, CTE
blockId: sql-queries
parentBlockId: sql
---

# SQL-запросы — JOIN, оконные функции, CTE

Умение писать сложные запросы отделяет разработчика, «знакомого с SQL», от того, кто владеет им уверенно. На Go-собеседованиях часто дают задачи прямо в блокноте или на whiteboard: написать запрос с несколькими JOIN-ами, посчитать скользящее среднее оконной функцией, рекурсивно обойти иерархию — и объяснить, почему этот запрос работает быстро или медленно.

## JOIN — объединение таблиц

JOIN соединяет строки двух таблиц по условию. Результирующая строка формируется из полей обеих таблиц.

### INNER JOIN

Возвращает только строки, у которых есть совпадение в обеих таблицах.

```sql
SELECT u.id, u.name, o.id AS order_id, o.total
FROM   users u
INNER JOIN orders o ON o.user_id = u.id;
```

Пользователи без заказов в результат не попадут. Заказы без пользователя тоже.

### LEFT JOIN

Возвращает все строки левой таблицы, а для правой — NULL, если совпадения нет. Используется, когда нужно показать все сущности независимо от наличия связанных данных.

```sql
SELECT u.name,
       COUNT(o.id) AS order_count
FROM   users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP  BY u.id, u.name;
```

Пользователь без заказов получит `order_count = 0`, а не исчезнет из результата.

### RIGHT JOIN и FULL OUTER JOIN

RIGHT JOIN — зеркало LEFT JOIN. Используется редко, так как всегда можно переписать через LEFT JOIN, поменяв таблицы местами.

FULL OUTER JOIN возвращает все строки из обеих таблиц, NULL в незаполненных полях с каждой стороны.

```sql
SELECT a.id AS a_id, b.id AS b_id
FROM   table_a a
FULL OUTER JOIN table_b b ON b.a_id = a.id;
```

### Множественные JOIN

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

Порядок JOIN-ов влияет на читаемость, но оптимизатор PostgreSQL сам выбирает порядок соединения таблиц на основе статистики.

## Подзапросы

Подзапрос — запрос внутри другого запроса. Может стоять в `WHERE`, `FROM` (derived table), `SELECT` (scalar subquery).

```sql
-- Пользователи, у которых сумма заказов выше средней по всем пользователям
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

Подзапросы бывают **коррелированными** (ссылаются на внешний запрос — выполняются для каждой строки) и **некоррелированными** (вычисляются один раз). Коррелированные подзапросы в `WHERE` — частый источник проблем с производительностью.

## GROUP BY и HAVING

`GROUP BY` группирует строки с одинаковыми значениями столбца. В `SELECT` после GROUP BY можно указывать только группирующие столбцы и агрегатные функции.

`HAVING` фильтрует уже сформированные группы. Ключевое отличие от `WHERE`: `WHERE` применяется до группировки (к строкам), `HAVING` — после (к группам).

```sql
SELECT   product_id,
         DATE_TRUNC('month', created_at) AS month,
         SUM(quantity)                   AS total_sold
FROM     order_items
WHERE    created_at >= '2024-01-01'     -- фильтр строк
GROUP BY product_id, DATE_TRUNC('month', created_at)
HAVING   SUM(quantity) > 100            -- фильтр групп
ORDER BY total_sold DESC;
```

## CTE (Common Table Expressions)

CTE — именованный подзапрос, определённый через `WITH`. Делает сложные запросы читаемыми, разбивая их на шаги. По умолчанию в PostgreSQL CTE **не** является барьером оптимизации с версии 12.

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

### Рекурсивные CTE

Рекурсивный CTE позволяет обходить иерархические данные (дерево категорий, граф зависимостей, цепочку задач). Состоит из **базового случая** (начальные строки) и **рекурсивного шага** (ссылка на сам CTE).

```sql
-- Все сотрудники в подчинении менеджера с id=1 (любой глубины)
WITH RECURSIVE subordinates AS (
    -- базовый случай: прямые подчинённые
    SELECT id, name, manager_id, 1 AS depth
    FROM   employees
    WHERE  manager_id = 1

    UNION ALL

    -- рекурсивный шаг: подчинённые подчинённых
    SELECT e.id, e.name, e.manager_id, s.depth + 1
    FROM   employees e
    JOIN   subordinates s ON s.id = e.manager_id
)
SELECT id, name, depth
FROM   subordinates
ORDER  BY depth, name;
```

Важно: рекурсивный CTE должен завершиться. PostgreSQL ограничивает глубину параметром `max_recursion_depth` (по умолчанию — без ограничения). Для защиты от бесконечных циклов добавляют условие `WHERE depth < 10` или фильтрацию уже посещённых узлов.

## Оконные функции

Оконные функции вычисляют значение для каждой строки с учётом «окна» — набора строк, связанных с текущей. В отличие от агрегатов, строки не сворачиваются.

Синтаксис: `функция() OVER (PARTITION BY ... ORDER BY ... ROWS/RANGE ...)`.

### ROW_NUMBER, RANK, DENSE_RANK

```sql
SELECT name,
       department,
       salary,
       ROW_NUMBER()  OVER w AS row_num,   -- уникальный номер, без повторов
       RANK()        OVER w AS rnk,       -- пропускает номера при равных значениях
       DENSE_RANK()  OVER w AS dense_rnk  -- не пропускает номера
FROM   employees
WINDOW w AS (PARTITION BY department ORDER BY salary DESC);
```

Разница при одинаковых зарплатах:
- Двум сотрудникам с одинаковой зарплатой `RANK` присвоит 1 и 1, следующий получит 3.
- `DENSE_RANK` присвоит 1 и 1, следующий получит 2.
- `ROW_NUMBER` присвоит 1 и 2 (произвольно).

### LAG и LEAD

`LAG` возвращает значение из **предыдущей** строки окна, `LEAD` — из **следующей**. Полезны для вычисления изменений и трендов.

```sql
SELECT order_date,
       revenue,
       LAG(revenue)  OVER (ORDER BY order_date) AS prev_day_revenue,
       LEAD(revenue) OVER (ORDER BY order_date) AS next_day_revenue,
       revenue - LAG(revenue) OVER (ORDER BY order_date) AS delta
FROM   daily_revenue
ORDER  BY order_date;
```

### Агрегаты как оконные функции

Любая агрегатная функция может работать как оконная:

```sql
SELECT name,
       department,
       salary,
       AVG(salary) OVER (PARTITION BY department) AS dept_avg,
       salary - AVG(salary) OVER (PARTITION BY department) AS diff_from_avg,
       SUM(salary) OVER (PARTITION BY department ORDER BY salary
                         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative
FROM   employees;
```

`ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` задаёт нарастающий итог от начала окна до текущей строки.

## EXPLAIN ANALYZE — чтение плана запроса

PostgreSQL показывает план выполнения командой `EXPLAIN ANALYZE`. Это обязательный навык для любого разработчика, работающего с базой данных.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT u.name, COUNT(o.id)
FROM   users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP  BY u.id;
```

Пример вывода:
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

На что смотреть:
- **Seq Scan** на большой таблице — потенциальная проблема, нужен индекс.
- **actual rows** сильно отличается от **rows** (оценки) — устаревшая статистика, нужен `ANALYZE`.
- **Nested Loop** при большом количестве строк — может быть медленным, хорошо при маленьком наборе.
- **Hash Join** — оптимален для больших таблиц без индексов.
- **Buffers: shared hit** vs **read** — данные из кэша или с диска.

## Паттерны запросов в Go

При работе с результатами JOIN-ов в Go часто возникает вопрос: как сопоставить вложенные объекты (пользователь → список заказов)?

Стандартный подход — использовать `sqlx` или `pgx` и собирать вложенность вручную:

```go
type UserWithOrders struct {
    UserID   int64   `db:"user_id"`
    UserName string  `db:"user_name"`
    OrderID  *int64  `db:"order_id"`
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

Главное — всегда проверять `rows.Err()` после цикла: ошибки потоковой обработки появляются именно там.
