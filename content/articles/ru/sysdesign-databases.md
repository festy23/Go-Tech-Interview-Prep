---
title: Базы данных
blockId: sysdesign-databases
parentBlockId: sysdesign
---

# Базы данных

Выбор базы данных — одно из наиболее значимых архитектурных решений. Оно определяет модель консистентности, паттерны запросов, операционную сложность и то, насколько болезненными будут миграции через три года. Эта статья охватывает компромисс SQL vs NoSQL, позиционирование PostgreSQL, MongoDB и Redis, стратегии репликации и партиционирования, connection pooling в Go и управление миграциями.

## SQL vs NoSQL

### SQL (реляционные базы данных)

Реляционные базы данных организуют данные в таблицы со строками и столбцами. Они применяют схему, поддерживают операции JOIN и предоставляют ACID-гарантии транзакций.

**ACID:**
- **Atomicity (Атомарность):** транзакция выполняется целиком или не выполняется вовсе.
- **Consistency (Согласованность):** транзакция переводит базу из одного корректного состояния в другое.
- **Isolation (Изоляция):** конкурентные транзакции выглядят выполняющимися последовательно.
- **Durability (Долговечность):** зафиксированные транзакции переживают сбои.

**Лучше всего подходит для:**
- Структурированных данных с чёткими связями (пользователи, заказы, товары).
- Нагрузок, требующих многострочных или многотабличных транзакций.
- Сложных запросов с JOIN, агрегациями и фильтрацией.
- Систем, где ограничения целостности данных являются бизнес-требованиями (внешние ключи, уникальные ограничения, CHECK-ограничения).

**Популярный выбор в Go:** PostgreSQL (по умолчанию), MySQL, CockroachDB (распределённый SQL), SQLite (встроенный/для тестирования).

### NoSQL (нереляционные базы данных)

NoSQL — зонтичный термин для баз данных, не использующих реляционную модель. Они торгуют частью SQL-гарантий ради гибкости, горизонтальной масштабируемости или специализированной производительности.

**Категории:**

| Тип | Примеры | Сильные стороны |
|---|---|---|
| Документные | MongoDB, CouchDB | Гибкая схема, вложенные данные, быстрые операции с одним документом |
| Ключ-значение | Redis, DynamoDB | Субмиллисекундный доступ, простая модель данных |
| Широкие столбцы | Cassandra, BigTable | Write-heavy, временные ряды, массовый масштаб |
| Графовые | Neo4j, Amazon Neptune | Запросы с тяжёлыми связями (социальные графы, рекомендации) |
| Временные ряды | InfluxDB, TimescaleDB | Часто меняющиеся данные с метками времени (метрики, телеметрия) |

**Когда выбирать NoSQL:**
- Схема часто меняется или неизвестна заранее (документное хранилище).
- Горизонтальная масштабируемость — жёсткое требование с первого дня (Cassandra, DynamoDB).
- Паттерн доступа — всегда по первичному ключу или вторичному индексу, никогда по произвольным запросам (ключ-значение).
- Строится функциональность с тяжёлым обходом графа (граф БД).

**Совет по умолчанию:** начинайте с PostgreSQL. Он поддерживает JSON-столбцы (`jsonb`), полнотекстовый поиск и массивы — давая значительную NoSQL-подобную гибкость внутри реляционной модели. Добавляйте специализированные базы данных только тогда, когда PostgreSQL явно недостаточен для конкретной нагрузки.

## PostgreSQL в Go

Каноническая Go-библиотека для PostgreSQL — `jackc/pgx` (v5), которая быстрее и богаче функциями, чем устаревший `lib/pq`.

