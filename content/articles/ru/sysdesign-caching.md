---
title: Кэширование
blockId: sysdesign-caching
parentBlockId: sysdesign
---

# Кэширование

Кэширование — практика хранения результата дорогостоящего вычисления или I/O-операции в более быстром хранилище, чтобы последующие запросы обслуживались без повторного выполнения работы. Это наиболее весомая оптимизация производительности в большинстве распределённых систем — правильно размещённый кэш может снизить среднюю задержку чтения на два порядка и сократить нагрузку на базу данных на 90% и более.

Понимание стратегий кэширования, техник инвалидации и сценариев сбоев необходимо как для системных интервью, так и для продакшн-разработки.

## Почему кэширование важно

Типичный стек без кэширования:
- Сетевой round-trip: ~1 мс (один дата-центр)
- Индексное сканирование PostgreSQL: ~5–50 мс
- Полное сканирование таблицы PostgreSQL: ~50–5000 мс

С Redis в front:
- Redis GET: ~0,1–0,3 мс
- Cache hit rate 95%: средняя задержка ≈ 0,95 × 0,2 мс + 0,05 × 20 мс = 1,19 мс

Цена кэширования — сложность: теперь есть два источника истины, которые нужно синхронизировать.

## Стратегии кэширования

### Cache-Aside (Ленивая загрузка)

Приложение управляет кэшем явно. При промахе кэша приложение читает из базы данных, записывает в кэш и возвращает результат.

```go
func (s *UserService) GetUser(ctx context.Context, id int64) (*User, error) {
    key := fmt.Sprintf("user:%d", id)

    // 1. Сначала проверяем кэш
    cached, err := s.redis.Get(ctx, key).Bytes()
    if err == nil {
        var u User
        if err := json.Unmarshal(cached, &u); err == nil {
            return &u, nil
        }
    }

    // 2. Промах кэша — читаем из базы данных
    user, err := s.db.GetUser(ctx, id)
    if err != nil {
        return nil, err
    }

    // 3. Заполняем кэш для будущих запросов
    data, _ := json.Marshal(user)
    s.redis.Set(ctx, key, data, 5*time.Minute)

    return user, nil
}
```

**Преимущества:**
- Кэшируются только запрошенные данные — нет бесполезной траты памяти.
- Сбои кэша не критичны: система прозрачно откатывается к базе данных.
- Схема кэша может отличаться от схемы базы данных (проекции, агрегации).

**Недостатки:**
- Первый запрос после промаха кэша (или холодного старта) медленный.
- Окно несоответствия кэша и базы данных: если другой процесс обновил базу, кэш хранит устаревшие данные до истечения TTL.
- Три сетевых вызова при промахе: чтение кэша → чтение БД → запись в кэш.

Cache-aside — наиболее распространённый паттерн и правильный выбор по умолчанию для рабочих нагрузок с преобладанием чтения.

### Write-Through

Каждая запись в базу данных синхронно дублируется в кэш. Кэш всегда актуален.

```go
func (s *UserService) UpdateUser(ctx context.Context, u *User) error {
    // 1. Запись в базу данных
    if err := s.db.UpdateUser(ctx, u); err != nil {
        return err
    }

    // 2. Синхронное обновление кэша
    key := fmt.Sprintf("user:%d", u.ID)
    data, _ := json.Marshal(u)
    return s.redis.Set(ctx, key, data, 5*time.Minute).Err()
}
```

**Преимущества:**
- Кэш всегда консистентен с базой данных сразу после записи.
- При чтении никогда не видим устаревшие данные.

**Недостатки:**
- Задержка записи удваивается: вызывающий ждёт и записи в БД, и записи в кэш.
- Кэш заполняется даже данными, которые никогда не читаются — бесполезные записи.
- Если запись в кэш не удалась после успешной записи в БД, возникает несоответствие. Обрабатывайте повтором или принимайте краткое окно несоответствия.

