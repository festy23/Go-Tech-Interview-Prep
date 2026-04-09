---
title: Паттерны микросервисов
blockId: sysdesign-microservices
parentBlockId: sysdesign
---

# Паттерны микросервисов

Микросервисная архитектура декомпозирует систему на небольшие, независимо деплоируемые сервисы, взаимодействующие по сети. Преимущества реальны — независимое масштабирование, независимый деплой, автономность команд, технологическая гетерогенность — но и стоимость существенна: внутрипроцессные вызовы функций заменяются сетевыми, а с ними приходят задержки, частичные сбои и сложность распределённых систем.

Эта статья охватывает паттерны, которые должен знать каждый Go-инженер, работающий с микросервисами: API Gateway, Circuit Breaker, Retry с backoff, Saga, 2PC, обнаружение сервисов, распределённая трассировка с OpenTelemetry и проверки работоспособности.

## API Gateway

API Gateway — единая точка входа для всего клиентского трафика. Он стоит перед вашими микросервисами и обрабатывает сквозные задачи: аутентификацию, ограничение скорости, маршрутизацию запросов, завершение TLS и агрегацию ответов.

```
                    ┌──── API Gateway ────┐
Клиент ──────────►  │  auth, rate limit   │ ──► Сервис пользователей
                   │  routing, tracing   │ ──► Сервис заказов
                   └─────────────────────┘ ──► Сервис товаров
```

**Обязанности:**
- **Аутентификация/Авторизация:** проверка JWT или сессионных токенов до маршрутизации. Только один сервис должен реализовывать эту логику.
- **Rate limiting:** защита бэкенд-сервисов от пиков трафика.
- **Маршрутизация запросов:** `/users/*` → сервис пользователей, `/orders/*` → сервис заказов.
- **Трансляция протоколов:** HTTP/1.1 от клиентов → gRPC для внутренних сервисов.
- **Агрегация ответов (BFF — Backend for Frontend):** объединение ответов нескольких сервисов в один ответ клиенту.

В Go популярные реализации API Gateway:
- **Kong** или **NGINX** — автономный шлюз с плагинами.
- **go-chi + цепочка middleware** — лёгкий внутрипроцессный шлюз для небольших деплоев.
- **Envoy / Istio** — полный service mesh со шлюзом.

Простая внутрипроцессная цепочка middleware в Go:

```go
func main() {
    r := chi.NewRouter()

    r.Use(middleware.RequestID)
    r.Use(otelhttp.NewMiddleware("api-gateway")) // распределённая трассировка
    r.Use(authMiddleware)
    r.Use(rateLimitMiddleware(100)) // 100 запросов/с на IP

    // Проксирование маршрутов на бэкенд-сервисы
    r.Mount("/users", reverseProxy(os.Getenv("USER_SERVICE_URL")))
    r.Mount("/orders", reverseProxy(os.Getenv("ORDER_SERVICE_URL")))

    http.ListenAndServe(":8080", r)
}

func reverseProxy(target string) http.Handler {
    url, _ := url.Parse(target)
    return httputil.NewSingleHostReverseProxy(url)
}
```

## Circuit Breaker

Когда сервис A вызывает сервис B, а B медленный или недоступный, горутины A накапливаются в ожидании. В итоге пул соединений A, количество горутин или память исчерпываются — A тоже становится недоступным. Это **каскадный сбой**.

Паттерн Circuit Breaker предотвращает каскадные сбои. Он мониторит вызовы downstream-сервиса и при превышении порога сбоев «открывает» цепь — последующие вызовы мгновенно завершаются ошибкой (не обращаясь к downstream-сервису) до сброса цепи.

**Состояния:**
- **Closed (Закрыт):** нормальная работа; запросы проходят.
- **Open (Открыт):** порог сбоев превышен; все запросы мгновенно завершаются ошибкой.
- **Half-Open (Полуоткрыт):** по истечении таймаута разрешается один пробный запрос. При успехе — переход в Closed; при сбое — возврат в Open.

