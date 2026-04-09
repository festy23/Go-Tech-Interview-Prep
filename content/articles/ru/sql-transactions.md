---
title: SQL-транзакции — ACID, изоляция, блокировки
blockId: sql-transactions
parentBlockId: sql
---

# SQL-транзакции — ACID, изоляция, блокировки

Транзакции — один из краеугольных камней надёжных систем. Без правильного понимания уровней изоляции в production возникают баги, которые воспроизводятся только под нагрузкой и почти невозможно отследить. Для собеседований это тема, по которой можно провести 30–40 минут: ACID, аномалии чтения, MVCC в PostgreSQL, дедлоки, оптимистичные блокировки.

## ACID — четыре гарантии транзакций

**Atomicity (атомарность)**. Транзакция — неделимая единица: либо выполняются все операции, либо ни одна. Если в середине транзакции происходит сбой, база данных откатывает все изменения к состоянию до начала транзакции.

```sql
BEGIN;
UPDATE accounts SET balance = balance - 500 WHERE id = 1;
UPDATE accounts SET balance = balance + 500 WHERE id = 2;
COMMIT; -- оба UPDATE зафиксированы или ни один
```

**Consistency (согласованность)**. Транзакция переводит базу из одного корректного состояния в другое. Все ограничения (CHECK, FOREIGN KEY, UNIQUE) должны выполняться на момент COMMIT.

**Isolation (изоляция)**. Параллельные транзакции не видят промежуточных результатов друг друга. Степень изоляции настраивается через уровни изоляции.

**Durability (долговечность)**. Зафиксированные данные сохраняются даже при сбое питания или краше процесса. PostgreSQL достигает этого через WAL (Write-Ahead Log): изменения сначала записываются в журнал, потом применяются к файлам данных.

## Аномалии чтения

Три классических аномалии, которые могут возникать при параллельных транзакциях:

### Dirty Read (грязное чтение)

Транзакция A читает данные, изменённые транзакцией B, которая ещё не зафиксирована. Если B откатится, A работала с фантомными данными.

```
T1: UPDATE orders SET status = 'shipped' WHERE id = 1;
T2: SELECT status FROM orders WHERE id = 1;  -- видит 'shipped'
T1: ROLLBACK;  -- 'shipped' исчезает, T2 читала несуществующее значение
```

### Non-Repeatable Read (неповторяемое чтение)

Транзакция A дважды читает одну строку и получает разные результаты, потому что между чтениями транзакция B изменила и зафиксировала строку.

```
T1: SELECT balance FROM accounts WHERE id = 1;  -- 1000
T2: UPDATE accounts SET balance = 900 WHERE id = 1; COMMIT;
T1: SELECT balance FROM accounts WHERE id = 1;  -- 900 (изменилось!)
```

### Phantom Read (чтение фантомов)

Транзакция A дважды выполняет запрос с диапазонным условием и получает разные наборы строк, потому что транзакция B вставила или удалила строки в этом диапазоне.

```
T1: SELECT COUNT(*) FROM orders WHERE user_id = 5;  -- 3
T2: INSERT INTO orders (user_id, ...) VALUES (5, ...); COMMIT;
T1: SELECT COUNT(*) FROM orders WHERE user_id = 5;  -- 4 (фантом!)
```

## Уровни изоляции

SQL-стандарт определяет четыре уровня, каждый из которых предотвращает определённые аномалии:

| Уровень | Dirty Read | Non-Repeatable | Phantom Read |
|---------|-----------|----------------|--------------|
| Read Uncommitted | Возможен | Возможно | Возможно |
| Read Committed | Нет | Возможно | Возможно |
| Repeatable Read | Нет | Нет | Возможно* |
| Serializable | Нет | Нет | Нет |

*В PostgreSQL Repeatable Read также предотвращает Phantom Read благодаря MVCC.

**Read Committed** — уровень по умолчанию в PostgreSQL. Каждый `SELECT` видит снимок данных на момент начала этого конкретного оператора (не транзакции).

**Repeatable Read** — каждый `SELECT` видит снимок на момент начала транзакции. Одни и те же данные будут одинаковыми на протяжении всей транзакции.

**Serializable** — транзакции выполняются так, будто они последовательны (даже если физически параллельны). PostgreSQL реализует SSI (Serializable Snapshot Isolation) — оптимистичный подход без блокировок чтения.

```sql
-- Установка уровня изоляции для транзакции
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts WHERE id = 1;
-- ... другие операции ...
COMMIT;
```

## MVCC в PostgreSQL

PostgreSQL реализует изоляцию через MVCC (Multi-Version Concurrency Control). Вместо блокировки строк при чтении создаётся **снимок** (snapshot) состояния базы данных. Каждая строка может существовать в нескольких версиях одновременно.

Каждая строка в PostgreSQL хранит:
- `xmin` — ID транзакции, создавшей строку.
- `xmax` — ID транзакции, удалившей строку (или 0, если строка актуальна).

