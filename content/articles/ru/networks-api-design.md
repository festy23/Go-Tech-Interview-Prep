---
title: Проектирование API
blockId: networks-api-design
parentBlockId: networks
---

# Проектирование API

Выбор протокола и стиля API — одно из ключевых архитектурных решений, влияющих на производительность, удобство использования и операционный overhead. REST, gRPC и GraphQL — три доминирующих подхода с разными компромиссами. На собеседованиях ожидают не только знание каждого из них, но и понимание, когда применять тот или иной.

## REST: Representational State Transfer

REST — архитектурный стиль для HTTP-API, сформулированный Роем Филдингом в 2000 году. Не протокол и не стандарт, а набор ограничений.

### Принципы REST

**Stateless**: каждый запрос самодостаточен. Сервер не хранит состояние клиента между запросами. Аутентификация через токен в каждом запросе, а не через сессию.

**Resource-based**: API работает с ресурсами (существительными), а не действиями (глаголами). URL идентифицирует ресурс, HTTP-метод — операцию.

**Uniform Interface**: стандартные HTTP-методы имеют единый смысл для всех ресурсов.

**Layered**: клиент не знает, говорит ли он с конечным сервером или прокси.

### Именование ресурсов

```
# Хорошо — существительные во множественном числе
GET    /users           # список пользователей
GET    /users/42        # конкретный пользователь
POST   /users           # создание нового пользователя
PUT    /users/42        # полное обновление пользователя
PATCH  /users/42        # частичное обновление
DELETE /users/42        # удаление

# Вложенные ресурсы
GET    /users/42/orders         # заказы пользователя 42
GET    /users/42/orders/7       # конкретный заказ
POST   /users/42/orders         # создание заказа для пользователя 42

# Плохо — глаголы в URL
POST /createUser
GET  /getUserById?id=42
POST /deleteUser
```

### Обработка ошибок

Используйте HTTP-статусы осмысленно и возвращайте структурированные ошибки:

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User with id 42 does not exist",
    "details": {
      "userId": 42
    }
  }
}
```

```go
type APIError struct {
    Code    string         `json:"code"`
    Message string         `json:"message"`
    Details map[string]any `json:"details,omitempty"`
}

func writeError(w http.ResponseWriter, status int, code, message string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(map[string]any{
        "error": APIError{Code: code, Message: message},
    })
}

// Использование
writeError(w, http.StatusNotFound, "USER_NOT_FOUND", "User does not exist")
```

### Версионирование API

Три подхода:

**1. URL-версионирование** (наиболее распространённое):
```
/api/v1/users
/api/v2/users
```

**2. Заголовок**:
```
Accept: application/vnd.myapi.v2+json
```

**3. Query parameter** (наименее удобное):
```
/api/users?version=2
```

Рекомендация: URL-версионирование для публичных API — очевидно, легко кэшировать, легко тестировать. Заголовочное версионирование — для API, где URL неизменен по требованиям (например, строгий REST).

### Пагинация

Три подхода для больших коллекций:

**Offset-based** (простой, но с проблемами при изменениях):
```
GET /users?page=2&per_page=20
```
```json
{
  "data": [...],
  "meta": {
    "total": 1000,
    "page": 2,
    "per_page": 20,
    "total_pages": 50
  }
}
```

**Cursor-based** (стабильный при вставках/удалениях):
```
GET /users?after=eyJpZCI6NDJ9&limit=20
```
```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6NjJ9",
    "has_more": true
  }
}
```

**Keyset pagination** (быстрый для больших таблиц):
```
GET /users?last_id=42&limit=20
```

Cursor-based предпочтительнее для real-time данных (лента событий, чаты). Offset хорош для административных интерфейсов с нумерацией страниц.

## OpenAPI: документирование REST

**OpenAPI Specification** (ранее Swagger) — стандарт описания REST API в YAML/JSON. Позволяет генерировать документацию, клиентский код и серверные заглушки.

Для Go: библиотеки `swaggo/swag` (аннотации в комментариях) или `ogen-go/ogen` (генерация кода из спецификации).

```yaml
# openapi.yaml
openapi: "3.1.0"
info:
  title: Users API
  version: "1.0.0"
