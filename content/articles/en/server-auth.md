---
title: Authentication in Go Servers
blockId: server-auth
parentBlockId: server
---

# Authentication in Go Servers

Authentication is one of the first design decisions in a server application. Go prescribes no framework, which is both freedom and responsibility: you choose between JWT and sessions, configure OAuth providers yourself, and implement CSRF protection yourself. In technical interviews the topic appears consistently when discussing security — from "how do you store passwords correctly" to "walk me through the OAuth 2.0 flow."

## Storing Passwords: bcrypt

Rule one: passwords are never stored in plain text, Base64, or MD5. Use bcrypt only (or scrypt/Argon2 for new projects).

```go
import "golang.org/x/crypto/bcrypt"

// Hash at registration time
func hashPassword(password string) (string, error) {
    // cost 12 — a good balance of speed and security (2^12 iterations)
    hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
    if err != nil {
        return "", fmt.Errorf("hash password: %w", err)
    }
    return string(hash), nil
}

// Verify at login
func checkPassword(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    return err == nil
}
```

Why bcrypt:
- Deliberately slow — each hash comparison takes tens of milliseconds.
- Built-in salt — identical passwords produce different hashes.
- Cost parameter — complexity can be increased as hardware gets faster.

Interview talking point: "MD5 or unsalted SHA can be brute-forced in seconds with a dictionary. bcrypt at cost 12 requires years."

## JWT: Stateless Authentication

A JSON Web Token is a compact, signed token carrying claims. The server stores no session state — verifying the signature is sufficient.

Structure: `header.payload.signature`, where each part is Base64URL-encoded JSON.

```go
import "github.com/golang-jwt/jwt/v5"

type Claims struct {
    UserID int64  `json:"sub"`
    Role   string `json:"role"`
    jwt.RegisteredClaims
}

var jwtSecret = []byte(os.Getenv("JWT_SECRET"))

// Generate a token on successful login
func generateToken(userID int64, role string) (string, error) {
    claims := Claims{
        UserID: userID,
        Role:   role,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            Issuer:    "myapp",
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(jwtSecret)
}

// Validate a token
func validateToken(tokenStr string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenStr, &Claims{},
        func(t *jwt.Token) (any, error) {
            // Always verify the signing method
            if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
                return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
            }
            return jwtSecret, nil
        })
    if err != nil {
        return nil, fmt.Errorf("parse token: %w", err)
    }

    claims, ok := token.Claims.(*Claims)
    if !ok || !token.Valid {
        return nil, errors.New("invalid token")
    }
    return claims, nil
}
```

Key points:
- **Never allow `alg: none`** — always verify the signing method.
- **Access token** — short-lived (15 minutes to 24 hours).
- **Refresh token** — long-lived (7–30 days), stored in an httpOnly cookie.
- JWTs cannot be invalidated before expiry — for logout, maintain a blacklist in Redis.

## JWT Middleware

```go
func JWTMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        authHeader := r.Header.Get("Authorization")
        if authHeader == "" {
            http.Error(w, "missing authorization header", http.StatusUnauthorized)
            return
        }

        // Format: "Bearer <token>"
        parts := strings.SplitN(authHeader, " ", 2)
        if len(parts) != 2 || parts[0] != "Bearer" {
            http.Error(w, "invalid authorization format", http.StatusUnauthorized)
            return
        }

        claims, err := validateToken(parts[1])
        if err != nil {
            http.Error(w, "invalid token", http.StatusUnauthorized)
            return
        }

        ctx := context.WithValue(r.Context(), claimsKey, claims)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

// Helper to retrieve claims in a handler
func ClaimsFromContext(ctx context.Context) (*Claims, bool) {
    claims, ok := ctx.Value(claimsKey).(*Claims)
    return claims, ok
}
```

## Session-Based Authentication

The alternative to JWT is server-side sessions. On login, a cryptographically random session ID is generated, stored in Redis with a TTL, and sent to the client as an httpOnly, Secure cookie.

```go
import (
    "crypto/rand"
    "encoding/hex"
)

func generateSessionID() (string, error) {
    b := make([]byte, 32)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return hex.EncodeToString(b), nil
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
    // ... password validation ...

    sessionID, err := generateSessionID()
    if err != nil {
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }

    err = h.redis.Set(r.Context(),
        "session:"+sessionID,
        userID,
        24*time.Hour,
    ).Err()
    if err != nil {
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }

    http.SetCookie(w, &http.Cookie{
        Name:     "session",
        Value:    sessionID,
        Path:     "/",
        HttpOnly: true,
        Secure:   true,
        SameSite: http.SameSiteLaxMode,
        MaxAge:   86400,
    })

    respond(w, http.StatusOK, map[string]string{"status": "ok"})
}

func SessionMiddleware(redis *redis.Client, next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        cookie, err := r.Cookie("session")
        if err != nil {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }

        userID, err := redis.Get(r.Context(), "session:"+cookie.Value).Int64()
        if err != nil {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }

        ctx := context.WithValue(r.Context(), userIDKey, userID)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

Advantages of sessions over JWT: instant invalidation (deleting the Redis key = logout), no risk of leaking data from the payload. Drawbacks: server-side state, the session store becomes a single point of failure.

## OAuth 2.0

OAuth 2.0 is an authorisation delegation protocol: the user grants your application access to their data at a provider (Google, GitHub, Yandex).

Simplified Authorization Code Flow:

```
1. Your server → redirect to provider's /authorize (client_id, scope, state)
2. User → logs in at provider + grants permission
3. Provider → redirect back to your /callback?code=...&state=...
4. Your server → POST /token at provider (code + client_secret)
5. Provider → access_token + refresh_token
6. Your server → GET /userinfo with access_token → user data
```

```go
import "golang.org/x/oauth2"
import "golang.org/x/oauth2/google"