```go
import "github.com/sony/gobreaker/v2"

cb := gobreaker.NewCircuitBreaker[*http.Response](gobreaker.Settings{
    Name:        "inventory-service",
    MaxRequests: 1,    // максимум запросов в half-open состоянии
    Interval:    60 * time.Second, // скользящее окно подсчёта сбоев
    Timeout:     30 * time.Second, // время в open-состоянии до half-open
    ReadyToTrip: func(counts gobreaker.Counts) bool {
        failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
        return counts.Requests >= 3 && failureRatio >= 0.6
    },
    OnStateChange: func(name string, from, to gobreaker.State) {
        log.Printf("circuit %s: %s → %s", name, from, to)
    },
})

func getInventory(ctx context.Context, productID string) (*Inventory, error) {
    resp, err := cb.Execute(func() (*http.Response, error) {
        return http.Get(fmt.Sprintf("%s/inventory/%s",
            os.Getenv("INVENTORY_URL"), productID))
    })
    if err != nil {
        if errors.Is(err, gobreaker.ErrOpenState) {
            // Быстрый сбой — вернуть кэшированное значение или значение по умолчанию
            return defaultInventory(), nil
        }
        return nil, err
    }
    defer resp.Body.Close()
    // ...
}
```

## Retry с Backoff

Временные сбои распространены в распределённых системах: сервис перезапускается, сетевая проблема длится 100 мс, запрос к базе данных таймаутит. Повтор запроса решает большинство временных сбоев.

Наивный retry: немедленно повторить при сбое. Это может усугубить проблемы — если много клиентов одновременно повторяют попытки, восстанавливающийся сервис снова перегружается.

**Экспоненциальный backoff** геометрически увеличивает задержку между попытками: ждать 1 с, затем 2 с, затем 4 с, затем 8 с. Это даёт downstream-сервису время на восстановление и снижает нагрузку.

**Jitter** добавляет случайность к backoff, чтобы все клиенты не повторяли попытки одновременно (проблема «thundering herd» на уровне повторов):

```go
func retryWithBackoff(ctx context.Context, maxRetries int, fn func() error) error {
    baseDelay := 100 * time.Millisecond
    maxDelay := 30 * time.Second

    for attempt := range maxRetries {
        if err := fn(); err == nil {
            return nil
        } else if !isRetryable(err) {
            return err // постоянная ошибка — не повторять
        }

        // Full jitter: случайная задержка в [0, min(base*2^attempt, maxDelay)]
        cap := min(float64(baseDelay)*math.Pow(2, float64(attempt)), float64(maxDelay))
        sleep := time.Duration(rand.Float64() * cap)

        select {
        case <-time.After(sleep):
        case <-ctx.Done():
            return ctx.Err()
        }
    }
    return fmt.Errorf("превышено максимальное число попыток (%d)", maxRetries)
}

func isRetryable(err error) bool {
    var httpErr *HTTPError
    if errors.As(err, &httpErr) {
        // Повторять на 5xx и 429 (rate limited), не на 4xx (ошибки клиента)
        return httpErr.StatusCode >= 500 || httpErr.StatusCode == 429
    }
    return true // по умолчанию повторять сетевые ошибки
}
```

**Важно:** повторять только **идемпотентные** операции. Повтор `POST /orders` может создать дублирующиеся заказы. Используйте ключи идемпотентности:

```go
req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, body)
req.Header.Set("Idempotency-Key", requestID) // сервер дедуплицирует по этому ключу
```

## Паттерн Saga

Saga — ответ распределённых систем на долгоживущие многошаговые транзакции, охватывающие несколько сервисов.

**Проблема:** сервис A списывает счёт, сервис B отправляет товар, сервис C обновляет баллы лояльности. Если сервис C упадёт, как откатить то, что уже сделали A и B?