paths:
  /users/{id}:
    get:
      summary: Get user by ID
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        "200":
          description: User found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
        "404":
          description: User not found
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
```

## gRPC: высокопроизводительный RPC

**gRPC** — фреймворк RPC (Remote Procedure Call) от Google, использующий Protocol Buffers для сериализации и HTTP/2 для транспорта.

### Protocol Buffers

Protobuf — бинарный формат сериализации. Компактнее JSON в 3–10 раз, быстрее парсинга в 5–10 раз:

```protobuf
// user.proto
syntax = "proto3";

package users.v1;

option go_package = "github.com/example/api/users/v1;usersv1";

service UserService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
  rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
  
  // Server streaming: одна запрос, поток ответов
  rpc WatchUsers(WatchUsersRequest) returns (stream UserEvent);
  
  // Client streaming: поток запросов, один ответ
  rpc BulkCreateUsers(stream CreateUserRequest) returns (BulkCreateResponse);
  
  // Bidirectional streaming
  rpc SyncUsers(stream SyncRequest) returns (stream SyncResponse);
}

message User {
  int64 id = 1;
  string name = 2;
  string email = 3;
  google.protobuf.Timestamp created_at = 4;
}

message GetUserRequest {
  int64 id = 1;
}

message GetUserResponse {
  User user = 1;
}
```

Генерация кода:
```bash
protoc --go_out=. --go-grpc_out=. user.proto
```

### gRPC-сервер на Go

```go
package main

import (
    "context"
    "log/slog"
    "net"

    "google.golang.org/grpc"
    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/status"

    usersv1 "github.com/example/api/users/v1"
)

type userServer struct {
    usersv1.UnimplementedUserServiceServer
    db UserRepository
}

func (s *userServer) GetUser(ctx context.Context, req *usersv1.GetUserRequest) (*usersv1.GetUserResponse, error) {
    if req.Id <= 0 {
        return nil, status.Errorf(codes.InvalidArgument, "id must be positive")
    }

    user, err := s.db.FindByID(ctx, req.Id)
    if err != nil {
        if errors.Is(err, ErrNotFound) {
            return nil, status.Errorf(codes.NotFound, "user %d not found", req.Id)
        }
        return nil, status.Errorf(codes.Internal, "internal error: %v", err)
    }

    return &usersv1.GetUserResponse{
        User: &usersv1.User{
            Id:    user.ID,
            Name:  user.Name,
            Email: user.Email,
        },
    }, nil
}

// Server streaming
func (s *userServer) WatchUsers(req *usersv1.WatchUsersRequest, stream usersv1.UserService_WatchUsersServer) error {
    ch := s.db.Subscribe(stream.Context())
    for {
        select {
        case event, ok := <-ch:
            if !ok {
                return nil
            }
            if err := stream.Send(&usersv1.UserEvent{User: toProto(event)}); err != nil {
                return err
            }
        case <-stream.Context().Done():
            return stream.Context().Err()
        }
    }
}

func main() {
    ln, err := net.Listen("tcp", ":50051")
    if err != nil {
        slog.Error("listen failed", "err", err)
        return
    }

    srv := grpc.NewServer(
        grpc.ChainUnaryInterceptor(
            loggingInterceptor,
            recoveryInterceptor,
        ),
    )
    usersv1.RegisterUserServiceServer(srv, &userServer{})

    slog.Info("gRPC server listening", "addr", ln.Addr())
    if err := srv.Serve(ln); err != nil {
        slog.Error("serve failed", "err", err)
    }
}
```

### gRPC-клиент на Go

```go
import (
    "context"
    "log/slog"
    "time"

    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials/insecure"

    usersv1 "github.com/example/api/users/v1"
)

