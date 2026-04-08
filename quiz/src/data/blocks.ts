export type DifficultyLevel =
  | "basic"
  | "basic-intermediate"
  | "intermediate"
  | "intermediate-advanced"
  | "advanced";

export interface RoadmapBlock {
  id: string;
  title: string;
  difficulty: DifficultyLevel;
  topicCount: number;
  topics: string[];
  quizId?: 1 | 2 | 3;
  gridRow: number;
  gridCol: number;
  color: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export const ROADMAP_BLOCKS: RoadmapBlock[] = [
  {
    id: "primitives",
    title: "Примитивы Go",
    difficulty: "basic",
    topicCount: 40,
    topics: [
      "Типы данных", "Строки и руны", "Константы и iota",
      "Указатели", "Массивы и слайсы", "Карты (map)",
      "Структуры и теги", "Функции и замыкания", "Пакеты и модули",
      "Видимость и init()", "Дженерики (Go 1.18+)",
    ],
    gridRow: 1,
    gridCol: 2,
    color: "#58a6ff",
  },
  {
    id: "oop",
    title: "ООП в Go",
    difficulty: "basic-intermediate",
    topicCount: 35,
    topics: [
      "Интерфейсы и неявная реализация", "Встраивание структур",
      "Композиция вместо наследования", "Полиморфизм через интерфейсы",
      "Пустой интерфейс (any)", "Утверждения типов", "Type switch",
      "SOLID-принципы в Go", "Dependency Injection",
    ],
    gridRow: 2,
    gridCol: 1,
    color: "#79c0ff",
  },
  {
    id: "sql",
    title: "SQL",
    difficulty: "intermediate",
    topicCount: 40,
    topics: [
      "SELECT, JOIN, GROUP BY, HAVING", "Индексы: B-tree, составные, покрывающие",
      "Транзакции и ACID", "Уровни изоляции", "Дедлоки в БД",
      "Оконные функции: RANK, ROW_NUMBER, LEAD/LAG",
      "CTE и рекурсивные запросы", "EXPLAIN ANALYZE",
      "N+1 проблема", "database/sql в Go", "Пул соединений",
    ],
    gridRow: 2,
    gridCol: 3,
    color: "#d2a679",
  },
  {
    id: "concurrency",
    title: "Конкурентность в Go",
    difficulty: "intermediate",
    topicCount: 50,
    topics: [
      "Горутины и планировщик GMP", "Каналы: буферизованные и нет",
      "select и паттерны на каналах", "Pipeline, Fan-out/Fan-in",
      "Семафор через канал", "sync.Mutex и RWMutex",
      "sync.WaitGroup, sync.Once", "sync/atomic", "sync.Pool",
      "Data race и -race детектор", "Goroutine leak и context.Context",
      "errgroup", "Паттерн Worker Pool",
    ],
    quizId: 3,
    gridRow: 3,
    gridCol: 1,
    color: "#d29922",
  },
  {
    id: "networks",
    title: "Сети и Линукс",
    difficulty: "intermediate",
    topicCount: 35,
    topics: [
      "TCP/IP: 3-way handshake, TIME_WAIT", "HTTP/1.1 vs HTTP/2",
      "TLS/HTTPS: сертификаты, mTLS", "DNS и CDN",
      "epoll/kqueue и netpoll в Go", "Блокирующий vs неблокирующий I/O",
      "Процесс vs поток vs горутина", "Сигналы: SIGTERM, SIGINT",
      "Linux CFS планировщик", "mmap и файловые дескрипторы",
      "SO_REUSEPORT, TCP_NODELAY",
    ],
    gridRow: 3,
    gridCol: 3,
    color: "#a5d6ff",
  },
  {
    id: "server",
    title: "Работа с сервером в Go",
    difficulty: "intermediate-advanced",
    topicCount: 45,
    topics: [
      "net/http: Handler, ServeMux, Middleware", "gRPC и protobuf",
      "WebSockets", "Graceful shutdown с context + os/signal",
      "Health checks и readiness probes", "Structured logging: slog/zap/zerolog",
      "Configuration management: viper, 12-factor", "Dependency Injection в Go",
      "Hexagonal Architecture", "OpenTelemetry и трейсинг",
      "Prometheus метрики", "Dockerfile multi-stage builds",
    ],
    gridRow: 4,
    gridCol: 2,
    color: "#3fb950",
  },
  {
    id: "sysdesign",
    title: "System Design Go",
    difficulty: "advanced",
    topicCount: 40,
    topics: [
      "Горизонтальное vs вертикальное масштабирование",
      "CAP теорема", "Consistent hashing", "Rate limiting",
      "Circuit breaker, Retry с backoff", "Kafka / NATS / RabbitMQ",
      "Saga pattern, 2PC", "LRU Cache с TTL", "URL Shortener",
      "Pub/Sub система", "Job Queue / Task Scheduler",
      "Service Mesh и gRPC Load Balancing",
    ],
    gridRow: 5,
    gridCol: 2,
    color: "#f85149",
  },
];

export const GRAPH_EDGES: GraphEdge[] = [
  { from: "primitives", to: "oop" },
  { from: "primitives", to: "sql" },
  { from: "oop", to: "concurrency" },
  { from: "sql", to: "networks" },
  { from: "concurrency", to: "server" },
  { from: "networks", to: "server" },
  { from: "server", to: "sysdesign" },
];

// quiz id → block id that it contributes progress to
export const QUIZ_TO_BLOCK: Record<number, string> = {
  3: "concurrency",
};

export const DIFFICULTY_LABEL: Record<DifficultyLevel, string> = {
  "basic": "Базовый",
  "basic-intermediate": "Базовый+",
  "intermediate": "Средний",
  "intermediate-advanced": "Средний+",
  "advanced": "Продвинутый",
};
