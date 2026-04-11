---
title: OOP in Go
blockId: oop
parentBlockId: null
---

# OOP in Go

Go is an intentionally minimalist language. It has no classes, no inheritance, no `abstract` or `virtual` keywords. Yet Go fully supports an object-oriented programming style — it just implements it differently from Java or C++. Understanding this difference is critical in technical interviews: the question "how do you do OOP without classes?" comes up regularly.

## Why Go Has No Classes

The authors of Go deliberately rejected the classical class hierarchy. The main reasons:

1. **Inheritance creates tight coupling.** A change to a base class breaks all its descendants. In large codebases this becomes a chronic source of pain.
2. **Deep hierarchies are hard to read.** To understand a method you need to hold the entire inheritance graph in your head.
3. **Composition is more flexible than inheritance.** "Prefer composition over inheritance" is a principle from the GoF book (Design Patterns, 1994). Go baked it into the language syntax.

In place of classes, Go offers three mechanisms: **structs** for data, **methods** for behavior, and **interfaces** for polymorphism.

## Structs and Methods

A struct is a data type with named fields. Methods are defined separately, via a receiver:

```go
type User struct {
    ID    int64
    Name  string
    Email string
}

func (u User) DisplayName() string {
    return u.Name
}

func (u *User) SetEmail(email string) {
    u.Email = email
}
```

The receiver `u User` is a copy (value receiver); `u *User` is a pointer. The rule is straightforward: if the method mutates the struct or the struct is large, use a pointer. Otherwise use a value. For a given type, stick to one style throughout.

Go 1.26 did not add new syntax for method definitions — this mechanism has been stable since Go 1.0.

## Encapsulation via Packages

In Java, visibility is controlled with `private`, `protected`, and `public`. In Go there is one rule: **a name that starts with an uppercase letter is exported; lowercase is unexported**.

Encapsulation in Go happens at the package level, not the class level:

```go
// package user

type user struct {       // unexported
    id    int64
    name  string
    email string
}

type User interface {    // exported
    DisplayName() string
    Email() string
}

func New(id int64, name, email string) User {
    return &user{id: id, name: name, email: email}
}

func (u *user) DisplayName() string { return u.name }
func (u *user) Email() string       { return u.email }
```

The caller gets the `User` interface and knows nothing about the internal `user` type. This provides the same encapsulation as `private` in Java, scoped to the package.

## Interfaces — the Foundation of Polymorphism

An interface in Go is a set of method signatures. A type satisfies an interface **implicitly**: no `implements` declarations, no annotations. Having the right methods is enough.

```go
type Stringer interface {
    String() string
}

type Point struct{ X, Y float64 }

func (p Point) String() string {
    return fmt.Sprintf("(%.2f, %.2f)", p.X, p.Y)
}

// Point automatically satisfies Stringer
var s Stringer = Point{3, 4}
fmt.Println(s.String()) // (3.00, 4.00)
```

Implicit satisfaction is the key difference from languages with explicit declarations. A type can satisfy an interface without knowing the interface exists. This makes it possible to retrofit an interface onto third-party code without modifying it.

### The Empty Interface and `any`

The type `any` (an alias for `interface{}`, introduced in Go 1.18) means "any value." Use it sparingly — you lose type safety.

```go
func Print(v any) {
    fmt.Println(v)
}
```

### Keep Interfaces Small

Idiomatic Go favors small interfaces. The standard library demonstrates this everywhere: `io.Reader` has one method, `io.Writer` has one, `io.Closer` has one. The combined `io.ReadWriter = io.Reader + io.Writer` is composed by interface embedding.

## Composition Instead of Inheritance

Go offers embedding as a replacement for inheritance. An embedded type promotes its methods into the outer type:

```go
type Animal struct {
    Name string
}

func (a Animal) Speak() string {
    return a.Name + " speaks"
}

type Dog struct {
    Animal                // embedding
    Breed string
}

d := Dog{Animal: Animal{Name: "Rex"}, Breed: "Husky"}
fmt.Println(d.Speak()) // Rex speaks — method promoted automatically
```

`Dog` does not inherit `Animal` — it contains it. But because of embedding, `Animal`'s methods are available directly on `d`. You can override a method by simply declaring one on `Dog` — this is called shadowing.

## Polymorphism via Interfaces

```go
type Shape interface {
    Area() float64
    Perimeter() float64
}

type Circle struct{ Radius float64 }
type Rectangle struct{ Width, Height float64 }

func (c Circle) Area() float64      { return math.Pi * c.Radius * c.Radius }
func (c Circle) Perimeter() float64 { return 2 * math.Pi * c.Radius }

func (r Rectangle) Area() float64      { return r.Width * r.Height }
func (r Rectangle) Perimeter() float64 { return 2 * (r.Width + r.Height) }

func PrintShape(s Shape) {
    fmt.Printf("Area: %.2f, Perimeter: %.2f\n", s.Area(), s.Perimeter())
}

PrintShape(Circle{Radius: 5})
PrintShape(Rectangle{Width: 3, Height: 4})
```

`PrintShape` works with any type that implements `Shape`. This is classical polymorphism — without inheritance.

## Summary: the Three Pillars of OOP in Go

| OOP Concept | Go Implementation |
|---|---|
| Encapsulation | Exported/unexported names at the package level |
| Inheritance | Struct embedding |
| Polymorphism | Interfaces with implicit satisfaction |

Deeper topics — SOLID, design patterns, dependency injection — are covered in the remaining articles in this block.
