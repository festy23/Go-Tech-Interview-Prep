---
title: Строки в Go
blockId: primitives-strings
parentBlockId: primitives
---

# Строки в Go

Строки — один из самых часто используемых типов в Go, и одновременно один из самых часто неправильно понимаемых. На интервью вопросы о строках встречаются регулярно: от базового «что такое rune» до тонких ловушек с конвертациями и производительностью.

## Внутреннее устройство строки

Строка в Go — это структура из двух полей:

```go
type StringHeader struct {
    Data uintptr // указатель на данные
    Len  int     // длина в байтах
}
```

Ключевое свойство: строка **неизменяема**. Нет способа модифицировать байты строки через стандартные средства языка. Это означает:

- Любая операция, изменяющая содержимое, создаёт новую строку
- Конкатенация `s1 + s2` всегда аллоцирует новую строку
- Передача строки в функцию копирует только заголовок (16 байт), не данные

```go
s := "hello"
// s[0] = 'H' // ошибка компиляции: cannot assign to s[0]

// Единственный способ "изменить" — создать новую
b := []byte(s)
b[0] = 'H'
s2 := string(b) // "Hello"
```

## UTF-8 и руны

Go хранит строки в UTF-8. Символы ASCII занимают 1 байт, кириллица — 2 байта, большинство CJK-символов — 3 байта, и т.д.

`len(s)` возвращает **количество байт**, не символов:

```go
s := "Привет"
fmt.Println(len(s))           // 12 (6 символов × 2 байта)
fmt.Println(len([]rune(s)))   // 6
fmt.Println(utf8.RuneCountInString(s)) // 6 (более эффективно)
```

Тип `rune` — это псевдоним для `int32` и представляет Unicode code point:

```go
var r rune = 'П' // 1055
fmt.Printf("%T %d %c\n", r, r, r) // int32 1055 П
```

### Итерация: bytes vs runes

Итерация по индексу — побайтовая:

```go
s := "Привет"
for i := 0; i < len(s); i++ {
    fmt.Printf("%d: %02x\n", i, s[i]) // байты, не руны
}
```

Итерация через `range` — рунная (декодирует UTF-8):

```go
for i, r := range s {
    fmt.Printf("byte[%d]: %c\n", i, r)
    // byte[0]: П
    // byte[2]: р
    // byte[4]: и
    // ...
}
```

Обратите внимание: `i` — это байтовый индекс начала руны, а не порядковый номер символа.

### Корректное индексирование по символам

```go
s := "Привет, мир!"
runes := []rune(s)
third := runes[2] // 'и' — третий символ

// Или через декодирование
_, size := utf8.DecodeRuneInString(s)
fmt.Println(size) // размер первой руны в байтах
```

## Сравнение строк

Строки сравниваются лексикографически по байтам:

```go
fmt.Println("abc" == "abc")  // true
fmt.Println("abc" < "abd")   // true
fmt.Println("б" > "а")       // true (по Unicode code point)
```

Для регистронезависимого сравнения:

```go
strings.EqualFold("Go", "go") // true
strings.EqualFold("Привет", "привет") // true — работает с Unicode
```

## Пакет strings

### Основные функции

```go
s := "  Hello, World!  "

strings.TrimSpace(s)              // "Hello, World!"
strings.ToUpper(s)                // "  HELLO, WORLD!  "
strings.ToLower(s)                // "  hello, world!  "
strings.Contains(s, "World")      // true
strings.HasPrefix(s, "  Hello")   // true
strings.HasSuffix(s, "!  ")       // true
strings.Count(s, "l")             // 3
strings.Index(s, "World")         // 9 (байтовый индекс)
strings.Replace(s, "World", "Go", 1) // заменяет первое вхождение
strings.ReplaceAll(s, "l", "L")   // все вхождения
strings.Split("a,b,c", ",")       // ["a", "b", "c"]
strings.Join([]string{"a","b"}, "-") // "a-b"
strings.Fields("  foo bar  baz  ") // ["foo", "bar", "baz"]
strings.Repeat("ab", 3)           // "ababab"
strings.TrimPrefix("Hello", "He") // "llo"
strings.TrimSuffix("Hello", "lo") // "Hel"
```

### strings.Cut (Go 1.18)

Одна из наиболее удобных функций, добавленных в Go 1.18. Разбивает строку по первому вхождению разделителя:

```go
before, after, found := strings.Cut("user@example.com", "@")
// before = "user", after = "example.com", found = true

before, after, found = strings.Cut("noatsign", "@")
// before = "noatsign", after = "", found = false
```

Заменяет паттерн с `strings.Index` + слайсингом, делая код значительно читаемее.

### strings.CutPrefix и strings.CutSuffix (Go 1.20)

```go
rest, found := strings.CutPrefix("https://example.com", "https://")
// rest = "example.com", found = true

rest, found = strings.CutSuffix("file.go", ".go")
// rest = "file", found = true
```

Удобнее, чем комбинация `HasPrefix`/`TrimPrefix`, потому что возвращает флаг, был ли префикс найден.

### strings.Clone (Go 1.20)

```go
original := "hello world"
clone := strings.Clone(original)
```

Гарантирует, что строка не разделяет память с другой строкой. Полезно, когда у вас есть большая строка-источник (например, считанная из файла), и вы хотите сохранить небольшую подстроку, не удерживая весь буфер в памяти.

```go
// Без Clone: small удерживает весь big в памяти
big := readLargeFile()
small := big[100:110]

// С Clone: big может быть собран GC
small = strings.Clone(big[100:110])
```

## strings.Builder — эффективное построение строк

Конкатенация строк в цикле — классический источник неэффективности:

