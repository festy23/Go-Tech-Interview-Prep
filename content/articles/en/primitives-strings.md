---
title: Strings in Go
blockId: primitives-strings
parentBlockId: primitives
---

# Strings in Go

Strings are one of the most used types in Go and simultaneously one of the most misunderstood. Interview questions about strings are common, ranging from basic "what is a rune" to subtle pitfalls around conversions and performance.

## Internal Structure

A string in Go is a two-field struct:

```go
type StringHeader struct {
    Data uintptr // pointer to data
    Len  int     // length in bytes
}
```

The key property: a string is **immutable**. There is no way to modify the bytes of a string through standard language mechanisms. This means:

- Any operation that changes content creates a new string
- Concatenation `s1 + s2` always allocates a new string
- Passing a string to a function copies only the header (16 bytes), not the data

```go
s := "hello"
// s[0] = 'H' // compile error: cannot assign to s[0]

// The only way to "modify" is to create a new string
b := []byte(s)
b[0] = 'H'
s2 := string(b) // "Hello"
```

## UTF-8 and Runes

Go stores strings as UTF-8. ASCII characters occupy 1 byte, Cyrillic characters 2 bytes, most CJK characters 3 bytes, etc.

`len(s)` returns the **number of bytes**, not characters:

```go
s := "Hello, 世界"
fmt.Println(len(s))                    // 13 (7 ASCII + 6 bytes for 2 CJK)
fmt.Println(len([]rune(s)))            // 9
fmt.Println(utf8.RuneCountInString(s)) // 9 (more efficient)
```

The `rune` type is an alias for `int32` and represents a Unicode code point:

```go
var r rune = '界' // 30028
fmt.Printf("%T %d %c\n", r, r, r) // int32 30028 界
```

### Iteration: Bytes vs Runes

Index-based iteration is byte-by-byte:

```go
s := "Hello, 世界"
for i := 0; i < len(s); i++ {
    fmt.Printf("%d: %02x\n", i, s[i]) // bytes, not runes
}
```

Range-based iteration decodes UTF-8 and yields runes:

```go
for i, r := range s {
    fmt.Printf("byte[%d]: %c\n", i, r)
    // byte[0]: H
    // byte[1]: e
    // byte[7]: 世  ← byte index 7, not character index 7
    // byte[10]: 界
}
```

Note: `i` is the byte offset of the rune's start, not a sequential character index.

### Correct Character Indexing

```go
s := "Hello, 世界"
runes := []rune(s)
seventh := runes[6] // ',' — the 7th character

// Or via decoding
r, size := utf8.DecodeRuneInString(s)
fmt.Println(r, size) // H 1
```

## String Comparison

Strings are compared lexicographically by bytes:

```go
fmt.Println("abc" == "abc")  // true
fmt.Println("abc" < "abd")   // true
fmt.Println("z" > "a")       // true
```

For case-insensitive comparison:

```go
strings.EqualFold("Go", "go")     // true
strings.EqualFold("Straße", "STRASSE") // true — handles Unicode folding
```

## The strings Package

### Core Functions

```go
s := "  Hello, World!  "

strings.TrimSpace(s)                  // "Hello, World!"
strings.ToUpper(s)                    // "  HELLO, WORLD!  "
strings.ToLower(s)                    // "  hello, world!  "
strings.Contains(s, "World")          // true
strings.HasPrefix(s, "  Hello")       // true
strings.HasSuffix(s, "!  ")           // true
strings.Count(s, "l")                 // 3
strings.Index(s, "World")             // 9 (byte index)
strings.Replace(s, "World", "Go", 1)  // replaces first occurrence
strings.ReplaceAll(s, "l", "L")       // all occurrences
strings.Split("a,b,c", ",")           // ["a", "b", "c"]
strings.Join([]string{"a","b"}, "-")  // "a-b"
strings.Fields("  foo bar  baz  ")    // ["foo", "bar", "baz"]
strings.Repeat("ab", 3)               // "ababab"
strings.TrimPrefix("Hello", "He")     // "llo"
strings.TrimSuffix("Hello", "lo")     // "Hel"
```

### strings.Cut (Go 1.18)

One of the most convenient functions added in Go 1.18. It splits a string around the first occurrence of a separator:

```go
before, after, found := strings.Cut("user@example.com", "@")
// before = "user", after = "example.com", found = true

before, after, found = strings.Cut("noatsign", "@")
// before = "noatsign", after = "", found = false
```

It replaces the pattern of `strings.Index` + slicing, making code significantly more readable.

### strings.CutPrefix and strings.CutSuffix (Go 1.20)

```go
rest, found := strings.CutPrefix("https://example.com", "https://")
// rest = "example.com", found = true

rest, found = strings.CutSuffix("file.go", ".go")
// rest = "file", found = true
```

More convenient than combining `HasPrefix`/`TrimPrefix` because it returns a flag indicating whether the prefix was found.

### strings.Clone (Go 1.20)

```go
original := "hello world"
clone := strings.Clone(original)
```

Guarantees the string does not share memory with another string. Useful when you have a large source string (e.g., read from a file or network) and want to keep a small substring without retaining the entire buffer in memory.