```go
import (
    "github.com/jackc/pgx/v5/pgxpool"
)

// Пул соединений — разделяется по всему приложению
pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
if err != nil {
    log.Fatal(err)
}
defer pool.Close()

// Настроенный пул
config, _ := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
config.MaxConns = 20
config.MinConns = 2
config.MaxConnLifetime = 30 * time.Minute
config.MaxConnIdleTime = 5 * time.Minute
pool, _ = pgxpool.NewWithConfig(ctx, config)

// Запрос с автоматическим сканированием
rows, err := pool.Query(ctx, "SELECT id, email FROM users WHERE active = $1", true)
users, err := pgx.CollectRows(rows, pgx.RowToStructByName[User])

// Транзакция
tx, err := pool.Begin(ctx)
if err != nil {
    return err
}
defer tx.Rollback(ctx) // no-op после Commit

_, err = tx.Exec(ctx, "UPDATE accounts SET balance = balance - $1 WHERE id = $2", amount, fromID)
if err != nil {
    return err
}
_, err = tx.Exec(ctx, "UPDATE accounts SET balance = balance + $1 WHERE id = $2", amount, toID)
if err != nil {
    return err
}
return tx.Commit(ctx)
```

Для приложений со сложным SQL и требованиями типобезопасности используйте `sqlc` — он генерирует типобезопасный Go-код из SQL-запросов во время сборки:

```sql
-- query.sql
-- name: GetUser :one
SELECT id, email, created_at FROM users WHERE id = $1;
```

```go
// Сгенерировано sqlc — полностью типобезопасно
user, err := queries.GetUser(ctx, userID)
```

## MongoDB в Go

MongoDB хранит документы (BSON, по сути JSON с типами) в коллекциях. Официальный Go-драйвер: `go.mongodb.org/mongo-driver/v2`.

```go
import (
    "go.mongodb.org/mongo-driver/v2/bson"
    "go.mongodb.org/mongo-driver/v2/mongo"
    "go.mongodb.org/mongo-driver/v2/mongo/options"
)

client, err := mongo.Connect(options.Client().ApplyURI(os.Getenv("MONGODB_URI")))
defer client.Disconnect(ctx)

coll := client.Database("mydb").Collection("users")

// Вставка
result, err := coll.InsertOne(ctx, bson.D{
    {Key: "email", Value: "alice@example.com"},
    {Key: "active", Value: true},
})

// Поиск с фильтром
var user User
err = coll.FindOne(ctx, bson.D{{Key: "_id", Value: userID}}).Decode(&user)

// Aggregation pipeline
pipeline := mongo.Pipeline{
    {{Key: "$match", Value: bson.D{{Key: "active", Value: true}}}},
    {{Key: "$group", Value: bson.D{
        {Key: "_id", Value: "$country"},
        {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}},
    }}},
    {{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}}}},
}
cursor, err := coll.Aggregate(ctx, pipeline)
```

**Сильные стороны MongoDB на практике:**
- Документы напрямую соответствуют объектам приложения — нет impedance mismatch с ORM.
- Гибкая схема: добавление новых полей без миграций.
- Встроенные массивы и вложенные документы для связей 1:N без JOIN.
- Горизонтальное шардирование встроено в ядро (с первой версии).

**Слабые стороны MongoDB:**
- Многодокументные транзакции поддерживаются (с v4.0), но дороги.
- Нет ограничений внешних ключей — ссылочная целостность ответственность приложения.
- Aggregation pipeline многословен по сравнению с SQL.

## Redis как база данных

Redis чаще всего используется как кэш, но для конкретных нагрузок также является полноценной первичной базой данных:

- **Хранение сессий:** низкая задержка чтения, встроенный TTL на каждый ключ.
- **Rate limiting:** атомарный `INCR` + `EXPIRE` за временное окно.
- **Таблицы лидеров:** sorted sets с операциями ранга O(log N).
- **Реал-тайм счётчики и статистика:** атомарные операции инкремента.
- **Pub/sub обмен сообщениями:** лёгкий fanout без персистентных потребителей.

Для долговечности Redis поддерживает **RDB-снимки** (дамп в момент времени) и **AOF (Append-Only File)** логирование. С `appendfsync always` Redis долговечен до гранулярности одной команды, ценой пропускной способности.

```go
// Rate limiting через Redis
func (s *Service) CheckRateLimit(ctx context.Context, userID string) (bool, error) {
    key := fmt.Sprintf("ratelimit:%s:%d", userID, time.Now().Unix()/60)
    
    pipe := s.rdb.Pipeline()
    incr := pipe.Incr(ctx, key)
    pipe.Expire(ctx, key, time.Minute)
    _, err := pipe.Exec(ctx)
    if err != nil {
        return false, err
    }
    
    return incr.Val() <= 100, nil // 100 запросов в минуту
}
```

