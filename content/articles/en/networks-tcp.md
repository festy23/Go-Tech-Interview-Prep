---
title: TCP/IP
blockId: networks-tcp
parentBlockId: networks
---

# TCP/IP

TCP/IP is the foundation the internet runs on. For Go developers this is not abstract theory: every `http.Client` and every `net.Dial` creates a TCP connection. Understanding the handshake, TIME_WAIT, Nagle's algorithm, and congestion control directly affects service performance and reliability. This article works up from the OSI model to specific Go configuration.

## The OSI Model and Where Go Fits

The OSI model (7 layers) is a conceptual framework for understanding network protocols. Four layers are relevant to Go developers:

| Layer | Number | Protocols | Go abstraction |
|-------|--------|-----------|----------------|
| Application | 7 | HTTP, gRPC, DNS | `net/http`, `google.golang.org/grpc` |
| Transport | 4 | TCP, UDP | `net.Conn`, `net.PacketConn` |
| Network | 3 | IP, ICMP | `net.IP` |
| Data Link | 2 | Ethernet, Wi-Fi | Not directly accessible from Go |

The `net` package operates at layers 3–4. `net/http` operates at layer 7 over TCP. Knowing which layer a problem lives on (DNS error? packet loss? application bug?) is a key diagnostic skill.

## TCP: Reliable Delivery

TCP (Transmission Control Protocol) provides:
- **Reliability**: lost packets are retransmitted.
- **Ordering**: bytes are delivered in the order they were sent.
- **Flow control**: the receiver advertises its buffer capacity (window size).
- **Congestion control**: the sender adapts to network capacity.

The cost is latency. Every segment requires an acknowledgement (ACK). Connection setup takes one RTT for the handshake.

## TCP Three-Way Handshake

Establishing a TCP connection requires a **three-way handshake**:

```
Client                      Server
  |                            |
  |------- SYN (seq=x) ------->|  Client wants to connect
  |                            |
  |<-- SYN-ACK (seq=y,ack=x+1)-|  Server acknowledges, sends its seq
  |                            |
  |------- ACK (ack=y+1) ----->|  Client acknowledges server
  |                            |
  |========= Data =============|  Connection established
```

**SYN (Synchronize)**: the client picks an Initial Sequence Number (ISN) — a random number for security — and sends it to the server.

**SYN-ACK**: the server acknowledges the client's ISN (`ack = x + 1`) and sends its own ISN (`seq = y`).

**ACK**: the client acknowledges the server's ISN (`ack = y + 1`). Connection is established.

Total: **1 RTT** before data can flow. At high latencies (intercontinental) this is significant — which is why TLS 1.3 optimises the handshake and HTTP/2 multiplexes requests over a single connection.

### What Interviewers Ask

A typical question: "What happens if a SYN packet is dropped?" — the client retries SYN with exponential backoff (1 s, 2 s, 4 s…) until the connection times out.

## Connection Teardown and TIME_WAIT

A TCP connection is closed via a **four-way exchange**:

```
Client                      Server
  |                            |
  |--------- FIN ------------->|  Client is done sending
  |<-------- ACK --------------|  Server acknowledges
  |                            |  (server may still send data)
  |<-------- FIN --------------|  Server is done sending
  |--------- ACK ------------->|  Client acknowledges
  |                            |
[TIME_WAIT: 2*MSL]              |  Connection closed
```

### TIME_WAIT

After sending the final ACK, the connection initiator enters the `TIME_WAIT` state for **2×MSL** (Maximum Segment Lifetime, typically 60 seconds).

Why? Two reasons:
1. The last ACK might be lost → the server will retransmit FIN → the client must still be alive to respond.
2. "Wandering" packets from the old connection must not be interpreted as data for a new connection with the same addresses and ports.

### The TIME_WAIT Problem

Under high load (load testing, HTTP client without keep-alive), a single machine creates thousands of connections. After closing, each occupies a port for 60 seconds. Linux has ~28 000 ephemeral ports (the `ip_local_port_range`). When exhausted, new connections cannot be established.