Двухфазная фиксация (2PC) — классический ответ, но она требует блокировки ресурсов всеми участниками на время транзакции — это медленно и ненадёжно в микросервисах с гетерогенными базами данных.

Saga разбивает распределённую транзакцию на последовательность локальных транзакций, каждая из которых публикует событие. При сбое компенсирующие транзакции выполняются в обратном порядке.

**Хореографическая Saga** (событийная, без центрального координатора):

```
Сервис заказов    → публикует OrderCreated
Сервис оплаты     → потребляет OrderCreated, публикует PaymentProcessed
Сервис склада     → потребляет PaymentProcessed, публикует InventoryReserved
Сервис доставки   → потребляет InventoryReserved, публикует OrderShipped

При сбое (например, оплата не прошла):
Сервис оплаты     → публикует PaymentFailed
Сервис заказов    → потребляет PaymentFailed, отменяет заказ (компенсирующая транзакция)
```

**Оркестрационная Saga** (центральный оркестратор):

```go
type OrderSaga struct {
    orderSvc     OrderService
    paymentSvc   PaymentService
    inventorySvc InventoryService
}

func (s *OrderSaga) Execute(ctx context.Context, order *Order) error {
    // Шаг 1: создать заказ
    if err := s.orderSvc.Create(ctx, order); err != nil {
        return err
    }

    // Шаг 2: обработать оплату
    if err := s.paymentSvc.Charge(ctx, order); err != nil {
        // Компенсация шага 1
        s.orderSvc.Cancel(ctx, order.ID) // компенсирующая транзакция
        return fmt.Errorf("оплата не прошла: %w", err)
    }

    // Шаг 3: зарезервировать склад
    if err := s.inventorySvc.Reserve(ctx, order); err != nil {
        // Компенсация шагов 1 и 2
        s.paymentSvc.Refund(ctx, order.ID)  // компенсирующая транзакция
        s.orderSvc.Cancel(ctx, order.ID)     // компенсирующая транзакция
        return fmt.Errorf("резервирование склада не удалось: %w", err)
    }

    return nil
}
```

**Saga vs 2PC:**
- Saga: eventual consistency, нет глобальной блокировки, каждый сервис использует собственную локальную транзакцию.
- 2PC: строгая консистентность, но требует координатора, блокирует ресурсы всех участников, имеет проблемы с доступностью при отказе координатора.

На практике Saga (оркестрационная) + идемпотентные операции — рекомендуемый паттерн для микросервисов.

## Обнаружение сервисов

Обнаружение сервисов — механизм того, как сервисы находят друг друга. В динамической среде с автоскейлингом и rolling deployments экземпляры сервисов появляются и исчезают — нельзя хардкодить IP-адреса.

**Две модели:**

**Клиентское обнаружение:** клиент запрашивает реестр сервисов (Consul, etcd) и выбирает экземпляр для вызова, реализуя собственную балансировку нагрузки.

```go
import "github.com/hashicorp/consul/api"

client, _ := api.NewClient(api.DefaultConfig())
services, _, _ := client.Health().Service("inventory-service", "", true, nil)

if len(services) == 0 {
    return fmt.Errorf("нет здоровых экземпляров inventory-service")
}
// Простой round-robin выбор
instance := services[idx%len(services)]
addr := fmt.Sprintf("%s:%d", instance.Service.Address, instance.Service.Port)
```

**Серверное обнаружение (балансировщик нагрузки):** клиент обращается к стабильному DNS-имени или виртуальному IP. Балансировщик нагрузки (Kubernetes Service, AWS ALB, Nginx) разрешает экземпляры. Это стандарт в Kubernetes.

**Kubernetes** предоставляет встроенное обнаружение сервисов через DNS:
- `http://inventory-service` разрешается в ClusterIP.
- `http://inventory-service.production.svc.cluster.local` для межпространственного доступа.

Для gRPC в Kubernetes используйте схему `dns:///` с клиентской балансировкой по IP подов:

