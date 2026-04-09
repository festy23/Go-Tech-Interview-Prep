---
title: TLS
blockId: networks-tls
parentBlockId: networks
---

# TLS

TLS (Transport Layer Security) — протокол, который превращает небезопасное TCP-соединение в зашифрованный канал с аутентификацией сторон. Для Go-разработчика это не только `ListenAndServeTLS` — это понимание цепочки доверия сертификатов, mTLS для внутренних сервисов и правильная конфигурация `crypto/tls`. Разбираем рукопожатие, PKI и практику применения в Go.

## Зачем нужен TLS

TLS решает три задачи:
1. **Конфиденциальность** — данные зашифрованы, перехватчик не прочитает содержимое.
2. **Целостность** — данные не изменены в пути (MAC/AEAD обнаружат любое изменение).
3. **Аутентификация** — клиент уверен, что говорит с правильным сервером (а при mTLS — и сервер уверен в клиенте).

Без TLS: передача паролей, токенов, персональных данных по незашифрованному HTTP — это катастрофа безопасности. Поэтому HTTPS — не опция для production, а требование.

## Инфраструктура открытых ключей (PKI)

### Сертификаты X.509

Сертификат — цифровой документ, связывающий публичный ключ с идентификатором (доменным именем, организацией). Формат X.509 содержит:

- **Subject** — кому выдан (CN=example.com, O=Acme Corp).
- **Issuer** — кто выдал (CA).
- **Public Key** — открытый ключ владельца.
- **Validity** — срок действия (Not Before / Not After).
- **Subject Alternative Names (SAN)** — дополнительные домены/IP.
- **Signature** — подпись CA, подтверждающая подлинность.

### Цепочка доверия

Браузеры и Go-программы доверяют списку **корневых CA** (Root Certificate Authorities) — центров сертификации, чьи сертификаты поставляются с ОС. Это Comodo, DigiCert, Let's Encrypt ISRG Root и ещё ~100 организаций.

```
Root CA (самоподписанный, хранится в ОС)
    └── Intermediate CA (подписан Root CA)
            └── Server Certificate (подписан Intermediate CA)
```

Зачем промежуточный CA? Root CA хранится оффлайн для безопасности. Intermediate CA используется для выдачи сертификатов — его компрометация не требует немедленного отзыва всех Root-доверий.

**Верификация цепочки**: клиент проверяет:
1. Подпись сертификата сервера → доверяет Intermediate CA?
2. Подпись Intermediate CA → доверяет Root CA?
3. Root CA в trusted store?
4. Сертификат не отозван (OCSP/CRL)?
5. CN/SAN совпадает с хостом запроса?
6. Срок действия не истёк?

### Let's Encrypt