```bash
# Diagnose
ss -s | grep TIME-WAIT

# Distribution of connection states
ss -tan | awk '{print $1}' | sort | uniq -c | sort -rn
```

**Solutions**:
- Enable keep-alive: reuse connections instead of constantly opening and closing them.
- `net.ipv4.tcp_tw_reuse = 1`: allow TIME_WAIT sockets to be reused for outgoing connections (safe).
- `SO_LINGER` with timeout=0: immediate RST instead of FIN (unsafe for production applications, testing only).

## Nagle's Algorithm

**Nagle's Algorithm** reduces packet count by coalescing small writes:

> While there is unacknowledged data in flight, do not send a small packet — wait until MSS bytes have accumulated or all outstanding ACKs have been received.

MSS (Maximum Segment Size) is typically 1460 bytes for Ethernet (MTU 1500 − 20 IP − 20 TCP).

**When it helps**: for bulk transfers (large files) it reduces the overhead from tiny packets.

**When it hurts**: for interactive protocols (SSH, databases) even a few milliseconds of delay is noticeable. For example, sending 3 bytes without Nagle goes immediately; with Nagle, those bytes are buffered until the previous ACK arrives.

### Disabling in Go

```go
conn, err := net.Dial("tcp", "localhost:5432")
if err != nil {
    return err
}
tcpConn := conn.(*net.TCPConn)
tcpConn.SetNoDelay(true) // TCP_NODELAY — disables Nagle's algorithm
```

Go's `http.Transport` sets `TCP_NODELAY` by default. For most Go services no action is needed.

## TCP Window and Flow Control

TCP uses a **sliding window** for flow control:

- **Receive window (rwnd)**: the receiver advertises how many bytes it can buffer.
- The sender cannot transmit more than `min(cwnd, rwnd)` unacknowledged bytes.
- When the buffer is full, the receiver shrinks `rwnd` down to 0 (zero window) — the sender pauses.

```
Seq: 1000        1500        2000        2500
     [data1      ][data2     ][data3     ]
     |------- window = 1500 bytes -------|
     ^                                   ^
  last ACK                    last ACK + rwnd
```

**Window scaling** (RFC 1323): allows the window to grow up to 1 GB. Without it the maximum is 65 535 bytes, which at 100 ms RTT gives only ~5 Mbit/s throughput.

## Congestion Control