Write-through подходит, когда чтения частые, записи редкие, а SLA по задержке чтения жёсткий.

### Write-Behind (Write-Back)

Приложение пишет сначала в кэш; кэш асинхронно сбрасывает данные в базу данных. Запись возвращается, как только кэш её подтвердил.

**Преимущества:**
- Минимальная задержка записи — только round-trip до кэша.
- Батчинг нескольких записей одного ключа — снижает write amplification в базе данных.

**Недостатки:**
- **Риск потери данных:** если узел кэша упадёт до сброса, данные теряются.
- Сложно реализовать корректно (подтверждение, повторы, гарантии порядка).
- Как правило, не подходит для финансовых или пользовательских данных, где требуется долговечность.

Write-behind применяется в pipeline'ах приёма временных рядов и аналитических буферах, где допустима небольшая потеря данных.

### Read-Through

Аналогично cache-aside, но сам слой кэша обрабатывает обращение к базе при промахе. Приложение всегда работает с кэшем, никогда напрямую с базой.

Это модель многих управляемых CDN-кэшей и некоторых модулей Redis. В коде приложения выглядит идентично cache-aside с точки зрения вызывающего.

## Redis в Go

Redis — доминирующий внешний кэш для Go-сервисов. Стандартный Go-клиент: `go-redis/redis`.

```go
import "github.com/redis/go-redis/v9"

opts := new(redis.Options) // Go 1.26: new(T) возвращает *T, удобно для конфигов с полями-указателями
opts.Addr = "localhost:6379"
opts.PoolSize = 10             // пул соединений
opts.MinIdleConns = 2
opts.DialTimeout = 5 * time.Second
opts.ReadTimeout = 3 * time.Second
opts.WriteTimeout = 3 * time.Second
rdb := redis.NewClient(opts)

// Атомарный инкремент — безопасен при конкурентном доступе
count, err := rdb.Incr(ctx, "page:views").Result()

// Pipelining — батч нескольких команд за один round-trip
pipe := rdb.Pipeline()
pipe.Set(ctx, "key1", "val1", time.Minute)
pipe.Set(ctx, "key2", "val2", time.Minute)
_, err = pipe.Exec(ctx)

// Lua-скрипт — атомарный check-and-set
script := redis.NewScript(`
    local current = redis.call("GET", KEYS[1])
    if current == ARGV[1] then
        return redis.call("SET", KEYS[1], ARGV[2])
    end
    return 0
`)
result, err := script.Run(ctx, rdb, []string{"mykey"}, "old_value", "new_value").Int()
```

### Структуры данных Redis для кэширования

| Структура | Применение |
|---|---|
| String | Кэш одного значения, счётчики, feature flags |
| Hash | Поля объекта (избегает накладных расходов сериализации при частичном чтении) |
| Sorted Set | Таблицы лидеров, rate limiting со скользящим окном |
| List | Последние элементы, очереди задач |
| HyperLogLog | Приближённый подсчёт уникальных посетителей |
| Bloom Filter | Вероятностная проверка существования в кэше (через модуль RedisBloom) |

## Кэширование в памяти в Go

Для кэшей, живущих внутри одного процесса (L1-кэш), Go предоставляет несколько вариантов.

### sync.Map

`sync.Map` — конкурентно-безопасная карта, оптимизированная для рабочих нагрузок с преобладанием чтения (много горутин читают, редкие записи). Использует оптимизированный для чтения быстрый путь с атомарным доступом и медленный путь с мьютексом для записи.

```go
var cache sync.Map

// Сохранение
cache.Store("user:1", &User{ID: 1, Name: "Алиса"})

// Загрузка
if val, ok := cache.Load("user:1"); ok {
    user := val.(*User)
    fmt.Println(user.Name)
}

// LoadOrStore — атомарный get-or-set
actual, loaded := cache.LoadOrStore("user:1", newUser)
if loaded {
    // 'actual' — существующее значение
}

// Range — итерация по всем записям
cache.Range(func(key, value any) bool {
    fmt.Printf("%v → %v\n", key, value)
    return true // продолжить итерацию
})
```

