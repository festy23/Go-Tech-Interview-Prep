---
title: HTTP
blockId: networks-http
parentBlockId: networks
---

# HTTP

HTTP is the protocol the modern web runs on. For Go developers this is not just theory: `net/http` is used in every service, and understanding protocol versions and connection mechanics directly affects performance. This article covers message structure, the evolution from HTTP/1.1 to HTTP/3, and how it all looks from inside Go.

## HTTP Message Structure

HTTP runs over TCP (over QUIC in HTTP/3). Every exchange consists of a **request** and a **response**.

### Request

```
POST /api/users HTTP/1.1
Host: example.com
Content-Type: application/json
Authorization: Bearer eyJhbGc...
Content-Length: 42

{"name": "Alice", "email": "alice@example.com"}
```

Structure:
- **Start line**: method, URI, version.
- **Headers**: case-insensitive key-value pairs.
- **Blank line**: separates headers from the body.
- **Body**: optional, depends on the method.

### Response

```
HTTP/1.1 201 Created
Content-Type: application/json
Location: /api/users/42
X-Request-Id: a1b2c3

{"id": 42, "name": "Alice"}
```

The structure is analogous: the start line contains the version, status code, and reason phrase.

## HTTP Methods

| Method | Idempotent | Safe | Body |
|--------|-----------|------|------|
| GET | Yes | Yes | No |
| HEAD | Yes | Yes | No |
| POST | No | No | Yes |
| PUT | Yes | No | Yes |
| PATCH | No | No | Yes |
| DELETE | Yes | No | No |
| OPTIONS | Yes | Yes | No |

**Idempotent** — calling it multiple times with the same parameters produces the same result. `PUT /users/42` with the same body always leads to the same state. `POST /users` creates a new user every time.

**Safe** — does not modify server state (read-only).

## Status Codes

**1xx — Informational**: 100 Continue, 101 Switching Protocols.

**2xx — Success**: 200 OK, 201 Created, 202 Accepted, 204 No Content.

**3xx — Redirection**: 301 Moved Permanently, 302 Found, 304 Not Modified, 307 Temporary Redirect.

**4xx — Client errors**: 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 429 Too Many Requests.

**5xx — Server errors**: 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout.

401 vs 403 is a common point of confusion: 401 means "not authenticated" (missing or invalid token), 403 means "authenticated but not authorised".

## Headers

### General

- `Content-Type: application/json; charset=utf-8` — body media type.
- `Content-Length: 42` — body length in bytes.
- `Transfer-Encoding: chunked` — body is sent in chunks without a known total length.
- `Accept: application/json` — client's preferred response format.
- `Accept-Encoding: gzip, br` — supported compression algorithms.
- `Content-Encoding: gzip` — compression applied to the body.

### Caching

- `Cache-Control: max-age=3600, public` — caching directives.
- `ETag: "abc123"` — resource version tag.
- `Last-Modified: Thu, 01 Jan 2026 00:00:00 GMT`.
- `If-None-Match: "abc123"` — conditional GET; the server replies 304 if the ETag matches.

### Security

- `Authorization: Bearer <token>` — JWT or OAuth token.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` — HSTS.
- `X-Content-Type-Options: nosniff`.
- `Access-Control-Allow-Origin: *` — CORS.

## HTTP/1.1: Keep-Alive and Its Limits

In HTTP/1.0 every request opened a new TCP connection. HTTP/1.1 introduced **keep-alive** — the connection stays open for subsequent requests.

```
Connection: keep-alive
Keep-Alive: timeout=5, max=100
```

The problem with HTTP/1.1 is **protocol-level head-of-line blocking**: the next request cannot start until the previous response is received (even with pipelining, responses must return in request order).

Browsers work around this by opening 6–8 parallel connections per domain, but this increases server load.

## HTTP/2: Multiplexing and HPACK

HTTP/2 (RFC 7540) solves head-of-line blocking through **binary framing** and **stream multiplexing**.

### Key Concepts

**Stream**: an independent bidirectional channel within a single TCP connection. Each request gets a unique `stream_id`. Dozens of requests are multiplexed over a single connection.

**Frame**: the minimum unit of data transfer. Types: HEADERS, DATA, SETTINGS, WINDOW_UPDATE, PING, RST_STREAM.

**HPACK compression**: headers are compressed using a static table (61 pre-defined headers) and a dynamic table (updated during the session). A frequently repeated `Content-Type: application/json` is transmitted as a single index instead of the full string.

**Server Push**: the server can proactively send a resource before the client requests it. In practice, Server Push proved less effective than expected, and HTTP/3 dropped it as a required feature.

**Prioritisation**: each stream has a priority and weight. The server can process important requests first.

```go
// Go automatically uses HTTP/2 when TLS is present.
// Explicit configuration:
import "golang.org/x/net/http2"

