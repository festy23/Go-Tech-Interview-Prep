/**
 * Seed additional questions about Go 1.22–1.26 features for "primitives" block.
 * Safe to re-run — skips duplicates.
 *
 * Run: MONGODB_URI=... MONGODB_DB_NAME=go_quiz pnpm --filter @quiz/backend exec tsx --tsconfig tsconfig.seed.json scripts/seed-primitives-new-go.ts
 */
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb'
import { env } from '../src/env.js'

interface Q {
  question: { ru: string; en: string }
  code?: string
  options: { ru: [string, string, string, string]; en: [string, string, string, string] }
  correct: 0 | 1 | 2 | 3
  explanation: { ru: string; en: string }
  difficulty: 'basic' | 'basic-intermediate' | 'intermediate' | 'intermediate-advanced' | 'advanced'
  tags: string[]
}

const questions: Q[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // GO 1.22: LOOP VARIABLE PER-ITERATION
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'Что изменилось в семантике переменных цикла for в Go 1.22?',
      en: 'What changed in for-loop variable semantics in Go 1.22?',
    },
    options: {
      ru: [
        'Переменные цикла теперь создаются заново на каждой итерации',
        'Переменные цикла теперь всегда передаются по указателю',
        'Цикл for range теперь поддерживает целые числа',
        'Оба варианта: переменные per-iteration + range over int',
      ],
      en: [
        'Loop variables are now created fresh on each iteration',
        'Loop variables are now always passed by pointer',
        'for range now supports integers',
        'Both: per-iteration variables + range over int',
      ],
    },
    correct: 3,
    explanation: {
      ru: 'Go 1.22 внёс два изменения: 1) переменные цикла for создаются заново на каждой итерации (исправляет классический баг с замыканиями), 2) range теперь поддерживает целые числа: for i := range 10 { ... }.',
      en: 'Go 1.22 introduced two changes: 1) for-loop variables are recreated each iteration (fixing the classic closure bug), 2) range now supports integers: for i := range 10 { ... }.',
    },
    difficulty: 'intermediate',
    tags: ['go1.22', 'loops', 'closures'],
  },
  {
    question: {
      ru: 'Что выведет этот код в Go 1.22+?',
      en: 'What will this code print in Go 1.22+?',
    },
    code: 'var ptrs [3]*int\nfor i := range 3 {\n  ptrs[i] = &i\n}\nfmt.Println(*ptrs[0], *ptrs[1], *ptrs[2])',
    options: {
      ru: ['3 3 3', '0 1 2', '2 2 2', 'Ошибка компиляции'],
      en: ['3 3 3', '0 1 2', '2 2 2', 'Compilation error'],
    },
    correct: 1,
    explanation: {
      ru: 'В Go 1.22+ переменная i создаётся заново на каждой итерации. Поэтому &i указывает на разные переменные. До Go 1.22 все три указателя указывали бы на одну и ту же переменную, и вывод был бы "2 2 2" (или "3 3 3" для классического for).',
      en: 'In Go 1.22+ the variable i is recreated each iteration. So &i points to different variables. Before Go 1.22, all three pointers would point to the same variable, printing "2 2 2" (or "3 3 3" for classic for).',
    },
    difficulty: 'intermediate',
    tags: ['go1.22', 'loops', 'pointers'],
  },
  {
    question: {
      ru: 'Как записать цикл от 0 до 9 с помощью range в Go 1.22+?',
      en: 'How to write a loop from 0 to 9 using range in Go 1.22+?',
    },
    options: {
      ru: [
        'for i := range 10 { ... }',
        'for i := range [10]struct{}{} { ... }',
        'for i := range(0, 10) { ... }',
        'for i := 0..10 { ... }',
      ],
      en: [
        'for i := range 10 { ... }',
        'for i := range [10]struct{}{} { ... }',
        'for i := range(0, 10) { ... }',
        'for i := 0..10 { ... }',
      ],
    },
    correct: 0,
    explanation: {
      ru: 'Go 1.22 добавил range over integers: `for i := range N` итерирует i от 0 до N-1. Это сахар для `for i := 0; i < N; i++`. Работает с любым целочисленным выражением.',
      en: 'Go 1.22 added range over integers: `for i := range N` iterates i from 0 to N-1. This is sugar for `for i := 0; i < N; i++`. Works with any integer expression.',
    },
    difficulty: 'basic',
    tags: ['go1.22', 'loops', 'range'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GO 1.24: SWISS TABLES, GENERIC TYPE ALIASES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'Что такое Swiss Tables и как они связаны с Go 1.24?',
      en: 'What are Swiss Tables and how do they relate to Go 1.24?',
    },
    options: {
      ru: [
        'Новая структура данных для слайсов',
        'Новая внутренняя реализация встроенного типа map, повышающая производительность',
        'Альтернативная реализация sync.Map',
        'Новый пакет для работы с базами данных',
      ],
      en: [
        'New data structure for slices',
        'New internal implementation of the built-in map type, improving performance',
        'Alternative implementation of sync.Map',
        'New package for database operations',
      ],
    },
    correct: 1,
    explanation: {
      ru: 'В Go 1.24 встроенный тип map перешёл на реализацию Swiss Tables — хеш-таблицу с группами (SIMD-friendly). Это прозрачное изменение: API map не изменился, но операции поиска, вставки и удаления стали быстрее.',
      en: 'In Go 1.24 the built-in map type switched to Swiss Tables — a hash table with groups (SIMD-friendly). This is a transparent change: map API is unchanged, but lookup, insert, and delete operations are faster.',
    },
    difficulty: 'intermediate',
    tags: ['go1.24', 'maps', 'internals'],
  },
  {
    question: {
      ru: 'Что такое generic type aliases в Go 1.24?',
      en: 'What are generic type aliases in Go 1.24?',
    },
    code: 'type Set[T comparable] = map[T]struct{}',
    options: {
      ru: [
        'Ошибка компиляции: алиасы не поддерживают параметры типов',
        'Создаёт параметризованный алиас типа — Set[int] = map[int]struct{}',
        'Создаёт новый тип с собственными методами',
        'Работает только с constraint any',
      ],
      en: [
        'Compilation error: aliases do not support type parameters',
        'Creates a parameterized type alias — Set[int] = map[int]struct{}',
        'Creates a new type with its own methods',
        'Only works with constraint any',
      ],
    },
    correct: 1,
    explanation: {
      ru: 'Go 1.24 полностью поддерживает generic type aliases. type Set[T comparable] = map[T]struct{} создаёт параметризованный алиас. Set[int] — это ровно map[int]struct{}, без нового типа. До Go 1.24 это был экспериментальный функционал.',
      en: 'Go 1.24 fully supports generic type aliases. type Set[T comparable] = map[T]struct{} creates a parameterized alias. Set[int] is exactly map[int]struct{}, no new type. Before Go 1.24 this was experimental.',
    },
    difficulty: 'intermediate',
    tags: ['go1.24', 'generics', 'types'],
  },
  {
    question: {
      ru: 'Что появилось в go.mod в Go 1.24?',
      en: 'What was added to go.mod in Go 1.24?',
    },
    options: {
      ru: [
        'Директива replace стала обязательной',
        'Директива tool для управления зависимостями-инструментами',
        'Поддержка приватных модулей через директиву private',
        'Автоматическое обновление зависимостей через директиву auto',
      ],
      en: [
        'The replace directive became mandatory',
        'The tool directive for managing tool dependencies',
        'Private module support via the private directive',
        'Automatic dependency updates via the auto directive',
      ],
    },
    correct: 1,
    explanation: {
      ru: 'Go 1.24 добавил директиву tool в go.mod для явного указания инструментов проекта (линтеры, генераторы кода и т.д.). Это заменяет старый хак с tools.go (пустой файл с //go:build ignore и blank imports).',
      en: 'Go 1.24 added the tool directive to go.mod for explicitly listing project tools (linters, code generators, etc.). This replaces the old tools.go hack (empty file with //go:build ignore and blank imports).',
    },
    difficulty: 'intermediate',
    tags: ['go1.24', 'modules'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GO 1.26: new(expr), errors.AsType(), GREEN TEA GC, SELF-REF GENERICS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'Что нового в синтаксисе new() в Go 1.26?',
      en: 'What is new about the new() syntax in Go 1.26?',
    },
    code: 'p := new(42)\nfmt.Printf("%T %v\\n", p, *p)',
    options: {
      ru: [
        'Ошибка компиляции: new принимает только тип',
        '*int 42 — new() теперь принимает выражение и возвращает указатель на значение',
        '*int 0 — выражение игнорируется',
        'int 42 — new() возвращает значение, не указатель',
      ],
      en: [
        'Compilation error: new only accepts a type',
        '*int 42 — new() now accepts an expression and returns a pointer to the value',
        '*int 0 — expression is ignored',
        'int 42 — new() returns a value, not a pointer',
      ],
    },
    correct: 1,
    explanation: {
      ru: 'Go 1.26 расширил new(): теперь он принимает не только тип (new(int)), но и выражение (new(42)). new(42) возвращает *int, указывающий на значение 42. Это упрощает создание указателей на литералы, что особенно удобно для optional полей в JSON/protobuf.',
      en: 'Go 1.26 extended new(): it now accepts not only a type (new(int)) but also an expression (new(42)). new(42) returns *int pointing to value 42. This simplifies creating pointers to literals, especially useful for optional fields in JSON/protobuf.',
    },
    difficulty: 'intermediate',
    tags: ['go1.26', 'pointers', 'new'],
  },
  {
    question: {
      ru: 'Как new(expr) в Go 1.26 решает проблему optional-полей?',
      en: 'How does new(expr) in Go 1.26 solve the optional fields problem?',
    },
    code: 'type Config struct {\n  Timeout *int `json:"timeout,omitempty"`\n}\n\n// Go 1.25 и ранее:\nfunc ptr(v int) *int { return &v }\nc := Config{Timeout: ptr(30)}\n\n// Go 1.26:\nc := Config{Timeout: new(30)}',
    options: {
      ru: [
        'new(30) создаёт *int{30} без вспомогательной функции',
        'new(30) работает только со структурами',
        'Оба варианта идентичны по производительности, но new(30) длиннее',
        'new(30) аллоцирует на стеке, ptr(30) — на куче',
      ],
      en: [
        'new(30) creates *int{30} without a helper function',
        'new(30) only works with structs',
        'Both variants are identical in performance but new(30) is longer',
        'new(30) allocates on stack, ptr(30) on heap',
      ],
    },
    correct: 0,
    explanation: {
      ru: 'До Go 1.26 для создания указателя на литерал нужна была вспомогательная функция (func ptr[T any](v T) *T { return &v }). Теперь new(30) делает это встроенно. Особенно полезно для protobuf и JSON с optional-полями (*int, *string).',
      en: 'Before Go 1.26 creating a pointer to a literal required a helper function (func ptr[T any](v T) *T { return &v }). Now new(30) does this natively. Especially useful for protobuf and JSON with optional fields (*int, *string).',
    },
    difficulty: 'basic-intermediate',
    tags: ['go1.26', 'pointers', 'patterns'],
  },
  {
    question: {
      ru: 'Что такое errors.AsType() в Go 1.26?',
      en: 'What is errors.AsType() in Go 1.26?',
    },
    code: '// Go 1.25 и ранее:\nvar pathErr *os.PathError\nif errors.As(err, &pathErr) {\n  fmt.Println(pathErr.Path)\n}\n\n// Go 1.26:\nif pathErr, ok := errors.AsType[*os.PathError](err); ok {\n  fmt.Println(pathErr.Path)\n}',
    options: {
      ru: [
        'Generic-обёртка для errors.As — type-safe, без промежуточной переменной',
        'Замена errors.Is для проверки типов ошибок',
        'Новый интерфейс, который должны реализовать кастомные ошибки',
        'Макрос для генерации кода обработки ошибок',
      ],
      en: [
        'Generic wrapper for errors.As — type-safe, no intermediate variable needed',
        'Replacement for errors.Is for checking error types',
        'New interface that custom errors must implement',
        'Macro for generating error handling code',
      ],
    },
    correct: 0,
    explanation: {
      ru: 'errors.AsType[T]() — generic-функция из Go 1.26. Вместо объявления промежуточной переменной и передачи указателя (&pathErr), она возвращает (T, bool). Это type-safe: тип T проверяется компилятором.',
      en: 'errors.AsType[T]() is a generic function from Go 1.26. Instead of declaring an intermediate variable and passing a pointer (&pathErr), it returns (T, bool). This is type-safe: type T is checked by the compiler.',
    },
    difficulty: 'intermediate',
    tags: ['go1.26', 'errors', 'generics'],
  },
  {
    question: {
      ru: 'Что такое Green Tea GC в Go 1.26?',
      en: 'What is the Green Tea GC in Go 1.26?',
    },
    options: {
      ru: [
        'Новый алгоритм сборки мусора, снижающий overhead GC на 10-40%, включён по умолчанию',
        'Ручное управление памятью через пул объектов',
        'Замена GC на reference counting',
        'Режим без сборщика мусора для embedded-систем',
      ],
      en: [
        'New garbage collection algorithm reducing GC overhead by 10-40%, enabled by default',
        'Manual memory management via object pools',
        'Replacement of GC with reference counting',
        'GC-free mode for embedded systems',
      ],
    },
    correct: 0,
    explanation: {
      ru: 'Green Tea GC — экспериментальный в Go 1.25, по умолчанию в Go 1.26. Снижает overhead GC на 10-40% без изменения API. Отключить: GOEXPERIMENT=nogreenteagc. Основное улучшение — более эффективное управление паузами и выделением памяти.',
      en: 'Green Tea GC was experimental in Go 1.25, default in Go 1.26. Reduces GC overhead by 10-40% without API changes. Disable: GOEXPERIMENT=nogreenteagc. Main improvement — more efficient pause management and memory allocation.',
    },
    difficulty: 'intermediate',
    tags: ['go1.26', 'gc', 'runtime'],
  },
  {
    question: {
      ru: 'Что такое self-referential generic constraints в Go 1.26?',
      en: 'What are self-referential generic constraints in Go 1.26?',
    },
    code: 'type Adder[A Adder[A]] interface {\n  Add(A) A\n}',
    options: {
      ru: [
        'Ошибка компиляции: циклическая ссылка в constraint',
        'Constraint, где тип ссылается сам на себя — позволяет выразить F-bounded polymorphism',
        'Обычный generic constraint без особенностей',
        'Constraint только для числовых типов',
      ],
      en: [
        'Compilation error: circular reference in constraint',
        'Constraint where the type references itself — enables F-bounded polymorphism',
        'Ordinary generic constraint without special features',
        'Constraint only for numeric types',
      ],
    },
    correct: 1,
    explanation: {
      ru: 'Go 1.26 разрешил self-referential constraints. Adder[A Adder[A]] означает: «A — это тип, который сам реализует Adder». Это паттерн F-bounded polymorphism, полезный для fluent API, builder-ов и математических абстракций. До Go 1.26 это вызывало ошибку компиляции.',
      en: 'Go 1.26 allowed self-referential constraints. Adder[A Adder[A]] means: "A is a type that itself implements Adder". This is the F-bounded polymorphism pattern, useful for fluent APIs, builders, and mathematical abstractions. Before Go 1.26 this caused a compilation error.',
    },
    difficulty: 'advanced',
    tags: ['go1.26', 'generics', 'constraints'],
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  const db = client.db(env.MONGODB_DB_NAME)
  const col = db.collection('questions')

  console.log(`\n[seed] Inserting ${questions.length} Go 1.22-1.26 questions for block "primitives"...`)

  let inserted = 0
  let skipped = 0
  const now = new Date()

  for (const q of questions) {
    const exists = await col.findOne({ 'question.ru': q.question.ru, blockId: 'primitives' })
    if (exists) {
      skipped++
      continue
    }

    await col.insertOne({
      _id: new ObjectId(),
      type: 'mcq' as const,
      quizId: null,
      blockId: 'primitives',
      question: q.question,
      ...(q.code ? { code: q.code } : {}),
      options: q.options,
      correct: q.correct,
      explanation: q.explanation,
      difficulty: q.difficulty,
      tags: q.tags,
      createdAt: now,
      updatedAt: now,
    })
    inserted++
  }

  console.log(`[seed] Done: ${inserted} inserted, ${skipped} skipped`)
  await client.close()
}

main().catch((err) => {
  console.error('[seed] Error:', err)
  process.exit(1)
})