```go
// Without Clone: small keeps the entire big in memory
big := readLargeBuffer()
small := big[100:110]

// With Clone: big can be garbage collected
small = strings.Clone(big[100:110])
```

## strings.Builder — Efficient String Construction

Concatenating strings in a loop is a classic source of inefficiency:

```go
// Bad: O(n²) allocations
result := ""
for _, s := range words {
    result += s + " "
}

// Good: amortized O(n)
var b strings.Builder
for _, s := range words {
    b.WriteString(s)
    b.WriteByte(' ')
}
result := b.String()
```

`strings.Builder` implements `io.Writer`, so it works with `fmt.Fprintf`:

```go
var b strings.Builder
fmt.Fprintf(&b, "Hello, %s! You are %d years old.", name, age)
result := b.String()
```

To avoid unnecessary allocations, pre-grow the buffer:

```go
var b strings.Builder
b.Grow(256) // reserves 256 bytes
```

## Conversions and Their Cost

### string ↔ []byte

```go
s := "hello"
b := []byte(s)  // copies: O(n)
s2 := string(b) // copies: O(n)
```

Every conversion allocates new memory and copies data. This matters in hot code paths.

The Go compiler optimizes certain cases to avoid allocation:

```go
// Compiler may avoid allocation here:
if string(b) == "hello" { ... }
m[string(b)] // map lookup with []byte key
```

### string ↔ []rune

```go
s := "Hello, 世界"
runes := []rune(s)   // decodes UTF-8 into []int32, O(n)
s2 := string(runes)  // encodes back, O(n)
```

This is more expensive than `[]byte` conversion because it requires UTF-8 decoding.

### unsafe Conversion (Read-Only Only!)

In some high-performance contexts, `unsafe` is used for zero-copy conversion:

```go
// Read-only! Modifying b would modify the original string
func unsafeStringToBytes(s string) []byte {
    return unsafe.Slice(unsafe.StringData(s), len(s))
}
```

Never modify the resulting slice. That is undefined behavior.

## Runes and Special Values

`utf8.RuneError` (value `\uFFFD`) is returned when iterating over invalid UTF-8:

```go
s := string([]byte{0xff, 0xfe}) // invalid UTF-8
for _, r := range s {
    if r == utf8.RuneError {
        fmt.Println("invalid UTF-8!")
    }
}
```

Validating a string:

```go
utf8.ValidString("Hello")              // true
utf8.ValidString(string([]byte{0xff})) // false
```

## String Formatting

Common format verbs for strings:

```go
s := "hello"
fmt.Printf("%s\n", s)  // hello
fmt.Printf("%q\n", s)  // "hello" — with quotes and escaping
fmt.Printf("%x\n", s)  // 68656c6c6f — hex encoding
fmt.Printf("%v\n", s)  // hello (default)

r := '界'
fmt.Printf("%c\n", r)  // 界
fmt.Printf("%d\n", r)  // 30028
fmt.Printf("%U\n", r)  // U+754C
```

## Common Interview Pitfalls

### Pitfall 1: len Returns Bytes

```go
s := "Hello, 世界"
fmt.Println(len(s)) // 13, not 9!

// Correct:
fmt.Println(utf8.RuneCountInString(s)) // 9
```

### Pitfall 2: Indexing Returns a Byte, Not a Rune

```go
s := "Hello, 世界"
fmt.Printf("%T %v\n", s[7], s[7]) // uint8 228 — first byte of '世', not '世'

// Correct:
runes := []rune(s)
fmt.Printf("%c\n", runes[7]) // 世
```

### Pitfall 3: String Slicing is Byte-Based

```go
s := "Hello, 世界"
sub := s[7:9] // first 2 bytes of '世' — invalid UTF-8!
fmt.Println(utf8.ValidString(sub)) // false

// Correct:
runes := []rune(s)
sub = string(runes[7:8]) // "世"
```

### Pitfall 4: Concatenation in a Loop

```go
// Bad: O(n²)
var result string
for i := range 1000 {
    result += strconv.Itoa(i)
}

// Good: O(n)
var b strings.Builder
b.Grow(4000) // rough estimate
for i := range 1000 {
    b.WriteString(strconv.Itoa(i))
}
result := b.String()
```

### Pitfall 5: strings.Clone to Prevent Memory Leaks

```go
func extractID(data string) string {
    // data is a huge string read from the network
    // without Clone, all of data stays in memory
    return strings.Clone(data[0:36]) // UUID
}
```

## Practical Problems

### Word Count with Unicode Support

```go
func wordCount(s string) map[string]int {
    counts := make(map[string]int)
    for _, word := range strings.Fields(s) {
        counts[strings.ToLower(word)]++
    }
    return counts
}
```

### Palindrome Check with Unicode

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

### Config Line Parsing with strings.Cut

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

## Summary

Strings in Go are immutable, stored as UTF-8, and `len()` returns bytes. Working with individual characters requires runes. Efficient string construction uses `strings.Builder`. Modern utilities from Go 1.18–1.20 (`strings.Cut`, `strings.CutPrefix`, `strings.Clone`) significantly simplify common patterns. Conversions between `string`, `[]byte`, and `[]rune` always copy data — keep this in mind in performance-sensitive code.
