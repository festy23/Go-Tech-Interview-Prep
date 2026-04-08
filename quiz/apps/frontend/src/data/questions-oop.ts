import type { Question } from "./questions";

export const questionsOop: Question[] = [
  // ── МЕТОДЫ И РЕСИВЕРЫ (Q1-Q8) ────────────────────────────────────────────
  {
    id: 1,
    question: "Когда следует использовать pointer receiver (*T) вместо value receiver (T)?",
    options: [
      "Когда метод должен изменять состояние структуры или структура слишком велика для копирования",
      "Только если структура содержит указатели на другие структуры",
      "Pointer receiver нужен всегда — value receiver устарел",
      "Только для экспортируемых методов",
    ],
    correct: 0,
    explanation:
      "Pointer receiver позволяет изменять поля структуры и избегает копирования больших структур. Value receiver создаёт копию, поэтому изменения не влияют на оригинал.",
  },
  {
    id: 2,
    question: "Можно ли определить метод на типе, который не является структурой?",
    code: "type Celsius float64\n\nfunc (c Celsius) ToFahrenheit() float64 {\n    return float64(c)*9/5 + 32\n}",
    options: [
      "Нет, методы можно определять только на struct",
      "Да, но только если тип определён в текущем пакете",
      "Да, на любом типе, включая встроенные (int, string)",
      "Только на типах, реализующих хотя бы один интерфейс",
    ],
    correct: 1,
    explanation:
      "Методы можно определять на любом именованном типе (type MyInt int, type Celsius float64), но только в пакете, где этот тип объявлен. На встроенных типах (int, string) напрямую методы определить нельзя.",
  },
  {
    id: 3,
    question: "Что произойдёт, если вызвать метод с pointer receiver на значении (не указателе)?",
    code: "type Counter struct { n int }\nfunc (c *Counter) Inc() { c.n++ }\n\nfunc main() {\n    c := Counter{}\n    c.Inc() // вызов на значении\n}",
    options: [
      "Ошибка компиляции: нельзя вызвать pointer receiver на значении",
      "Go автоматически возьмёт адрес (&c) и вызовет метод",
      "Метод вызовется, но изменения не сохранятся",
      "Паника во время выполнения",
    ],
    correct: 1,
    explanation:
      "Go автоматически берёт адрес переменной: c.Inc() преобразуется в (&c).Inc(). Это работает только для адресуемых переменных — нельзя вызвать на литерале Counter{}.Inc().",
  },
  {
    id: 4,
    question: "Что такое method expression в Go?",
    code: "type Dog struct { Name string }\nfunc (d Dog) Bark() string { return d.Name + \": Woof!\" }\n\nf := Dog.Bark\nresult := f(Dog{Name: \"Rex\"})",
    options: [
      "Способ вызвать метод без создания экземпляра структуры",
      "Функция, полученная из метода, где первый аргумент — ресивер",
      "Синтаксический сахар для анонимных функций",
      "Паттерн для наследования методов",
    ],
    correct: 1,
    explanation:
      "Method expression (Dog.Bark) возвращает обычную функцию, первый аргумент которой — ресивер. Dog.Bark имеет сигнатуру func(Dog) string. Это полезно для передачи методов как значений.",
  },
  {
    id: 5,
    question: "Что такое method value в Go?",
    code: "d := Dog{Name: \"Rex\"}\nf := d.Bark  // method value\nfmt.Println(f())",
    options: [
      "Значение, возвращённое методом при вызове",
      "Замыкание, привязанное к конкретному экземпляру ресивера",
      "Указатель на метод в таблице виртуальных методов",
      "Константа, определённая внутри метода",
    ],
    correct: 1,
    explanation:
      "Method value (d.Bark) — это замыкание, которое захватывает конкретный ресивер d. Вызов f() эквивалентен d.Bark(). Сигнатура f — func() string (без ресивера).",
  },
  {
    id: 6,
    question: "Можно ли определить метод для типа, объявленного в другом пакете?",
    options: [
      "Да, если тип экспортирован (начинается с большой буквы)",
      "Да, через механизм extension methods как в C#",
      "Нет, методы можно определять только в пакете, где объявлен тип",
      "Да, но только через embedding этого типа",
    ],
    correct: 2,
    explanation:
      "Go запрещает определять методы на типах из других пакетов. Обходной путь — создать свой тип на основе импортированного (type MyType importedpkg.Type) или использовать embedding.",
  },
  {
    id: 7,
    question: "Что произойдёт при попытке определить метод и с value receiver, и с pointer receiver с одним именем?",
    code: "type Num struct{ val int }\nfunc (n Num) Double() int { return n.val * 2 }\nfunc (n *Num) Double() int { return n.val * 2 }",
    options: [
      "Pointer receiver версия перезапишет value receiver версию",
      "Ошибка компиляции: метод Double уже определён",
      "Будет выбран нужный метод в зависимости от типа вызова",
      "Скомпилируется, но вызовет панику при runtime",
    ],
    correct: 1,
    explanation:
      "Go не позволяет определить метод с одним именем и для T, и для *T. Метод принадлежит method set типа, и имя должно быть уникальным. Компилятор выдаст ошибку.",
  },
  {
    id: 8,
    question: "Что такое method set типа и почему он важен для интерфейсов?",
    options: [
      "Набор всех полей структуры, доступных через методы",
      "Набор методов, которые можно вызвать на значении данного типа — определяет, какие интерфейсы тип реализует",
      "Список всех интерфейсов, которые тип явно реализует",
      "Количество методов, необходимых для реализации интерфейса",
    ],
    correct: 1,
    explanation:
      "Method set — набор методов типа. Для T это только value receivers, для *T — и value, и pointer receivers. Это определяет, какие интерфейсы удовлетворяет тип: T может не реализовывать интерфейс, который *T реализует.",
  },

  // ── ИНТЕРФЕЙСЫ — ПРОДВИНУТОЕ (Q9-Q16) ────────────────────────────────────
  {
    id: 9,
    question: "Как объединить несколько интерфейсов в один в Go?",
    code: "type Reader interface { Read(p []byte) (int, error) }\ntype Writer interface { Write(p []byte) (int, error) }\ntype ReadWriter interface {\n    Reader\n    Writer\n}",
    options: [
      "Через ключевое слово extends",
      "Через встраивание (embedding) интерфейсов",
      "Через множественное наследование интерфейсов",
      "Через generic constraints",
    ],
    correct: 1,
    explanation:
      "Интерфейсы в Go объединяются через embedding: интерфейс ReadWriter встраивает Reader и Writer. Тип, реализующий оба метода, автоматически удовлетворяет ReadWriter.",
  },
  {
    id: 10,
    question: "Что означает принцип «accept interfaces, return structs» в Go?",
    options: [
      "Функции должны принимать интерфейсы для гибкости, но возвращать конкретные типы для удобства",
      "Все входные параметры должны быть interface{}, а возвращать нужно struct",
      "Интерфейсы нужны только для входных данных, а struct — для хранения",
      "Это правило о том, что интерфейсы должны объявляться в пакете потребителя",
    ],
    correct: 0,
    explanation:
      "Принимая интерфейсы, функция становится гибкой — можно передать любую реализацию. Возвращая конкретный тип, мы даём вызывающему полный доступ к полям и методам без необходимости type assertion.",
  },
  {
    id: 11,
    question: "Для чего используется конструкция var _ Interface = (*Type)(nil)?",
    code: "type Saver interface { Save() error }\ntype FileSaver struct{}\n\nvar _ Saver = (*FileSaver)(nil)",
    options: [
      "Для создания nil-значения интерфейса",
      "Для compile-time проверки, что тип реализует интерфейс",
      "Для регистрации типа в реестре интерфейсов",
      "Для оптимизации вызова методов через vtable",
    ],
    correct: 1,
    explanation:
      "Это идиома compile-time assertion. Если FileSaver не реализует Saver, компилятор выдаст ошибку. Переменная _ отбрасывается, nil не занимает памяти — это чисто compile-time проверка.",
  },
  {
    id: 12,
    question: "Почему в Go принято создавать интерфейсы с одним-двумя методами?",
    options: [
      "Ограничение компилятора — интерфейсы не могут иметь больше трёх методов",
      "Маленькие интерфейсы легче реализовать, комбинировать и переиспользовать",
      "Это просто соглашение, не влияющее на код",
      "Из-за того, что Go не поддерживает перегрузку методов",
    ],
    correct: 1,
    explanation:
      "Маленькие интерфейсы (io.Reader, io.Writer, fmt.Stringer) — основа идиоматического Go. Их легко реализовать, они следуют Interface Segregation Principle (ISP), и их можно комбинировать через embedding.",
  },
  {
    id: 13,
    question: "Что выведет этот код?",
    code: "type MyErr struct{ msg string }\nfunc (e *MyErr) Error() string { return e.msg }\n\nfunc getErr() error {\n    var p *MyErr = nil\n    return p\n}\n\nfunc main() {\n    err := getErr()\n    fmt.Println(err == nil)\n}",
    options: [
      "true — потому что p равен nil",
      "false — интерфейс содержит тип *MyErr и nil значение, что не равно nil интерфейсу",
      "panic: nil pointer dereference",
      "Ошибка компиляции",
    ],
    correct: 1,
    explanation:
      "Это классическая Go-ловушка: интерфейс error содержит пару (type, value). Когда мы возвращаем nil *MyErr как error, интерфейс становится (*MyErr, nil) — тип не nil, поэтому интерфейс != nil. Решение: возвращать nil напрямую.",
  },
  {
    id: 14,
    question: "Можно ли сравнивать два интерфейсных значения через ==?",
    options: [
      "Нет, интерфейсы нельзя сравнивать — нужно использовать reflect.DeepEqual",
      "Да, сравниваются и тип, и значение — но паника если конкретный тип не сравнимый",
      "Да, сравниваются только указатели на данные",
      "Только если оба интерфейса — nil",
    ],
    correct: 1,
    explanation:
      "Интерфейсы сравнимы через ==: равны, если совпадают и динамический тип, и значение. Но если конкретный тип не сравнимый (например, слайс), произойдёт паника при runtime.",
  },
  {
    id: 15,
    question: "Сколько памяти занимает значение интерфейсного типа в Go?",
    options: [
      "Зависит от размера конкретного значения внутри",
      "Два машинных слова (16 байт на 64-битной системе): указатель на тип и указатель на данные",
      "Одно машинное слово — это обычный указатель",
      "Три слова: тип, указатель на данные, размер данных",
    ],
    correct: 1,
    explanation:
      "Интерфейсное значение — это пара (iface): указатель на таблицу типа/методов (itable) и указатель на данные. Итого 16 байт на 64-битной системе, независимо от размера конкретного значения.",
  },
  {
    id: 16,
    question: "В чём разница между any и interface{} в Go 1.18+?",
    options: [
      "any — это generic тип, а interface{} — обычный интерфейс",
      "any — это просто алиас для interface{}, они полностью идентичны",
      "any поддерживает type constraints, а interface{} — нет",
      "any нельзя использовать как тип параметра функции",
    ],
    correct: 1,
    explanation:
      "Начиная с Go 1.18, any — это встроенный алиас для interface{}. Они полностью взаимозаменяемы. Алиас введён для краткости и читаемости, особенно в контексте generic constraints.",
  },

  // ── КОМПОЗИЦИЯ И ВСТРАИВАНИЕ — ПРОДВИНУТОЕ (Q17-Q23) ──────────────────────
  {
    id: 17,
    question: "Какие элементы промоутятся (promoted) при встраивании структуры?",
    code: "type Base struct { ID int }\nfunc (b Base) GetID() int { return b.ID }\n\ntype Child struct {\n    Base\n    Name string\n}",
    options: [
      "Только методы — поля не промоутятся",
      "Только экспортируемые поля и методы",
      "Все поля и методы встроенного типа",
      "Только поля — методы нужно делегировать вручную",
    ],
    correct: 2,
    explanation:
      "При embedding промоутятся все поля и методы встроенного типа. Child получает поле ID и метод GetID() напрямую: c.ID и c.GetID() работают без обращения к c.Base.",
  },
  {
    id: 18,
    question: "Что произойдёт при встраивании двух типов с одинаковым методом?",
    code: "type A struct{}\nfunc (A) Hello() string { return \"A\" }\n\ntype B struct{}\nfunc (B) Hello() string { return \"B\" }\n\ntype C struct { A; B }",
    options: [
      "Метод из последнего встроенного типа (B) выигрывает",
      "Ошибка компиляции при определении C",
      "Вызов c.Hello() — ошибка компиляции (ambiguous selector), но c.A.Hello() и c.B.Hello() работают",
      "Метод из первого встроенного типа (A) выигрывает",
    ],
    correct: 2,
    explanation:
      "При конфликте промоутированных методов вызов c.Hello() — ошибка компиляции (ambiguous selector). Нужно явно указать: c.A.Hello() или c.B.Hello(). Либо определить Hello() на самом C.",
  },
  {
    id: 19,
    question: "В чём разница между встраиванием struct и встраиванием указателя на struct?",
    code: "type Inner struct { Val int }\n\n// Вариант 1:\ntype Outer1 struct { Inner }\n\n// Вариант 2:\ntype Outer2 struct { *Inner }",
    options: [
      "Нет разницы — оба варианта идентичны",
      "Указатель позволяет разделять Inner между несколькими Outer, но zero-value Outer2 содержит nil",
      "Встраивание указателя не промоутит методы",
      "Встраивание указателя запрещено — ошибка компиляции",
    ],
    correct: 1,
    explanation:
      "При встраивании *Inner: несколько Outer2 могут ссылаться на один Inner; zero-value содержит nil (нужна инициализация); промоутятся все методы (и value, и pointer receivers).",
  },
  {
    id: 20,
    question: "Можно ли «переопределить» промоутированный метод в Go?",
    code: "type Base struct{}\nfunc (Base) Greet() string { return \"Hello from Base\" }\n\ntype Child struct { Base }\nfunc (Child) Greet() string { return \"Hello from Child\" }",
    options: [
      "Нет, промоутированные методы нельзя переопределить — ошибка компиляции",
      "Да, метод Child.Greet() затеняет (shadows) Base.Greet(), но Base.Greet() доступен через c.Base.Greet()",
      "Да, это полноценное переопределение как в наследовании ООП",
      "Метод Base.Greet() будет удалён из method set Child",
    ],
    correct: 1,
    explanation:
      "Метод Child.Greet() затеняет промоутированный Base.Greet(). При вызове c.Greet() вызовется Child.Greet(). Оригинал доступен явно: c.Base.Greet(). Это не наследование — Base.Greet() по-прежнему получает Base как ресивер.",
  },
  {
    id: 21,
    question: "Как правильно инициализировать структуру с embedded полями?",
    code: "type Address struct { City string }\ntype Person struct {\n    Name string\n    Address\n}",
    options: [
      "Person{Name: \"Ivan\", City: \"Moscow\"} — поля промоутятся в литерал",
      "Person{Name: \"Ivan\", Address: Address{City: \"Moscow\"}} — через имя встроенного типа",
      "Person{Name: \"Ivan\"}.Address.City = \"Moscow\" — через цепочку",
      "Person{Name: \"Ivan\", Address.City: \"Moscow\"} — через точку",
    ],
    correct: 1,
    explanation:
      "В литерале структуры промоутированные поля нельзя указывать напрямую. Нужно использовать имя встроенного типа: Address: Address{City: \"Moscow\"}. После создания можно обращаться: p.City = \"Moscow\".",
  },
  {
    id: 22,
    question: "Зачем встраивать интерфейс в структуру?",
    code: "type Logger interface { Log(msg string) }\n\ntype Service struct {\n    Logger\n    name string\n}",
    options: [
      "Чтобы структура автоматически реализовала интерфейс с возможностью подставить реализацию в runtime",
      "Это синтаксическая ошибка — интерфейсы нельзя встраивать в структуры",
      "Чтобы ограничить набор методов структуры только методами интерфейса",
      "Для создания абстрактного класса",
    ],
    correct: 0,
    explanation:
      "Встраивание интерфейса в struct позволяет структуре реализовать интерфейс, делегируя вызовы конкретной реализации, переданной при создании. Если поле не инициализировано — паника при вызове. Паттерн используется для partial implementation и mock.",
  },
  {
    id: 23,
    question: "Как обратиться к полю или методу встроенного типа напрямую?",
    code: "type Engine struct { HP int }\nfunc (e Engine) Start() string { return \"Vroom\" }\n\ntype Car struct { Engine }",
    options: [
      "Только через промоутированное имя: car.HP, car.Start()",
      "Только через имя типа: car.Engine.HP, car.Engine.Start()",
      "Оба способа работают: car.HP и car.Engine.HP эквивалентны",
      "Нужно приводить тип: car.(Engine).HP",
    ],
    correct: 2,
    explanation:
      "Оба варианта допустимы: car.HP — промоутированный доступ, car.Engine.HP — явный доступ через имя встроенного типа. Явный доступ нужен при конфликте имён или когда нужно обратиться к ресиверу конкретного типа.",
  },

  // ── ПОЛИМОРФИЗМ (Q24-Q28) ────────────────────────────────────────────────
  {
    id: 24,
    question: "Как в Go реализуется полиморфизм через интерфейсы?",
    code: "type Shape interface { Area() float64 }\ntype Circle struct { R float64 }\nfunc (c Circle) Area() float64 { return 3.14 * c.R * c.R }\ntype Rect struct { W, H float64 }\nfunc (r Rect) Area() float64 { return r.W * r.H }\n\nfunc PrintArea(s Shape) { fmt.Println(s.Area()) }",
    options: [
      "Через наследование от базового класса Shape",
      "Через явное приведение типов при вызове PrintArea",
      "Функция PrintArea принимает интерфейс — любой тип с методом Area() подходит",
      "Go не поддерживает полиморфизм",
    ],
    correct: 2,
    explanation:
      "Полиморфизм в Go — через интерфейсы. PrintArea принимает Shape, и любой тип с методом Area() float64 подходит. Circle и Rect не знают о Shape — они просто имеют нужный метод.",
  },
  {
    id: 25,
    question: "Существует ли в Go таблица виртуальных методов (vtable)?",
    options: [
      "Да, каждая структура имеет vtable как в C++",
      "Нет, Go использует itable — таблицу методов, которая создаётся при присвоении конкретного типа интерфейсу",
      "Нет, Go использует только отражение (reflect) для вызова методов",
      "Да, vtable создаётся при компиляции для каждого интерфейса",
    ],
    correct: 1,
    explanation:
      "Go не использует vtable в традиционном смысле. Вместо этого при присвоении конкретного типа интерфейсу создаётся itable — таблица, содержащая указатели на конкретные методы для данной пары (интерфейс, тип). itab кэшируется после первого создания.",
  },
  {
    id: 26,
    question: "Чем отличается runtime-полиморфизм (интерфейсы) от compile-time полиморфизма (generics)?",
    options: [
      "Ничем — generics просто синтаксический сахар над интерфейсами",
      "Интерфейсы используют динамическую диспетчеризацию, generics — специализацию на этапе компиляции (GC Shapes)",
      "Generics быстрее, но не поддерживают методы",
      "Интерфейсы работают только со структурами, generics — с любыми типами",
    ],
    correct: 1,
    explanation:
      "Интерфейсы — runtime-полиморфизм: тип определяется в runtime через itable. Generics — compile-time: Go использует GC Shapes stenciling — гибридный подход между мономорфизацией и словарной диспетчеризацией. Не путать с полной мономорфизацией как в Rust/C++. Generics дают type safety без runtime overhead.",
  },
  {
    id: 27,
    question: "Как использовать интерфейс в качестве type constraint для generics?",
    code: "type Stringer interface { String() string }\n\nfunc PrintAll[T Stringer](items []T) {\n    for _, item := range items {\n        fmt.Println(item.String())\n    }\n}",
    options: [
      "Это ошибка — интерфейсы нельзя использовать как constraints",
      "Constraint ограничивает T типами, реализующими Stringer — проверяется при компиляции",
      "Constraint работает как runtime-проверка при вызове функции",
      "T может быть только конкретным типом, не интерфейсом",
    ],
    correct: 1,
    explanation:
      "Интерфейсы в Go 1.18+ могут быть type constraints. Компилятор гарантирует, что T реализует Stringer. Это даёт type safety без dynamic dispatch — все вызовы String() известны при компиляции.",
  },
  {
    id: 28,
    question: "Как передать функции значения разных типов через общий интерфейс?",
    code: "type Notifier interface { Notify(msg string) error }\n\ntype EmailNotifier struct{}\nfunc (e EmailNotifier) Notify(msg string) error { /*...*/ }\n\ntype SMSNotifier struct{}\nfunc (s SMSNotifier) Notify(msg string) error { /*...*/ }",
    options: [
      "Создать []Notifier и добавить туда EmailNotifier и SMSNotifier",
      "Использовать interface{} и type switch внутри функции",
      "Передать оба типа как отдельные параметры",
      "Создать общую базовую структуру для обоих типов",
    ],
    correct: 0,
    explanation:
      "Слайс []Notifier может содержать любые типы, реализующие интерфейс Notifier. Это идиоматический способ — каждый элемент вызовет свою реализацию Notify() через interface dispatch.",
  },

  // ── SOLID В GO (Q29-Q33) ──────────────────────────────────────────────────
  {
    id: 29,
    question: "Как принцип единственной ответственности (SRP) проявляется в Go?",
    options: [
      "Каждый файл должен содержать ровно один тип",
      "Каждый пакет, тип и функция должны иметь одну чётко определённую зону ответственности",
      "Каждый метод должен делать ровно одно действие",
      "SRP в Go не применим — это концепция только для ООП-языков",
    ],
    correct: 1,
    explanation:
      "SRP в Go реализуется через систему пакетов: пакет net/http отвечает за HTTP, encoding/json — за JSON. На уровне типов: структура и её методы должны иметь одну ответственность. Маленькие интерфейсы (io.Reader) — тоже проявление SRP.",
  },
  {
    id: 30,
    question: "Как принцип открытости/закрытости (OCP) работает в Go без наследования?",
    options: [
      "Через модификатор sealed на структурах",
      "Через интерфейсы: можно добавить новое поведение, реализовав существующий интерфейс, не меняя существующий код",
      "В Go OCP невозможен без наследования",
      "Через генерацию кода с go generate",
    ],
    correct: 1,
    explanation:
      "В Go OCP достигается через интерфейсы. Если функция принимает интерфейс, новое поведение добавляется через новый тип, реализующий этот интерфейс — существующий код не меняется. Это мощнее наследования.",
  },
  {
    id: 31,
    question: "Что означает принцип разделения интерфейсов (ISP) и почему Go идеально ему следует?",
    options: [
      "Интерфейсы нужно разделять по пакетам — не более одного на пакет",
      "Клиенты не должны зависеть от методов, которые они не используют — поэтому в Go интерфейсы маленькие",
      "Каждый интерфейс должен быть в отдельном файле",
      "Интерфейсы не должны встраивать другие интерфейсы",
    ],
    correct: 1,
    explanation:
      "ISP: клиент должен зависеть только от нужных методов. Go следует этому по дизайну — интерфейсы обычно содержат 1-2 метода (io.Reader, io.Writer). Большие интерфейсы собираются через embedding маленьких.",
  },
  {
    id: 32,
    question: "Как принцип инверсии зависимостей (DIP) реализуется в Go?",
    code: "type UserRepo interface { GetByID(id int) (*User, error) }\n\ntype UserService struct {\n    repo UserRepo  // зависимость от абстракции\n}\n\nfunc NewUserService(repo UserRepo) *UserService {\n    return &UserService{repo: repo}\n}",
    options: [
      "Через глобальные переменные с конкретными реализациями",
      "Модули высокого уровня зависят от интерфейсов, а не от конкретных реализаций",
      "Через dependency injection фреймворк (обязателен)",
      "Через пакет reflect для динамического создания зависимостей",
    ],
    correct: 1,
    explanation:
      "DIP: зависимости направлены к абстракциям. UserService зависит от интерфейса UserRepo, а не от конкретной PostgresRepo. Это позволяет подменять реализацию в тестах и при смене хранилища.",
  },
  {
    id: 33,
    question: "Как принцип подстановки Лисков (LSP) связан с интерфейсами Go?",
    options: [
      "LSP не применим к Go — он только для классового наследования",
      "Любой тип, реализующий интерфейс, должен корректно работать везде, где ожидается этот интерфейс",
      "Тип-потомок должен наследовать все методы базового типа",
      "LSP требует, чтобы все методы возвращали одинаковые типы",
    ],
    correct: 1,
    explanation:
      "LSP в Go: если функция принимает io.Reader, любая реализация (файл, сетевое соединение, буфер) должна корректно вести себя как Reader. Нарушение LSP — реализация, которая не следует контракту интерфейса (например, Read() никогда не возвращает io.EOF).",
  },

  // ── DEPENDENCY INJECTION (Q34-Q37) ────────────────────────────────────────
  {
    id: 34,
    question: "Что такое constructor injection и почему это предпочтительный способ DI в Go?",
    code: "func NewOrderService(repo OrderRepo, notifier Notifier) *OrderService {\n    return &OrderService{repo: repo, notifier: notifier}\n}",
    options: [
      "Передача зависимостей через глобальный контейнер",
      "Передача зависимостей через конструктор (New-функцию), что делает зависимости явными и обязательными",
      "Передача зависимостей через setter-методы",
      "Автоматическое внедрение через рефлексию",
    ],
    correct: 1,
    explanation:
      "Constructor injection — передача зависимостей через функцию-конструктор New*(). Это идиоматично для Go: зависимости явные, обязательные и видны в сигнатуре. Нет магии, всё проверяется при компиляции.",
  },
  {
    id: 35,
    question: "Как интерфейсы помогают в unit-тестировании Go-кода?",
    options: [
      "Интерфейсы нужны только для production-кода, не для тестов",
      "Интерфейсы позволяют создавать mock/stub реализации, подменяя реальные зависимости в тестах",
      "Go автоматически генерирует mock из интерфейсов",
      "Тесты не должны использовать интерфейсы — только конкретные типы",
    ],
    correct: 1,
    explanation:
      "Если сервис зависит от интерфейса (например, UserRepo), в тестах можно передать mock-реализацию вместо реальной БД. Это изолирует тестируемый код и убирает внешние зависимости.",
  },
  {
    id: 36,
    question: "Что такое Functional Options pattern в Go?",
    code: "type Option func(*Server)\n\nfunc WithPort(port int) Option {\n    return func(s *Server) { s.port = port }\n}\n\nfunc NewServer(opts ...Option) *Server {\n    s := &Server{port: 8080}\n    for _, opt := range opts {\n        opt(s)\n    }\n    return s\n}",
    options: [
      "Паттерн для создания анонимных функций",
      "Паттерн конфигурирования через функции-опции: гибкая альтернатива struct конфигурации",
      "Способ реализации optional параметров как в Python",
      "Паттерн для ленивой инициализации полей структуры",
    ],
    correct: 1,
    explanation:
      "Functional Options — паттерн, где конфигурация передаётся через variadic функции-опции. Преимущества: значения по умолчанию, опциональность, расширяемость без ломающих изменений API. Functional Options — это паттерн конфигурирования объектов, не Dependency Injection. DI решает задачу передачи зависимостей; Functional Options — задачу гибкой настройки параметров.",
  },
  {
    id: 37,
    question: "В чём разница между DI через поля структуры и через конструктор?",
    code: "// Через конструктор:\nfunc NewService(repo Repo) *Service { return &Service{repo: repo} }\n\n// Через поле:\ntype Service struct { Repo Repo }\ns := Service{}\ns.Repo = myRepo",
    options: [
      "Разницы нет — оба подхода полностью эквивалентны",
      "Конструктор гарантирует наличие зависимости, через поле — зависимость может остаться nil",
      "Поля нельзя использовать для DI — это антипаттерн",
      "Конструктор медленнее, так как вызывает функцию",
    ],
    correct: 1,
    explanation:
      "Конструктор делает зависимость обязательной — без неё нельзя создать экземпляр. Через экспортированное поле зависимость можно забыть установить, получив nil pointer panic в runtime.",
  },

  // ── СТАНДАРТНЫЕ ИНТЕРФЕЙСЫ (Q38-Q43) ──────────────────────────────────────
  {
    id: 38,
    question: "Какой метод нужно реализовать для удовлетворения интерфейса fmt.Stringer?",
    code: "type User struct { Name string; Age int }\n\n// Какой метод добавить, чтобы fmt.Println(user) выводил \"Ivan (25)\"?",
    options: [
      "func (u User) Format() string",
      "func (u User) String() string",
      "func (u User) ToString() string",
      "func (u User) Print() string",
    ],
    correct: 1,
    explanation:
      "fmt.Stringer требует метод String() string. Если тип реализует Stringer, fmt.Println() и другие функции пакета fmt будут использовать его для форматированного вывода.",
  },
  {
    id: 39,
    question: "Какие три метода нужно реализовать для интерфейса sort.Interface?",
    options: [
      "Sort(), Compare(), Equals()",
      "Len() int, Less(i, j int) bool, Swap(i, j int)",
      "Size() int, Before(a, b) bool, Exchange(i, j int)",
      "Count() int, LessThan(i, j int) bool, Move(i, j int)",
    ],
    correct: 1,
    explanation:
      "sort.Interface требует три метода: Len() — количество элементов, Less(i, j) — порядок сравнения, Swap(i, j) — обмен элементов. Любой тип с этими методами можно сортировать через sort.Sort().",
  },
  {
    id: 40,
    question: "Какой метод определяет интерфейс io.Writer?",
    options: [
      "Write(data string) error",
      "Write(p []byte) (n int, err error)",
      "WriteTo(w Writer) (int64, error)",
      "Output(p []byte) int",
    ],
    correct: 1,
    explanation:
      "io.Writer: Write(p []byte) (n int, err error). Записывает len(p) байт из p. Возвращает количество записанных байт и ошибку. Реализуется файлами, буферами, HTTP response writer и т.д.",
  },
  {
    id: 41,
    question: "Какой метод определяет интерфейс http.Handler?",
    code: "type MyHandler struct{}\n\n// Какой метод нужно реализовать?",
    options: [
      "Handle(w http.ResponseWriter, r *http.Request)",
      "ServeHTTP(w http.ResponseWriter, r *http.Request)",
      "Process(ctx context.Context, r *http.Request) error",
      "HandleRequest(r *http.Request) *http.Response",
    ],
    correct: 1,
    explanation:
      "http.Handler требует ServeHTTP(http.ResponseWriter, *http.Request). Любой тип с этим методом может обрабатывать HTTP-запросы. http.HandlerFunc — адаптер, превращающий обычную функцию в Handler.",
  },
  {
    id: 42,
    question: "Для чего используются интерфейсы json.Marshaler и json.Unmarshaler?",
    code: "type Marshaler interface { MarshalJSON() ([]byte, error) }\ntype Unmarshaler interface { UnmarshalJSON([]byte) error }",
    options: [
      "Для автоматической генерации JSON-тегов",
      "Для кастомной сериализации/десериализации типа в/из JSON",
      "Для валидации JSON-данных перед парсингом",
      "Для сжатия JSON-вывода",
    ],
    correct: 1,
    explanation:
      "Реализовав Marshaler, вы контролируете, как тип сериализуется в JSON. Unmarshaler — как парсится из JSON. Это полезно для пользовательских форматов дат, enum-значений, вложенных структур и т.д.",
  },
  {
    id: 43,
    question: "Зачем нужен интерфейс io.Closer и когда вызывать Close()?",
    options: [
      "Close() вызывается для удаления объекта из памяти (аналог деструктора)",
      "Close() освобождает ресурсы (файлы, соединения). Вызывать нужно через defer сразу после успешного открытия",
      "Close() закрывает канал — аналог close(ch)",
      "io.Closer нужен только для сетевых соединений",
    ],
    correct: 1,
    explanation:
      "io.Closer: Close() error. Освобождает ресурсы ОС (файловые дескрипторы, сетевые соединения, БД-курсоры). Идиома: f, err := os.Open(...); if err != nil { return err }; defer f.Close().",
  },

  // ── ПАТТЕРНЫ ПРОЕКТИРОВАНИЯ (Q44-Q47) ─────────────────────────────────────
  {
    id: 44,
    question: "Как реализуется паттерн Strategy в Go?",
    code: "type Sorter interface { Sort(data []int) []int }\n\ntype BubbleSort struct{}\nfunc (BubbleSort) Sort(data []int) []int { /*...*/ }\n\ntype QuickSort struct{}\nfunc (QuickSort) Sort(data []int) []int { /*...*/ }\n\ntype DataProcessor struct { sorter Sorter }",
    options: [
      "Через наследование от базового класса Strategy",
      "Через интерфейс, определяющий стратегию, и инъекцию конкретной реализации",
      "Через switch-case по типу стратегии",
      "Через глобальную переменную с текущей стратегией",
    ],
    correct: 1,
    explanation:
      "Strategy в Go: интерфейс определяет алгоритм (Sorter), конкретные типы реализуют его (BubbleSort, QuickSort). DataProcessor получает стратегию через конструктор — поведение меняется без изменения кода процессора.",
  },
  {
    id: 45,
    question: "Как реализуется паттерн Factory в Go?",
    code: "type Storage interface { Save(data []byte) error }\n\nfunc NewStorage(storageType string) Storage {\n    switch storageType {\n    case \"file\":  return &FileStorage{}\n    case \"s3\":    return &S3Storage{}\n    default:      return &MemStorage{}\n    }\n}",
    options: [
      "Функция-фабрика возвращает интерфейс, скрывая конкретную реализацию",
      "Через абстрактный класс с методом Create()",
      "Через рефлексию и reflect.New()",
      "Паттерн Factory невозможен в Go",
    ],
    correct: 0,
    explanation:
      "Factory в Go — функция, возвращающая интерфейс. Вызывающий код не знает о конкретном типе (FileStorage, S3Storage) — работает только через интерфейс Storage. Это отвязывает код от деталей реализации.",
  },
  {
    id: 46,
    question: "Как реализуется паттерн Decorator в Go?",
    code: "type Logger interface { Log(msg string) }\n\ntype TimestampLogger struct {\n    inner Logger\n}\n\nfunc (t *TimestampLogger) Log(msg string) {\n    t.inner.Log(time.Now().String() + \": \" + msg)\n}",
    options: [
      "Через наследование и переопределение методов",
      "Обёртка реализует тот же интерфейс, добавляя поведение и делегируя вызов внутреннему объекту",
      "Через middleware-функции без интерфейсов",
      "Через monkey-patching методов",
    ],
    correct: 1,
    explanation:
      "Decorator в Go: обёртка (TimestampLogger) реализует тот же интерфейс (Logger) и содержит inner — оригинал. Вызов Log() добавляет timestamp и делегирует inner.Log(). Декораторы можно вкладывать друг в друга.",
  },
  {
    id: 47,
    question: "Что такое паттерн Repository и как он связан с интерфейсами?",
    options: [
      "Repository — это Git-репозиторий для хранения кода",
      "Интерфейс, абстрагирующий доступ к данным: бизнес-логика не знает, откуда берутся данные",
      "Паттерн для кэширования данных в памяти",
      "Специальный пакет Go для работы с базами данных",
    ],
    correct: 1,
    explanation:
      "Repository — интерфейс (UserRepo с методами GetByID, Save, Delete), абстрагирующий хранилище. Бизнес-логика работает с интерфейсом, а конкретная реализация (PostgresRepo, MongoRepo, MockRepo) подставляется через DI.",
  },

  // ── КОД-РЕВЬЮ / ЧТО ВЫВЕДЕТ КОД (Q48-Q50) ───────────────────────────────
  {
    id: 48,
    question: "Что выведет этот код?",
    code: "type Animal interface { Speak() string }\ntype Dog struct{}\nfunc (d *Dog) Speak() string { return \"Woof\" }\n\nfunc main() {\n    var a Animal\n    var d Dog\n    // a = d   // строка X\n    a = &d\n    fmt.Println(a.Speak())\n}",
    options: [
      "Woof — код работает корректно",
      "Ошибка компиляции на строке X, если её раскомментировать: Dog не реализует Animal, только *Dog",
      "panic: nil pointer dereference",
      "Пустая строка",
    ],
    correct: 1,
    explanation:
      "Speak() определён с pointer receiver (*Dog). Method set Dog не содержит Speak(), поэтому Dog не реализует Animal. Только *Dog реализует Animal. Строка a = &d работает, а a = d (строка X) — ошибка компиляции.",
  },
  {
    id: 49,
    question: "Что выведет этот код?",
    code: "type Base struct{}\nfunc (Base) Name() string { return \"Base\" }\n\ntype Child struct { Base }\nfunc (Child) Name() string { return \"Child\" }\n\nfunc main() {\n    c := Child{}\n    fmt.Println(c.Name())\n    fmt.Println(c.Base.Name())\n}",
    options: [
      "Child\\nChild",
      "Base\\nBase",
      "Child\\nBase",
      "Ошибка компиляции: конфликт методов",
    ],
    correct: 2,
    explanation:
      "c.Name() вызывает Child.Name() — метод Child затеняет промоутированный Base.Name(). Но c.Base.Name() обращается к встроенному полю напрямую и вызывает Base.Name(). Это shadowing, не overriding — ресиверы разные.",
  },
  {
    id: 50,
    question: "Какая проблема в этом коде?",
    code: "type Writer interface { Write(data string) }\n\ntype FileWriter struct { path string }\nfunc (fw FileWriter) Write(data string) { /* write to file */ }\n\nfunc process(w Writer) {\n    if fw, ok := w.(*FileWriter); ok {\n        fmt.Println(\"Writing to:\", fw.path)\n    }\n    w.Write(\"hello\")\n}",
    options: [
      "Утечка памяти из-за незакрытого файла",
      "Type assertion нарушает абстракцию: process знает о конкретном типе FileWriter, что противоречит DIP",
      "Код не скомпилируется — type assertion не работает с кастомными интерфейсами",
      "Проблем нет — код идиоматичен",
    ],
    correct: 1,
    explanation:
      "Функция process() принимает интерфейс Writer, но проверяет конкретный тип *FileWriter. Это нарушает Dependency Inversion — абстракция протекает. Если нужен путь, лучше добавить метод Path() в интерфейс или создать отдельный интерфейс.",
  },
];
