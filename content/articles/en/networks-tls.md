---
title: TLS
blockId: networks-tls
parentBlockId: networks
---

# TLS

TLS (Transport Layer Security) transforms an unsecured TCP connection into an encrypted channel with peer authentication. For Go developers this means more than `ListenAndServeTLS` — it means understanding certificate chains, mTLS for internal services, and correct `crypto/tls` configuration. This article covers the handshake, PKI, and practical TLS in Go.

## Why TLS Is Necessary

TLS addresses three concerns:
1. **Confidentiality** — data is encrypted; an eavesdropper cannot read the content.
2. **Integrity** — data has not been altered in transit (MAC/AEAD detect any modification).
3. **Authentication** — the client is certain it is talking to the right server (and with mTLS, the server is certain about the client too).

Without TLS: transmitting passwords, tokens, and personal data over plain HTTP is a security disaster. HTTPS is not optional in production.

## Public Key Infrastructure (PKI)

### X.509 Certificates

A certificate is a digital document binding a public key to an identity (domain name, organisation). The X.509 format contains:

- **Subject** — whom it was issued to (CN=example.com, O=Acme Corp).
- **Issuer** — who issued it (the CA).
- **Public Key** — the owner's public key.
- **Validity** — the validity period (Not Before / Not After).
- **Subject Alternative Names (SAN)** — additional domains/IPs.
- **Signature** — the CA's signature confirming authenticity.

### The Chain of Trust

Browsers and Go programs trust a list of **root CAs** (Root Certificate Authorities) — certification authorities whose certificates ship with the operating system. This list includes Comodo, DigiCert, Let's Encrypt ISRG Root, and roughly 100 other organisations.

```
Root CA (self-signed, stored in OS trust store)
    └── Intermediate CA (signed by Root CA)
            └── Server Certificate (signed by Intermediate CA)
```

Why an intermediate CA? The Root CA is stored offline for security. The Intermediate CA is used for day-to-day certificate issuance — compromising it does not require immediately revoking all root trust.

**Chain verification**: the client checks:
1. Server certificate signature → is the Intermediate CA trusted?
2. Intermediate CA signature → is the Root CA trusted?
3. Is the Root CA in the trust store?
4. Is the certificate revoked (OCSP/CRL)?
5. Does CN/SAN match the requested host?
6. Is the certificate still within its validity period?

### Let's Encrypt