var googleConfig = &oauth2.Config{
    ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
    ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
    RedirectURL:  "https://myapp.com/auth/google/callback",
    Scopes:       []string{"openid", "email", "profile"},
    Endpoint:     google.Endpoint,
}

func (h *Handler) googleLogin(w http.ResponseWriter, r *http.Request) {
    // state — random string for CSRF protection
    state := generateState()
    h.storeState(r.Context(), state) // store in Redis with 5-minute TTL

    url := googleConfig.AuthCodeURL(state, oauth2.AccessTypeOffline)
    http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func (h *Handler) googleCallback(w http.ResponseWriter, r *http.Request) {
    state := r.URL.Query().Get("state")
    if !h.verifyState(r.Context(), state) {
        http.Error(w, "invalid state", http.StatusBadRequest)
        return
    }

    code := r.URL.Query().Get("code")
    token, err := googleConfig.Exchange(r.Context(), code)
    if err != nil {
        http.Error(w, "token exchange failed", http.StatusInternalServerError)
        return
    }

    client := googleConfig.Client(r.Context(), token)
    resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
    // ... parse email, find or create user in DB ...
}
```

## CORS

Cross-Origin Resource Sharing — headers that allow the browser to make API calls from a different domain:

```go
func CORSMiddleware(allowedOrigins []string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            origin := r.Header.Get("Origin")
            for _, allowed := range allowedOrigins {
                if origin == allowed {
                    w.Header().Set("Access-Control-Allow-Origin", origin)
                    w.Header().Set("Vary", "Origin")
                    break
                }
            }

            w.Header().Set("Access-Control-Allow-Methods",
                "GET, POST, PUT, PATCH, DELETE, OPTIONS")
            w.Header().Set("Access-Control-Allow-Headers",
                "Content-Type, Authorization")
            w.Header().Set("Access-Control-Allow-Credentials", "true")
            w.Header().Set("Access-Control-Max-Age", "86400")

            // Handle preflight
            if r.Method == http.MethodOptions {
                w.WriteHeader(http.StatusNoContent)
                return
            }

            next.ServeHTTP(w, r)
        })
    }
}
```

Do not use `Access-Control-Allow-Origin: *` with `Allow-Credentials: true` — the browser will reject it. When using credentials, you must specify a concrete origin.

## CSRF Protection

CSRF (Cross-Site Request Forgery) is an attack where a malicious site tricks the user's browser into making a request to your server using the victim's cookies.

Defences:
1. **SameSite cookie** — `SameSite=Lax` or `SameSite=Strict` blocks most attacks.
2. **CSRF token** — the server generates a unique token; the client sends it in the `X-CSRF-Token` header.
3. **Double Submit Cookie** — the token is mirrored in both a cookie and a header; the server compares them.

```go
func CSRFMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Safe methods do not need CSRF validation
        if r.Method == http.MethodGet || r.Method == http.MethodHead {
            next.ServeHTTP(w, r)
            return
        }

        headerToken := r.Header.Get("X-CSRF-Token")
        cookieToken, err := r.Cookie("csrf_token")
        if err != nil || headerToken == "" || headerToken != cookieToken.Value {
            http.Error(w, "invalid csrf token", http.StatusForbidden)
            return
        }

        next.ServeHTTP(w, r)
    })
}
```

## Authorisation: Middleware and Roles

Authentication answers "who are you"; authorisation answers "what are you allowed to do." After the JWT middleware, add authorisation:

```go
func RequireRole(role string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            claims, ok := ClaimsFromContext(r.Context())
            if !ok {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
            }
            if claims.Role != role {
                http.Error(w, "forbidden", http.StatusForbidden)
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}

// Usage
mux.Handle("DELETE /api/users/{id}",
    JWTMiddleware(RequireRole("admin")(http.HandlerFunc(deleteUser))))
```

## Common Interview Questions

**JWT vs sessions — when to use which?** JWT is stateless — the server stores nothing, horizontal scaling is trivial. Sessions are stateful — instant invalidation, and the payload is never sent to the client. Pick JWT for API-first services; sessions for server-rendered apps where security is paramount.

**Where should a client store the JWT?** In an httpOnly cookie for XSS protection. In localStorage for simplicity, but vulnerable to XSS. Best practice: access token in SPA memory, refresh token in an httpOnly cookie.

**How do you invalidate a JWT?** Strictly speaking, you cannot until it expires. Options: short TTL (15 minutes) with a refresh token, a Redis blacklist keyed on the `jti` claim, or switching to opaque tokens.

**What is PKCE?** Proof Key for Code Exchange — an OAuth 2.0 extension for public clients (SPAs, mobile apps) that cannot safely store a `client_secret`. A `code_verifier` + `code_challenge` pair is used instead.

## Summary

Secure authentication in Go rests on a few pillars: bcrypt for passwords, JWT or sessions for state, OAuth 2.0 for delegation, and CORS/CSRF headers for browser safety. All of this is implemented as a middleware chain — no framework required, explicit, and fully testable.
