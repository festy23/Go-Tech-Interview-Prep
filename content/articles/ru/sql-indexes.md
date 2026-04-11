---
title: SQL-индексы — B-tree, составные, покрывающие
blockId: sql-indexes
parentBlockId: sql
---

# SQL-индексы — B-tree, составные, покрывающие

Индексы — самый быстрый способ ускорить медленный запрос и один из самых популярных топиков на собеседованиях по базам данных. Разработчик должен не просто знать команду `CREATE INDEX`, но и понимать внутреннюю структуру, уметь читать `EXPLAIN ANALYZE`, выбирать тип индекса и объяснять, когда индекс вреден.

## Как работает B-tree индекс

B-tree (сбалансированное дерево) — структура данных по умолчанию для индексов в PostgreSQL. Дерево состоит из страниц: корень → узловые страницы → листовые страницы. Каждая листовая страница содержит упорядоченный список значений ключа и ссылок на физическое расположение строки (TID — tuple identifier).

При поиске `WHERE salary = 85000`:
1. PostgreSQL начинает с корня дерева.
2. На каждом уровне выбирает нужный дочерний узел (бинарный поиск по странице).
3. На листовом уровне находит все TID для значения `85000`.
4. Загружает соответствующие строки из heap (основного хранилища таблицы).

Сложность поиска: O(log N), где N — количество строк. Для таблицы в 10 миллионов строк это ~23 уровня против 10 миллионов шагов при sequential scan.

B-tree поддерживает операции: `=`, `<`, `<=`, `>`, `>=`, `BETWEEN`, `IN`, `IS NULL/NOT NULL`, `LIKE 'prefix%'`.

Не поддерживает: `LIKE '%suffix'`, `LIKE '%middle%'`, регулярные выражения без специального индекса.

## Составные (composite) индексы

Составной индекс включает несколько столбцов. Порядок столбцов критически важен: PostgreSQL может использовать такой индекс только если запрос фильтрует по **префиксу** списка столбцов.

```sql
CREATE INDEX idx_orders_user_date ON orders (user_id, created_at);
```

Этот индекс будет использован для:
- `WHERE user_id = 5`
- `WHERE user_id = 5 AND created_at > '2025-01-01'`
- `ORDER BY user_id, created_at`

Не будет использован для:
- `WHERE created_at > '2025-01-01'` (без `user_id`)

Правило **«наиболее селективный столбец сначала»** применяется в большинстве случаев. Однако есть нюанс: если первый столбец используется только в диапазонном предикате, а второй — в точном сравнении, бывает выгоднее поставить столбец с `=` первым.

```sql
-- Лучше: equality column first
CREATE INDEX idx_orders_status_date ON orders (status, created_at)
-- Для запроса: WHERE status = 'pending' AND created_at > '2025-01-01'
```

## Покрывающие (covering) индексы

Покрывающий индекс содержит все столбцы, которые нужны запросу. В этом случае PostgreSQL выполняет **index-only scan** — данные берутся прямо из индекса без обращения к heap.

```sql
CREATE INDEX idx_users_email_name ON users (email) INCLUDE (name, created_at);
```

`INCLUDE` добавляет столбцы в листовые страницы индекса без включения их в ключ сортировки. Это экономит место и позволяет индексу обслуживать запросы вида:

```sql
SELECT name, created_at FROM users WHERE email = 'alice@example.com';
-- → Index Only Scan using idx_users_email_name
```

Сравните с вариантом без `INCLUDE`: без покрывающего индекса PostgreSQL нашёл бы строку через B-tree, но затем обратился бы к heap для получения `name` и `created_at`.

## Частичные (partial) индексы

Частичный индекс строится только для строк, удовлетворяющих условию `WHERE`. Он меньше по размеру и быстрее обновляется.

```sql
-- Индекс только для незавершённых заказов
CREATE INDEX idx_orders_pending ON orders (created_at)
WHERE status = 'pending';
```

PostgreSQL будет использовать этот индекс только когда запрос содержит условие `status = 'pending'`. Для фильтрации по completed/cancelled этот индекс не подойдёт.

Применения частичных индексов:
- Индексирование только ненулевых значений (`WHERE column IS NOT NULL`).
- Индексирование только «активных» записей.
- Ускорение мягкого удаления (`WHERE deleted_at IS NULL`).

```sql
CREATE UNIQUE INDEX idx_users_email_active
ON users (email)
WHERE deleted_at IS NULL;
-- Гарантирует уникальность email только среди активных пользователей
```

## Index-only scan и видимость строк

Index-only scan работает, когда индекс покрывает все нужные столбцы. Но PostgreSQL не всегда его использует даже при наличии покрывающего индекса. Причина — **visibility map**: база данных должна убедиться, что строка видима текущей транзакции. Если страница не отмечена как «все строки видимы», всё равно происходит обращение к heap.