srv := &http.Server{Addr: ":443", Handler: mux}
http2.ConfigureServer(srv, &http2.Server{
    MaxConcurrentStreams: 250,
    MaxReadFrameSize:     1 << 20,
})
```

### HTTP/1.1 vs HTTP/2

| Aspect | HTTP/1.1 | HTTP/2 |
|--------|----------|--------|
| Format | Text | Binary |
| Connections | Many (parallel) | One (multiplexed) |
| Header compression | None | HPACK |
| Response ordering | Strict | Arbitrary |
| Server Push | No | Yes |

## HTTP/3: QUIC and Eliminating the TCP Bottleneck

HTTP/3 (RFC 9114) switches from TCP to **QUIC** — a transport-layer protocol over UDP, originally designed by Google.

### The HTTP/2 Problem That HTTP/3 Solves

HTTP/2 eliminated protocol-level head-of-line blocking, but TCP remains a single byte stream. When one packet is lost, **all** HTTP/2 streams stall while TCP performs retransmission. This is TCP head-of-line blocking.

QUIC solves this: each stream is independent, so a lost packet in one stream does not block the others.

### QUIC Advantages

- **0-RTT and 1-RTT handshake**: QUIC combines the transport and TLS handshakes. Resumed connections can use 0-RTT (data is sent with the first packet).
- **Connection Migration**: a connection is identified by its Connection ID, not by the IP:port pair. Switching from Wi-Fi to mobile data does not drop the connection.
- **Built-in encryption**: QUIC always uses TLS 1.3; unencrypted QUIC does not exist.
- **Independent streams**: a lost packet affects only one stream.

```go
// HTTP/3 in Go via quic-go
import (
    "github.com/quic-go/quic-go/http3"
)

srv := &http3.Server{
    Addr:    ":443",
    Handler: mux,
}
log.Fatal(srv.ListenAndServeTLS("cert.pem", "key.pem"))
```

### Version Comparison

| Feature | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---------|----------|--------|--------|
| Transport | TCP | TCP | QUIC (UDP) |
| HoL blocking (protocol) | Yes | No | No |
| HoL blocking (transport) | Yes | Yes | No |
| TLS | Optional | Usually | Mandatory |
| Handshake RTT | 1–3 | 1–3 | 0–1 |
| Go std support | Yes | Yes | No (quic-go) |

## HTTP in Go: Practice

### Server

```go
package main

import (
    "encoding/json"
    "log/slog"
    "net/http"
    "time"
)

type User struct {
    ID   int    `json:"id"`
    Name string `json:"name"`
}

func main() {
    mux := http.NewServeMux()

    // Go 1.22+: method + named path parameters in the pattern
    mux.HandleFunc("GET /users/{id}", func(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        user := User{ID: 1, Name: "Alice"}
        _ = id

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(user)
    })

    srv := &http.Server{
        Addr:         ":8080",
        Handler:      mux,
        ReadTimeout:  5 * time.Second,
        WriteTimeout: 10 * time.Second,
        IdleTimeout:  120 * time.Second,
    }

    slog.Info("starting server", "addr", srv.Addr)
    if err := srv.ListenAndServe(); err != nil {
        slog.Error("server error", "err", err)
    }
}
```

Since Go 1.22, `http.ServeMux` supports named path parameters and HTTP method prefixes directly in the pattern: `"GET /users/{id}"`.

### Client

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

// Create the client once — it is goroutine-safe and reuses connections.
var httpClient = &http.Client{
    Timeout: 10 * time.Second,
    Transport: &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 10,
        IdleConnTimeout:     90 * time.Second,
    },
}

func getUser(ctx context.Context, id int) (*User, error) {
    req, err := http.NewRequestWithContext(ctx, http.MethodGet,
        fmt.Sprintf("https://api.example.com/users/%d", id), nil)
    if err != nil {
        return nil, fmt.Errorf("create request: %w", err)
    }
    req.Header.Set("Accept", "application/json")

    resp, err := httpClient.Do(req)
    if err != nil {
        return nil, fmt.Errorf("do request: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
    }

    var user User
    if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
        return nil, fmt.Errorf("decode response: %w", err)
    }
    return &user, nil
}
```

### Middleware

```go
func logging(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next.ServeHTTP(w, r)
        slog.Info("request",
            "method", r.Method,
            "path", r.URL.Path,
            "duration", time.Since(start),
        )
    })
}

mux.Handle("GET /users/{id}", logging(http.HandlerFunc(getUserHandler)))
```

## Compression and Performance

Enabling gzip compression reduces JSON payload size by 60–80%:

```go
import "compress/gzip"

func gzipMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
            next.ServeHTTP(w, r)
            return
        }
        gz := gzip.NewWriter(w)
        defer gz.Close()
        w.Header().Set("Content-Encoding", "gzip")
        w.Header().Del("Content-Length") // unknown until compressed
        next.ServeHTTP(&gzipResponseWriter{Writer: gz, ResponseWriter: w}, r)
    })
}
```

In practice, a library like `github.com/klauspost/compress/gzhttp` is preferable as it handles all edge cases correctly.

## Common Interview Questions

**What is the difference between POST and PUT?** POST creates a resource and is not idempotent. PUT replaces a resource entirely and is idempotent. PATCH performs a partial update.

**What is CORS and when is it needed?** Cross-Origin Resource Sharing is a browser security mechanism that prevents JavaScript on `a.com` from making requests to `b.com` without explicit permission from `b.com` via `Access-Control-Allow-Origin` headers.

**What is the difference between 401 and 403?** 401 Unauthorized — the user is not authenticated (missing or invalid token). 403 Forbidden — the user is authenticated but lacks permission to access the resource.

**Why does Keep-Alive matter?** Reusing a TCP connection for multiple requests avoids the latency of a new handshake and reduces server resource consumption.

**What is chunked transfer encoding?** A way to send a response body when the total length is not known in advance — for example, when streaming. The body is split into chunks, each prefixed with its size; the final chunk has size 0.

**How does HTTP/2 solve head-of-line blocking?** Stream multiplexing: multiple requests travel over a single TCP connection simultaneously, and responses can arrive in any order. However, a lost TCP packet still stalls all streams — HTTP/3 solves that.