Unlike flow control (which tracks the receiver's buffer), **congestion control** regulates load on the network itself.

The sender maintains a **congestion window (cwnd)** — the number of bytes it can send without receiving an ACK.

### Phases

**Slow Start**: begin with cwnd = 1 MSS. After each ACK, cwnd doubles (exponential growth). Continues until the `ssthresh` threshold or a packet loss event.

```
Round 1: cwnd = 1 MSS  → 1 packet
Round 2: cwnd = 2 MSS  → 2 packets
Round 3: cwnd = 4 MSS  → 4 packets
Round 4: cwnd = 8 MSS  → 8 packets
... until ssthresh or loss
```

**Congestion Avoidance**: once cwnd reaches `ssthresh`, it grows linearly (+1 MSS per RTT).

**Fast Retransmit**: on receiving 3 duplicate ACKs (packet lost but later packets arrived), retransmit the lost segment immediately without waiting for a timeout.

**Fast Recovery**: after fast retransmit, `cwnd = ssthresh + 3 MSS` — does not reset to 1 as on timeout.

### Algorithms

- **CUBIC**: the Linux default. cwnd growth follows a cubic function of time since the last loss event.
- **BBR** (Bottleneck Bandwidth and RTT): Google's algorithm. Models actual bandwidth and RTT rather than reacting to individual packet loss events.

For high-bandwidth internet links, BBR significantly outperforms CUBIC.

## UDP vs TCP

| Feature | TCP | UDP |
|---------|-----|-----|
| Reliability | Guaranteed | None |
| Ordering | Guaranteed | None |
| Connection setup | 3-way handshake | None |
| Flow control | Yes | No |
| Congestion control | Yes | No |
| Overhead | High | Minimal |
| Latency | Higher | Lower |
| Use cases | HTTP, SMTP, FTP | DNS, VoIP, gaming, QUIC |

**When UDP makes sense**: applications where stale data is worse than lost data (video streaming, VoIP), or where you implement your own reliability layer (QUIC, DTLS).

**TCP in Go**: all of `net/http` uses TCP. `net.Listen("tcp", ":8080")`, `net.Dial("tcp", ...)`.

**UDP in Go**: `net.ListenPacket("udp", ":53")`, `net.Dial("udp", "8.8.8.8:53")`.

## TCP in Go: Practice

### Basic TCP Server

```go
package main

import (
    "bufio"
    "fmt"
    "log/slog"
    "net"
)

func main() {
    ln, err := net.Listen("tcp", ":8080")
    if err != nil {
        slog.Error("listen failed", "err", err)
        return
    }
    defer ln.Close()

    slog.Info("listening", "addr", ln.Addr())

    for {
        conn, err := ln.Accept()
        if err != nil {
            slog.Error("accept failed", "err", err)
            continue
        }
        go handleConn(conn)
    }
}

func handleConn(conn net.Conn) {
    defer conn.Close()

    scanner := bufio.NewScanner(conn)
    for scanner.Scan() {
        line := scanner.Text()
        fmt.Fprintf(conn, "echo: %s\n", line)
    }
    if err := scanner.Err(); err != nil {
        slog.Error("scan error", "err", err)
    }
}
```

### Timeouts on a TCP Connection

```go
conn, err := net.DialTimeout("tcp", "example.com:80", 5*time.Second)
if err != nil {
    return err
}

// Absolute deadline for both reads and writes
conn.SetDeadline(time.Now().Add(10 * time.Second))

// Read-only deadline
conn.SetReadDeadline(time.Now().Add(5 * time.Second))

// Write-only deadline
conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
```

Important: deadlines are absolute timestamps, not durations. Set the deadline before each read/write operation, not once at connection creation.

### Keep-Alive in Go

```go
dialer := &net.Dialer{
    Timeout:   30 * time.Second,
    KeepAlive: 30 * time.Second, // sends TCP keep-alives every 30 s
}

conn, err := dialer.DialContext(ctx, "tcp", "example.com:80")
```

`http.Transport` enables keep-alive with a 15-second interval by default.

### TCP Diagnostics on Linux

```bash
# All TCP connections of a Go process (PID 12345)
ss -tnp | grep pid=12345

# Retransmit and error counters
netstat -s | grep -E "retransmit|failed"

# Packet capture on port 8080
tcpdump -i any -n 'port 8080' -w dump.pcap

# Inspect the capture
tcpdump -r dump.pcap -A

# TIME_WAIT count
ss -s | head -5
```

## Common Interview Questions

**Why does TIME_WAIT last 2×MSL?** MSL is the maximum lifetime of a segment in the network (typically 30 or 60 seconds). 2×MSL guarantees that all "wandering" packets from the old connection expire before a new connection with the same parameters is created.

**What is a SYN flood?** An attack in which the attacker sends many SYN packets without completing the handshake. The server stores half-open connections in a backlog queue. The countermeasure is SYN cookies: the server encodes state into the sequence number and stores no per-connection state until the ACK arrives.

**How is TCP different from UDP?** TCP guarantees reliability, ordering, and congestion control at the cost of latency and overhead. UDP provides no guarantees and minimal overhead. UDP is used where latency is critical or where the application implements its own reliability (QUIC, DNS, VoIP).

**What is Nagle's algorithm and when should it be disabled?** It coalesces small writes to reduce overhead. Disable it via `TCP_NODELAY` for interactive protocols where latency matters: databases, SSH, game servers.

**What happens when the receive buffer fills?** The receiver sets rwnd = 0 (zero window). The sender stops and periodically sends window probes until the receiver frees buffer space.

**How does fast retransmit work?** On receiving 3 duplicate ACKs — one packet was lost but subsequent ones arrived. Instead of waiting for a timeout, the sender immediately retransmits the missing segment.