## Репликация

Репликация копирует данные с первичного (write) узла на один или несколько реплик-узлов (read).

**Цели:**
- **Высокая доступность:** при отказе primary реплика повышается.
- **Масштабирование чтения:** маршрутизировать read-запросы на реплики, снижая нагрузку на primary.
- **Аварийное восстановление:** реплики в разных зонах доступности или регионах.

### Синхронная vs асинхронная репликация

| Режим | Поведение | Компромисс |
|---|---|---|
| Синхронная | Primary ждёт подтверждения минимум от одной реплики | Нулевая потеря данных, больше задержки записи |
| Асинхронная | Primary возвращается, как только записал локально | Меньше задержки записи, задержка репликации = потенциальная потеря данных |

PostgreSQL использует синхронную репликацию с `synchronous_commit = on` (можно устанавливать на уровне транзакции). Большинство деплоев использует асинхронную репликацию с ручным переключением через Patroni или аналоги.

### Read Replicas в Go

```go
// Отдельное соединение read replica для SELECT-запросов
type DB struct {
    primary *pgxpool.Pool
    replica *pgxpool.Pool
}

func (db *DB) QueryUser(ctx context.Context, id int64) (*User, error) {
    // Чтение с реплики — могут быть слегка устаревшие данные
    rows, err := db.replica.Query(ctx, "SELECT * FROM users WHERE id = $1", id)
    // ...
}

func (db *DB) CreateUser(ctx context.Context, u *User) error {
    // Запись на primary
    _, err := db.primary.Exec(ctx, "INSERT INTO users ...")
    return err
}
```

**Предупреждение:** после записи всегда читайте с primary данные, которые нужны сразу после записи. Чтение с реплики сразу после записи может вернуть устаревшие данные.

## Партиционирование

Партиционирование базы данных (также «табличное партиционирование») разбивает большую таблицу на меньшие физические части по ключу партиционирования, представляя приложению единую логическую таблицу.

**Горизонтальное партиционирование (шардирование):** строки распределяются по нескольким базам данных. Подробности в статье о масштабируемости.

**Табличное партиционирование PostgreSQL** (одна машина, несколько файлов таблицы):

```sql
-- Партиционирование по диапазону дат
CREATE TABLE events (
    id          BIGINT,
    created_at  TIMESTAMPTZ NOT NULL,
    payload     JSONB
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2025 PARTITION OF events
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE events_2026 PARTITION OF events
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- PostgreSQL автоматически маршрутизирует вставки и обрезает партиции в запросах
SELECT * FROM events WHERE created_at >= '2026-01-01'; -- сканирует только events_2026
```

Преимущества: более быстрые запросы (обрезка партиций), более простое массовое удаление старых данных, параллельные запросы по партициям.

## Connection Pooling в Go

Соединения с базой данных дорогостоящие: каждое удерживает сокет, серверную память и (для PostgreSQL) фоновый процесс. Go-сервис со 100 горутинами не должен одновременно открывать 100 соединений к базе данных — это перегрузит её.

### pgxpool

`pgxpool` управляет пулом соединений внутри. Настраивайте исходя из значения `max_connections` в PostgreSQL и количества экземпляров приложения.

```go
config, _ := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))

// Эвристика размера: max_connections в PostgreSQL / количество экземпляров приложения
// например, postgres max_connections=100, 5 экземпляров → MaxConns = 20
config.MaxConns = 20
config.MinConns = 2                    // держать тёплые соединения
config.MaxConnLifetime = 30 * time.Minute
config.MaxConnIdleTime = 5 * time.Minute
config.HealthCheckPeriod = time.Minute

// BeforeAcquire хук — полезен для установки параметров сессии
config.BeforeAcquire = func(ctx context.Context, conn *pgx.Conn) bool {
    // Вернуть false, чтобы отбросить соединение
    return true
}

pool, err := pgxpool.NewWithConfig(ctx, config)
```

### PgBouncer