func main() {
    conn, err := grpc.NewClient("localhost:50051",
        grpc.WithTransportCredentials(insecure.NewCredentials()),
        // В продакшне используйте TLS:
        // grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{})),
    )
    if err != nil {
        slog.Error("dial failed", "err", err)
        return
    }
    defer conn.Close()

    client := usersv1.NewUserServiceClient(conn)

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    resp, err := client.GetUser(ctx, &usersv1.GetUserRequest{Id: 42})
    if err != nil {
        // gRPC-статусы проверяются через пакет status
        st := status.Convert(err)
        slog.Error("GetUser failed",
            "code", st.Code(),
            "message", st.Message(),
        )
        return
    }

    slog.Info("got user", "name", resp.User.Name)
}
```

### gRPC vs REST

| Аспект | REST | gRPC |
|--------|------|------|
| Формат | JSON (текст) | Protobuf (бинарный) |
| Транспорт | HTTP/1.1 или HTTP/2 | HTTP/2 |
| Стриминг | SSE, WebSocket (отдельно) | Встроенный (4 режима) |
| Типизация | Нет (OpenAPI опционально) | Строгая (proto) |
| Кодогенерация | Опциональная | Обязательная |
| Отладка | curl, браузер | grpcurl, grpc-gateway |
| Browser support | Нативный | Нет (нужен grpc-web) |
| Версионирование | URL, заголовки | Proto-пакеты |

**Когда gRPC**: internal microservices, высоконагруженные сервисы, стриминг, языково-нейтральные интерфейсы.

**Когда REST**: публичные API, браузерные клиенты, простые CRUD-операции.

## GraphQL: гибкие запросы

**GraphQL** — язык запросов для API, разработанный Facebook. Одна точка входа, клиент запрашивает только нужные поля.

### Ключевые концепции

**Query** — запрос данных:
```graphql
query {
  user(id: 42) {
    id
    name
    email
    orders(limit: 5) {
      id
      total
      status
    }
  }
}
```

**Mutation** — изменение данных:
```graphql
mutation {
  createUser(input: { name: "Alice", email: "alice@example.com" }) {
    id
    name
  }
}
```

**Subscription** — подписка на изменения (через WebSocket):
```graphql
subscription {
  orderStatusChanged(userId: 42) {
    orderId
    newStatus
  }
}
```

**Fragments** — переиспользуемые фрагменты полей:
```graphql
fragment UserFields on User {
  id
  name
  email
}

query {
  user(id: 42) { ...UserFields }
  currentUser { ...UserFields }
}
```

### GraphQL в Go

Библиотека `graph-gophers/graphql-go` или `99designs/gqlgen` (предпочтительнее — кодогенерация):

```go
// schema.graphqls
type Query {
  user(id: ID!): User
}

type User {
  id: ID!
  name: String!
  email: String!
}

// resolver.go (генерируется через gqlgen)
func (r *queryResolver) User(ctx context.Context, id string) (*model.User, error) {
    uid, err := strconv.ParseInt(id, 10, 64)
    if err != nil {
        return nil, fmt.Errorf("invalid id: %w", err)
    }
    return r.db.FindUser(ctx, uid)
}
```

### N+1 проблема в GraphQL

Классическая проблема: запрос 100 пользователей с их заказами → 100 отдельных запросов к БД для заказов (N+1).

Решение — **DataLoader** (батчинг запросов):

```go
import "github.com/graph-gophers/dataloader/v7"

type OrderLoader = dataloader.Loader[int64, []*Order]