[Let's Encrypt](https://letsencrypt.org/) is a free, automated CA run by ISRG. It issues Domain Validated (DV) certificates via the **ACME** protocol (Automated Certificate Management Environment).

Go's `golang.org/x/crypto/acme/autocert` library automates certificate acquisition and renewal:

```go
import "golang.org/x/crypto/acme/autocert"

m := &autocert.Manager{
    Cache:      autocert.DirCache("/var/cache/certs"),
    Prompt:     autocert.AcceptTOS,
    HostPolicy: autocert.HostWhitelist("example.com", "www.example.com"),
}

srv := &http.Server{
    Addr:      ":443",
    Handler:   mux,
    TLSConfig: m.TLSConfig(),
}

// HTTP → HTTPS redirect
go http.ListenAndServe(":80", m.HTTPHandler(nil))
log.Fatal(srv.ListenAndServeTLS("", "")) // empty paths — autocert manages files
```

## TLS Handshake

### TLS 1.2 (Two Round Trips)

```
Client                          Server
  |                               |
  | ---- ClientHello -----------> |  TLS version, cipher suites, random
  |                               |
  | <--- ServerHello ------------ |  Chosen cipher suite, random
  | <--- Certificate ------------ |  Server certificate
  | <--- ServerKeyExchange ------- |  (DH parameters if DHE)
  | <--- ServerHelloDone --------- |
  |                               |
  | ---- ClientKeyExchange ------> |  Pre-master secret (encrypted with pub key)
  | ---- ChangeCipherSpec -------> |  "Switching to encryption"
  | ---- Finished ----------------> |  Hash of entire handshake (encrypted)
  |                               |
  | <--- ChangeCipherSpec --------- |
  | <--- Finished ----------------- |
  |                               |
  |======== Encrypted Data ========|  2 RTT before data
```

### TLS 1.3 (One Round Trip)

TLS 1.3 (RFC 8446, 2018) significantly simplifies the handshake:

```
Client                          Server
  |                               |
  | ---- ClientHello + key_share -> |  TLS 1.3, DH public key, supported groups
  |                               |
  | <--- ServerHello + key_share -- |  Chosen DH group, server public key
  | <--- {Certificate} ------------ |  (encrypted)
  | <--- {CertificateVerify} ------- |
  | <--- {Finished} ---------------- |
  |                               |
  | ---- {Finished} --------------> |
  |                               |
  |======== Encrypted Data ========|  1 RTT before data
```

Key improvements in TLS 1.3:
- **1-RTT** (vs 2-RTT in TLS 1.2) — faster.
- **0-RTT resumption** — on session resumption, data is sent with the first packet (with replay attack risk; requires idempotent endpoints).
- **Forward secrecy is mandatory** — only (EC)DHE key exchange, no RSA. Compromising the long-term private key does not expose past sessions.
- **Weak ciphers removed** — no RC4, DES, 3DES, MD5, SHA-1.
- **AEAD only** — AES-GCM, ChaCha20-Poly1305.

### Cipher Suites

TLS 1.3 supports only 3 cipher suites:
- `TLS_AES_128_GCM_SHA256`
- `TLS_AES_256_GCM_SHA384`
- `TLS_CHACHA20_POLY1305_SHA256`

TLS 1.2 supports hundreds of combinations (including insecure ones). Recommendation: if using TLS 1.2, permit only `TLS_ECDHE_*_WITH_AES_*_GCM_SHA*`.

## crypto/tls in Go

### HTTPS Server

```go
package main

import (
    "crypto/tls"
    "log/slog"
    "net/http"
    "time"
)

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("Hello, TLS!"))
    })

    tlsCfg := &tls.Config{
        MinVersion: tls.VersionTLS12,
        CurvePreferences: []tls.CurveID{
            tls.X25519,
            tls.CurveP256,
        },
        CipherSuites: []uint16{
            // TLS 1.2 — secure suites only
            tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
            tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
            tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,
            tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256,
        },
    }

    srv := &http.Server{
        Addr:         ":443",
        Handler:      mux,
        TLSConfig:    tlsCfg,
        ReadTimeout:  5 * time.Second,
        WriteTimeout: 10 * time.Second,
    }

    slog.Info("starting HTTPS server", "addr", srv.Addr)
    log.Fatal(srv.ListenAndServeTLS("cert.pem", "key.pem"))
}
```

### HTTPS Client with a Custom CA

```go
import (
    "crypto/tls"
    "crypto/x509"
    "os"
    "net/http"
)

func newHTTPSClient(caFile string) (*http.Client, error) {
    caCert, err := os.ReadFile(caFile)
    if err != nil {
        return nil, fmt.Errorf("read CA cert: %w", err)
    }

    pool := x509.NewCertPool()
    if !pool.AppendCertsFromPEM(caCert) {
        return nil, fmt.Errorf("invalid CA cert")
    }

    return &http.Client{
        Transport: &http.Transport{
            TLSClientConfig: &tls.Config{
                RootCAs:    pool,
                MinVersion: tls.VersionTLS12,
            },
        },
        Timeout: 10 * time.Second,
    }, nil
}
```

## mTLS: Mutual Authentication

Standard TLS authenticates only the server. **mTLS (Mutual TLS)** requires the server to verify the client's certificate as well. This is standard for:
- Service meshes (Istio, Linkerd).
- Internal microservice APIs.
- Zero-trust networks.
- Partner (B2B) APIs.

### mTLS Server

```go
import (
    "crypto/tls"
    "crypto/x509"
    "net/http"
    "os"
)

func newMTLSServer(certFile, keyFile, clientCAFile string) (*http.Server, error) {
    // Load the CA used to verify client certificates
    clientCACert, err := os.ReadFile(clientCAFile)
    if err != nil {
        return nil, fmt.Errorf("read client CA: %w", err)
    }
    clientCAPool := x509.NewCertPool()
    if !clientCAPool.AppendCertsFromPEM(clientCACert) {
        return nil, fmt.Errorf("invalid client CA cert")
    }

    // Load the server certificate
    serverCert, err := tls.LoadX509KeyPair(certFile, keyFile)
    if err != nil {
        return nil, fmt.Errorf("load server cert: %w", err)
    }

    tlsCfg := &tls.Config{
        Certificates: []tls.Certificate{serverCert},
        ClientAuth:   tls.RequireAndVerifyClientCert, // mandatory client verification
        ClientCAs:    clientCAPool,
        MinVersion:   tls.VersionTLS13,
    }

    return &http.Server{
        Addr:      ":443",
        TLSConfig: tlsCfg,
    }, nil
}
```

### mTLS Client

```go
func newMTLSClient(clientCertFile, clientKeyFile, serverCAFile string) (*http.Client, error) {
    // Client certificate for authenticating to the server
    clientCert, err := tls.LoadX509KeyPair(clientCertFile, clientKeyFile)
    if err != nil {
        return nil, fmt.Errorf("load client cert: %w", err)
    }

    // Server CA for verifying the server
    serverCA, err := os.ReadFile(serverCAFile)
    if err != nil {
        return nil, fmt.Errorf("read server CA: %w", err)
    }
    serverCAPool := x509.NewCertPool()
    serverCAPool.AppendCertsFromPEM(serverCA)

    return &http.Client{
        Transport: &http.Transport{
            TLSClientConfig: &tls.Config{
                Certificates: []tls.Certificate{clientCert}, // present client certificate
                RootCAs:      serverCAPool,
                MinVersion:   tls.VersionTLS13,
            },
        },
        Timeout: 10 * time.Second,
    }, nil
}
```

### Reading TLS Info in a Handler

```go
mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
    if r.TLS != nil && len(r.TLS.PeerCertificates) > 0 {
        clientCert := r.TLS.PeerCertificates[0]
        slog.Info("authenticated client",
            "subject", clientCert.Subject.CommonName,
            "issuer", clientCert.Issuer.CommonName,
        )
    }
})
```

## Certificate Pinning

**Certificate Pinning** — the client accepts only a specific certificate (or its public key), ignoring the system trust store. Used for high-security mobile applications.

```go
func newPinnedClient(expectedFingerprint [32]byte) *http.Client {
    return &http.Client{
        Transport: &http.Transport{
            TLSClientConfig: &tls.Config{
                VerifyConnection: func(cs tls.ConnectionState) error {
                    if len(cs.PeerCertificates) == 0 {
                        return fmt.Errorf("no server certificate")
                    }
                    cert := cs.PeerCertificates[0]
                    // SHA-256 fingerprint of the public key
                    fingerprint := sha256.Sum256(cert.RawSubjectPublicKeyInfo)
                    if fingerprint != expectedFingerprint {
                        return fmt.Errorf("certificate fingerprint mismatch")
                    }
                    return nil
                },
            },
        },
    }
}
```

**Pinning drawback**: rotating the certificate requires updating all client applications. For web services, a sound PKI infrastructure is usually preferable to pinning.

## Self-Signed Certificates and Internal CAs

For local development and internal services, it is convenient to run your own CA. The `mkcert` tool automates this:

```bash
# Install and create a local CA
brew install mkcert
mkcert -install

# Create a certificate for localhost
mkcert localhost 127.0.0.1 ::1
```

For production internal PKI: `cfssl` (CloudFlare), `step-ca` (Smallstep), or HashiCorp Vault's PKI secrets engine.

### Generating a Certificate in Go

```go
import (
    "crypto/ecdsa"
    "crypto/elliptic"
    "crypto/rand"
    "crypto/x509"
    "crypto/x509/pkix"
    "encoding/pem"
    "math/big"
    "os"
    "time"
)

func generateSelfSignedCert(certFile, keyFile string) error {
    key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
    if err != nil {
        return err
    }

    template := x509.Certificate{
        SerialNumber: big.NewInt(1),
        Subject:      pkix.Name{CommonName: "localhost"},
        NotBefore:    time.Now(),
        NotAfter:     time.Now().Add(365 * 24 * time.Hour),
        KeyUsage:     x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
        ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
        IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
        DNSNames:     []string{"localhost"},
    }

    certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
    if err != nil {
        return err
    }

    certOut, _ := os.Create(certFile)
    pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: certDER})
    certOut.Close()

    keyOut, _ := os.Create(keyFile)
    keyDER, _ := x509.MarshalECPrivateKey(key)
    pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})
    keyOut.Close()

    return nil
}
```

## Common Interview Questions

**`InsecureSkipVerify: true` in production.** This disables certificate verification. Any man-in-the-middle can present a forged certificate. Acceptable only in tests, never in production.

**Certificates not being renewed.** Let's Encrypt issues certificates valid for 90 days. Automatic renewal via `autocert` or `cron + certbot` is mandatory.

**What is forward secrecy?** The property whereby compromising the server's long-term private key does not expose previously recorded traffic sessions. Achieved by using ephemeral DH keys (DHE/ECDHE) per session. TLS 1.3 mandates forward secrecy.

**What is the difference between TLS 1.2 and TLS 1.3?** TLS 1.3 has a 1-RTT handshake (vs 2-RTT), mandatory forward secrecy, AEAD-only ciphers, no weak algorithms, and 0-RTT session resumption.

**What is OCSP stapling?** A mechanism by which the server itself queries its certificate's revocation status from the CA and attaches the signed response to the TLS handshake. The client does not need a separate OCSP round trip, reducing latency.

**How does SNI work?** Server Name Indication is a TLS extension that lets the client send the hostname at the start of the handshake (before encryption). The server can then select the correct certificate for that host. This enables multiple HTTPS domains on a single IP address. In Go, `tls.Config.GetCertificate` allows dynamic certificate selection by SNI.