Для приложений с очень большим количеством короткоживущих соединений (serverless, много реплик) используйте **PgBouncer** как connection pooler перед PostgreSQL. PgBouncer поддерживает небольшое количество реальных PostgreSQL-соединений и мультиплексирует сотни соединений приложения на них.

Режимы:
- **Session pooling:** одно PostgreSQL-соединение на клиентскую сессию (по умолчанию).
- **Transaction pooling:** одно PostgreSQL-соединение на транзакцию — максимальная эффективность, но несовместимо с prepared statements и некоторыми функциями PostgreSQL.

## Стратегия миграций

### Принципы

1. **Каждое изменение схемы — миграция** — версионированная, протестированная, применяемая в известном порядке.
2. **Миграции должны быть обратно совместимы** во время деплоя. При rolling deployment старый и новый код приложения работают одновременно с одной базой данных.
3. **Разделяйте деплой и изменение схемы** для деструктивных операций (удаление столбцов, переименование таблиц).

### Паттерн Expand-Contract

Для миграций без простоя:

1. **Expand (расширение):** добавить новый столбец/таблицу рядом со старым. Старый код игнорирует его.
2. **Деплой нового кода**, который пишет в оба — старый и новый, читает из старого.
3. **Backfill** существующих строк для заполнения нового столбца.
4. **Деплой снова:** читать из нового столбца, писать только в новый.
5. **Contract (сжатие):** удалить старый столбец/таблицу отдельной миграцией.

### Инструменты миграций в Go

**golang-migrate** — наиболее распространённый инструмент миграций в Go:

```bash
migrate -path ./migrations -database "$DATABASE_URL" up
migrate -path ./migrations -database "$DATABASE_URL" down 1
```

```go
// Встроенные миграции
import "github.com/golang-migrate/migrate/v4"
import _ "github.com/golang-migrate/migrate/v4/source/iofs"

//go:embed migrations/*.sql
var migrationsFS embed.FS

func runMigrations(dbURL string) error {
    sourceDriver, err := iofs.New(migrationsFS, "migrations")
    if err != nil {
        return err
    }
    m, err := migrate.NewWithSourceInstance("iofs", sourceDriver, dbURL)
    if err != nil {
        return err
    }
    return m.Up()
}
```

Файлы миграций следуют соглашению `{версия}_{описание}.{up|down}.sql`:
```
migrations/
  001_create_users.up.sql
  001_create_users.down.sql
  002_add_email_index.up.sql
  002_add_email_index.down.sql
```

**Atlas** (`ariga.io/atlas`) — более современная альтернатива, которая умеет генерировать миграции из определений Go-структур и проверяет обратную совместимость миграций.

## Вопросы для самопроверки

1. **Нужно хранить профили пользователей, которые часто получают новые опциональные поля. Что выбрать — PostgreSQL или MongoDB и почему?**
   *Оба варианта работают, но PostgreSQL-столбец `jsonb` позволяет хранить гибкие данные рядом со структурированными полями, сохраняя ACID и возможности SQL-запросов. Используйте MongoDB, если весь документ без схемы и никогда не нужны реляционные ограничения.*

2. **У вашего PostgreSQL primary есть асинхронные реплики. Вы обновляете email пользователя и сразу перенаправляете его на страницу профиля, которая читает с реплики. Пользователь видит старый email. Какой паттерн предотвращает это?**
   *Read-your-writes: маршрутизировать чтение сразу после записи на primary, или использовать токен репликации, которого реплика должна достичь перед ответом на чтение.*

3. **В чём разница между репликацией и партиционированием базы данных?**
   *Репликация создаёт копии одних данных на нескольких узлах (для HA и масштабирования чтения). Партиционирование разделяет данные по узлам или файлам таблицы, так что каждый шард хранит отдельное подмножество (для масштабирования записи и обрезки запросов).*

4. **Почему MaxConns пула соединений должен зависеть от количества экземпляров приложения?**
   *Каждый экземпляр открывает до MaxConns соединений. При 10 экземплярах с MaxConns=50 потенциально открывается 500 соединений к PostgreSQL, что может превысить его `max_connections` и привести к отказу в соединении.*