```go
conn, err := grpc.NewClient(
    "dns:///inventory-service:50051",
    grpc.WithDefaultServiceConfig(`{"loadBalancingConfig": [{"round_robin":{}}]}`),
    grpc.WithTransportCredentials(insecure.NewCredentials()),
)
```

## Распределённая трассировка с OpenTelemetry

В монолите один запрос виден в одном логе. В микросервисах один пользовательский запрос может затрагивать 5–10 сервисов. Без распределённой трассировки отлаживать задержки или ошибки между сервисами практически невозможно.

**Ключевые понятия:**
- **Trace (Трейс):** полный путь запроса, состоящий из спанов.
- **Span (Спан):** одна операция в трейсе (один HTTP-вызов, один запрос к БД). Имеет время начала, продолжительность и метаданные (атрибуты, события, статус).
- **Распространение контекста:** передача trace ID и span ID в заголовках запросов, чтобы спаны разных сервисов можно было связать.

OpenTelemetry — стандарт CNCF для распределённой трассировки (и метрик, и логов). В Go:

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/sdk/trace"
    "go.opentelemetry.io/otel/propagation"
)

func initTracer(ctx context.Context) (func(), error) {
    exporter, err := otlptracehttp.New(ctx,
        otlptracehttp.WithEndpoint("http://otel-collector:4318"),
    )
    if err != nil {
        return nil, err
    }

    tp := trace.NewTracerProvider(
        trace.WithBatcher(exporter),
        trace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String("order-service"),
        )),
    )
    otel.SetTracerProvider(tp)
    otel.SetTextMapPropagator(propagation.TraceContext{})

    return func() { tp.Shutdown(ctx) }, nil
}

// Инструментация HTTP-сервера
mux.Handle("/orders", otelhttp.NewHandler(orderHandler, "handle-order"))

// Инструментация исходящих HTTP-вызовов
client := &http.Client{
    Transport: otelhttp.NewTransport(http.DefaultTransport),
}

// Ручное создание спана
func processOrder(ctx context.Context, order *Order) error {
    ctx, span := otel.Tracer("order-service").Start(ctx, "processOrder")
    defer span.End()

    span.SetAttributes(
        attribute.String("order.id", order.ID),
        attribute.Float64("order.total", order.Total),
    )

    if err := validateOrder(ctx, order); err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
        return err
    }
    return nil
}
```

Заголовки W3C Trace Context (`traceparent`, `tracestate`) автоматически распространяются через middleware `otelhttp` — downstream-сервисы получают их и продолжают тот же трейс.

**Сэмплинг:** трассировка каждого запроса при высоком трафике дорогостояща. Настройте коэффициент сэмплинга:

```go
trace.WithSampler(trace.TraceIDRatioBased(0.1)) // сэмплировать 10% запросов
```

Или используйте **parent-based сэмплинг**: если вызывающий уже сэмплировал запрос, downstream-сервис также должен его сэмплировать (чтобы трейс был полным).

## Проверки работоспособности

Проверки работоспособности сообщают о готовности сервиса принимать трафик. Балансировщик нагрузки или kubelet Kubernetes опрашивает эндпоинты проверок и убирает нездоровые экземпляры из ротации.

**Два типа:**
- **Liveness (Живучесть):** живёт ли процесс? Если нет — перезапустить его. Liveness-проверка должна быть очень лёгкой — она доказывает, что процесс не завис.
- **Readiness (Готовность):** готов ли сервис обслуживать трафик? Если нет — прекратить маршрутизацию на него. Readiness-проверка верифицирует, что все зависимости (база данных, downstream-сервисы) доступны.

```go
func healthHandler(db *pgxpool.Pool, rdb *redis.Client) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
        defer cancel()

        checks := map[string]error{
            "postgres": db.Ping(ctx),
            "redis":    rdb.Ping(ctx).Err(),
        }

        healthy := true
        for _, err := range checks {
            if err != nil {
                healthy = false
                break
            }
        }

        if !healthy {
            w.WriteHeader(http.StatusServiceUnavailable)
        } else {
            w.WriteHeader(http.StatusOK)
        }
        json.NewEncoder(w).Encode(checks)
    }
}