func newOrderLoader(db DB) *OrderLoader {
    return dataloader.NewBatchedLoader(func(ctx context.Context, userIDs []int64) []*dataloader.Result[[]*Order] {
        // Один запрос для всех пользователей
        ordersByUser, err := db.FindOrdersByUserIDs(ctx, userIDs)
        results := make([]*dataloader.Result[[]*Order], len(userIDs))
        for i, uid := range userIDs {
            if err != nil {
                results[i] = &dataloader.Result[[]*Order]{Error: err}
            } else {
                results[i] = &dataloader.Result[[]*Order]{Data: ordersByUser[uid]}
            }
        }
        return results
    })
}
```

### REST vs gRPC vs GraphQL

| | REST | gRPC | GraphQL |
|--|------|------|---------|
| Fetching | Фиксированные эндпоинты | Фиксированные методы | Клиент выбирает поля |
| Over/Under-fetching | Есть | Есть | Нет |
| Стриминг | Ограниченный | Встроенный | Subscription (WS) |
| Кэширование | HTTP-кэш | Сложно | Только GET-запросы |
| Сложность сервера | Низкая | Средняя | Высокая |
| Сложность клиента | Низкая | Средняя | Низкая (Apollo) |
| Интроспекция | OpenAPI | Proto reflection | Встроена |

## Best Practices для продакшн API

### Идемпотентность

Для мутирующих операций добавляйте Idempotency-Key:

```go
// Клиент генерирует уникальный ключ для каждой операции
req.Header.Set("Idempotency-Key", uuid.New().String())

// Сервер кэширует результат на 24 часа
func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
    key := r.Header.Get("Idempotency-Key")
    if key != "" {
        if cached, ok := h.cache.Get(key); ok {
            w.WriteHeader(http.StatusOK)
            json.NewEncoder(w).Encode(cached)
            return
        }
    }
    // ... создаём заказ
    // ... кэшируем результат по key
}
```

### Rate Limiting

```go
import "golang.org/x/time/rate"

type RateLimiter struct {
    limiters sync.Map
}

func (rl *RateLimiter) getLimiter(key string) *rate.Limiter {
    v, _ := rl.limiters.LoadOrStore(key, rate.NewLimiter(rate.Every(time.Second), 100))
    return v.(*rate.Limiter)
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        limiter := rl.getLimiter(r.RemoteAddr)
        if !limiter.Allow() {
            w.Header().Set("Retry-After", "1")
            writeError(w, http.StatusTooManyRequests, "RATE_LIMIT_EXCEEDED", "Too many requests")
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

### Retry с экспоненциальным бэкоффом

```go
func withRetry(ctx context.Context, maxAttempts int, fn func() error) error {
    var err error
    for attempt := range maxAttempts {
        if err = fn(); err == nil {
            return nil
        }

        // Не ретраить клиентские ошибки (4xx)
        var apiErr *APIError
        if errors.As(err, &apiErr) && apiErr.StatusCode < 500 {
            return err
        }

        if attempt == maxAttempts-1 {
            break
        }

        // Экспоненциальный бэкофф с джиттером
        delay := time.Duration(1<<attempt)*100*time.Millisecond +
            time.Duration(rand.Int64N(int64(50*time.Millisecond)))

        select {
        case <-time.After(delay):
        case <-ctx.Done():
            return ctx.Err()
        }
    }
    return fmt.Errorf("after %d attempts: %w", maxAttempts, err)
}
```

## Типичные вопросы на собеседованиях

**Что такое REST и каковы его ограничения?** REST — архитектурный стиль с resource-based URL, HTTP-методами и stateless-запросами. Ограничения: over-fetching (лишние данные), under-fetching (несколько запросов для одного экрана), нет стандарта для real-time.

**В чём преимущества gRPC перед REST?** Бинарный protobuf быстрее JSON, HTTP/2 даёт стриминг и мультиплексирование, строгая типизация, кодогенерация исключает ошибки. Минусы: нет поддержки в браузерах, сложнее отлаживать.

**Что такое N+1 проблема?** При fetching'е коллекции с вложенными данными каждый элемент вызывает отдельный запрос к БД. Решения: JOIN в SQL, DataLoader для GraphQL, пакетные операции.

**Как версионировать API без поломки клиентов?** Добавлять новые поля (backward-compatible). Не удалять и не переименовывать существующие поля без нового мажорного версиона. URL-версионирование для крупных изменений.

**Что такое idempotency key?** Уникальный клиентский идентификатор запроса, позволяющий безопасно ретраить мутирующие операции. Сервер возвращает закэшированный результат при повторном запросе с тем же ключом.