**Ограничение:** `sync.Map` не имеет TTL, вытеснения и ограничения размера. Для продакшн-использования оберните с логикой истечения или используйте специализированную библиотеку.

### LRU-кэш

LRU (Least Recently Used) кэш вытесняет наименее недавно обращавшуюся запись при заполнении. Это наиболее распространённая политика вытеснения для in-memory кэшей.

```go
import "container/list"

type LRU[K comparable, V any] struct {
    mu       sync.Mutex
    capacity int
    list     *list.List
    items    map[K]*list.Element
}

type entry[K comparable, V any] struct {
    key   K
    value V
}

func NewLRU[K comparable, V any](capacity int) *LRU[K, V] {
    return &LRU[K, V]{
        capacity: capacity,
        list:     list.New(),
        items:    make(map[K]*list.Element, capacity),
    }
}

func (c *LRU[K, V]) Get(key K) (V, bool) {
    c.mu.Lock()
    defer c.mu.Unlock()

    if elem, ok := c.items[key]; ok {
        c.list.MoveToFront(elem)
        return elem.Value.(*entry[K, V]).value, true
    }
    var zero V
    return zero, false
}

func (c *LRU[K, V]) Put(key K, value V) {
    c.mu.Lock()
    defer c.mu.Unlock()

    if elem, ok := c.items[key]; ok {
        c.list.MoveToFront(elem)
        elem.Value.(*entry[K, V]).value = value
        return
    }

    if c.list.Len() >= c.capacity {
        // Вытесняем наименее недавно использованный
        back := c.list.Back()
        if back != nil {
            c.list.Remove(back)
            delete(c.items, back.Value.(*entry[K, V]).key)
        }
    }

    e := &entry[K, V]{key: key, value: value}
    elem := c.list.PushFront(e)
    c.items[key] = elem
}
```

Для продакшн-использования рекомендуется пакет `github.com/hashicorp/golang-lru/v2`, предоставляющий LRU и ARC кэши на дженериках с поддержкой TTL.

## TTL и инвалидация кэша

**TTL (Time To Live)** — простейшая стратегия инвалидации кэша: каждая запись кэша истекает через фиксированный интервал. Самовосстанавливающаяся: даже если забыть инвалидировать ключ, он в конечном счёте истечёт.

```go
// Установка с TTL
rdb.Set(ctx, "user:42", userData, 5*time.Minute)

// Продление TTL при обращении (скользящий TTL)
func (s *Cache) Get(ctx context.Context, key string) ([]byte, error) {
    pipe := s.rdb.Pipeline()
    get := pipe.Get(ctx, key)
    pipe.Expire(ctx, key, s.slidingTTL)
    pipe.Exec(ctx)
    return get.Bytes()
}
```

**Стратегии инвалидации кэша:**

1. **TTL-истечение** — простейший вариант, но окно устаревания = длительность TTL.
2. **Write-invalidate** — при записи немедленно удалять ключ кэша: `rdb.Del(ctx, key)`. Следующее чтение его перезаполнит.
3. **Событийная инвалидация** — публиковать событие «данные изменились» в шину сообщений; узлы кэша подписываются и вытесняют соответствующие ключи.
4. **Теги кэша** — ассоциировать записи кэша с логическими тегами (например, `user:42` тегировать как `user`). Инвалидация тега инвалидирует все связанные записи.

Знаменитое наблюдение Фила Карлтона: «В информатике есть только две трудные вещи: инвалидация кэша и именование переменных». На практике используйте TTL по умолчанию, а явную инвалидацию добавляйте только для данных, критически важных для актуальности.

## Thundering Herd и Cache Stampede

### Thundering Herd