Команда `VACUUM` обновляет visibility map. На таблицах с частыми обновлениями `autovacuum` может не успевать, и index-only scan деградирует в обычный index scan.

```sql
-- Принудительный VACUUM для чистоты эксперимента
VACUUM ANALYZE orders;
EXPLAIN (ANALYZE, BUFFERS) SELECT user_id, total FROM orders WHERE user_id = 42;
-- Ищите: Index Only Scan vs Index Scan
```

## Когда НЕ нужен индекс

Индекс ускоряет чтение, но замедляет запись. При каждом `INSERT`, `UPDATE`, `DELETE` PostgreSQL должен обновить все индексы таблицы. Лишние индексы — не просто неиспользуемые данные, они активно вредят производительности.

**Не индексируйте:**

1. **Маленькие таблицы** (< 1000 строк). Sequential scan быстрее: меньше точек входа, всё помещается в кэш.
2. **Столбцы с низкой кардинальностью** (булевы, статусы с 3–5 значениями). Индекс по `status` с двумя значениями будет обращаться к половине таблицы — планировщик выберет seq scan.
3. **Часто обновляемые столбцы**. Каждый `UPDATE` перестраивает индекс. Несколько индексов на горячей таблице могут убить производительность записи.
4. **Столбцы, всегда используемые с функцией**: `WHERE LOWER(email) = ...` не использует обычный индекс по `email`.

**Решение для функционального поиска** — функциональный (expression) индекс:

```sql
CREATE INDEX idx_users_email_lower ON users (LOWER(email));
-- Теперь WHERE LOWER(email) = 'alice@example.com' использует индекс
```

## Чтение вывода EXPLAIN

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

Ключевые поля:
- `cost=0.43..8.45` — оценочная стоимость (начало..конец); единицы условные.
- `rows=1` — оценка планировщика; `actual rows=1` — реальное число строк.
- `loops=1` — сколько раз выполнялся этот узел плана.
- `Buffers: shared hit=3` — 3 страницы взяты из shared buffer cache (без обращения к диску).

**Типичные узлы плана:**

| Узел | Когда используется |
|------|-------------------|
| Seq Scan | Нет индекса или планировщик решил, что seq scan быстрее |
| Index Scan | Есть индекс, нужно обращение к heap |
| Index Only Scan | Покрывающий индекс, heap не нужен |
| Bitmap Heap Scan | Много строк по индексу; сначала собирается bitmap, потом heap |
| Nested Loop | JOIN небольших наборов |
| Hash Join | JOIN больших наборов без индекса |
| Merge Join | JOIN предварительно отсортированных наборов |

## Проблема N+1 и индексы

N+1 — антипаттерн, при котором для загрузки N дочерних объектов делается N дополнительных запросов вместо одного JOIN.

```go
// N+1 — плохо
users, _ := db.QueryContext(ctx, "SELECT id, name FROM users")
for rows.Next() {
    var u User
    rows.Scan(&u.ID, &u.Name)
    // Отдельный запрос для каждого пользователя!
    orderRows, _ := db.QueryContext(ctx,
        "SELECT id, total FROM orders WHERE user_id = $1", u.ID)
    // ...
}
```

Даже с идеальным индексом по `orders.user_id` — это 1 + N запросов к базе данных. При 1000 пользователей: 1001 round-trip вместо 1.

```go
// Решение 1: один JOIN-запрос
rows, _ := db.QueryContext(ctx, `
    SELECT u.id, u.name, o.id, o.total
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
`)

// Решение 2: два запроса + IN (для предотвращения декартова произведения)
userIDs := []int64{...}
rows, _ := db.QueryContext(ctx,
    "SELECT id, user_id, total FROM orders WHERE user_id = ANY($1)",
    pq.Array(userIDs))
```

Индекс `idx_orders_user_id` на столбце `user_id` критически важен для обоих решений — как для JOIN, так и для `WHERE user_id = ANY(...)`.

## Мониторинг использования индексов

PostgreSQL собирает статистику использования индексов в представлении `pg_stat_user_indexes`:

```sql
SELECT schemaname,
       tablename,
       indexname,
       idx_scan,   -- сколько раз индекс использовался для сканирования
       idx_tup_read,
       idx_tup_fetch
FROM   pg_stat_user_indexes
WHERE  schemaname = 'public'
ORDER  BY idx_scan ASC;
```

Индексы с `idx_scan = 0` — кандидаты на удаление. Перед удалением убедитесь, что статистика не была сброшена и таблица не используется только в редких batch-операциях.

```sql
-- Неиспользуемые индексы (кроме primary key)
SELECT indexname, tablename, pg_size_pretty(pg_relation_size(indexname::regclass)) AS size
FROM   pg_stat_user_indexes
WHERE  idx_scan = 0
  AND  indexname NOT LIKE '%_pkey';
```