// Регистрация эндпоинтов
mux.HandleFunc("/healthz/live", func(w http.ResponseWriter, _ *http.Request) {
    w.WriteHeader(http.StatusOK) // просто «я работаю?»
})
mux.HandleFunc("/healthz/ready", healthHandler(db, rdb))
```

В Kubernetes:

```yaml
livenessProbe:
  httpGet:
    path: /healthz/live
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /healthz/ready
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 3
```

## Всё вместе

Надёжный Go-микросервис объединяет все эти паттерны:

```go
func main() {
    ctx := context.Background()

    // Трассировка
    shutdown, _ := initTracer(ctx)
    defer shutdown()

    // Зависимости
    db, _ := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
    rdb := redis.NewClient(&redis.Options{Addr: os.Getenv("REDIS_ADDR")})

    // Circuit breaker для downstream-вызовов
    cb := gobreaker.NewCircuitBreaker[*http.Response](gobreaker.Settings{
        Name:    "downstream",
        Timeout: 30 * time.Second,
        ReadyToTrip: func(c gobreaker.Counts) bool {
            return c.ConsecutiveFailures > 5
        },
    })

    svc := &OrderService{db: db, cache: rdb, cb: cb}

    mux := chi.NewRouter()
    mux.Use(otelhttp.NewMiddleware("order-service"))
    mux.Use(middleware.Recoverer)
    mux.HandleFunc("/healthz/live", livenessHandler)
    mux.HandleFunc("/healthz/ready", readinessHandler(db, rdb))
    mux.Mount("/orders", orderRoutes(svc))

    srv := &http.Server{Addr: ":8080", Handler: mux}

    // Graceful shutdown
    go func() {
        stop := make(chan os.Signal, 1)
        signal.Notify(stop, syscall.SIGTERM, syscall.SIGINT)
        <-stop
        shutCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
        defer cancel()
        srv.Shutdown(shutCtx)
    }()

    srv.ListenAndServe()
}
```

## Вопросы для самопроверки

1. **Сервис A вызывает сервис B. Сервис B начинает медленно отвечать (таймаут 10 с). Опишите, что происходит без circuit breaker и с ним.**
   *Без: горутины A накапливаются в ожидании B; A исчерпывает пул соединений и становится неотзывчивым. С circuit breaker: после нескольких сбоев цепь открывается; A мгновенно выдаёт ошибку и может вернуть кэшированный или деградированный ответ, предотвращая каскад.*

2. **В чём разница между оркестрационной и хореографической Saga?**
   *Оркестрация: центральный оркестратор координирует шаги и запускает компенсации. Хореография: каждый сервис реагирует на события предыдущего шага и публикует собственные события. Хореография не имеет центральной точки отказа, но сложнее для трассировки; оркестрация явнее, но добавляет зависимость координатора.*

3. **Как работает распространение контекста в OpenTelemetry?**
   *Первый сервис начинает трейс и вводит trace ID и span ID в HTTP-заголовки (`traceparent`). Каждый downstream-сервис извлекает контекст из входящих заголовков, создаёт дочерний спан и вводит обновлённый контекст в собственные исходящие вызовы. Все спаны разделяют один trace ID и могут отображаться как единая временная шкала трейса.*

4. **Почему liveness и readiness проверки должны быть на отдельных эндпоинтах?**
   *Сбои liveness приводят к перезапуску контейнера — это должно происходить только если процесс действительно завис (дедлок, нехватка памяти). Сбои readiness прекращают маршрутизацию трафика на экземпляр без перезапуска — подходит, когда зависимость временно недоступна. Один эндпоинт для обоих привёл бы к ненужным перезапускам при кратковременной недоступности базы данных.*
