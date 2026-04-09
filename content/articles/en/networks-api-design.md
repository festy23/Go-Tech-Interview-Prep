---
title: API Design
blockId: networks-api-design
parentBlockId: networks
---

# API Design

Choosing an API protocol and style is one of the key architectural decisions that affects performance, developer ergonomics, and operational overhead. REST, gRPC, and GraphQL are three dominant approaches, each with different trade-offs. Interviews expect not only knowledge of each but also the judgment to choose the right one.

## REST: Representational State Transfer

REST is an architectural style for HTTP APIs, articulated by Roy Fielding in his 2000 dissertation. It is not a protocol or a standard — it is a set of constraints.

### REST Principles

**Stateless**: every request is self-contained. The server stores no client state between requests. Authentication uses a token in each request, not a session.

**Resource-based**: the API works with resources (nouns), not actions (verbs). The URL identifies the resource; the HTTP method specifies the operation.

**Uniform Interface**: standard HTTP methods carry the same meaning across all resources.

**Layered**: the client does not know whether it is talking to the final server or a proxy.

### Resource Naming

```
# Good — plural nouns
GET    /users           # list users
GET    /users/42        # get a specific user
POST   /users           # create a new user
PUT    /users/42        # replace the user entirely
PATCH  /users/42        # partial update
DELETE /users/42        # delete the user

# Nested resources
GET    /users/42/orders         # orders belonging to user 42
GET    /users/42/orders/7       # a specific order
POST   /users/42/orders         # create an order for user 42

# Bad — verbs in URLs
POST /createUser
GET  /getUserById?id=42
POST /deleteUser
```

### Error Handling

Use HTTP status codes meaningfully and return structured errors:

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

// Usage
writeError(w, http.StatusNotFound, "USER_NOT_FOUND", "User does not exist")
```

### API Versioning

Three approaches:

**1. URL versioning** (most common):
```
/api/v1/users
/api/v2/users
```

**2. Header versioning**:
```
Accept: application/vnd.myapi.v2+json
```

**3. Query parameter** (least ergonomic):
```
/api/users?version=2
```

Recommendation: URL versioning for public APIs — obvious, easy to cache, easy to test. Header versioning for APIs where the URL must remain stable (e.g., strict REST purists).

### Pagination

Three approaches for large collections:

**Offset-based** (simple, but problematic with concurrent modifications):
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

**Cursor-based** (stable under inserts/deletes):
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

**Keyset pagination** (fast for large tables):
```
GET /users?last_id=42&limit=20
```

Cursor-based is preferable for real-time data (event feeds, chats). Offset is fine for admin interfaces with numbered pages.

## OpenAPI: Documenting REST

**OpenAPI Specification** (formerly Swagger) is a standard for describing REST APIs in YAML/JSON. It enables generating documentation, client code, and server stubs.

For Go: `swaggo/swag` (annotations in comments) or `ogen-go/ogen` (code generation from spec).

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

## gRPC: High-Performance RPC

**gRPC** is an RPC (Remote Procedure Call) framework from Google that uses Protocol Buffers for serialisation and HTTP/2 for transport.

### Protocol Buffers

Protobuf is a binary serialisation format. It is 3–10× more compact than JSON and 5–10× faster to parse:

```protobuf
// user.proto
syntax = "proto3";

package users.v1;

option go_package = "github.com/example/api/users/v1;usersv1";

service UserService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
  rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
  
  // Server streaming: one request, stream of responses
  rpc WatchUsers(WatchUsersRequest) returns (stream UserEvent);
  
  // Client streaming: stream of requests, one response
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

Code generation:
```bash
protoc --go_out=. --go-grpc_out=. user.proto
```

### gRPC Server in Go

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

### gRPC Client in Go

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
        // In production use TLS:
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
        // gRPC statuses are checked via the status package
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

| Aspect | REST | gRPC |
|--------|------|------|
| Format | JSON (text) | Protobuf (binary) |
| Transport | HTTP/1.1 or HTTP/2 | HTTP/2 |
| Streaming | SSE, WebSocket (separate) | Built-in (4 modes) |
| Type safety | None (OpenAPI optional) | Strict (proto) |
| Code generation | Optional | Mandatory |
| Debugging | curl, browser | grpcurl, grpc-gateway |
| Browser support | Native | No (needs grpc-web) |
| Versioning | URL, headers | Proto packages |