[Let's Encrypt](https://letsencrypt.org/) — бесплатный автоматизированный CA от ISRG. Выдаёт Domain Validated (DV) сертификаты через протокол **ACME** (Automated Certificate Management Environment).

В Go библиотека `golang.org/x/crypto/acme/autocert` автоматизирует получение и обновление:

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

// Перенаправление HTTP → HTTPS
go http.ListenAndServe(":80", m.HTTPHandler(nil))
log.Fatal(srv.ListenAndServeTLS("", "")) // пустые пути — autocert управляет файлами
```

## TLS Handshake

### TLS 1.2 (два RTT)

```
Client                          Server
  |                               |
  | ---- ClientHello -----------> |  TLS версия, cipher suites, random
  |                               |
  | <--- ServerHello ------------ |  Выбранный cipher suite, random
  | <--- Certificate ------------ |  Сертификат сервера
  | <--- ServerKeyExchange ------- |  (DH параметры, если DHE)
  | <--- ServerHelloDone --------- |
  |                               |
  | ---- ClientKeyExchange ------> |  Pre-master secret (зашифр. публ. ключом)
  | ---- ChangeCipherSpec -------> |  "Переключаемся на шифрование"
  | ---- Finished ----------------> |  Хэш всего handshake (зашифрован)
  |                               |
  | <--- ChangeCipherSpec --------- |
  | <--- Finished ----------------- |
  |                               |
  |======== Зашифрованные данные ==|  2 RTT до данных
```

### TLS 1.3 (один RTT)

TLS 1.3 (RFC 8446, 2018) значительно упрощает рукопожатие:

```
Client                          Server
  |                               |
  | ---- ClientHello + key_share -> |  TLS 1.3, DH public key, supported groups
  |                               |
  | <--- ServerHello + key_share -- |  Выбранный DH, server public key
  | <--- {Certificate} ------------ |  (зашифровано)
  | <--- {CertificateVerify} ------- |
  | <--- {Finished} ---------------- |
  |                               |
  | ---- {Finished} --------------> |
  |                               |
  |======== Зашифрованные данные ==|  1 RTT до данных
```

Ключевые улучшения TLS 1.3:
- **1-RTT** (вместо 2-RTT в TLS 1.2) — быстрее.
- **0-RTT resumption** — при возобновлении сессии данные отправляются с первым пакетом (с риском replay-атак, нужна идемпотентность).
- **Forward Secrecy** обязательна — только (EC)DHE key exchange, не RSA. Компрометация долгосрочного ключа не раскрывает прошлые сессии.
- **Убраны слабые шифры** — нет RC4, DES, 3DES, MD5, SHA-1.
- **Только AEAD** — AES-GCM, ChaCha20-Poly1305.

### Cipher Suites

TLS 1.3 поддерживает только 3 cipher suite:
- `TLS_AES_128_GCM_SHA256`
- `TLS_AES_256_GCM_SHA384`
- `TLS_CHACHA20_POLY1305_SHA256`

TLS 1.2 поддерживает сотни комбинаций (включая небезопасные). Рекомендация: при использовании TLS 1.2 разрешать только `TLS_ECDHE_*_WITH_AES_*_GCM_SHA*`.

## crypto/tls в Go

### HTTPS-сервер

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
            // TLS 1.2 — только безопасные
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

### HTTPS-клиент с кастомным CA

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

## mTLS: взаимная аутентификация

Стандартный TLS аутентифицирует только сервер. **mTLS (Mutual TLS)** — сервер также проверяет сертификат клиента. Это стандарт для:
- Service mesh (Istio, Linkerd).
- Internal microservices APIs.
- Zero-trust сетей.
- API для партнёров (B2B).

### mTLS-сервер

```go
import (
    "crypto/tls"
    "crypto/x509"
    "net/http"
    "os"
)

func newMTLSServer(certFile, keyFile, clientCAFile string) (*http.Server, error) {
    // Загружаем CA для верификации клиентских сертификатов
    clientCACert, err := os.ReadFile(clientCAFile)
    if err != nil {
        return nil, fmt.Errorf("read client CA: %w", err)
    }
    clientCAPool := x509.NewCertPool()
    if !clientCAPool.AppendCertsFromPEM(clientCACert) {
        return nil, fmt.Errorf("invalid client CA cert")
    }

    // Загружаем серверный сертификат
    serverCert, err := tls.LoadX509KeyPair(certFile, keyFile)
    if err != nil {
        return nil, fmt.Errorf("load server cert: %w", err)
    }

    tlsCfg := &tls.Config{
        Certificates: []tls.Certificate{serverCert},
        ClientAuth:   tls.RequireAndVerifyClientCert, // обязательная верификация клиента
        ClientCAs:    clientCAPool,
        MinVersion:   tls.VersionTLS13,
    }

    return &http.Server{
        Addr:      ":443",
        TLSConfig: tlsCfg,
    }, nil
}
```

### mTLS-клиент

```go
func newMTLSClient(clientCertFile, clientKeyFile, serverCAFile string) (*http.Client, error) {
    // Клиентский сертификат для аутентификации на сервере
    clientCert, err := tls.LoadX509KeyPair(clientCertFile, clientKeyFile)
    if err != nil {
        return nil, fmt.Errorf("load client cert: %w", err)
    }

    // Серверный CA для верификации сервера
    serverCA, err := os.ReadFile(serverCAFile)
    if err != nil {
        return nil, fmt.Errorf("read server CA: %w", err)
    }
    serverCAPool := x509.NewCertPool()
    serverCAPool.AppendCertsFromPEM(serverCA)

    return &http.Client{
        Transport: &http.Transport{
            TLSClientConfig: &tls.Config{
                Certificates: []tls.Certificate{clientCert}, // предъявляем клиентский сертификат
                RootCAs:      serverCAPool,
                MinVersion:   tls.VersionTLS13,
            },
        },
        Timeout: 10 * time.Second,
    }, nil
}
```

### Получение информации о TLS в обработчике

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

**Certificate Pinning** — клиент принимает только конкретный сертификат (или его публичный ключ), игнорируя системный trust store. Используется для высокозащищённых мобильных приложений.

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
                    // SHA-256 fingerprint публичного ключа
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

**Недостаток pinning**: при ротации сертификата нужно обновлять все клиентские приложения. Для веб-сервисов обычно предпочитают правильную PKI-инфраструктуру вместо pinning.

## Самоподписанные сертификаты и internal CA

Для локальной разработки и internal сервисов удобно использовать собственный CA. Инструмент `mkcert` автоматизирует это:

```bash
# Установка и создание локального CA
brew install mkcert
mkcert -install

# Создание сертификата для localhost
mkcert localhost 127.0.0.1 ::1
```

Для production internal PKI: `cfssl` (CloudFlare), `step-ca` (Smallstep) или Vault PKI secrets engine.

### Генерация сертификата в Go

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

## Типичные ошибки и вопросы на собеседованиях

**`InsecureSkipVerify: true` в продакшне.** Это отключает верификацию сертификата. Любой MitM может подсунуть фальшивый сертификат. Допустимо только в тестах, никогда в продакшне.

**Не обновляются сертификаты.** Let's Encrypt выдаёт сертификаты на 90 дней. Автоматическое обновление через `autocert` или cron + `certbot` — обязательно.

**Что такое forward secrecy?** Свойство, при котором компрометация долгосрочного ключа сервера не раскрывает ранее записанный трафик. Достигается использованием ephemeral DH-ключей (DHE/ECDHE) для каждой сессии. TLS 1.3 обеспечивает forward secrecy обязательно.

**В чём разница между TLS 1.2 и TLS 1.3?** TLS 1.3 — 1 RTT handshake (vs 2 RTT), обязательный forward secrecy, только AEAD, убраны слабые алгоритмы, поддержка 0-RTT.

**Что такое OCSP stapling?** Механизм, при котором сервер сам запрашивает статус отзыва своего сертификата у CA и прикрепляет ответ к TLS handshake. Клиенту не нужно отдельно обращаться к OCSP, снижая задержку.

**Как работает SNI?** Server Name Indication — расширение TLS, позволяющее клиенту сообщить hostname в начале handshake (до шифрования). Сервер может выбрать нужный сертификат для этого хоста. Это позволяет хостить несколько HTTPS-доменов на одном IP. В Go `tls.Config.GetCertificate` позволяет динамически выбирать сертификат по SNI.
