---
title: Networks and Linux
blockId: networks
parentBlockId: null
---

# Networks and Linux

Networking and basic Linux knowledge are examined in virtually every backend Go interview. HTTP servers, gRPC clients, TLS handshakes, and diagnosing latency with `ss` and `tcpdump` — all of this requires understanding the network stack. Go makes networking convenient, but only when you understand what is happening underneath.

## Why It Matters for Go Developers

Go was designed from the ground up for networked services. The `net/http` package from the standard library manages connection pooling, keep-alive, TLS, and HTTP/2 transparently. But "transparently" does not mean "without configuration": a misconfigured `http.Transport`, a forgotten `resp.Body.Close()`, or a missing timeout will turn your service into a source of production incidents under load.

Interview questions on networking appear in three formats:
1. **Theory** — "What happens when you type a URL into a browser?", "Why does TIME_WAIT exist?", "What is the difference between HTTP/2 and HTTP/3?"
2. **Diagnostics** — "How would you find a connection leak?", "What does `netstat -s` show?"
3. **Implementation** — "Write an HTTPS server with mutual authentication (mTLS)", "Implement retry with exponential backoff".

Understanding all four layers of this section — HTTP, TCP/IP, TLS, and API design — gives you the vocabulary to handle any of these confidently.

## HTTP: The Application-Layer Protocol

HTTP is the primary protocol for web services. The ability to distinguish between versions is expected:

- **HTTP/1.1** — text-based protocol; one connection processes one request at a time (no pipelining in practice). Head-of-line blocking at the protocol level.
- **HTTP/2** — binary framing, multiplexing multiple streams over a single TCP connection, HPACK header compression, server push.
- **HTTP/3** — runs over QUIC (UDP), eliminates TCP's head-of-line blocking, encryption is built in.

In Go, switching between HTTP/1.1 and HTTP/2 is automatic when using `net/http` with TLS. HTTP/3 requires a third-party library such as `quic-go`.

```go
// HTTP/2 is enabled automatically when TLS is present
srv := &http.Server{
    Addr:         ":443",
    Handler:      mux,
    ReadTimeout:  5 * time.Second,
    WriteTimeout: 10 * time.Second,
    IdleTimeout:  120 * time.Second,
}
log.Fatal(srv.ListenAndServeTLS("cert.pem", "key.pem"))
```

For deeper coverage, see the **HTTP** article.

## TCP/IP: The Transport Layer

TCP guarantees delivery and ordering of bytes. Several mechanisms are critical for Go services:

**3-way handshake**: SYN → SYN-ACK → ACK. Each new connection adds an RTT to latency — which is why keep-alive and connection pooling matter.

**TIME_WAIT**: after a connection closes, the port remains in this state for ~60 seconds (2×MSL). Closing many connections rapidly from a single host (e.g., a load test) can exhaust ephemeral ports. Solutions include enabling `SO_REUSEPORT` or using keep-alive.

**Nagle's algorithm**: coalesces small packets into one, reducing overhead. This increases latency for interactive protocols — disable via `TCP_NODELAY`.

**Congestion control**: algorithms like CUBIC and BBR manage the congestion window. Understanding slow start explains why the first requests to a service are slower than subsequent ones.

For deeper coverage, see the **TCP/IP** article.

## TLS: Transport Security

TLS encrypts connections and authenticates parties. In Go this is the `crypto/tls` package — one of the most carefully designed in the standard library.

Key concepts:
- **Certificate chain**: root CA → intermediate CA → server certificate. The browser/client trusts root CAs.
- **TLS 1.3**: simplified handshake (1-RTT instead of 2-RTT), AEAD-only ciphers, no RSA key exchange.
- **mTLS**: mutual authentication — the server also verifies the client's certificate. The standard for internal microservices.

```go
tlsCfg := new(tls.Config{
    MinVersion: tls.VersionTLS13,
    ClientAuth: tls.RequireAndVerifyClientCert,
    ClientCAs:  certPool,
})
```

For deeper coverage, see the **TLS** article.

## API Design

The choice of API protocol affects performance, client ergonomics, and operational overhead.

- **REST** — HTTP + JSON, maximum compatibility, easy to debug with curl.
- **gRPC** — Protocol Buffers + HTTP/2, strong typing, streaming, code generation. Ideal for internal services.
- **GraphQL** — the client requests exactly the fields it needs, single endpoint. Convenient for complex UI queries.

For a public API with browser clients — REST. For high-performance internal service meshes — gRPC. For flexible frontend queries — GraphQL.

For deeper coverage, see the **API Design** article.

## Common Mistakes Interviewers Look For

**1. Missing timeouts.** `http.DefaultClient` has no timeout. A hung partner service will block a goroutine indefinitely.

```go
// Bad
resp, err := http.Get(url)

// Good
client := &http.Client{Timeout: 10 * time.Second}
resp, err := client.Get(url)
```

**2. Unclosed `resp.Body`.** The connection will not be returned to the pool, causing a leak.

```go
resp, err := client.Get(url)
if err != nil {
    return err
}
defer resp.Body.Close() // required
```

**3. Ignoring the response status code.** HTTP 200 OK is not "success" for all APIs. Always check `resp.StatusCode`.

**4. Creating `*http.Client` as a local variable.** Each call creates a new Transport and does not reuse connections. `http.Client` should be a singleton or a struct field.

**5. Disabling TLS verification.** `InsecureSkipVerify: true` in production code is a common code-review finding. Never disable certificate verification in production.

## Linux Tools for Diagnostics

Go developers deploy services on Linux, so basic fluency with network utilities is an expected skill:

| Command | What it shows |
|---------|---------------|
| `ss -tnp` | TCP connections + owning processes |
| `ss -s` | summary statistics (TIME_WAIT count, etc.) |
| `netstat -s` | TCP/IP error counters |
| `tcpdump -i any port 8080` | packet capture |
| `curl -v --http2` | HTTP/2 negotiation |
| `openssl s_client -connect host:443` | manual TLS handshake |
| `strace -e trace=network` | network system calls |

## What's Next

This article is a high-level overview. Each topic is covered in depth in a dedicated article:

- **HTTP** — protocol versions, message structure, keep-alive, multiplexing, HPACK.
- **TCP/IP** — handshake, TIME_WAIT, Nagle, congestion control, the OSI model.
- **TLS** — handshake, certificates, mTLS, `crypto/tls` in Go, Let's Encrypt.
- **API Design** — REST, gRPC, GraphQL, protobuf, versioning, pagination.

Recommended learning order: TCP/IP → HTTP → TLS → API Design. Understanding the lower layers makes the upper ones obvious.