**When gRPC**: internal microservices, high-throughput services, streaming, language-neutral interfaces.

**When REST**: public APIs, browser clients, simple CRUD operations.

## GraphQL: Flexible Queries

**GraphQL** is a query language for APIs developed by Facebook. One endpoint, and the client requests exactly the fields it needs.

### Key Concepts

**Query** — fetching data:
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

**Mutation** — modifying data:
```graphql
mutation {
  createUser(input: { name: "Alice", email: "alice@example.com" }) {
    id
    name
  }
}
```

**Subscription** — streaming changes (via WebSocket):
```graphql
subscription {
  orderStatusChanged(userId: 42) {
    orderId
    newStatus
  }
}
```

**Fragments** — reusable field selections:
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

### GraphQL in Go

The `99designs/gqlgen` library (preferred — code generation from schema):

```go
// schema.graphqls
// type Query {
//   user(id: ID!): User
// }

// resolver.go (generated by gqlgen)
func (r *queryResolver) User(ctx context.Context, id string) (*model.User, error) {
    uid, err := strconv.ParseInt(id, 10, 64)
    if err != nil {
        return nil, fmt.Errorf("invalid id: %w", err)
    }
    return r.db.FindUser(ctx, uid)
}
```

### The N+1 Problem in GraphQL

The classic problem: fetching 100 users with their orders triggers 100 separate database queries for orders (N+1).

Solution — **DataLoader** (request batching):

```go
import "github.com/graph-gophers/dataloader/v7"

type OrderLoader = dataloader.Loader[int64, []*Order]

func newOrderLoader(db DB) *OrderLoader {
    return dataloader.NewBatchedLoader(func(ctx context.Context, userIDs []int64) []*dataloader.Result[[]*Order] {
        // One query for all users
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
| Data fetching | Fixed endpoints | Fixed methods | Client selects fields |
| Over/under-fetching | Yes | Yes | No |
| Streaming | Limited | Built-in | Subscription (WS) |
| Caching | HTTP cache | Hard | GET requests only |
| Server complexity | Low | Medium | High |
| Client complexity | Low | Medium | Low (Apollo) |
| Introspection | OpenAPI | Proto reflection | Built-in |

## Production API Best Practices

### Idempotency

For mutating operations, add an Idempotency-Key:

```go
// Client generates a unique key per operation
req.Header.Set("Idempotency-Key", uuid.New().String())

// Server caches the result for 24 hours
func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
    key := r.Header.Get("Idempotency-Key")
    if key != "" {
        if cached, ok := h.cache.Get(key); ok {
            w.WriteHeader(http.StatusOK)
            json.NewEncoder(w).Encode(cached)
            return
        }
    }
    // ... create the order
    // ... cache the result under key
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

### Retry with Exponential Backoff

```go
func withRetry(ctx context.Context, maxAttempts int, fn func() error) error {
    var err error
    for attempt := range maxAttempts {
        if err = fn(); err == nil {
            return nil
        }

        // Do not retry client errors (4xx)
        var apiErr *APIError
        if errors.As(err, &apiErr) && apiErr.StatusCode < 500 {
            return err
        }

        if attempt == maxAttempts-1 {
            break
        }

        // Exponential backoff with jitter
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

## Common Interview Questions

**What is REST and what are its limitations?** REST is an architectural style with resource-based URLs, HTTP methods, and stateless requests. Limitations: over-fetching (too much data), under-fetching (multiple requests for one screen), no standard for real-time communication.

**What are the advantages of gRPC over REST?** Binary protobuf is faster than JSON, HTTP/2 provides streaming and multiplexing, strict typing, and code generation eliminates interface drift. Downsides: no native browser support, harder to debug without tooling.

**What is the N+1 problem?** When fetching a collection with nested data, each item triggers a separate database query. Solutions: SQL JOINs, DataLoader batching for GraphQL, batch API operations.

**How do you version an API without breaking clients?** Add new fields (backward-compatible). Never remove or rename existing fields without a new major version. Use URL versioning for breaking changes.

**What is an idempotency key?** A unique client-generated identifier for a request that allows safely retrying mutating operations. The server returns the cached result on a subsequent request with the same key.