```go
// Плохо: O(n²) аллокаций
result := ""
for _, s := range words {
    result += s + " "
}

// Хорошо: amortized O(n)
var b strings.Builder
for _, s := range words {
    b.WriteString(s)
    b.WriteByte(' ')
}
result := b.String()
```

`strings.Builder` реализует `io.Writer`, так что его можно использовать с `fmt.Fprintf`:

```go
var b strings.Builder
fmt.Fprintf(&b, "Hello, %s! You are %d years old.", name, age)
result := b.String()
```

Для предотвращения лишних аллокаций задавайте начальную ёмкость:

```go
var b strings.Builder
b.Grow(256) // резервирует 256 байт
```

## Конвертации и их стоимость

### string ↔ []byte

```go
s := "hello"
b := []byte(s)  // копия: O(n)
s2 := string(b) // копия: O(n)
```

Каждое преобразование аллоцирует новую память и копирует данные. Это важно в горячих путях кода.

Компилятор Go оптимизирует некоторые случаи, избегая аллокации:

```go
// Компилятор может избежать аллокации здесь:
if string(b) == "hello" { ... }
m[string(b)] // поиск в map по ключу []byte
```

### string ↔ []rune

```go
s := "Привет"
runes := []rune(s)   // декодирует UTF-8 в []int32, O(n)
s2 := string(runes)  // кодирует обратно, O(n)
```

Это дороже, чем `[]byte` конвертация, потому что требует декодирования UTF-8.

### unsafe-конвертация (только для чтения!)

В некоторых высокопроизводительных контекстах используют `unsafe` для конвертации без копирования:

```go
// Только для чтения! Изменение b изменит исходную строку
func unsafeStringToBytes(s string) []byte {
    return unsafe.Slice(unsafe.StringData(s), len(s))
}
```

Никогда не модифицируйте полученный срез. Это undefined behavior.

## Руны и специальные значения

`utf8.RuneError` (значение `\uFFFD`) возвращается при итерации по некорректной UTF-8 последовательности:

```go
s := string([]byte{0xff, 0xfe}) // некорректный UTF-8
for _, r := range s {
    if r == utf8.RuneError {
        fmt.Println("invalid UTF-8!")
    }
}
```

Проверка корректности строки:

```go
utf8.ValidString("Привет") // true
utf8.ValidString(string([]byte{0xff})) // false
```

## Форматирование строк

Распространённые форматные глаголы для строк:

```go
s := "hello"
fmt.Printf("%s\n", s)  // hello
fmt.Printf("%q\n", s)  // "hello" — с кавычками и экранированием
fmt.Printf("%x\n", s)  // 68656c6c6f — hex
fmt.Printf("%v\n", s)  // hello (default)

r := 'П'
fmt.Printf("%c\n", r)  // П
fmt.Printf("%d\n", r)  // 1055
fmt.Printf("%U\n", r)  // U+041F
```

## Типичные ловушки на интервью

### Ловушка 1: len возвращает байты

```go
s := "Привет"
fmt.Println(len(s)) // 12, не 6!

// Правильно:
fmt.Println(utf8.RuneCountInString(s)) // 6
```

### Ловушка 2: Индексирование возвращает байт, не руну

```go
s := "Привет"
fmt.Printf("%T %v\n", s[0], s[0]) // uint8 208 — первый байт, не 'П'

// Правильно:
r, _ := utf8.DecodeRuneInString(s)
fmt.Printf("%c\n", r) // П
```

### Ловушка 3: Срез строки — по байтам

```go
s := "Привет"
sub := s[0:2] // первые 2 байта — половина буквы 'П'!
fmt.Println(utf8.ValidString(sub)) // false

// Правильно:
runes := []rune(s)
sub = string(runes[0:1]) // "П"
```

### Ловушка 4: Конкатенация в цикле

```go
// Плохо: O(n²)
var result string
for i := range 1000 {
    result += strconv.Itoa(i)
}

// Хорошо: O(n)
var b strings.Builder
b.Grow(4000) // грубая оценка
for i := range 1000 {
    b.WriteString(strconv.Itoa(i))
}
result := b.String()
```

### Ловушка 5: strings.Clone для предотвращения утечки

```go
func extractID(data string) string {
    // data — огромная строка из сети
    // без Clone, весь data остаётся в памяти
    return strings.Clone(data[0:36]) // UUID
}
```

## Практические задачи

### Подсчёт слов с учётом Unicode

```go
func wordCount(s string) map[string]int {
    counts := make(map[string]int)
    for _, word := range strings.Fields(s) {
        counts[strings.ToLower(word)]++
    }
    return counts
}
```

### Является ли строка палиндромом (с учётом Unicode)

```go
func isPalindrome(s string) bool {
    runes := []rune(strings.ToLower(s))
    for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
        if runes[i] != runes[j] {
            return false
        }
    }
    return true
}
```

### Парсинг конфигурации с strings.Cut

```go
func parseConfig(line string) (key, value string, ok bool) {
    key, value, ok = strings.Cut(strings.TrimSpace(line), "=")
    if ok {
        key = strings.TrimSpace(key)
        value = strings.TrimSpace(value)
    }
    return
}
```

## Итог

Строки в Go неизменяемы, хранятся в UTF-8, и `len()` возвращает байты. Для работы с символами нужны руны. Эффективное построение строк — через `strings.Builder`. Современные утилиты Go 1.18–1.20 (`strings.Cut`, `strings.CutPrefix`, `strings.Clone`) существенно упрощают типовой код. Конвертации между `string`, `[]byte` и `[]rune` всегда создают копии — это важно учитывать в производительном коде.