Когда популярный ключ кэша истекает, все конкурентные запросы, обнаружившие промах кэша, одновременно отправляют запросы к базе данных. Если ключ обрабатывал 1000 запросов/секунду, все 1000 одновременно бьют в базу.

**Решение: вероятностное раннее обновление.**

Вместо истечения ключа ровно в момент TTL, начинать обновление чуть раньше с вероятностью, растущей по мере приближения к истечению:

```go
// Алгоритм XFetch (оптимальное раннее перевычисление)
func (s *Cache) GetWithEarlyRefresh(ctx context.Context, key string, ttl time.Duration, fetch func() ([]byte, error)) ([]byte, error) {
    // ... упрощённо: если оставшийся TTL < delta * beta * log(rand), обновляем заранее
    val, err := s.rdb.Get(ctx, key).Bytes()
    if err != nil || shouldRefreshEarly(val, ttl) {
        fresh, err := fetch()
        if err != nil {
            return val, nil // отдаём устаревшее при ошибке получения
        }
        s.rdb.Set(ctx, key, fresh, ttl)
        return fresh, nil
    }
    return val, nil
}
```

### Cache Stampede

Похоже на thundering herd, но вызвано перезапуском узла кэша или очисткой кэша при деплое. Все ключи становятся холодными одновременно.

**Решения:**

**1. Мьютекс/singleflight:** только одна горутина получает данные из базы; остальные ждут результата.

```go
import "golang.org/x/sync/singleflight"

var group singleflight.Group

func (s *Cache) GetUser(ctx context.Context, id int64) (*User, error) {
    key := fmt.Sprintf("user:%d", id)

    // Все конкурентные вызовы для одного ключа разделяют один запрос к БД
    v, err, _ := group.Do(key, func() (any, error) {
        cached, err := s.rdb.Get(ctx, key).Bytes()
        if err == nil {
            var u User
            json.Unmarshal(cached, &u)
            return &u, nil
        }

        user, err := s.db.GetUser(ctx, id)
        if err != nil {
            return nil, err
        }

        data, _ := json.Marshal(user)
        s.rdb.Set(ctx, key, data, 5*time.Minute)
        return user, nil
    })

    if err != nil {
        return nil, err
    }
    return v.(*User), nil
}
```

**2. Прогрев кэша:** перед деплоем предзаполнять кэш часто запрашиваемыми ключами через фоновое задание.

**3. Разброс TTL:** добавлять небольшое случайное смещение к значениям TTL, чтобы ключи истекали в разное время, а не все сразу.

```go
jitter := time.Duration(rand.Int63n(int64(30 * time.Second)))
s.rdb.Set(ctx, key, data, 5*time.Minute+jitter)
```

## Вопросы для самопроверки

1. **Сервис с преобладанием чтения использует cache-aside с TTL 10 минут. Пользователь обновляет профиль, но другие видят старую версию до 10 минут. Как это исправить без уменьшения TTL?**
   *При обновлении профиля явно вызывать `DEL` для ключа кэша. Следующее чтение его перезаполнит.*

2. **В чём разница между thundering herd и cache stampede? Приведите конкретный сценарий для каждого.**
   *Thundering herd: один популярный ключ истекает при высокой нагрузке → все конкурентные читатели одновременно обращаются к БД. Cache stampede: новый деплой перезапускает или очищает Redis → все ключи холодные одновременно.*

3. **Почему `sync.Map` не подходит в качестве продакшн LRU-кэша?**
   *У него нет ограничения размера, нет TTL и нет политики вытеснения — он растёт без ограничений.*

4. **Объясните singleflight. Чем отличается от мьютекса?**
   *Singleflight дедуплицирует конкурентные вызовы с одним ключом в один: первый вызывающий выполняет функцию, остальные ждут и получают тот же результат. Мьютекс просто сериализует доступ без дедупликации — все вызывающие всё равно выполняют функцию последовательно.*
