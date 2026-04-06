import type { Question } from "./questions";

export const questionsServer: Question[] = [
  {
    id: 1,
    question: "Какой интерфейс необходимо реализовать для создания HTTP-обработчика в Go?",
    options: [
      "http.Handler с методом ServeHTTP(ResponseWriter, *Request)",
      "http.Handler с методом Handle(ResponseWriter, *Request)",
      "http.Middleware с методом ServeHTTP(ResponseWriter, *Request)",
      "http.Controller с методом Handle(ResponseWriter, *Request)"
    ],
    correct: 0,
    explanation: "Интерфейс http.Handler требует единственный метод ServeHTTP(w http.ResponseWriter, r *http.Request). Именно этот интерфейс регистрируется в ServeMux."
  },
  {
    id: 2,
    question: "Что произойдёт, если в http.ListenAndServe передать nil в качестве handler?",
    options: [
      "Сервер не запустится и вернёт ошибку",
      "Будет использован http.DefaultServeMux",
      "Будет создан новый пустой ServeMux",
      "Каждый запрос вернёт 404"
    ],
    correct: 1,
    explanation: "При nil handler http.ListenAndServe использует http.DefaultServeMux — глобальный мультиплексер, в который регистрируются обработчики через http.Handle и http.HandleFunc."
  },
  {
    id: 3,
    question: "Как правильно реализовать middleware в Go с использованием net/http?",
    options: [
      "func Middleware(next http.Handler) http.Handler { return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { /* до */ next.ServeHTTP(w, r) /* после */ }) }",
      "func Middleware(next http.Handler) { next.ServeHTTP(w, r) }",
      "type Middleware struct { Next http.Handler }; func (m Middleware) Handle(w, r) {}",
      "func Middleware(w http.ResponseWriter, r *http.Request, next func()) { next() }"
    ],
    correct: 0,
    explanation: "Middleware в Go — это функция, принимающая http.Handler и возвращающая http.Handler. Внутри оборачивает вызов next.ServeHTTP для выполнения логики до и после обработки запроса."
  },
  {
    id: 4,
    question: "Чем http.ServeMux отличается от http.DefaultServeMux?",
    options: [
      "ServeMux поддерживает regex-роутинг, DefaultServeMux — нет",
      "DefaultServeMux — глобальный синглтон, ServeMux создаётся через http.NewServeMux()",
      "DefaultServeMux быстрее ServeMux за счёт предкомпиляции маршрутов",
      "ServeMux и DefaultServeMux — одно и то же, просто разные псевдонимы"
    ],
    correct: 1,
    explanation: "http.DefaultServeMux — пакетная переменная типа *http.ServeMux. http.NewServeMux() создаёт новый независимый мультиплексер. Использование DefaultServeMux опасно: сторонние пакеты могут регистрировать в нём маршруты."
  },
  {
    id: 5,
    question: "Как реализовать graceful shutdown HTTP-сервера в Go?",
    code: `srv := &http.Server{Addr: \":8080\", Handler: mux}
go srv.ListenAndServe()
// Получили сигнал завершения...`,
    options: [
      "srv.Close()",
      "srv.Shutdown(context.Background())",
      "os.Exit(0)",
      "srv.Shutdown(ctx) с context, имеющим таймаут"
    ],
    correct: 3,
    explanation: "srv.Shutdown(ctx) дожидается завершения активных соединений. Важно передавать context с таймаутом, чтобы не ждать вечно. srv.Close() принудительно обрывает все соединения без ожидания."
  },
  {
    id: 6,
    question: "Как корректно перехватить SIGTERM и SIGINT для graceful shutdown?",
    code: `quit := make(chan os.Signal, 1)
// ???
<-quit`,
    options: [
      "signal.Notify(quit, os.Kill, os.Interrupt)",
      "signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)",
      "os.Signal(quit, syscall.SIGTERM)",
      "signal.Listen(quit, syscall.SIGTERM, syscall.SIGINT)"
    ],
    correct: 1,
    explanation: "signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT) регистрирует канал для получения указанных сигналов. os.Kill нельзя перехватить (SIGKILL). Буферизованный канал (размер 1) предотвращает потерю сигнала."
  },
  {
    id: 7,
    question: "Что такое gRPC и на каком протоколе он работает?",
    options: [
      "Remote Procedure Call фреймворк от Google, работает поверх HTTP/1.1",
      "Remote Procedure Call фреймворк от Google, работает поверх HTTP/2",
      "GraphQL-совместимый RPC фреймворк, работает поверх WebSockets",
      "Бинарный протокол, работающий напрямую поверх TCP"
    ],
    correct: 1,
    explanation: "gRPC — RPC-фреймворк от Google, использующий HTTP/2 для транспорта и Protocol Buffers для сериализации. HTTP/2 даёт мультиплексирование, двунаправленный стриминг и сжатие заголовков."
  },
  {
    id: 8,
    question: "Что описывает файл .proto в gRPC?",
    options: [
      "Конфигурацию сервера и параметры подключения",
      "Интерфейс сервиса (методы) и структуры данных (messages)",
      "Маршруты HTTP и middleware цепочку",
      "Схему базы данных и миграции"
    ],
    correct: 1,
    explanation: ".proto файл — IDL (Interface Definition Language) для Protocol Buffers. Описывает service с rpc-методами и message-структуры. Из него генерируется код на любом поддерживаемом языке через protoc."
  },
  {
    id: 9,
    question: "Какие типы стриминга поддерживает gRPC?",
    options: [
      "Только унарный (один запрос — один ответ)",
      "Серверный стриминг и клиентский стриминг",
      "Унарный, серверный, клиентский и двунаправленный стриминг",
      "Только двунаправленный стриминг"
    ],
    correct: 2,
    explanation: "gRPC поддерживает 4 типа: Unary (1:1), Server Streaming (1:N), Client Streaming (N:1), Bidirectional Streaming (N:N). Все реализованы поверх HTTP/2 потоков."
  },
  {
    id: 10,
    question: "Как выполнить HTTP/JSON → gRPC транскодинг в Go?",
    options: [
      "Использовать grpc-gateway для генерации reverse-proxy из .proto аннотаций",
      "Встроенный в стандартный grpc пакет конвертер",
      "Написать вручную HTTP-обёртку для каждого метода",
      "Использовать connect-go, который поддерживает только gRPC-Web"
    ],
    correct: 0,
    explanation: "grpc-gateway читает аннотации google.api.http из .proto и генерирует HTTP/JSON reverse-proxy, который транслирует REST-запросы в gRPC-вызовы. Альтернатива — connect-go, поддерживающий gRPC, gRPC-Web и Connect протоколы."
  },
  {
    id: 11,
    question: "Что такое Interceptor в gRPC (Go)?",
    options: [
      "Аналог HTTP middleware — функция, оборачивающая вызов RPC метода",
      "Инструмент для перехвата сетевых пакетов на уровне TCP",
      "Встроенный в grpc логгер запросов",
      "Плагин для protoc, генерирующий дополнительный код"
    ],
    correct: 0,
    explanation: "gRPC Interceptor — аналог HTTP middleware. UnaryInterceptor оборачивает унарные вызовы, StreamInterceptor — стриминговые. Используется для логирования, аутентификации, трейсинга, retry-логики."
  },
  {
    id: 12,
    question: "Как правильно читать тело HTTP-запроса и предотвратить утечку ресурсов?",
    code: `func handler(w http.ResponseWriter, r *http.Request) {
    body, err := io.ReadAll(r.Body)
    // ???
}`,
    options: [
      "defer r.Body.Close() в начале функции",
      "r.Body.Close() после чтения",
      "Тело закрывается автоматически, явное закрытие не нужно",
      "io.ReadAll автоматически закрывает тело"
    ],
    correct: 0,
    explanation: "defer r.Body.Close() нужно вызывать сразу — даже если чтение не требуется. Незакрытое тело приводит к утечке TCP-соединений. При использовании keep-alive соединение не вернётся в пул."
  },
  {
    id: 13,
    question: "Что возвращает http.ResponseWriter.WriteHeader() и когда его нужно вызывать?",
    options: [
      "Возвращает ошибку; вызывать до Write()",
      "Ничего не возвращает; вызывать до первого вызова Write() для установки статус-кода",
      "Возвращает количество записанных байт заголовка",
      "Ничего не возвращает; можно вызывать в любом порядке"
    ],
    correct: 1,
    explanation: "WriteHeader(statusCode int) устанавливает HTTP статус-код и должен быть вызван до Write(). После первого вызова Write() заголовки отправляются автоматически со статусом 200. Повторный вызов WriteHeader игнорируется."
  },
  {
    id: 14,
    question: "Как передать данные между middleware и обработчиком в net/http?",
    options: [
      "Через глобальные переменные",
      "Через context.WithValue(r.Context(), key, value) и r.WithContext(ctx)",
      "Через кастомные заголовки запроса",
      "Через параметры URL"
    ],
    correct: 1,
    explanation: "context.WithValue создаёт новый контекст с парой ключ-значение, r.WithContext возвращает новый Request с этим контекстом. В следующем обработчике: value := r.Context().Value(key). Ключи должны быть непримитивными типами."
  },
  {
    id: 15,
    question: "Что такое health check endpoint и какие статусы он должен возвращать?",
    options: [
      "Всегда возвращает 200 OK если процесс жив",
      "200 если сервис полностью готов, 503 если нет; /healthz — liveness, /readyz — readiness",
      "204 No Content при успехе, 500 при ошибке",
      "Возвращает JSON с метриками CPU и памяти"
    ],
    correct: 1,
    explanation: "Liveness (/healthz): жив ли процесс — 200/503. Readiness (/readyz): готов ли принимать трафик (БД, кэш доступны) — 200/503. Kubernetes использует оба: liveness для рестарта, readiness для исключения из балансировки."
  },
  {
    id: 16,
    question: "Чем slog отличается от log в стандартной библиотеке Go?",
    options: [
      "slog поддерживает структурированное логирование с уровнями и атрибутами",
      "slog быстрее только за счёт async записи",
      "slog — сторонняя библиотека, не входит в stdlib",
      "slog поддерживает только JSON формат"
    ],
    correct: 0,
    explanation: "slog (Go 1.21+) поддерживает структурированное логирование: уровни (Debug, Info, Warn, Error), атрибуты ключ-значение, сменяемые Handler (JSON, text). В отличие от log — не просто строки, а машиночитаемый формат."
  },
  {
    id: 17,
    question: "Как создать структурированный лог с атрибутами в slog?",
    code: `// Нужно залогировать: user=42, duration=150ms`,
    options: [
      `slog.Info("request done", "user", 42, "duration", 150*time.Millisecond)`,
      `slog.Info("request done", map[string]any{"user": 42})`,
      `log.Printf("request done user=%d duration=%v", 42, 150*time.Millisecond)`,
      `slog.Log("INFO", "request done", slog.Int("user", 42))`
    ],
    correct: 0,
    explanation: "slog.Info принимает msg и чередующиеся пары ключ-значение. Можно также использовать slog.With для создания логгера с предустановленными атрибутами. slog.Int(\"user\", 42) — типизированный атрибут."
  },
  {
    id: 18,
    question: "Что такое zap и в чём его преимущество перед slog?",
    options: [
      "zap — более медленная, но простая альтернатива slog",
      "zap исторически быстрее за счёт zero-allocation API (zap.Field), хотя slog в новых версиях Go сравнялся",
      "zap поддерживает только JSON вывод",
      "zap — официальная замена slog в Go 1.22+"
    ],
    correct: 1,
    explanation: "zap от Uber использует типизированные поля (zap.String, zap.Int) для zero-allocation логирования. SugaredLogger предоставляет более удобный API с минимальным накладными расходами. С Go 1.21 slog стал сравнимым по производительности."
  },
  {
    id: 19,
    question: "Что такое 12-factor app и как это связано с конфигурацией Go-сервиса?",
    options: [
      "Методология, предписывающая хранить конфигурацию в файлах TOML рядом с бинарником",
      "Методология, предписывающая хранить конфигурацию в переменных окружения, отделяя её от кода",
      "Стандарт Docker контейнеризации для Go приложений",
      "Требование использовать 12 независимых микросервисов"
    ],
    correct: 1,
    explanation: "12-factor (III фактор) требует хранить конфиг в env-переменных — это позволяет деплоить один и тот же образ в разные окружения. В Go: os.Getenv или библиотеки envconfig, viper с env-источниками."
  },
  {
    id: 20,
    question: "Как безопасно читать конфигурацию из переменных окружения в Go?",
    options: [
      "os.Getenv везде по коду где нужно значение",
      "Читать все env в struct при старте приложения и завершаться с ошибкой если обязательные не заданы",
      "Использовать os.LookupEnv и игнорировать ошибки",
      "Хранить в глобальных переменных типа var dbURL = os.Getenv(\"DB_URL\")"
    ],
    correct: 1,
    explanation: "Лучшая практика: читать все env в config-struct при старте, валидировать обязательные поля, завершаться с os.Exit(1) если конфиг невалиден. Библиотеки: envconfig, cleanenv. Это явно документирует зависимости сервиса."
  },
  {
    id: 21,
    question: "Что такое Dependency Injection в Go и какой подход предпочтителен?",
    options: [
      "Использование глобальных синглтонов для зависимостей",
      "Передача зависимостей через конструктор (constructor injection) без DI-фреймворка",
      "Обязательное использование wire или dig для генерации кода",
      "Внедрение через теги struct: `inject:\"db\"`"
    ],
    correct: 1,
    explanation: "В Go предпочтителен explicit constructor injection: NewService(db *DB, logger *slog.Logger). Зависимости явны, тестируемы (моки через интерфейсы). DI-фреймворки (wire, dig) — опционально для больших графов зависимостей."
  },
  {
    id: 22,
    question: "Что такое Hexagonal Architecture (Ports and Adapters)?",
    options: [
      "Архитектура с 6 слоями: controller, service, repository, model, dto, mapper",
      "Подход, где бизнес-логика в центре изолирована от внешних систем через интерфейсы (порты), реализуемые адаптерами",
      "Микросервисная архитектура с 6 сервисами на домен",
      "Паттерн для организации gRPC сервисов"
    ],
    correct: 1,
    explanation: "Hexagonal Architecture: доменная логика определяет интерфейсы (порты) — что ей нужно. Адаптеры реализуют эти интерфейсы для конкретных технологий (PostgreSQL, Redis, HTTP). Бизнес-логика не знает о деталях реализации."
  },
  {
    id: 23,
    question: "Как правильно завершить HTTP-сервер при панике в goroutine-обработчике?",
    options: [
      "Паника в goroutine всегда убивает весь процесс — recover не помогает",
      "Использовать recover() в middleware, логировать и отвечать 500",
      "Обернуть весь сервер в recover()",
      "Паника в goroutine обработчика изолирована и не влияет на сервер"
    ],
    correct: 1,
    explanation: "net/http уже вызывает recover() для каждого обработчика — паника не убьёт сервер. Но лучше добавить middleware с recover(), чтобы логировать stack trace и корректно отвечать клиенту с 500, а не просто обрывать соединение."
  },
  {
    id: 24,
    question: "Что такое OpenTelemetry и для чего он используется в Go?",
    options: [
      "Библиотека для структурированного логирования, замена slog",
      "Стандарт и SDK для сбора трейсов, метрик и логов с экспортом в Jaeger, Prometheus, OTLP",
      "Инструмент для профилирования Go-приложений (pprof обёртка)",
      "Фреймворк для e2e тестирования HTTP API"
    ],
    correct: 1,
    explanation: "OpenTelemetry — vendor-neutral стандарт для observability. В Go: go.opentelemetry.io/otel. Позволяет инструментировать код (spans, attributes), собирать метрики и экспортировать в любой бэкенд (Jaeger, Zipkin, Grafana Tempo)."
  },
  {
    id: 25,
    question: "Как создать span в OpenTelemetry Go?",
    code: `tracer := otel.Tracer("my-service")
// Начать span для операции "db.query"`,
    options: [
      `span := tracer.NewSpan("db.query")`,
      `ctx, span := tracer.Start(ctx, "db.query"); defer span.End()`,
      `otel.StartSpan(ctx, "db.query")`,
      `span := tracer.Start("db.query"); defer span.Finish()`
    ],
    correct: 1,
    explanation: "tracer.Start(ctx, name) возвращает новый контекст с span и сам span. defer span.End() обязателен — иначе span не будет экспортирован. Новый ctx передаётся дальше для создания дочерних span."
  },
  {
    id: 26,
    question: "Что такое WebSocket и чем он отличается от обычного HTTP?",
    options: [
      "WebSocket — это HTTP/2 Server-Sent Events с двунаправленностью",
      "Протокол с постоянным двунаправленным TCP-соединением, инициируемый HTTP Upgrade handshake",
      "Бинарный протокол поверх UDP для низкой задержки",
      "Расширение HTTP/1.1 для long polling"
    ],
    correct: 1,
    explanation: "WebSocket начинается с HTTP Upgrade запроса (101 Switching Protocols), после чего TCP-соединение используется для двунаправленного обмена фреймами. Нет overhead HTTP заголовков на каждое сообщение."
  },
  {
    id: 27,
    question: "Какая библиотека стандартна для WebSockets в Go и как апгрейдить соединение?",
    options: [
      "net/websocket из stdlib: websocket.Upgrade(w, r, nil, 1024, 1024)",
      "gorilla/websocket: var upgrader = websocket.Upgrader{}; conn, err := upgrader.Upgrade(w, r, nil)",
      "nhooyr.io/websocket: websocket.Accept(w, r, nil)",
      "Gorilla и nhooyr одинаково популярны; в stdlib websocket нет"
    ],
    correct: 3,
    explanation: "В stdlib нет WebSocket пакета. gorilla/websocket исторически самый популярный. nhooyr.io/websocket — более современная альтернатива с context-поддержкой. gobwas/ws — низкоуровневая zero-allocation библиотека."
  },
  {
    id: 28,
    question: "Как установить таймаут для HTTP-сервера в Go?",
    code: `srv := &http.Server{
    Addr: \":8080\",
    Handler: mux,
    // ???
}`,
    options: [
      "Таймауты устанавливаются только через context в каждом обработчике",
      "ReadTimeout, WriteTimeout, IdleTimeout и ReadHeaderTimeout в http.Server",
      "srv.SetTimeout(30 * time.Second)",
      "Только через http.TimeoutHandler(handler, timeout, msg)"
    ],
    correct: 1,
    explanation: "http.Server поддерживает: ReadTimeout (чтение запроса), ReadHeaderTimeout (только заголовки), WriteTimeout (запись ответа), IdleTimeout (keep-alive). Без таймаутов медленные клиенты могут исчерпать соединения (Slowloris атака)."
  },
  {
    id: 29,
    question: "Что такое http.TimeoutHandler и когда его использовать?",
    options: [
      "Устанавливает глобальный таймаут сервера вместо http.Server.WriteTimeout",
      "Оборачивает handler: если он не ответил за dt, клиент получает 503 с заданным сообщением",
      "Добавляет таймаут только к чтению тела запроса",
      "Аналог context.WithTimeout, но для HTTP обработчиков"
    ],
    correct: 1,
    explanation: "http.TimeoutHandler(h, dt, msg) возвращает handler-обёртку. Если h не вызвал WriteHeader за dt, клиент получает 503 Service Unavailable. Полезен для per-route таймаутов в дополнение к глобальным таймаутам сервера."
  },
  {
    id: 30,
    question: "Как правильно читать и декодировать JSON из тела HTTP-запроса?",
    code: `func handler(w http.ResponseWriter, r *http.Request) {
    var req MyRequest
    // ???
}`,
    options: [
      "json.Unmarshal(r.Body, &req)",
      "json.NewDecoder(r.Body).Decode(&req)",
      "json.NewDecoder(r.Body).Decode(&req) с последующим io.ReadAll для дренажа тела",
      "body, _ := io.ReadAll(r.Body); json.Unmarshal(body, &req)"
    ],
    correct: 1,
    explanation: "json.NewDecoder(r.Body).Decode(&req) — стримминговый декодер, эффективнее io.ReadAll+Unmarshal для больших тел. После Decode() тело может содержать лишние данные — если нужно, проверять что оно пустое. Обязательно defer r.Body.Close()."
  },
  {
    id: 31,
    question: "Как ограничить размер тела HTTP-запроса?",
    options: [
      "r.Body = http.MaxBytesReader(w, r.Body, maxBytes)",
      "r.ContentLength < maxBytes",
      "io.LimitReader(r.Body, maxBytes)",
      "Установить MaxRequestBodySize в http.Server"
    ],
    correct: 0,
    explanation: "http.MaxBytesReader оборачивает Body: при превышении лимита возвращает ошибку и устанавливает флаг, что сервер должен закрыть соединение. io.LimitReader только обрезает чтение, но не сигнализирует об ошибке клиенту."
  },
  {
    id: 32,
    question: "Что такое gRPC metadata и как передать токен авторизации?",
    options: [
      "Metadata — аналог HTTP заголовков; добавляется через metadata.AppendToOutgoingContext(ctx, \"authorization\", \"Bearer token\")",
      "Metadata передаётся только в теле proto message",
      "gRPC не поддерживает заголовки — авторизация только через TLS сертификаты",
      "metadata.New(map[string]string{\"auth\": token}) передаётся как параметр RPC вызова"
    ],
    correct: 0,
    explanation: "gRPC metadata — аналог HTTP заголовков (ключ-значение). Исходящие: metadata.AppendToOutgoingContext. Входящие на сервере: metadata.FromIncomingContext(ctx). Стандартный ключ для авторизации: \"authorization\"."
  },
  {
    id: 33,
    question: "Как настроить CORS в Go HTTP сервере?",
    options: [
      "Использовать встроенный http.CORS middleware",
      "Добавить заголовки Access-Control-Allow-Origin в middleware вручную или через rs/cors",
      "CORS настраивается только на уровне nginx/reverse proxy",
      "Установить srv.CORS = true в http.Server"
    ],
    correct: 1,
    explanation: "CORS реализуется через middleware: установка заголовков Access-Control-Allow-Origin, Access-Control-Allow-Methods, Access-Control-Allow-Headers. Для preflight (OPTIONS) — отвечать 200 без вызова основного handler. Популярная либа: rs/cors."
  },
  {
    id: 34,
    question: "Что такое Server-Sent Events (SSE) и как реализовать в Go?",
    options: [
      "Двунаправленный протокол, аналог WebSocket но проще",
      "Однонаправленный стриминг сервер→клиент через обычный HTTP; Content-Type: text/event-stream",
      "Механизм push-уведомлений в HTTP/2",
      "Протокол для стриминга бинарных данных"
    ],
    correct: 1,
    explanation: "SSE — однонаправленный: сервер пушит события, клиент читает. Реализация в Go: Content-Type: text/event-stream, Cache-Control: no-cache, использовать http.Flusher для немедленной отправки данных. Формат: 'data: {json}\\n\\n'."
  },
  {
    id: 35,
    question: "Что такое pprof и как включить HTTP endpoint для профилирования?",
    code: `import _ "net/http/pprof"`,
    options: [
      "Достаточно blank import — регистрирует /debug/pprof/* на DefaultServeMux",
      "Нужно явно вызвать pprof.Register(mux) после импорта",
      "Blank import включает только CPU профилирование",
      "pprof работает только через CLI, HTTP endpoint не поддерживается"
    ],
    correct: 0,
    explanation: "Blank import net/http/pprof регистрирует обработчики на http.DefaultServeMux: /debug/pprof/, /debug/pprof/heap, /debug/pprof/goroutine и др. Если используется кастомный ServeMux — нужно явно зарегистрировать pprof.Handler."
  },
  {
    id: 36,
    question: "Как защитить pprof endpoint в production?",
    options: [
      "Pprof в production безопасен — показывает только метрики",
      "Запускать pprof на отдельном internal порту (не публичном) или за auth middleware",
      "Использовать HTTPS — это достаточная защита",
      "Pprof нельзя использовать в production вообще"
    ],
    correct: 1,
    explanation: "Pprof раскрывает внутреннюю информацию о программе (heap, goroutines, CPU). В production: отдельный порт только во внутренней сети, или auth middleware. CPU профилирование также нагружает сервер."
  },
  {
    id: 37,
    question: "Что такое rate limiting и как реализовать token bucket в Go?",
    options: [
      "Использовать встроенный http.RateLimit middleware",
      "golang.org/x/time/rate: limiter := rate.NewLimiter(rate.Every(time.Second), burst); limiter.Wait(ctx)",
      "Считать запросы в sync.Map и блокировать при превышении",
      "Использовать только внешние решения (nginx, API gateway)"
    ],
    correct: 1,
    explanation: "golang.org/x/time/rate реализует token bucket. rate.NewLimiter(r, b): r — скорость пополнения токенов, b — максимальный burst. limiter.Wait(ctx) блокирует до доступного токена. limiter.Allow() — неблокирующая проверка."
  },
  {
    id: 38,
    question: "Как реализовать per-IP rate limiting для HTTP сервера?",
    options: [
      "Один глобальный limiter для всех клиентов",
      "Map[IP]*rate.Limiter с sync.Mutex или sync.Map, очистка устаревших записей",
      "Проверять IP в каждом обработчике отдельно",
      "Стандартная библиотека не поддерживает per-IP ограничения"
    ],
    correct: 1,
    explanation: "Per-IP лимитер: map от IP к *rate.Limiter, защищённый мьютексом. Важно чистить устаревшие записи (TTL через time.AfterFunc или отдельную goroutine) чтобы не было утечки памяти. Реальный IP берётся из X-Forwarded-For за прокси."
  },
  {
    id: 39,
    question: "Что такое circuit breaker паттерн и зачем нужен в Go HTTP клиенте?",
    options: [
      "Паттерн для ограничения числа одновременных запросов (semaphore)",
      "Автоматически прекращает запросы к недоступному сервису после N ошибок, давая ему время восстановиться",
      "Retry механизм с exponential backoff",
      "Таймаут для HTTP запросов"
    ],
    correct: 1,
    explanation: "Circuit breaker: CLOSED (запросы проходят) → OPEN (после N ошибок, запросы блокируются) → HALF-OPEN (пробный запрос). Предотвращает каскадные сбои. Библиотеки: sony/gobreaker, afex/hystrix-go."
  },
  {
    id: 40,
    question: "Как настроить HTTP клиент с таймаутом и пулом соединений в Go?",
    code: `client := &http.Client{
    // ???
}`,
    options: [
      "client.Timeout = 30 * time.Second — достаточно для production",
      "Timeout + кастомный Transport с MaxIdleConns, IdleConnTimeout, MaxConnsPerHost",
      "Использовать http.DefaultClient — он уже оптимален",
      "Timeout устанавливается только через context в каждом запросе"
    ],
    correct: 1,
    explanation: "Для production: &http.Client{Timeout: 30s, Transport: &http.Transport{MaxIdleConns: 100, IdleConnTimeout: 90s, MaxConnsPerHost: 10, DisableKeepAlives: false}}. http.DefaultClient не имеет таймаута — опасен для production."
  },
  {
    id: 41,
    question: "Что такое TLS mutual authentication (mTLS) и как настроить в Go?",
    options: [
      "TLS где клиент и сервер взаимно проверяют сертификаты друг друга",
      "Двойное TLS шифрование для повышенной безопасности",
      "TLS с двумя CA сертификатами",
      "Аутентификация через два токена в TLS handshake"
    ],
    correct: 0,
    explanation: "mTLS: сервер и клиент предъявляют X.509 сертификаты. В Go: tls.Config{ClientAuth: tls.RequireAndVerifyClientCert, ClientCAs: certPool}. Используется в service mesh (Istio), внутренних API, gRPC."
  },
  {
    id: 42,
    question: "Как правильно использовать context для отмены HTTP запроса к внешнему API?",
    code: `func fetchData(ctx context.Context) error {
    req, _ := http.NewRequest(\"GET\", url, nil)
    // ???
}`,
    options: [
      "client.Get(url) — context игнорируется в http.Client",
      "req = req.WithContext(ctx); resp, err := client.Do(req)",
      "http.NewRequestWithContext(ctx, \"GET\", url, nil); client.Do(req)",
      "Варианты 2 и 3 оба корректны"
    ],
    correct: 3,
    explanation: "Оба подхода корректны: req.WithContext(ctx) или http.NewRequestWithContext(ctx, method, url, body). При отмене ctx запрос прерывается. Всегда передавайте context из входящего запроса для propagation cancellation."
  },
  {
    id: 43,
    question: "Что такое middleware chain и как скомпоновать несколько middleware?",
    code: `mux.Handle(\"/api\", handler)
// Нужно применить: logging → auth → rateLimit → handler`,
    options: [
      "mux.Use(logging, auth, rateLimit)",
      "logging(auth(rateLimit(handler))) — явная вложенность",
      "alice.New(logging, auth, rateLimit).Then(handler)",
      "Варианты 2 и 3 оба корректны; вариант 3 — удобнее"
    ],
    correct: 3,
    explanation: "Явная вложенность работает всегда: logging(auth(rateLimit(handler))). Библиотека justinas/alice упрощает: alice.New(logging, auth, rateLimit).Then(handler). Порядок важен — внешний middleware выполняется первым."
  },
  {
    id: 44,
    question: "Как реализовать retry с exponential backoff для HTTP клиента?",
    options: [
      "for i := 0; i < retries; i++ { resp, err := client.Do(req); if err == nil { break }; time.Sleep(time.Duration(i) * time.Second) }",
      "for i := 0; i < retries; i++ { resp, err := client.Do(req); if err == nil { break }; time.Sleep(baseDelay * (1 << i)) }",
      "Использовать стандартный http.Retry из stdlib",
      "Exponential backoff: delay = base * 2^attempt + jitter"
    ],
    correct: 3,
    explanation: "Правильный exponential backoff: delay = base * 2^attempt + random jitter (предотвращает thundering herd). Важно: нельзя повторно использовать одно и то же http.Request — Body уже прочитан. Нужно пересоздавать запрос. Библиотека: hashicorp/go-retryablehttp."
  },
  {
    id: 45,
    question: "Что возвращает grpc.Dial (устаревший) и почему нужен grpc.NewClient?",
    options: [
      "grpc.Dial устарел в gRPC Go v1.69.0; grpc.NewClient создаёт соединение явно без немедленного подключения",
      "grpc.NewClient — просто новое название grpc.Dial без изменений",
      "grpc.Dial синхронно подключается, grpc.NewClient — асинхронно",
      "grpc.NewClient требует явного вызова conn.Connect()"
    ],
    correct: 0,
    explanation: "grpc.Dial устарел в v1.69.0. grpc.NewClient — рекомендуемая замена. Ключевое отличие: grpc.Dial по умолчанию не блокирует и начинает подключение; поведение было непредсказуемым. grpc.NewClient явнее управляет lifecycle соединения."
  },
  {
    id: 46,
    question: "Как реализовать HTTP роутер с path parameters (например /users/{id})?",
    options: [
      "Стандартный http.ServeMux не поддерживает path params — нужна сторонняя либа",
      "С Go 1.22 http.ServeMux поддерживает /users/{id} и r.PathValue(\"id\")",
      "Через regexp в middleware",
      "Только через gorilla/mux или chi"
    ],
    correct: 1,
    explanation: "С Go 1.22 http.ServeMux поддерживает паттерны с {name}: mux.HandleFunc(\"/users/{id}\", handler). Внутри: id := r.PathValue(\"id\"). До Go 1.22 использовались gorilla/mux, chi, httprouter."
  },
  {
    id: 47,
    question: "Как логировать входящие HTTP запросы (access log) в Go?",
    options: [
      "Встроенный http.AccessLog(handler)",
      "Middleware, записывающий метод, путь, статус, latency с помощью responseWriter-обёртки",
      "Флаг -accesslog при запуске",
      "log.Println в каждом обработчике"
    ],
    correct: 1,
    explanation: "Access log middleware: обернуть ResponseWriter для перехвата статус-кода и размера ответа, засечь время до и после ServeHTTP. Логировать: метод, URI, статус, bytes, duration, request-id. Популярные: chi/middleware, gorilla/handlers."
  },
  {
    id: 48,
    question: "Что такое request ID и как его правильно реализовать?",
    options: [
      "Request ID — номер запроса, увеличивающийся на 1 для каждого запроса",
      "Уникальный UUID генерируется в middleware, добавляется в context и заголовок X-Request-ID",
      "Request ID берётся только из входящего заголовка X-Request-ID",
      "Request ID — это номер TCP соединения"
    ],
    correct: 1,
    explanation: "Request ID middleware: читает X-Request-ID из запроса (если есть, иначе генерирует UUID), добавляет в context (для логов) и в ответный заголовок X-Request-ID (для клиента). Позволяет коррелировать логи одного запроса."
  },
  {
    id: 49,
    question: "Как настроить gRPC interceptor для логирования всех вызовов?",
    code: `s := grpc.NewServer(
    // ???
)`,
    options: [
      "grpc.NewServer(grpc.Logger(myLogger))",
      "grpc.NewServer(grpc.UnaryInterceptor(loggingInterceptor))",
      "s.AddInterceptor(loggingInterceptor)",
      "grpc.NewServer(grpc.Middleware(loggingInterceptor))"
    ],
    correct: 1,
    explanation: "grpc.UnaryInterceptor для унарных методов, grpc.StreamInterceptor для стриминга. Для нескольких interceptors: grpc.ChainUnaryInterceptor(interceptor1, interceptor2). Библиотека grpc-ecosystem/go-grpc-middleware предоставляет готовые interceptors."
  },
  {
    id: 50,
    question: "Что такое readiness probe vs liveness probe в контексте Kubernetes и Go-сервиса?",
    options: [
      "Это одно и то же — оба проверяют жив ли процесс",
      "Liveness: жив ли контейнер (→ restart если нет); Readiness: готов ли принимать трафик (→ убрать из балансировки если нет)",
      "Readiness проверяется только при старте, liveness — постоянно",
      "Liveness — HTTP проверка, readiness — TCP проверка"
    ],
    correct: 1,
    explanation: "Liveness (/healthz): если 503 — k8s перезапустит pod. Readiness (/readyz): если 503 — pod убирается из Service endpoints. В Go: liveness всегда 200 если процесс жив; readiness проверяет подключение к БД, кэшу, нужным сервисам."
  }
];
