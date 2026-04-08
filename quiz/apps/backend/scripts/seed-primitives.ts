/**
 * Seed 50 questions for the "primitives" block.
 * Covers: data types, strings/runes, constants/iota, pointers,
 * arrays/slices, maps, structs/tags, functions/closures,
 * packages/modules, visibility/init(), generics, code review.
 *
 * Run: MONGODB_URI=... MONGODB_DB_NAME=go_quiz pnpm --filter @quiz/backend exec tsx --tsconfig tsconfig.seed.json scripts/seed-primitives.ts
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
  // ТИПЫ ДАННЫХ (1-7)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'Каков размер типа int в Go на 64-битной платформе?',
      en: 'What is the size of the int type in Go on a 64-bit platform?',
    },
    options: {
      ru: ['Всегда 4 байта', 'Всегда 8 байт', 'Зависит от платформы: 4 или 8 байт', 'Определяется компилятором при сборке'],
      en: ['Always 4 bytes', 'Always 8 bytes', 'Platform-dependent: 4 or 8 bytes', 'Determined by the compiler at build time'],
    },
    correct: 2,
    explanation: {
      ru: 'Тип int в Go имеет платформо-зависимый размер: 4 байта на 32-битных и 8 байт на 64-битных системах. Для фиксированного размера используйте int32 или int64.',
      en: 'The int type in Go is platform-dependent: 4 bytes on 32-bit and 8 bytes on 64-bit systems. Use int32 or int64 for fixed sizes.',
    },
    difficulty: 'basic',
    tags: ['types'],
  },
  {
    question: {
      ru: 'Что будет выведено?\nvar x float64\nfmt.Println(x)',
      en: 'What will be printed?\nvar x float64\nfmt.Println(x)',
    },
    options: {
      ru: ['0', '0.0', 'nil', 'Ошибка компиляции'],
      en: ['0', '0.0', 'nil', 'Compilation error'],
    },
    correct: 0,
    explanation: {
      ru: 'Нулевое значение для float64 — это 0, и fmt.Println выводит его как "0" (без десятичной точки, если дробная часть нулевая). fmt.Printf("%.1f") выведет "0.0".',
      en: 'The zero value for float64 is 0, and fmt.Println prints it as "0" (no decimal point when fractional part is zero). fmt.Printf("%.1f") would print "0.0".',
    },
    difficulty: 'basic',
    tags: ['types', 'zero-values'],
  },
  {
    question: {
      ru: 'Какой тип имеет нетипизированная константа 42 в Go?',
      en: 'What type does the untyped constant 42 have in Go?',
    },
    options: {
      ru: ['int', 'int64', 'Нетипизированная целочисленная константа', 'uint'],
      en: ['int', 'int64', 'Untyped integer constant', 'uint'],
    },
    correct: 2,
    explanation: {
      ru: 'В Go числовые литералы — это нетипизированные константы. Тип определяется в момент использования: при присвоении переменной, передаче в функцию и т.д. Это позволяет 42 быть совместимым с int, float64, complex128 и другими числовыми типами.',
      en: 'In Go, numeric literals are untyped constants. The type is determined at the point of use: when assigned to a variable, passed to a function, etc. This allows 42 to be compatible with int, float64, complex128 and other numeric types.',
    },
    difficulty: 'basic',
    tags: ['types', 'constants'],
  },
  {
    question: {
      ru: 'Можно ли сравнивать значения разных числовых типов напрямую?',
      en: 'Can you directly compare values of different numeric types?',
    },
    code: 'var a int32 = 10\nvar b int64 = 10\nfmt.Println(a == b)',
    options: {
      ru: ['Да, выведет true', 'Да, выведет false', 'Ошибка компиляции: несовместимые типы', 'Паника во время выполнения'],
      en: ['Yes, prints true', 'Yes, prints false', 'Compilation error: incompatible types', 'Runtime panic'],
    },
    correct: 2,
    explanation: {
      ru: 'Go — строго типизированный язык. Сравнение int32 и int64 невозможно без явного приведения типов. Нужно: fmt.Println(int64(a) == b).',
      en: 'Go is strictly typed. Comparing int32 and int64 is not allowed without explicit type conversion. Use: fmt.Println(int64(a) == b).',
    },
    difficulty: 'basic',
    tags: ['types', 'comparison'],
  },
  {
    question: {
      ru: 'Каково нулевое значение для типа bool в Go?',
      en: 'What is the zero value for the bool type in Go?',
    },
    options: {
      ru: ['true', 'false', 'nil', '0'],
      en: ['true', 'false', 'nil', '0'],
    },
    correct: 1,
    explanation: {
      ru: 'Нулевое значение bool — false. В Go каждый тип имеет нулевое значение: числа → 0, строки → "", указатели/слайсы/карты → nil, bool → false.',
      en: 'The zero value of bool is false. In Go every type has a zero value: numbers → 0, strings → "", pointers/slices/maps → nil, bool → false.',
    },
    difficulty: 'basic',
    tags: ['types', 'zero-values'],
  },
  {
    question: {
      ru: 'Что такое rune в Go?',
      en: 'What is a rune in Go?',
    },
    options: {
      ru: ['Алиас для byte', 'Алиас для int32, представляет Unicode code point', 'Специальный тип для работы с UTF-8', 'Алиас для uint32'],
      en: ['Alias for byte', 'Alias for int32, represents a Unicode code point', 'Special type for UTF-8 handling', 'Alias for uint32'],
    },
    correct: 1,
    explanation: {
      ru: 'rune — это алиас для int32. Он представляет один Unicode code point. Строки в Go хранятся как последовательность байт (UTF-8), а rune позволяет работать с отдельными символами.',
      en: 'rune is an alias for int32. It represents a single Unicode code point. Go strings are stored as byte sequences (UTF-8), and rune allows working with individual characters.',
    },
    difficulty: 'basic',
    tags: ['types', 'rune'],
  },
  {
    question: {
      ru: 'Что выведет этот код?',
      en: 'What will this code print?',
    },
    code: 's := "Привет"\nfmt.Println(len(s))',
    options: {
      ru: ['6', '12', '7', 'Ошибка компиляции'],
      en: ['6', '12', '7', 'Compilation error'],
    },
    correct: 1,
    explanation: {
      ru: 'len(s) возвращает количество байт, а не символов. Каждая кириллическая буква в UTF-8 занимает 2 байта. "Привет" = 6 символов × 2 байта = 12 байт. Для подсчёта символов используйте utf8.RuneCountInString(s).',
      en: 'len(s) returns the number of bytes, not characters. Each Cyrillic letter in UTF-8 takes 2 bytes. "Привет" = 6 characters × 2 bytes = 12 bytes. Use utf8.RuneCountInString(s) to count characters.',
    },
    difficulty: 'basic-intermediate',
    tags: ['strings', 'utf8'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // СТРОКИ И РУНЫ (8-12)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'Являются ли строки в Go изменяемыми (mutable)?',
      en: 'Are strings in Go mutable?',
    },
    options: {
      ru: ['Да, строки можно изменять по индексу', 'Нет, строки неизменяемы', 'Только если использовать unsafe', 'Зависит от того, как строка была создана'],
      en: ['Yes, strings can be modified by index', 'No, strings are immutable', 'Only with unsafe', 'Depends on how the string was created'],
    },
    correct: 1,
    explanation: {
      ru: 'Строки в Go неизменяемы. Попытка s[0] = \'H\' вызовет ошибку компиляции. Для изменения нужно конвертировать в []byte или []rune, изменить и создать новую строку.',
      en: 'Strings in Go are immutable. Attempting s[0] = \'H\' causes a compilation error. To modify, convert to []byte or []rune, modify, and create a new string.',
    },
    difficulty: 'basic',
    tags: ['strings'],
  },
  {
    question: {
      ru: 'Что произойдёт при итерации по строке с помощью range?',
      en: 'What happens when iterating over a string with range?',
    },
    code: 'for i, c := range "Go🚀" {\n  fmt.Printf("%d:%c ", i, c)\n}',
    options: {
      ru: ['0:G 1:o 2:🚀', '0:G 1:o 2:🚀 3: 4: 5:', '0:G 1:o 2:🚀 (индексы — байтовые смещения)', 'Ошибка: эмодзи не поддерживается'],
      en: ['0:G 1:o 2:🚀', '0:G 1:o 2:🚀 3: 4: 5:', '0:G 1:o 2:🚀 (indices are byte offsets)', 'Error: emoji not supported'],
    },
    correct: 2,
    explanation: {
      ru: 'range по строке итерирует по рунам (не байтам), но индекс i — это байтовое смещение. "G"=1 байт (i=0), "o"=1 байт (i=1), "🚀"=4 байта (i=2). Следующий индекс был бы 6.',
      en: 'range over a string iterates by runes (not bytes), but index i is the byte offset. "G"=1 byte (i=0), "o"=1 byte (i=1), "🚀"=4 bytes (i=2). Next index would be 6.',
    },
    difficulty: 'basic-intermediate',
    tags: ['strings', 'range', 'rune'],
  },
  {
    question: {
      ru: 'Как эффективно конкатенировать множество строк в цикле?',
      en: 'How to efficiently concatenate many strings in a loop?',
    },
    options: {
      ru: ['Оператором +', 'fmt.Sprintf()', 'strings.Builder', 'bytes.Buffer (менее эффективен для строк)'],
      en: ['Using + operator', 'fmt.Sprintf()', 'strings.Builder', 'bytes.Buffer (less efficient for strings)'],
    },
    correct: 2,
    explanation: {
      ru: 'strings.Builder — самый эффективный способ. Конкатенация через + в цикле создаёт новую строку на каждой итерации (O(n²) по памяти). strings.Builder минимизирует аллокации.',
      en: 'strings.Builder is the most efficient way. Concatenation with + in a loop creates a new string each iteration (O(n²) memory). strings.Builder minimizes allocations.',
    },
    difficulty: 'basic-intermediate',
    tags: ['strings', 'performance'],
  },
  {
    question: {
      ru: 'Что выведет этот код?',
      en: 'What will this code print?',
    },
    code: 's := "hello"\nb := []byte(s)\nb[0] = \'H\'\nfmt.Println(s, string(b))',
    options: {
      ru: ['Hello Hello', 'hello Hello', 'hello hello', 'Ошибка компиляции'],
      en: ['Hello Hello', 'hello Hello', 'hello hello', 'Compilation error'],
    },
    correct: 1,
    explanation: {
      ru: '[]byte(s) создаёт копию данных строки. Изменение b[0] не затрагивает оригинальную строку s, потому что строки неизменяемы. Поэтому s остаётся "hello", а string(b) = "Hello".',
      en: '[]byte(s) creates a copy of the string data. Modifying b[0] does not affect the original string s because strings are immutable. So s stays "hello" and string(b) = "Hello".',
    },
    difficulty: 'basic-intermediate',
    tags: ['strings', 'slices'],
  },
  {
    question: {
      ru: 'Какой результат сравнения строк в Go?',
      en: 'How does string comparison work in Go?',
    },
    code: 'fmt.Println("abc" == "abc")\nfmt.Println("abc" < "abd")',
    options: {
      ru: ['true, true', 'true, false', 'Ошибка: строки нельзя сравнивать <', 'Зависит от локали'],
      en: ['true, true', 'true, false', 'Error: strings cannot be compared with <', 'Depends on locale'],
    },
    correct: 0,
    explanation: {
      ru: 'Строки в Go сравниваются лексикографически по байтам. == проверяет равенство, а <, > сравнивают побайтово. Это не зависит от локали.',
      en: 'Strings in Go are compared lexicographically by bytes. == checks equality, < and > compare byte by byte. This is locale-independent.',
    },
    difficulty: 'basic',
    tags: ['strings', 'comparison'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // КОНСТАНТЫ И IOTA (13-16)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'Что выведет этот код с iota?',
      en: 'What will this code with iota print?',
    },
    code: 'const (\n  A = iota     // 0\n  B            // 1\n  _            // 2 (пропущен)\n  D            // 3\n)\nfmt.Println(D)',
    options: {
      ru: ['2', '3', '4', 'Ошибка компиляции'],
      en: ['2', '3', '4', 'Compilation error'],
    },
    correct: 1,
    explanation: {
      ru: 'iota увеличивается на 1 для каждой строки в блоке const, даже если значение не используется (_ = blank identifier). A=0, B=1, _=2, D=3.',
      en: 'iota increments by 1 for each line in a const block, even if the value is unused (_ = blank identifier). A=0, B=1, _=2, D=3.',
    },
    difficulty: 'basic-intermediate',
    tags: ['constants', 'iota'],
  },
  {
    question: {
      ru: 'Как создать битовые флаги с помощью iota?',
      en: 'How to create bit flags using iota?',
    },
    code: 'const (\n  FlagRead  = 1 << iota // ?\n  FlagWrite             // ?\n  FlagExec              // ?\n)',
    options: {
      ru: ['1, 2, 3', '1, 2, 4', '0, 1, 2', '2, 4, 8'],
      en: ['1, 2, 3', '1, 2, 4', '0, 1, 2', '2, 4, 8'],
    },
    correct: 1,
    explanation: {
      ru: '1 << iota создаёт степени двойки: 1<<0=1, 1<<1=2, 1<<2=4. Это классический паттерн для битовых флагов. Комбинация: FlagRead | FlagWrite = 3.',
      en: '1 << iota creates powers of two: 1<<0=1, 1<<1=2, 1<<2=4. This is the classic bit flag pattern. Combination: FlagRead | FlagWrite = 3.',
    },
    difficulty: 'basic-intermediate',
    tags: ['constants', 'iota', 'bitflags'],
  },
  {
    question: {
      ru: 'Можно ли изменить значение константы в Go?',
      en: 'Can you change the value of a constant in Go?',
    },
    options: {
      ru: ['Да, через присваивание', 'Нет, константы неизменяемы', 'Только если тип — указатель', 'Только через unsafe.Pointer'],
      en: ['Yes, via assignment', 'No, constants are immutable', 'Only if the type is a pointer', 'Only through unsafe.Pointer'],
    },
    correct: 1,
    explanation: {
      ru: 'Константы в Go вычисляются во время компиляции и не могут быть изменены. Они не имеют адреса в памяти, поэтому даже unsafe не поможет.',
      en: 'Constants in Go are evaluated at compile time and cannot be changed. They have no memory address, so even unsafe cannot help.',
    },
    difficulty: 'basic',
    tags: ['constants'],
  },
  {
    question: {
      ru: 'Что произойдёт при компиляции?',
      en: 'What will happen at compilation?',
    },
    code: 'const x = 1e1000\nfmt.Println(x)',
    options: {
      ru: ['Выведет Inf', 'Выведет очень большое число', 'Ошибка компиляции: переполнение', 'Ошибка компиляции: константа не может быть представлена как float64'],
      en: ['Prints Inf', 'Prints a very large number', 'Compilation error: overflow', 'Compilation error: constant cannot be represented as float64'],
    },
    correct: 3,
    explanation: {
      ru: 'Нетипизированные константы в Go имеют произвольную точность, но при использовании (fmt.Println) должны быть приведены к конкретному типу. 1e1000 не помещается в float64 → ошибка компиляции.',
      en: 'Untyped constants in Go have arbitrary precision, but when used (fmt.Println) they must be converted to a concrete type. 1e1000 does not fit in float64 → compilation error.',
    },
    difficulty: 'intermediate',
    tags: ['constants', 'types'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // УКАЗАТЕЛИ (17-20)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'Поддерживает ли Go арифметику указателей?',
      en: 'Does Go support pointer arithmetic?',
    },
    options: {
      ru: ['Да, как в C', 'Нет, только через пакет unsafe', 'Да, но только для массивов', 'Нет, вообще никак'],
      en: ['Yes, like in C', 'No, only through the unsafe package', 'Yes, but only for arrays', 'No, not at all'],
    },
    correct: 1,
    explanation: {
      ru: 'Go не поддерживает арифметику указателей в обычном коде. Через пакет unsafe можно выполнять операции с unsafe.Pointer и uintptr, но это нарушает гарантии безопасности.',
      en: 'Go does not support pointer arithmetic in regular code. Through the unsafe package you can work with unsafe.Pointer and uintptr, but this breaks safety guarantees.',
    },
    difficulty: 'basic',
    tags: ['pointers'],
  },
  {
    question: {
      ru: 'Что выведет этот код?',
      en: 'What will this code print?',
    },
    code: 'func inc(p *int) {\n  *p++\n}\n\nx := 5\ninc(&x)\nfmt.Println(x)',
    options: {
      ru: ['5', '6', 'Ошибка компиляции', 'Паника: nil pointer'],
      en: ['5', '6', 'Compilation error', 'Panic: nil pointer'],
    },
    correct: 1,
    explanation: {
      ru: 'Функция inc получает указатель на x и увеличивает значение по этому адресу. *p++ эквивалентно (*p)++ в Go (инкремент значения, на которое указывает p). Результат: 6.',
      en: 'Function inc receives a pointer to x and increments the value at that address. *p++ is equivalent to (*p)++ in Go (increment the value p points to). Result: 6.',
    },
    difficulty: 'basic',
    tags: ['pointers'],
  },
  {
    question: {
      ru: 'Можно ли взять адрес литерала в Go?',
      en: 'Can you take the address of a literal in Go?',
    },
    code: 'p := &42',
    options: {
      ru: ['Да, p будет *int', 'Нет, ошибка компиляции', 'Да, но только для составных литералов', 'Зависит от версии Go'],
      en: ['Yes, p will be *int', 'No, compilation error', 'Yes, but only for composite literals', 'Depends on Go version'],
    },
    correct: 1,
    explanation: {
      ru: 'Нельзя взять адрес числового литерала (&42 — ошибка). Но можно для составных литералов: p := &Point{1, 2}. Для простых типов используйте вспомогательную функцию: func ptr[T any](v T) *T { return &v }.',
      en: 'You cannot take the address of a numeric literal (&42 — error). But you can for composite literals: p := &Point{1, 2}. For simple types use a helper: func ptr[T any](v T) *T { return &v }.',
    },
    difficulty: 'basic-intermediate',
    tags: ['pointers'],
  },
  {
    question: {
      ru: 'Что произойдёт при разыменовании nil-указателя?',
      en: 'What happens when dereferencing a nil pointer?',
    },
    code: 'var p *int\nfmt.Println(*p)',
    options: {
      ru: ['Выведет 0', 'Ошибка компиляции', 'Паника: runtime error: invalid memory address', 'Неопределённое поведение'],
      en: ['Prints 0', 'Compilation error', 'Panic: runtime error: invalid memory address', 'Undefined behavior'],
    },
    correct: 2,
    explanation: {
      ru: 'Разыменование nil-указателя вызывает панику с сообщением "invalid memory address or nil pointer dereference". В отличие от C/C++, в Go это всегда детерминированная паника, а не UB.',
      en: 'Dereferencing a nil pointer causes a panic with "invalid memory address or nil pointer dereference". Unlike C/C++, in Go this is always a deterministic panic, not UB.',
    },
    difficulty: 'basic',
    tags: ['pointers', 'nil'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // СЛАЙСЫ (21-28)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'Из чего состоит внутренняя структура слайса в Go?',
      en: 'What is the internal structure of a slice in Go?',
    },
    options: {
      ru: ['Указатель на данные и длина', 'Указатель на данные, длина и ёмкость', 'Массив фиксированного размера', 'Связный список элементов'],
      en: ['Pointer to data and length', 'Pointer to data, length, and capacity', 'Fixed-size array', 'Linked list of elements'],
    },
    correct: 1,
    explanation: {
      ru: 'Слайс — это структура из трёх полей (slice header): указатель на нижележащий массив (ptr), длина (len) и ёмкость (cap). Размер slice header = 24 байта на 64-бит.',
      en: 'A slice is a struct of three fields (slice header): pointer to underlying array (ptr), length (len), and capacity (cap). Slice header size = 24 bytes on 64-bit.',
    },
    difficulty: 'basic',
    tags: ['slices'],
  },
  {
    question: {
      ru: 'Что выведет этот код?',
      en: 'What will this code print?',
    },
    code: 'a := []int{1, 2, 3, 4, 5}\nb := a[1:3]\nfmt.Println(len(b), cap(b))',
    options: {
      ru: ['2 2', '2 4', '3 5', '2 5'],
      en: ['2 2', '2 4', '3 5', '2 5'],
    },
    correct: 1,
    explanation: {
      ru: 'b := a[1:3] создаёт слайс с len=2 (элементы [2,3]). Ёмкость считается от начала слайса до конца нижележащего массива: cap = 5-1 = 4.',
      en: 'b := a[1:3] creates a slice with len=2 (elements [2,3]). Capacity is counted from the start of the slice to the end of the underlying array: cap = 5-1 = 4.',
    },
    difficulty: 'basic-intermediate',
    tags: ['slices', 'capacity'],
  },
  {
    question: {
      ru: 'Что произойдёт при append, если ёмкости не хватает?',
      en: 'What happens during append when capacity is insufficient?',
    },
    options: {
      ru: ['Паника', 'Аллоцируется новый массив, данные копируются', 'Элемент добавляется за пределы массива', 'Ошибка компиляции'],
      en: ['Panic', 'A new array is allocated and data is copied', 'Element is added beyond array bounds', 'Compilation error'],
    },
    correct: 1,
    explanation: {
      ru: 'Когда cap исчерпан, append выделяет новый массив с увеличенной ёмкостью, копирует данные и возвращает слайс с новым указателем. Старый массив остаётся неизменным. Алгоритм роста: до Go 1.18 — ×2 до 1024 элементов, затем ×1.25; с Go 1.18+ — плавная кривая роста. Не следует полагаться на конкретный коэффициент.',
      en: 'When cap is exhausted, append allocates a new array with increased capacity, copies data, and returns a slice with a new pointer. The old array remains unchanged. Growth algorithm: before Go 1.18 — ×2 up to 1024 elements, then ×1.25; since Go 1.18+ — smooth growth curve. Do not rely on specific growth factors.',
    },
    difficulty: 'basic-intermediate',
    tags: ['slices', 'append'],
  },
  {
    question: {
      ru: 'CODE REVIEW: Найдите баг.',
      en: 'CODE REVIEW: Find the bug.',
    },
    code: 'func filter(s []int) []int {\n  result := s[:0] // переиспользуем массив\n  for _, v := range s {\n    if v > 0 {\n      result = append(result, v)\n    }\n  }\n  return result\n}',
    options: {
      ru: ['Код корректен и безопасен', 'Баг: result и s делят один массив — оригинал s мутируется', 'Баг: result всегда nil', 'Баг: range по s видит изменения result'],
      en: ['Code is correct and safe', 'Bug: result and s share the same array — original s is mutated', 'Bug: result is always nil', 'Bug: range over s sees result changes'],
    },
    correct: 1,
    explanation: {
      ru: 's[:0] создаёт слайс длины 0, но с тем же нижележащим массивом. append перезаписывает элементы оригинала s. Если вызывающий код использует s после вызова filter — увидит повреждённые данные. Безопаснее: result := make([]int, 0, len(s)).',
      en: 's[:0] creates a zero-length slice sharing the same underlying array. append overwrites elements of the original s. If the caller uses s after calling filter — it will see corrupted data. Safer: result := make([]int, 0, len(s)).',
    },
    difficulty: 'intermediate',
    tags: ['slices', 'code-review', 'bugs'],
  },
  {
    question: {
      ru: 'Чем отличается nil-слайс от пустого слайса?',
      en: 'What is the difference between a nil slice and an empty slice?',
    },
    code: 'var a []int        // nil слайс\nb := []int{}       // пустой слайс\nc := make([]int, 0) // пустой слайс',
    options: {
      ru: ['Ничем — они полностью идентичны', 'nil-слайс == nil, пустой != nil; но оба имеют len=0, cap=0', 'nil-слайс вызовет панику при append', 'Пустой слайс аллоцирует память, nil — нет'],
      en: ['Nothing — they are identical', 'nil slice == nil, empty != nil; but both have len=0, cap=0', 'nil slice will panic on append', 'Empty slice allocates memory, nil does not'],
    },
    correct: 1,
    explanation: {
      ru: 'nil-слайс: указатель = nil. Пустой слайс: указатель != nil. Оба имеют len=0, cap=0. append работает с обоими. JSON-маршалинг различает: nil → null, [] → []. Идиоматично: для условий используйте len(s) == 0, не s == nil.',
      en: 'nil slice: pointer = nil. Empty slice: pointer != nil. Both have len=0, cap=0. append works with both. JSON marshaling differs: nil → null, [] → []. Idiomatic: use len(s) == 0, not s == nil.',
    },
    difficulty: 'intermediate',
    tags: ['slices', 'nil'],
  },
  {
    question: {
      ru: 'Что выведет этот код?',
      en: 'What will this code print?',
    },
    code: 'a := make([]int, 3, 5)\na = append(a, 1)\nfmt.Println(a)',
    options: {
      ru: ['[1]', '[0 0 0 1]', '[1 0 0 0]', 'Паника: индекс вне диапазона'],
      en: ['[1]', '[0 0 0 1]', '[1 0 0 0]', 'Panic: index out of range'],
    },
    correct: 1,
    explanation: {
      ru: 'make([]int, 3, 5) создаёт слайс с 3 нулевыми элементами и ёмкостью 5. append добавляет 1 после существующих элементов. Результат: [0 0 0 1].',
      en: 'make([]int, 3, 5) creates a slice with 3 zero elements and capacity 5. append adds 1 after existing elements. Result: [0 0 0 1].',
    },
    difficulty: 'basic-intermediate',
    tags: ['slices', 'make', 'append'],
  },
  {
    question: {
      ru: 'CODE REVIEW: Безопасен ли этот код?',
      en: 'CODE REVIEW: Is this code safe?',
    },
    code: 'func getFirst(data []byte) []byte {\n  return data[:1]\n}',
    options: {
      ru: ['Да, полностью безопасен', 'Утечка памяти: возвращённый слайс удерживает весь нижележащий массив', 'Паника если data пуст', 'И утечка памяти, и паника если data пуст'],
      en: ['Yes, fully safe', 'Memory leak: returned slice retains the entire underlying array', 'Panic if data is empty', 'Both memory leak and panic if data is empty'],
    },
    correct: 3,
    explanation: {
      ru: 'Две проблемы: 1) data[:1] паникует если len(data)==0. 2) Возвращённый слайс удерживает весь нижележащий массив data в памяти (не даёт GC собрать его). Решение: проверить len + копировать: return append([]byte{}, data[:1]...).',
      en: 'Two issues: 1) data[:1] panics if len(data)==0. 2) Returned slice retains the entire underlying data array in memory (prevents GC). Fix: check len + copy: return append([]byte{}, data[:1]...).',
    },
    difficulty: 'intermediate',
    tags: ['slices', 'code-review', 'memory-leak'],
  },
  {
    question: {
      ru: 'Как ограничить ёмкость слайса при нарезке?',
      en: 'How to limit slice capacity when slicing?',
    },
    code: 'a := []int{1, 2, 3, 4, 5}\nb := a[1:3:3] // full slice expression',
    options: {
      ru: ['b имеет len=2, cap=2', 'b имеет len=2, cap=4', 'Ошибка компиляции', 'b имеет len=3, cap=3'],
      en: ['b has len=2, cap=2', 'b has len=2, cap=4', 'Compilation error', 'b has len=3, cap=3'],
    },
    correct: 0,
    explanation: {
      ru: 'a[low:high:max] — full slice expression. len = high-low = 2, cap = max-low = 2. Это предотвращает случайное изменение элементов оригинального массива через append к b.',
      en: 'a[low:high:max] — full slice expression. len = high-low = 2, cap = max-low = 2. This prevents accidental modification of original array elements through append to b.',
    },
    difficulty: 'intermediate',
    tags: ['slices', 'capacity'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // КАРТЫ (29-33)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'Что произойдёт при чтении из nil-карты?',
      en: 'What happens when reading from a nil map?',
    },
    code: 'var m map[string]int\nfmt.Println(m["key"])',
    options: {
      ru: ['Паника', '0 (нулевое значение)', 'Ошибка компиляции', 'nil'],
      en: ['Panic', '0 (zero value)', 'Compilation error', 'nil'],
    },
    correct: 1,
    explanation: {
      ru: 'Чтение из nil-карты безопасно и возвращает нулевое значение типа (0 для int). А вот запись в nil-карту (m["key"] = 1) вызовет панику.',
      en: 'Reading from a nil map is safe and returns the zero value of the type (0 for int). Writing to a nil map (m["key"] = 1) causes a panic.',
    },
    difficulty: 'basic-intermediate',
    tags: ['maps', 'nil'],
  },
  {
    question: {
      ru: 'Гарантирован ли порядок итерации по map в Go?',
      en: 'Is the iteration order over a map guaranteed in Go?',
    },
    options: {
      ru: ['Да, по порядку вставки', 'Да, по отсортированным ключам', 'Нет, порядок рандомизирован намеренно', 'Зависит от реализации хеш-функции'],
      en: ['Yes, insertion order', 'Yes, sorted keys', 'No, order is intentionally randomized', 'Depends on hash function implementation'],
    },
    correct: 2,
    explanation: {
      ru: 'Go намеренно рандомизирует порядок итерации по map, чтобы программисты не зависели от конкретного порядка. Каждый range по одной и той же карте может дать разный порядок.',
      en: 'Go intentionally randomizes map iteration order so developers don\'t depend on a specific order. Each range over the same map may yield a different order.',
    },
    difficulty: 'basic',
    tags: ['maps', 'iteration'],
  },
  {
    question: {
      ru: 'Как проверить, существует ли ключ в map?',
      en: 'How to check if a key exists in a map?',
    },
    options: {
      ru: ['if m["key"] != nil', 'if m["key"] != 0', 'val, ok := m["key"]; if ok { ... }', 'if m.Contains("key")'],
      en: ['if m["key"] != nil', 'if m["key"] != 0', 'val, ok := m["key"]; if ok { ... }', 'if m.Contains("key")'],
    },
    correct: 2,
    explanation: {
      ru: 'Идиома «comma ok»: val, ok := m[key]. ok == true если ключ существует. Проверка через != 0 ненадёжна, т.к. нулевое значение может быть легитимным.',
      en: 'The "comma ok" idiom: val, ok := m[key]. ok == true if the key exists. Checking != 0 is unreliable since zero value may be legitimate.',
    },
    difficulty: 'basic',
    tags: ['maps'],
  },
  {
    question: {
      ru: 'Безопасно ли одновременное чтение и запись в map из разных горутин?',
      en: 'Is concurrent read and write to a map from different goroutines safe?',
    },
    options: {
      ru: ['Да, map потокобезопасен', 'Нет, будет data race и возможен краш', 'Да, если использовать буферизованный канал', 'Только чтение безопасно, запись — нет'],
      en: ['Yes, map is thread-safe', 'No, there will be a data race and possible crash', 'Yes, if using a buffered channel', 'Only reading is safe, writing is not'],
    },
    correct: 1,
    explanation: {
      ru: 'map в Go не потокобезопасен. Одновременные чтение и запись — это data race, которое приводит к краху (fatal error: concurrent map read and map write). Используйте sync.RWMutex или sync.Map.',
      en: 'map in Go is not thread-safe. Concurrent read and write is a data race that crashes (fatal error: concurrent map read and map write). Use sync.RWMutex or sync.Map.',
    },
    difficulty: 'intermediate',
    tags: ['maps', 'concurrency'],
  },
  {
    question: {
      ru: 'Можно ли использовать слайс как ключ map?',
      en: 'Can you use a slice as a map key?',
    },
    options: {
      ru: ['Да', 'Нет, ошибка компиляции', 'Только []byte', 'Только если слайс фиксированной длины'],
      en: ['Yes', 'No, compilation error', 'Only []byte', 'Only if the slice has fixed length'],
    },
    correct: 1,
    explanation: {
      ru: 'Ключи map должны быть comparable. Слайсы не сравниваемы (==), поэтому не могут быть ключами. Можно использовать массив [N]T (фиксированной длины) или строку.',
      en: 'Map keys must be comparable. Slices are not comparable (==), so they cannot be keys. You can use an array [N]T (fixed length) or a string.',
    },
    difficulty: 'basic-intermediate',
    tags: ['maps', 'types'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // СТРУКТУРЫ И ТЕГИ (34-38)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'Что такое struct tag в Go?',
      en: 'What is a struct tag in Go?',
    },
    code: 'type User struct {\n  Name string `json:"name" db:"user_name"`\n}',
    options: {
      ru: ['Комментарий для документации', 'Метаданные, доступные через reflection во время выполнения', 'Валидация полей при компиляции', 'Автоматическая генерация кода'],
      en: ['Documentation comment', 'Metadata accessible via reflection at runtime', 'Field validation at compile time', 'Automatic code generation'],
    },
    correct: 1,
    explanation: {
      ru: 'Struct tags — строковые метаданные, прикреплённые к полям. Доступны через reflect.StructField.Tag. Используются библиотеками (encoding/json, GORM, validator) для настройки поведения.',
      en: 'Struct tags are string metadata attached to fields. Accessible via reflect.StructField.Tag. Used by libraries (encoding/json, GORM, validator) to configure behavior.',
    },
    difficulty: 'basic',
    tags: ['structs', 'tags'],
  },
  {
    question: {
      ru: 'Можно ли сравнивать структуры оператором ==?',
      en: 'Can structs be compared with the == operator?',
    },
    options: {
      ru: ['Да, всегда', 'Только если все поля comparable', 'Нет, нужен reflect.DeepEqual', 'Только если структура реализует Comparable'],
      en: ['Yes, always', 'Only if all fields are comparable', 'No, need reflect.DeepEqual', 'Only if struct implements Comparable'],
    },
    correct: 1,
    explanation: {
      ru: 'Структуры сравнимы через ==, если ВСЕ их поля comparable. Структура с полем []int или map не сравнима. Для таких случаев — reflect.DeepEqual или ручное сравнение.',
      en: 'Structs are comparable via == if ALL their fields are comparable. A struct with a []int or map field is not comparable. For such cases — reflect.DeepEqual or manual comparison.',
    },
    difficulty: 'basic-intermediate',
    tags: ['structs', 'comparison'],
  },
  {
    question: {
      ru: 'Что такое выравнивание (alignment) полей структуры?',
      en: 'What is struct field alignment?',
    },
    code: 'type A struct {\n  a bool   // 1 byte\n  b int64  // 8 bytes\n  c bool   // 1 byte\n}\nfmt.Println(unsafe.Sizeof(A{}))',
    options: {
      ru: ['10', '24', '16', '12'],
      en: ['10', '24', '16', '12'],
    },
    correct: 1,
    explanation: {
      ru: 'Компилятор добавляет padding для выравнивания. bool (1) + padding (7) + int64 (8) + bool (1) + padding (7) = 24 байта. Если переставить поля: int64, bool, bool — будет 16 байт.',
      en: 'The compiler adds padding for alignment. bool (1) + padding (7) + int64 (8) + bool (1) + padding (7) = 24 bytes. Reorder to: int64, bool, bool — 16 bytes.',
    },
    difficulty: 'intermediate',
    tags: ['structs', 'memory', 'alignment'],
  },
  {
    question: {
      ru: 'Что такое встраивание (embedding) структур в Go?',
      en: 'What is struct embedding in Go?',
    },
    code: 'type Animal struct {\n  Name string\n}\nfunc (a Animal) Speak() string { return a.Name }\n\ntype Dog struct {\n  Animal\n  Breed string\n}',
    options: {
      ru: ['Наследование как в Java/C++', 'Композиция: методы Animal продвигаются на Dog', 'Dog является подтипом Animal', 'Animal — интерфейс для Dog'],
      en: ['Inheritance like Java/C++', 'Composition: Animal methods are promoted to Dog', 'Dog is a subtype of Animal', 'Animal is an interface for Dog'],
    },
    correct: 1,
    explanation: {
      ru: 'Встраивание — это композиция, не наследование. Методы Animal «продвигаются» на Dog: можно вызвать dog.Speak(). Но Dog не является подтипом Animal — нельзя передать Dog туда, где ожидается Animal.',
      en: 'Embedding is composition, not inheritance. Animal methods are "promoted" to Dog: you can call dog.Speak(). But Dog is not a subtype of Animal — you cannot pass Dog where Animal is expected.',
    },
    difficulty: 'basic-intermediate',
    tags: ['structs', 'embedding', 'oop'],
  },
  {
    question: {
      ru: 'CODE REVIEW: Что выведет этот код?',
      en: 'CODE REVIEW: What will this code print?',
    },
    code: 'type Config struct {\n  Debug bool\n  Port  int `json:"port"`\n}\n\nc := Config{}\nb, _ := json.Marshal(c)\nfmt.Println(string(b))',
    options: {
      ru: ['{"Debug":false,"port":0}', '{"port":0}', '{}', '{"Debug":false,"Port":0}'],
      en: ['{"Debug":false,"port":0}', '{"port":0}', '{}', '{"Debug":false,"Port":0}'],
    },
    correct: 0,
    explanation: {
      ru: 'json.Marshal включает все экспортируемые поля. Debug не имеет json-тега → используется имя поля "Debug". Port имеет тег `json:"port"` → используется "port". Нулевые значения включаются (для исключения: json:"port,omitempty").',
      en: 'json.Marshal includes all exported fields. Debug has no json tag → field name "Debug" is used. Port has tag `json:"port"` → "port" is used. Zero values are included (to exclude: json:"port,omitempty").',
    },
    difficulty: 'basic-intermediate',
    tags: ['structs', 'json', 'code-review'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ФУНКЦИИ И ЗАМЫКАНИЯ (39-43)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'CODE REVIEW: Что выведет этот код?',
      en: 'CODE REVIEW: What will this code print?',
    },
    code: 'funcs := make([]func(), 3)\nfor i := 0; i < 3; i++ {\n  funcs[i] = func() { fmt.Println(i) }\n}\nfor _, f := range funcs {\n  f()\n}',
    options: {
      ru: ['0 1 2', '3 3 3', '2 2 2', 'Ошибка компиляции'],
      en: ['0 1 2', '3 3 3', '2 2 2', 'Compilation error'],
    },
    correct: 0,
    explanation: {
      ru: 'Начиная с Go 1.22, переменная цикла for создаётся заново на каждой итерации — каждое замыкание захватывает своё значение i, поэтому выведет 0 1 2. В версиях до 1.22 все три функции захватывали одну и ту же переменную i, и результат был 3 3 3.',
      en: 'Starting with Go 1.22, the loop variable is recreated each iteration — each closure captures its own value of i, so it prints 0 1 2. Before 1.22, all three functions captured the same variable i, resulting in 3 3 3.',
    },
    difficulty: 'intermediate',
    tags: ['closures', 'code-review', 'gotchas'],
  },
  {
    question: {
      ru: 'Поддерживает ли Go перегрузку функций (overloading)?',
      en: 'Does Go support function overloading?',
    },
    options: {
      ru: ['Да, как в Java', 'Нет, но можно использовать variadic функции', 'Только для методов с разными receiver-ами', 'Да, с помощью дженериков'],
      en: ['Yes, like Java', 'No, but variadic functions can be used', 'Only for methods with different receivers', 'Yes, with generics'],
    },
    correct: 1,
    explanation: {
      ru: 'Go не поддерживает перегрузку функций. Вместо этого используют variadic параметры (func f(args ...int)), функциональные опции (Option pattern), или разные имена функций.',
      en: 'Go does not support function overloading. Instead, use variadic parameters (func f(args ...int)), functional options (Option pattern), or different function names.',
    },
    difficulty: 'basic',
    tags: ['functions'],
  },
  {
    question: {
      ru: 'Что такое именованные возвращаемые значения?',
      en: 'What are named return values?',
    },
    code: 'func divide(a, b float64) (result float64, err error) {\n  if b == 0 {\n    err = errors.New("division by zero")\n    return // naked return\n  }\n  result = a / b\n  return\n}',
    options: {
      ru: ['Сахар для documentation — ничего не делают', 'Создают переменные с нулевыми значениями и позволяют naked return', 'Обязывают caller использовать те же имена', 'Включают автоматическую обработку ошибок'],
      en: ['Documentation sugar — they do nothing', 'Create variables with zero values and enable naked return', 'Force the caller to use the same names', 'Enable automatic error handling'],
    },
    correct: 1,
    explanation: {
      ru: 'Именованные возвращаемые значения — это переменные, инициализированные нулевыми значениями. return без аргументов (naked return) возвращает текущие значения этих переменных. Полезно для defer + error handling.',
      en: 'Named return values are variables initialized with zero values. A return without arguments (naked return) returns the current values of these variables. Useful for defer + error handling.',
    },
    difficulty: 'basic-intermediate',
    tags: ['functions', 'return'],
  },
  {
    question: {
      ru: 'Что произойдёт при вызове defer в цикле?',
      en: 'What happens when defer is called in a loop?',
    },
    code: 'for i := 0; i < 3; i++ {\n  defer fmt.Println(i)\n}',
    options: {
      ru: ['0 1 2', '2 1 0', '3 3 3', 'Ошибка компиляции'],
      en: ['0 1 2', '2 1 0', '3 3 3', 'Compilation error'],
    },
    correct: 1,
    explanation: {
      ru: 'defer работает как стек (LIFO). Аргументы вычисляются в момент вызова defer, поэтому значения i фиксируются: 0, 1, 2. Но выполняются в обратном порядке: 2, 1, 0.',
      en: 'defer works as a stack (LIFO). Arguments are evaluated at the time of the defer call, so i values are captured: 0, 1, 2. But executed in reverse order: 2, 1, 0.',
    },
    difficulty: 'basic-intermediate',
    tags: ['defer', 'closures'],
  },
  {
    question: {
      ru: 'Являются ли функции в Go «first-class citizens»?',
      en: 'Are functions in Go "first-class citizens"?',
    },
    options: {
      ru: ['Нет, функции нельзя передавать как аргументы', 'Да: можно присваивать переменным, передавать и возвращать', 'Только анонимные функции', 'Только через интерфейсы'],
      en: ['No, functions cannot be passed as arguments', 'Yes: can be assigned to variables, passed and returned', 'Only anonymous functions', 'Only through interfaces'],
    },
    correct: 1,
    explanation: {
      ru: 'Функции в Go — полноценные значения. Их можно присваивать переменным, передавать как аргументы, возвращать из функций. Тип функции: func(int, int) int.',
      en: 'Functions in Go are first-class values. They can be assigned to variables, passed as arguments, and returned from functions. Function type: func(int, int) int.',
    },
    difficulty: 'basic',
    tags: ['functions'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ПАКЕТЫ, ВИДИМОСТЬ, MODERN GO (44-47)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'Как определяется видимость (экспорт) в Go?',
      en: 'How is visibility (export) determined in Go?',
    },
    options: {
      ru: ['Ключевыми словами public/private', 'Первой буквой имени: заглавная = экспортировано', 'Аннотациями //go:export', 'Файлом exports.go в пакете'],
      en: ['With public/private keywords', 'By the first letter: uppercase = exported', 'With //go:export annotations', 'With exports.go file in package'],
    },
    correct: 1,
    explanation: {
      ru: 'В Go видимость определяется регистром первой буквы: Заглавная = экспортировано (public), строчная = не экспортировано (package-private). Это касается функций, типов, переменных, констант, полей структур и методов.',
      en: 'In Go, visibility is determined by the first letter case: Uppercase = exported (public), lowercase = unexported (package-private). This applies to functions, types, variables, constants, struct fields, and methods.',
    },
    difficulty: 'basic',
    tags: ['packages', 'visibility'],
  },
  {
    question: {
      ru: 'Какой новый синтаксис цикла появился в Go 1.22?',
      en: 'What new loop syntax was introduced in Go 1.22?',
    },
    code: 'for i := range 5 {\n  fmt.Println(i)\n}',
    options: {
      ru: ['Выведет 0 1 2 3 4 — range по целому числу итерирует от 0 до N-1', 'Ошибка компиляции — range работает только с коллекциями', 'Выведет 1 2 3 4 5 — range по числу итерирует от 1 до N', 'Бесконечный цикл — range не поддерживает числа'],
      en: ['Prints 0 1 2 3 4 — range over integer iterates from 0 to N-1', 'Compilation error — range only works with collections', 'Prints 1 2 3 4 5 — range over number iterates from 1 to N', 'Infinite loop — range does not support numbers'],
    },
    correct: 0,
    explanation: {
      ru: 'В Go 1.22 добавлен range по целому числу: `for i := range N` эквивалентен `for i := 0; i < N; i++`. Итерация от 0 до N-1. Это лаконичнее и идиоматичнее для простых циклов.',
      en: 'Go 1.22 added range over integers: `for i := range N` is equivalent to `for i := 0; i < N; i++`. Iterates from 0 to N-1. More concise and idiomatic for simple loops.',
    },
    difficulty: 'basic',
    tags: ['loops', 'go1.22', 'modern-go'],
  },
  {
    question: {
      ru: 'Что делает cmp.Or из Go 1.22?',
      en: 'What does cmp.Or from Go 1.22 do?',
    },
    code: 'name := cmp.Or(os.Getenv("NAME"), cfg.Name, "default")',
    options: {
      ru: ['Возвращает первое ненулевое значение из аргументов', 'Сравнивает все аргументы и возвращает наибольший', 'Возвращает true, если хотя бы один аргумент ненулевой', 'Паникует, если все аргументы нулевые'],
      en: ['Returns the first non-zero value from arguments', 'Compares all arguments and returns the largest', 'Returns true if at least one argument is non-zero', 'Panics if all arguments are zero'],
    },
    correct: 0,
    explanation: {
      ru: 'cmp.Or возвращает первое ненулевое значение из списка. Если все нулевые — возвращает zero value типа. Заменяет цепочку if/else для выбора дефолтов: cmp.Or(flag, env, config, "default").',
      en: 'cmp.Or returns the first non-zero value from the list. If all are zero, returns the zero value of the type. Replaces if/else chains for default selection: cmp.Or(flag, env, config, "default").',
    },
    difficulty: 'intermediate',
    tags: ['cmp', 'go1.22', 'modern-go'],
  },
  {
    question: {
      ru: 'Что нового даёт расширенный new() в Go 1.26?',
      en: 'What does the extended new() in Go 1.26 provide?',
    },
    code: 'cfg := Config{\n  Timeout: new(30),    // *int\n  Debug:   new(true),  // *bool\n  Name:    new("app"), // *string\n}',
    options: {
      ru: ['new() в Go 1.26 принимает выражения, не только типы — возвращает указатель на значение', 'Ошибка компиляции — new() принимает только типы', 'new(30) создаёт массив из 30 элементов', 'new() с выражением работает только для примитивов'],
      en: ['new() in Go 1.26 accepts expressions, not just types — returns pointer to value', 'Compilation error — new() only accepts types', 'new(30) creates an array of 30 elements', 'new() with expression only works for primitives'],
    },
    correct: 0,
    explanation: {
      ru: 'В Go 1.26 new() расширен: new(val) возвращает указатель на val. Тип выводится автоматически: new(0) → *int, new("s") → *string, new(T{}) → *T. Заменяет паттерн `x := val; &x` для заполнения полей со звёздочкой в структурах.',
      en: 'Go 1.26 extends new(): new(val) returns a pointer to val. Type is inferred: new(0) → *int, new("s") → *string, new(T{}) → *T. Replaces the `x := val; &x` pattern for filling pointer fields in structs.',
    },
    difficulty: 'intermediate',
    tags: ['new', 'go1.26', 'modern-go'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ДЖЕНЕРИКИ (48-50)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    question: {
      ru: 'Какой constraint использовать для типа, поддерживающего сравнение ==?',
      en: 'Which constraint to use for a type that supports == comparison?',
    },
    options: {
      ru: ['any', 'comparable', 'constraints.Ordered', 'interface{ Equal() bool }'],
      en: ['any', 'comparable', 'constraints.Ordered', 'interface{ Equal() bool }'],
    },
    correct: 1,
    explanation: {
      ru: 'comparable — встроенный constraint для типов, поддерживающих == и !=. any (alias для interface{}) не гарантирует сравнимость. constraints.Ordered — для типов с <, >, <=, >=.',
      en: 'comparable is a built-in constraint for types supporting == and !=. any (alias for interface{}) does not guarantee comparability. constraints.Ordered is for types with <, >, <=, >=.',
    },
    difficulty: 'basic-intermediate',
    tags: ['generics'],
  },
  {
    question: {
      ru: 'Что выведет эта generic-функция?',
      en: 'What will this generic function print?',
    },
    code: 'func Map[T any, R any](s []T, f func(T) R) []R {\n  result := make([]R, len(s))\n  for i, v := range s {\n    result[i] = f(v)\n  }\n  return result\n}\n\nnums := []int{1, 2, 3}\nstrs := Map(nums, strconv.Itoa)\nfmt.Println(strs)',
    options: {
      ru: ['[1 2 3]', '["1" "2" "3"]', 'Ошибка компиляции: нужно указать типы', 'Ошибка: strconv.Itoa несовместим'],
      en: ['[1 2 3]', '["1" "2" "3"]', 'Compilation error: types must be specified', 'Error: strconv.Itoa incompatible'],
    },
    correct: 0,
    explanation: {
      ru: 'Go выводит типы T=int, R=string автоматически из аргументов. strconv.Itoa имеет сигнатуру func(int) string, что совпадает с func(T) R. fmt.Println выводит строковый слайс как [1 2 3] (без кавычек).',
      en: 'Go infers types T=int, R=string automatically from arguments. strconv.Itoa has signature func(int) string, matching func(T) R. fmt.Println prints string slice as [1 2 3] (no quotes).',
    },
    difficulty: 'intermediate',
    tags: ['generics', 'type-inference'],
  },
  {
    question: {
      ru: 'CODE REVIEW: Скомпилируется ли этот код?',
      en: 'CODE REVIEW: Will this code compile?',
    },
    code: 'type Number interface {\n  int | float64 | string\n}\n\nfunc Sum[T Number](a, b T) T {\n  return a + b\n}',
    options: {
      ru: ['Да, вызов Sum(1, 2) вернёт 3', 'Нет: string поддерживает +, но это не «число»', 'Нет: нужен ~int | ~float64 | ~string', 'Да, но string в Number — ошибка дизайна'],
      en: ['Yes, Sum(1, 2) returns 3', 'No: string supports + but is not a "number"', 'No: need ~int | ~float64 | ~string', 'Yes, but string in Number is a design error'],
    },
    correct: 3,
    explanation: {
      ru: 'Код скомпилируется, т.к. все типы в union (int, float64, string) поддерживают оператор +. Но включение string в Number — ошибка дизайна: Sum("a", "b") = "ab", что не является математической суммой. Используйте ~int | ~float64 для числовых типов.',
      en: 'Code compiles since all types in the union (int, float64, string) support the + operator. But including string in Number is a design error: Sum("a", "b") = "ab" which is not a mathematical sum. Use ~int | ~float64 for numeric types.',
    },
    difficulty: 'intermediate',
    tags: ['generics', 'code-review', 'design'],
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  const db = client.db(env.MONGODB_DB_NAME)
  const col = db.collection('questions')

  console.log(`\n[seed-primitives] Inserting ${questions.length} questions for block "primitives"...`)

  let inserted = 0
  let skipped = 0
  const now = new Date()

  for (const q of questions) {
    // Check if already exists (by Russian question text)
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

  console.log(`[seed-primitives] Done: ${inserted} inserted, ${skipped} skipped (already exist)`)
  await client.close()
}

main().catch((err) => {
  console.error('[seed-primitives] Error:', err)
  process.exit(1)
})