При чтении PostgreSQL видит только строки с `xmin` меньше текущего снимка и `xmax` равным 0 или больше снимка.

Следствия MVCC:
- **Читатели не блокируют писателей** — `SELECT` не ставит блокировок, не мешает `UPDATE`.
- **Мёртвые версии накапливаются** — старые версии строк нужно периодически очищать через `VACUUM`.
- **Bloat** — при интенсивных обновлениях таблицы могут «раздуваться» из-за накопления мёртвых версий.

## Дедлоки

Дедлок (взаимная блокировка) возникает, когда две транзакции ждут блокировок друг друга.

```
T1: UPDATE accounts SET balance = balance - 100 WHERE id = 1;
    -- T1 держит блокировку строки 1
T2: UPDATE accounts SET balance = balance - 100 WHERE id = 2;
    -- T2 держит блокировку строки 2
T1: UPDATE accounts SET balance = balance + 100 WHERE id = 2;
    -- T1 ждёт T2
T2: UPDATE accounts SET balance = balance + 100 WHERE id = 1;
    -- T2 ждёт T1 → ДЕДЛОК
```

PostgreSQL автоматически обнаруживает дедлоки и откатывает одну из транзакций с ошибкой `ERROR: deadlock detected`.

**Профилактика дедлоков:**

1. **Одинаковый порядок блокировок** — всегда обновляйте строки в одном порядке (например, по возрастанию ID).
2. **Короткие транзакции** — чем меньше транзакция держит блокировки, тем меньше вероятность конфликта.
3. **Явная блокировка `SELECT FOR UPDATE`** — получить блокировку строки перед чтением.

```go
// Защита от дедлоков: всегда блокируем в одном порядке
func transfer(ctx context.Context, db *sql.DB, fromID, toID int64, amount float64) error {
    // Сортируем ID, чтобы всегда блокировать в одном порядке
    first, second := fromID, toID
    if fromID > toID {
        first, second = toID, fromID
    }

    tx, err := db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()

    // Блокируем обе строки в детерминированном порядке
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

## SELECT FOR UPDATE и блокировки строк

`SELECT FOR UPDATE` блокирует выбранные строки для изменения. Другие транзакции будут ждать снятия блокировки.

```sql
-- Пессимистичная блокировка: захватить строку перед изменением
BEGIN;
SELECT id, balance FROM accounts WHERE id = $1 FOR UPDATE;
-- другие транзакции не могут изменить эту строку
UPDATE accounts SET balance = balance - $2 WHERE id = $1;
COMMIT;
```

Варианты:
- `FOR UPDATE` — блокировка для записи.
- `FOR SHARE` — блокировка для чтения (другие могут читать, но не писать).
- `FOR UPDATE SKIP LOCKED` — пропустить уже заблокированные строки (полезно для очередей задач).
- `FOR UPDATE NOWAIT` — немедленно вернуть ошибку вместо ожидания.

```sql
-- Паттерн очереди задач: взять следующее незаблокированное задание
SELECT id, payload
FROM   jobs
WHERE  status = 'pending'
ORDER  BY created_at
LIMIT  1
FOR UPDATE SKIP LOCKED;
```

## Advisory Locks

PostgreSQL предоставляет пользовательские блокировки (advisory locks) — именованные блокировки, которые не привязаны к конкретным строкам. Они полезны для распределённых операций, которые нельзя защитить обычными строковыми блокировками.

```sql
-- Транзакционная advisory lock (снимается при COMMIT/ROLLBACK)
SELECT pg_advisory_xact_lock(42);  -- блокировка с ключом 42

-- Сессионная advisory lock (нужно снимать явно)
SELECT pg_advisory_lock(42);
-- ... критическая секция ...
SELECT pg_advisory_unlock(42);
```

В Go advisory locks удобно использовать для межсервисной синхронизации:

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

## Оптимистичные vs пессимистичные блокировки

**Пессимистичная блокировка** (`SELECT FOR UPDATE`) предполагает, что конфликт произойдёт, и захватывает блокировку заранее. Простая, надёжная, но снижает параллелизм.

**Оптимистичная блокировка** предполагает, что конфликты редки. Строка не блокируется при чтении; при обновлении проверяется, не изменилась ли она.

Реализация через `version` столбец:

```sql
-- Схема
ALTER TABLE products ADD COLUMN version INT DEFAULT 0;

-- Обновление с проверкой версии
UPDATE products
SET    name = $1, version = version + 1
WHERE  id = $2 AND version = $3;
-- Если affected rows = 0 → кто-то изменил строку → конфликт
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
        return ErrConflict // другая транзакция изменила строку
    }
    return nil
}
```

Оптимистичная блокировка подходит, когда конфликты редки (низкая конкурентность записи). При высокой конкурентности пессимистичная блокировка эффективнее — меньше повторных попыток.
