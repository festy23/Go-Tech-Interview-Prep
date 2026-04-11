---
title: Аутентификация в Go-серверах
blockId: server-auth
parentBlockId: server
---

# Аутентификация в Go-серверах

Аутентификация — один из первых вопросов при проектировании серверного приложения. Go не навязывает фреймворк, и это одновременно свобода и ответственность: разработчик сам выбирает между JWT и сессиями, сам настраивает OAuth-провайдеров, сам реализует защиту от CSRF. На собеседованиях тема аутентификации неизменно появляется при обсуждении безопасности — от «как правильно хранить пароли» до «как устроен OAuth 2.0».

## Хранение паролей: bcrypt

Первое правило: пароли никогда не хранятся в открытом виде, в Base64 или MD5. Только bcrypt (или scrypt/Argon2 для новых проектов).

```go
import "golang.org/x/crypto/bcrypt"

// Хеширование при регистрации
func hashPassword(password string) (string, error) {
    // cost 12 — хороший баланс скорости и безопасности (2^12 итераций)
    hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
    if err != nil {
        return "", fmt.Errorf("hash password: %w", err)
    }
    return string(hash), nil
}

// Проверка при входе
func checkPassword(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    return err == nil
}
```

Почему bcrypt:
- Намеренно медленный — каждый перебор хеша занимает десятки миллисекунд.
- Встроенная соль — даже одинаковые пароли дают разные хеши.
- Параметр стоимости (cost) позволяет увеличивать сложность по мере роста мощности железа.

Аргументы для bcrypt на собеседовании: «MD5 или SHA без соли — dictionary attack за секунды. bcrypt с cost 12 — brute-force за годы».

## JWT: stateless аутентификация

JSON Web Token — компактный подписанный токен, содержащий claims (утверждения). Сервер не хранит состояние сессии: достаточно проверить подпись.

Структура JWT: `header.payload.signature`, где каждая часть — Base64URL-encoded JSON.

```go
import "github.com/golang-jwt/jwt/v5"

type Claims struct {
    UserID int64  `json:"sub"`
    Role   string `json:"role"`
    jwt.RegisteredClaims
}

var jwtSecret = []byte(os.Getenv("JWT_SECRET"))

// Генерация токена при успешном входе
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

// Валидация токена
func validateToken(tokenStr string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenStr, &Claims{},
        func(t *jwt.Token) (any, error) {
            // Обязательно проверяем метод подписи
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

Важные нюансы:
- **Никогда не используйте `alg: none`** — всегда проверяйте метод подписи.
- **Access token** — короткоживущий (15 минут — 24 часа).
- **Refresh token** — долгоживущий (7–30 дней), хранится в httpOnly cookie.
- JWT нельзя инвалидировать до истечения срока — для logout храните blacklist в Redis.

## JWT middleware

```go
func JWTMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        authHeader := r.Header.Get("Authorization")
        if authHeader == "" {
            http.Error(w, "missing authorization header", http.StatusUnauthorized)
            return
        }

        // Формат: "Bearer <token>"
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

        // Кладём claims в контекст
        ctx := context.WithValue(r.Context(), claimsKey, claims)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

// Вспомогательная функция для получения claims в обработчике
func ClaimsFromContext(ctx context.Context) (*Claims, bool) {
    claims, ok := ctx.Value(claimsKey).(*Claims)
    return claims, ok
}
```

## Сессионная аутентификация

Альтернатива JWT — сессии на стороне сервера. При входе создаётся случайный идентификатор сессии, который хранится в Redis (или другом хранилище), а клиенту отдаётся в httpOnly, Secure cookie.

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
    // ... валидация пароля ...

    sessionID, err := generateSessionID()
    if err != nil {
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }

    // Сохраняем сессию в Redis с TTL 24 часа
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
        HttpOnly: true,       // недоступен JS
        Secure:   true,       // только HTTPS
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

Преимущества сессий перед JWT: мгновенная инвалидация (удалить ключ из Redis = logout), нет риска украсть данные из payload. Недостатки: состояние на сервере, хранилище сессий становится точкой отказа.

## OAuth 2.0

OAuth 2.0 — протокол делегирования авторизации: пользователь разрешает вашему приложению доступ к своим данным у провайдера (Google, GitHub, Yandex).

Упрощённый Authorization Code Flow:

```
1. Ваш сервер → редирект на /authorize провайдера (с client_id, scope, state)
2. Пользователь → логин у провайдера + подтверждение
3. Провайдер → редирект обратно на ваш /callback?code=...&state=...
4. Ваш сервер → POST /token у провайдера (code + client_secret)
5. Провайдер → access_token + refresh_token
6. Ваш сервер → GET /userinfo с access_token → данные пользователя
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
    // state — случайная строка для защиты от CSRF
    state := generateState()
    h.storeState(r.Context(), state) // сохранить в Redis с TTL 5 минут

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

    // Получаем данные пользователя
    client := googleConfig.Client(r.Context(), token)
    resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
    // ... парсим email, создаём/находим пользователя в БД ...
}
```

## CORS

Cross-Origin Resource Sharing — заголовки, которые разрешают браузеру обращаться к API с другого домена:

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

            // Preflight запрос
            if r.Method == http.MethodOptions {
                w.WriteHeader(http.StatusNoContent)
                return
            }

            next.ServeHTTP(w, r)
        })
    }
}
```

Не используйте `Access-Control-Allow-Origin: *` вместе с `Allow-Credentials: true` — браузер откажет. При использовании credentials нужно указывать конкретный origin.

## CSRF-защита

CSRF (Cross-Site Request Forgery) — атака, при которой вредоносный сайт заставляет браузер пользователя выполнить запрос к вашему серверу с cookies жертвы.

Защиты:
1. **SameSite cookie** — `SameSite=Lax` или `SameSite=Strict` блокирует большинство атак.
2. **CSRF-токен** — сервер генерирует уникальный токен, клиент отправляет его в заголовке `X-CSRF-Token`.
3. **Double Submit Cookie** — токен дублируется в cookie и заголовке; сервер сравнивает.

```go
func CSRFMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Безопасные методы не требуют CSRF-проверки
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

## Авторизация: middleware и роли

Аутентификация — «кто ты», авторизация — «что ты можешь делать». После JWT middleware идёт авторизация:

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

// Использование
mux.Handle("DELETE /api/users/{id}",
    JWTMiddleware(RequireRole("admin")(http.HandlerFunc(deleteUser))))
```

## Типичные вопросы на собеседовании

**Чем JWT отличается от сессий?** JWT — stateless, сервер не хранит состояние, легко масштабировать горизонтально. Сессии — stateful, проще инвалидировать, безопаснее (payload не передаётся клиенту).

**Где хранить JWT на клиенте?** В httpOnly cookie — защита от XSS. В localStorage — уязвим к XSS, но проще работать с SPA. На практике: access token в памяти SPA, refresh token в httpOnly cookie.

**Как инвалидировать JWT?** Технически нельзя до истечения срока. Варианты: короткий TTL (15 минут) + refresh token, blacklist в Redis по `jti` (JWT ID), или переход на непрозрачные токены.

**Что такое PKCE?** Proof Key for Code Exchange — расширение OAuth 2.0 для публичных клиентов (SPA, мобильные), где client_secret нельзя безопасно хранить. Вместо него используется code_verifier + code_challenge.

## Итог

Безопасная аутентификация в Go строится на нескольких столпах: bcrypt для паролей, JWT или сессии для состояния, OAuth 2.0 для делегирования, CORS и CSRF для защиты в браузере. Всё это реализуется через middleware-цепочку — без фреймворков, явно, тестируемо.
