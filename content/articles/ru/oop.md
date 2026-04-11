---
title: ООП в Go
blockId: oop
parentBlockId: null
---

# ООП в Go

Go — намеренно минималистичный язык. В нём нет классов, нет наследования, нет ключевых слов `abstract` или `virtual`. При этом Go полностью поддерживает объектно-ориентированный стиль программирования — только реализован он иначе, чем в Java или C++. Понимание этой разницы критично для технического собеседования: вопрос «как реализовать ООП без классов» встречается регулярно.

## Почему в Go нет классов

Авторы Go сознательно отказались от классической иерархии классов. Главные причины:

1. **Наследование создаёт жёсткую связанность.** Изменение базового класса ломает всех наследников. В крупных кодовых базах это становится источником постоянных проблем.
2. **Глубокие иерархии трудно читать.** Чтобы понять метод, нужно держать в голове весь граф наследования.
3. **Состав гибче наследования.** «Prefer composition over inheritance» — принцип из книги «Design Patterns» (GoF, 1994). Go встроил его в синтаксис языка.

Вместо классов Go предлагает три механизма: **структуры** для данных, **методы** для поведения и **интерфейсы** для полиморфизма.

## Структуры и методы

Структура в Go — это тип данных с именованными полями. Методы определяются отдельно, через получатель:

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

Получатель `u User` — копия значения (value receiver), `u *User` — указатель. Правило простое: если метод изменяет структуру или структура большая — используйте указатель. В остальных случаях — значение. Для одного типа лучше придерживаться одного стиля.

Go 1.26 не добавил новых синтаксических конструкций для определения методов — этот механизм стабилен с Go 1.0.

## Инкапсуляция через пакеты

В Java видимость регулируется ключевыми словами `private`, `protected`, `public`. В Go правило одно: **имя начинается с заглавной буквы — экспортировано, со строчной — нет**.

Инкапсуляция в Go происходит на уровне пакета, а не класса:

```go
// пакет user

type user struct {       // не экспортирован
    id    int64
    name  string
    email string
}

type User interface {    // экспортирован
    DisplayName() string
    Email() string
}

func New(id int64, name, email string) User {
    return &user{id: id, name: name, email: email}
}

func (u *user) DisplayName() string { return u.name }
func (u *user) Email() string       { return u.email }
```

Клиент пакета получает интерфейс `User`, но не знает о внутреннем типе `user`. Это обеспечивает ту же инкапсуляцию, что и `private` в Java, только на уровне пакета.

## Интерфейсы — основа полиморфизма

Интерфейс в Go — это набор сигнатур методов. Тип реализует интерфейс **неявно**: никаких `implements`, никаких деклараций. Достаточно иметь нужные методы.

```go
type Stringer interface {
    String() string
}

type Point struct{ X, Y float64 }

func (p Point) String() string {
    return fmt.Sprintf("(%.2f, %.2f)", p.X, p.Y)
}

// Point автоматически удовлетворяет Stringer
var s Stringer = Point{3, 4}
fmt.Println(s.String()) // (3.00, 4.00)
```

Неявная реализация — главное отличие Go от языков с явными объявлениями. Это означает, что тип может реализовывать интерфейс, не зная о его существовании. Это позволяет добавлять интерфейсы к чужому коду без его изменения.

### Пустой интерфейс и `any`

Тип `any` (псевдоним `interface{}`, добавлен в Go 1.18) описывает «любое значение». Используется с осторожностью: теряется типобезопасность.

```go
func Print(v any) {
    fmt.Println(v)
}
```

### Интерфейсы маленькие

Идиоматичный Go — это маленькие интерфейсы. Стандартная библиотека демонстрирует это повсюду: `io.Reader` имеет один метод, `io.Writer` — один, `io.Closer` — один. Комбинация `io.ReadWriter = io.Reader + io.Writer` собирается через встраивание интерфейсов.

## Композиция вместо наследования

Go предлагает встраивание (embedding) как замену наследованию. Встроенный тип «продвигает» свои методы во внешний тип:

```go
type Animal struct {
    Name string
}

func (a Animal) Speak() string {
    return a.Name + " speaks"
}

type Dog struct {
    Animal                // встраивание
    Breed string
}

d := Dog{Animal: Animal{Name: "Rex"}, Breed: "Husky"}
fmt.Println(d.Speak()) // Rex speaks — метод продвинут автоматически
```

`Dog` не наследует `Animal` — он содержит его. Но благодаря встраиванию методы `Animal` доступны напрямую через `d`. Можно переопределить метод, просто объявив его на `Dog` — это называется «shadowing».

## Полиморфизм через интерфейсы

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

Функция `PrintShape` работает с любым типом, реализующим `Shape`. Это классический полиморфизм — без наследования.

## Итого: три столпа ООП в Go

| Концепция ООП | Реализация в Go |
|---|---|
| Инкапсуляция | Экспортируемые/неэкспортируемые имена на уровне пакета |
| Наследование | Встраивание структур (embedding) |
| Полиморфизм | Интерфейсы с неявной реализацией |

Детальные темы — SOLID, паттерны проектирования, dependency injection — разобраны в отдельных статьях блока.
