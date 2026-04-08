import type { Question } from "./questions";

export const questionsSql: Question[] = [
  // ── JOINs (Q1-Q6) ────────────────────────────────────────────────────────
  {
    id: 1,
    question: "Чем INNER JOIN отличается от LEFT JOIN?",
    code: "SELECT u.name, o.total\nFROM users u\nINNER JOIN orders o ON u.id = o.user_id;\n\n-- vs\n\nSELECT u.name, o.total\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id;",
    options: [
      "INNER JOIN возвращает только строки с совпадениями в обеих таблицах, LEFT JOIN — все строки из левой + совпадения из правой (NULL если нет)",
      "INNER JOIN быстрее, LEFT JOIN — медленнее, но результат одинаков",
      "LEFT JOIN всегда возвращает больше столбцов, чем INNER JOIN",
      "INNER JOIN работает только с первичными ключами, LEFT JOIN — с любыми столбцами",
    ],
    correct: 0,
    explanation:
      "INNER JOIN возвращает только строки, для которых есть совпадение в обеих таблицах. LEFT JOIN возвращает все строки из левой таблицы, а для строк без совпадения в правой таблице ставит NULL.",
  },
  {
    id: 2,
    question: "Что такое SELF JOIN и когда он нужен?",
    code: "SELECT e.name AS employee, m.name AS manager\nFROM employees e\nJOIN employees m ON e.manager_id = m.id;",
    options: [
      "JOIN таблицы с самой собой — используется для иерархий (сотрудник-менеджер, категории-подкатегории)",
      "JOIN двух одинаковых таблиц в разных схемах",
      "Специальный тип JOIN для рекурсивных запросов",
      "JOIN, который автоматически исключает дубликаты",
    ],
    correct: 0,
    explanation:
      "SELF JOIN — JOIN таблицы с самой собой через алиасы. Используется для иерархических данных: сотрудник→менеджер, категория→подкатегория, друзья в соцсетях. Каждый алиас представляет \"виртуальную копию\" таблицы.",
  },
  {
    id: 3,
    question: "Что возвращает CROSS JOIN?",
    options: [
      "Только строки, где все столбцы совпадают",
      "Декартово произведение — каждая строка первой таблицы с каждой строкой второй",
      "Объединение двух таблиц без дубликатов",
      "Пересечение двух таблиц по общим столбцам",
    ],
    correct: 1,
    explanation:
      "CROSS JOIN возвращает декартово произведение: если в таблице A — 10 строк, в B — 5, результат — 50 строк. Используется редко: для генерации комбинаций (размеры × цвета), календарных сеток и т.д.",
  },
  {
    id: 4,
    question: "В чём ловушка LEFT JOIN с WHERE на правой таблице?",
    code: "-- Запрос 1 (корректный):\nSELECT u.name, o.total\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id AND o.status = 'paid';\n\n-- Запрос 2 (ловушка):\nSELECT u.name, o.total\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nWHERE o.status = 'paid';",
    options: [
      "Разницы нет — оба запроса эквивалентны",
      "Запрос 2 фактически превращает LEFT JOIN в INNER JOIN, отсекая строки с NULL",
      "Запрос 1 медленнее из-за дополнительного условия в ON",
      "Запрос 2 вызовет ошибку синтаксиса",
    ],
    correct: 1,
    explanation:
      "WHERE o.status = 'paid' фильтрует результат ПОСЛЕ JOIN, убирая строки где o.status IS NULL — это все строки без заказов. LEFT JOIN превращается в INNER JOIN. Фильтр по правой таблице нужно ставить в ON, не в WHERE.",
  },
  {
    id: 5,
    question: "Влияет ли порядок таблиц в JOIN на производительность?",
    options: [
      "Да, всегда нужно ставить маленькую таблицу первой",
      "Нет — оптимизатор запросов сам выбирает оптимальный порядок",
      "Да, но только для CROSS JOIN",
      "Порядок важен только при использовании индексов",
    ],
    correct: 1,
    explanation:
      "Современные СУБД (PostgreSQL, MySQL) имеют query optimizer, который переставляет таблицы в оптимальном порядке. Порядок в SQL-запросе — для читаемости. PostgreSQL не поддерживает hints как Oracle/MySQL — для управления порядком JOIN используются параметры сессии (`join_collapse_limit`, `enable_hashjoin` и т.д.).",
  },
  {
    id: 6,
    question: "Почему NATURAL JOIN опасен в production?",
    code: "SELECT * FROM orders NATURAL JOIN products;",
    options: [
      "NATURAL JOIN работает медленнее обычного JOIN",
      "Он автоматически соединяет по ВСЕМ одноимённым столбцам — при добавлении нового столбца запрос может сломаться",
      "NATURAL JOIN не поддерживается в PostgreSQL",
      "Он всегда возвращает декартово произведение",
    ],
    correct: 1,
    explanation:
      "NATURAL JOIN автоматически соединяет по столбцам с одинаковыми именами. Если позже добавить столбец с совпадающим именем (например, updated_at), запрос неявно изменит поведение. В production всегда явно указывайте ON условие.",
  },

  // ── GROUP BY, HAVING, агрегация (Q7-Q11) ─────────────────────────────────
  {
    id: 7,
    question: "Чем WHERE отличается от HAVING?",
    options: [
      "WHERE фильтрует строки ДО группировки, HAVING — ПОСЛЕ группировки (по агрегатам)",
      "WHERE работает с числами, HAVING — со строками",
      "Разницы нет — это синонимы",
      "HAVING может использоваться без GROUP BY, WHERE — нет",
    ],
    correct: 0,
    explanation:
      "WHERE фильтрует отдельные строки до GROUP BY. HAVING фильтрует группы после GROUP BY, работая с результатами агрегатных функций (COUNT, SUM, AVG). Порядок: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY.",
  },
  {
    id: 8,
    question: "В чём разница между COUNT(*), COUNT(column) и COUNT(DISTINCT column)?",
    options: [
      "COUNT(*) считает все строки, COUNT(column) — только не-NULL, COUNT(DISTINCT column) — уникальные не-NULL",
      "Все три варианта эквивалентны и возвращают одно значение",
      "COUNT(*) считает столбцы, COUNT(column) — строки",
      "COUNT(DISTINCT) работает только с числовыми столбцами",
    ],
    correct: 0,
    explanation:
      "COUNT(*) — все строки включая NULL. COUNT(column) — строки где column IS NOT NULL. COUNT(DISTINCT column) — количество уникальных не-NULL значений. Пример: в столбце [1, 2, 2, NULL] — COUNT(*)=4, COUNT(col)=3, COUNT(DISTINCT col)=2.",
  },
  {
    id: 9,
    question: "Как найти дубликаты email в таблице users?",
    code: "SELECT email, COUNT(*) as cnt\nFROM users\nGROUP BY email\nHAVING COUNT(*) > 1;",
    options: [
      "Запрос найдёт все email, которые встречаются больше одного раза",
      "Запрос вернёт ошибку — нельзя использовать COUNT в HAVING",
      "Запрос вернёт все строки из таблицы без фильтрации",
      "Запрос удалит дубликаты из таблицы",
    ],
    correct: 0,
    explanation:
      "GROUP BY email группирует строки по email. HAVING COUNT(*) > 1 оставляет только группы с более чем одной строкой — это и есть дубликаты. SELECT показывает email и количество вхождений.",
  },
  {
    id: 10,
    question: "Можно ли использовать alias из SELECT в WHERE?",
    code: "SELECT name, salary * 12 AS annual\nFROM employees\nWHERE annual > 1000000;  -- Будет ли работать?",
    options: [
      "Да, alias доступен везде в запросе",
      "Нет — WHERE выполняется до SELECT, поэтому alias ещё не определён",
      "Зависит от СУБД — в PostgreSQL работает, в MySQL нет",
      "Да, но только для числовых alias",
    ],
    correct: 1,
    explanation:
      "SQL выполняется в порядке: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY. WHERE обрабатывается раньше SELECT, поэтому alias из SELECT не виден. Нужно: WHERE salary * 12 > 1000000. В ORDER BY alias уже доступен.",
  },
  {
    id: 11,
    question: "В каком порядке SQL выполняет части запроса?",
    options: [
      "SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY",
      "FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT",
      "FROM → SELECT → WHERE → GROUP BY → ORDER BY → HAVING",
      "SELECT → FROM → JOIN → WHERE → ORDER BY → LIMIT",
    ],
    correct: 1,
    explanation:
      "Логический порядок выполнения: FROM (источник) → WHERE (фильтр строк) → GROUP BY (группировка) → HAVING (фильтр групп) → SELECT (выбор столбцов) → ORDER BY (сортировка) → LIMIT. Это объясняет, почему alias из SELECT нельзя использовать в WHERE.",
  },

  // ── Подзапросы и CTE (Q12-Q16) ───────────────────────────────────────────
  {
    id: 12,
    question: "Чем коррелированный подзапрос отличается от обычного?",
    code: "-- Обычный:\nSELECT * FROM emp WHERE salary > (SELECT AVG(salary) FROM emp);\n\n-- Коррелированный:\nSELECT * FROM emp e1\nWHERE salary > (SELECT AVG(salary) FROM emp e2 WHERE e2.dept_id = e1.dept_id);",
    options: [
      "Обычный подзапрос выполняется один раз, коррелированный — для каждой строки внешнего запроса",
      "Коррелированный подзапрос всегда быстрее обычного",
      "Обычный подзапрос может ссылаться на внешний запрос, коррелированный — нет",
      "Разницы в производительности нет",
    ],
    correct: 0,
    explanation:
      "Обычный подзапрос выполняется один раз и его результат используется во внешнем запросе. Коррелированный ссылается на столбцы внешнего запроса (e1.dept_id) и выполняется заново для каждой строки — это может быть медленно на больших таблицах.",
  },
  {
    id: 13,
    question: "Когда CTE (WITH) лучше подзапроса?",
    code: "WITH active_users AS (\n    SELECT id, name FROM users WHERE active = true\n)\nSELECT au.name, COUNT(o.id)\nFROM active_users au\nJOIN orders o ON au.id = o.user_id\nGROUP BY au.name;",
    options: [
      "CTE всегда быстрее подзапроса",
      "CTE улучшает читаемость, позволяет переиспользовать результат и поддерживает рекурсию",
      "CTE — это синтаксический сахар, который компилятор убирает",
      "CTE работает только с SELECT, подзапросы — с любыми операциями",
    ],
    correct: 1,
    explanation:
      "CTE: 1) Читаемость — именованный блок вместо вложенного подзапроса. 2) Переиспользование — можно ссылаться несколько раз. 3) Рекурсия — WITH RECURSIVE для деревьев. В PostgreSQL до версии 12 CTE всегда материализовался. С версии 12+ оптимизатор может инлайнить CTE. Поведение можно контролировать через `AS MATERIALIZED` / `AS NOT MATERIALIZED`.",
  },
  {
    id: 14,
    question: "Как работает рекурсивный CTE?",
    code: "WITH RECURSIVE tree AS (\n    SELECT id, name, parent_id, 0 AS depth\n    FROM categories WHERE parent_id IS NULL\n    UNION ALL\n    SELECT c.id, c.name, c.parent_id, t.depth + 1\n    FROM categories c\n    JOIN tree t ON c.parent_id = t.id\n)\nSELECT * FROM tree;",
    options: [
      "Запрос вызывает сам себя бесконечно, пока не истечёт timeout",
      "Базовый запрос (anchor) выполняется первым, затем рекурсивная часть повторяется, пока не перестанет возвращать строки",
      "Рекурсивный CTE работает только с числовыми данными",
      "UNION ALL можно заменить на UNION без изменения результата",
    ],
    correct: 1,
    explanation:
      "Рекурсивный CTE: 1) Anchor — начальный запрос (корневые категории, parent_id IS NULL). 2) Рекурсивная часть — ссылается на CTE и добавляет потомков. 3) Остановка — когда рекурсивная часть возвращает 0 строк. Идеально для деревьев, графов, иерархий.",
  },
  {
    id: 15,
    question: "В чём разница между EXISTS и IN?",
    code: "-- Вариант 1:\nSELECT * FROM users u\nWHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);\n\n-- Вариант 2:\nSELECT * FROM users\nWHERE id IN (SELECT user_id FROM orders);",
    options: [
      "EXISTS и IN всегда эквивалентны по производительности",
      "EXISTS останавливается при первом совпадении (short-circuit), IN формирует полный список — EXISTS эффективнее при большом подзапросе",
      "IN работает только с числами, EXISTS — с любыми типами",
      "EXISTS возвращает данные подзапроса, IN — только true/false",
    ],
    correct: 1,
    explanation:
      "EXISTS проверяет наличие хотя бы одной строки и прекращает поиск (short-circuit). IN формирует полный набор значений. При большой правой таблице EXISTS эффективнее. При маленькой — разница минимальна. Также IN не работает корректно с NULL.",
  },
  {
    id: 16,
    question: "Что такое LATERAL JOIN и когда он нужен?",
    code: "SELECT u.name, latest.total\nFROM users u\nLEFT JOIN LATERAL (\n    SELECT total FROM orders\n    WHERE user_id = u.id\n    ORDER BY created_at DESC LIMIT 3\n) latest ON true;",
    options: [
      "Обычный JOIN, записанный другим синтаксисом",
      "Подзапрос в LATERAL может ссылаться на столбцы левой таблицы — как коррелированный подзапрос, но в FROM",
      "LATERAL JOIN работает только с агрегатными функциями",
      "Это PostgreSQL-специфичный синтаксис, не входящий в стандарт SQL",
    ],
    correct: 1,
    explanation:
      "LATERAL позволяет подзапросу в FROM ссылаться на предыдущие таблицы (u.id). Это как коррелированный подзапрос, но возвращающий набор строк. Идеально для \"Top-N на группу\" (последние 3 заказа каждого пользователя).",
  },

  // ── Оконные функции (Q17-Q21) ────────────────────────────────────────────
  {
    id: 17,
    question: "В чём разница между ROW_NUMBER(), RANK() и DENSE_RANK()?",
    code: "SELECT name, score,\n  ROW_NUMBER() OVER (ORDER BY score DESC),\n  RANK()       OVER (ORDER BY score DESC),\n  DENSE_RANK() OVER (ORDER BY score DESC)\nFROM students;\n\n-- Данные: Alice=95, Bob=90, Carol=90, Dave=85",
    options: [
      "ROW_NUMBER: 1,2,3,4. RANK: 1,2,2,4. DENSE_RANK: 1,2,2,3",
      "Все три функции возвращают одинаковый результат",
      "ROW_NUMBER: 1,2,3,4. RANK: 1,2,2,3. DENSE_RANK: 1,2,2,4",
      "ROW_NUMBER не работает с ORDER BY, RANK и DENSE_RANK — работают",
    ],
    correct: 0,
    explanation:
      "ROW_NUMBER — уникальный порядковый номер (1,2,3,4). RANK — при одинаковых значениях даёт один ранг, следующий пропускает (1,2,2,4). DENSE_RANK — как RANK, но без пропусков (1,2,2,3).",
  },
  {
    id: 18,
    question: "Чем PARTITION BY отличается от GROUP BY?",
    options: [
      "GROUP BY схлопывает строки в группы, PARTITION BY сохраняет все строки и добавляет агрегат в каждую",
      "PARTITION BY — это синоним GROUP BY в оконных функциях",
      "GROUP BY работает быстрее PARTITION BY",
      "PARTITION BY можно использовать только с ROW_NUMBER",
    ],
    correct: 0,
    explanation:
      "GROUP BY агрегирует строки — 100 строк превращаются в 5 групп. PARTITION BY разбивает данные на группы для оконной функции, но сохраняет все 100 строк. Каждая строка получает значение агрегата для своей группы.",
  },
  {
    id: 19,
    question: "Для чего нужны функции LAG() и LEAD()?",
    code: "SELECT date, revenue,\n  LAG(revenue) OVER (ORDER BY date) AS prev_revenue,\n  revenue - LAG(revenue) OVER (ORDER BY date) AS growth\nFROM daily_sales;",
    options: [
      "LAG — задержка выполнения запроса, LEAD — приоритет выполнения",
      "LAG возвращает значение из предыдущей строки, LEAD — из следующей (в рамках окна)",
      "LAG и LEAD — это функции для работы с датами",
      "LAG удаляет строку, LEAD вставляет новую",
    ],
    correct: 1,
    explanation:
      "LAG(column, N) — значение из N строк назад (по умолчанию 1). LEAD(column, N) — из N строк вперёд. Идеально для: сравнение с предыдущим периодом, расчёт роста, детект аномалий. NULL если предыдущей/следующей строки нет.",
  },
  {
    id: 20,
    question: "Как посчитать нарастающий итог (running total) через оконную функцию?",
    code: "SELECT date, amount,\n  SUM(amount) OVER (ORDER BY date) AS running_total\nFROM payments;",
    options: [
      "SUM с OVER без PARTITION BY суммирует всю таблицу и дублирует результат",
      "SUM с OVER (ORDER BY date) считает нарастающую сумму от первой строки до текущей",
      "Для running total нужен рекурсивный CTE, оконные функции не подходят",
      "Запрос вернёт ошибку — SUM не может использоваться с OVER",
    ],
    correct: 1,
    explanation:
      "SUM(amount) OVER (ORDER BY date) — нарастающий итог: для каждой строки суммируется amount от начала до текущей строки. Без ORDER BY — SUM по всему окну (одно число). OVER (PARTITION BY dept ORDER BY date) — running total внутри каждого отдела.",
  },
  {
    id: 21,
    question: "Что делает функция NTILE()?",
    code: "SELECT name, salary,\n  NTILE(4) OVER (ORDER BY salary) AS quartile\nFROM employees;",
    options: [
      "Делит строки на N равных групп (бакетов) и присваивает номер группы каждой строке",
      "Возвращает N-й элемент из отсортированного набора",
      "Фильтрует первые N процентов строк",
      "Округляет значение до N знаков после запятой",
    ],
    correct: 0,
    explanation:
      "NTILE(4) делит все строки на 4 примерно равные группы (квартили). Первая группа получает 1, вторая — 2 и т.д. Используется для: квартильный анализ зарплат, разбиение на перцентили, сегментация клиентов по тратам.",
  },

  // ── Индексы (Q22-Q28) ────────────────────────────────────────────────────
  {
    id: 22,
    question: "Как B-tree индекс обеспечивает поиск за O(log n)?",
    options: [
      "Хранит все данные в отсортированном массиве",
      "Сбалансированное дерево: каждый узел содержит ключи и указатели на дочерние узлы, на каждом уровне отсекается часть данных",
      "Использует хеш-функцию для прямого доступа к записи",
      "Параллельно сканирует несколько блоков диска",
    ],
    correct: 1,
    explanation:
      "B-tree — сбалансированное дерево, где каждый узел содержит отсортированные ключи и указатели. При поиске на каждом уровне отсекается большая часть данных. Для 1 млн записей нужно ~20 шагов (log₂ 1M ≈ 20), а не 1 млн.",
  },
  {
    id: 23,
    question: "Почему порядок столбцов в составном индексе важен?",
    code: "CREATE INDEX idx_user_status ON orders(user_id, status);\n\n-- Запрос A: WHERE user_id = 1 AND status = 'paid'  ✓\n-- Запрос B: WHERE user_id = 1                      ✓\n-- Запрос C: WHERE status = 'paid'                   ?",
    options: [
      "Порядок не важен — оптимизатор переставит столбцы",
      "Составной индекс работает по принципу \"leftmost prefix\" — запрос C не сможет использовать индекс",
      "Запрос C будет использовать индекс, но медленнее",
      "Все три запроса будут использовать индекс одинаково эффективно",
    ],
    correct: 1,
    explanation:
      "Составной индекс (user_id, status) работает как телефонная книга: сначала сортировка по user_id, потом по status. Запрос по user_id (или user_id + status) использует индекс. Запрос только по status — нет (нельзя искать по фамилии, не зная имя).",
  },
  {
    id: 24,
    question: "Что такое покрывающий (covering) индекс?",
    code: "CREATE INDEX idx_covering ON orders(user_id, status) INCLUDE (total);\n\n-- Запрос:\nSELECT status, total FROM orders WHERE user_id = 42;",
    options: [
      "Индекс, который содержит все столбцы, нужные запросу — данные читаются только из индекса (Index Only Scan)",
      "Индекс, покрывающий все таблицы в базе данных",
      "Индекс, который автоматически обновляется при INSERT",
      "Специальный тип индекса для полнотекстового поиска",
    ],
    correct: 0,
    explanation:
      "Covering index содержит все столбцы, которые запрос читает (WHERE + SELECT). PostgreSQL выполняет Index Only Scan — не обращаясь к таблице (heap). INCLUDE добавляет столбцы в лист индекса без сортировки по ним.",
  },
  {
    id: 25,
    question: "Что такое partial index и когда он полезен?",
    code: "CREATE INDEX idx_active_users ON users(email)\n  WHERE active = true;",
    options: [
      "Индекс, который строится только для строк, удовлетворяющих WHERE — меньше размер, быстрее обновления",
      "Индекс, который индексирует только часть столбцов таблицы",
      "Временный индекс, который удаляется после выполнения запроса",
      "Индекс с неполной точностью для приблизительных запросов",
    ],
    correct: 0,
    explanation:
      "Partial index индексирует только часть строк (WHERE active = true). Если 90% пользователей неактивны, индекс будет в 10 раз меньше обычного. Полезен, когда запросы всегда фильтруют по одному значению.",
  },
  {
    id: 26,
    question: "Когда индекс НЕ помогает и PostgreSQL выбирает Seq Scan?",
    options: [
      "Когда таблица пустая",
      "Когда запрос возвращает большую часть таблицы (>10-20%), используется функция на столбце, или кардинальность низкая",
      "Когда индекс был создан менее часа назад",
      "Когда запрос содержит JOIN",
    ],
    correct: 1,
    explanation:
      "Индекс не помогает: 1) Возвращается >10-20% таблицы — Seq Scan дешевле. 2) Функция на столбце: WHERE LOWER(name) = 'ivan' — нужен функциональный индекс. 3) LIKE '%...' — поиск по середине строки. 4) Низкая кардинальность (boolean) — мало уникальных значений.",
  },
  {
    id: 27,
    question: "Как индексы влияют на операции записи (INSERT/UPDATE/DELETE)?",
    options: [
      "Индексы ускоряют все операции, включая запись",
      "Индексы замедляют запись — каждый индекс нужно обновлять при изменении данных",
      "Индексы влияют только на SELECT, запись не затрагивается",
      "UPDATE автоматически перестраивает все индексы таблицы",
    ],
    correct: 1,
    explanation:
      "Каждый индекс — дополнительная структура, которую нужно обновлять при INSERT/UPDATE/DELETE. 5 индексов = 5 дополнительных записей при INSERT. Баланс: чем больше индексов, тем быстрее чтение, но медленнее запись. Для OLTP — умеренное количество, для OLAP — больше.",
  },
  {
    id: 28,
    question: "Для чего используются GIN и GiST индексы в PostgreSQL?",
    options: [
      "Для индексации числовых столбцов с высокой кардинальностью",
      "GIN — для полнотекстового поиска и JSONB, GiST — для геоданных и диапазонов",
      "Это устаревшие типы индексов, заменённые B-tree",
      "Для индексации внешних ключей (foreign keys)",
    ],
    correct: 1,
    explanation:
      "GIN (Generalized Inverted Index): массивы, JSONB, полнотекстовый поиск — когда в одной строке несколько значений. GiST (Generalized Search Tree): геоданные (PostGIS), диапазоны (tsrange), нечёткий поиск (pg_trgm). B-tree не подходит для этих задач.",
  },

  // ── Транзакции и блокировки — продвинутое (Q29-Q33) ───────────────────────
  {
    id: 29,
    question: "Что гарантирует уровень изоляции Repeatable Read?",
    options: [
      "Полную сериализацию всех транзакций",
      "Транзакция видит снимок данных на момент первого запроса в транзакции — нет dirty read и non-repeatable read, но возможен serialization error",
      "Каждый SELECT внутри транзакции видит последние зафиксированные данные",
      "Блокировку всех читаемых строк до конца транзакции",
    ],
    correct: 1,
    explanation:
      "Repeatable Read в PostgreSQL: транзакция работает со снимком (snapshot) данных на момент первого запроса. Повторный SELECT вернёт те же данные. Нет dirty/non-repeatable read. Но при конфликте записи — serialization error, нужен retry.",
  },
  {
    id: 30,
    question: "Когда стоит использовать уровень изоляции Serializable?",
    options: [
      "Всегда — это самый безопасный уровень без недостатков",
      "Когда нужна гарантия, что параллельные транзакции дадут тот же результат, что последовательные — ценой производительности",
      "Только при DELETE операциях",
      "Serializable нельзя использовать в PostgreSQL",
    ],
    correct: 1,
    explanation:
      "Serializable гарантирует: результат параллельного выполнения = результату какого-то последовательного выполнения. Цена: больше serialization error → нужен retry logic. Используется: финансовые транзакции, бронирование, когда корректность важнее скорости.",
  },
  {
    id: 31,
    question: "Что делает SELECT FOR UPDATE?",
    code: "BEGIN;\nSELECT * FROM accounts WHERE id = 1 FOR UPDATE;\n-- Другие транзакции не смогут изменить эту строку\nUPDATE accounts SET balance = balance - 100 WHERE id = 1;\nCOMMIT;",
    options: [
      "Обновляет строки, найденные SELECT",
      "Блокирует выбранные строки до конца транзакции — пессимистическая блокировка",
      "Создаёт копию строки для будущего обновления",
      "Автоматически откатывает транзакцию при конфликте",
    ],
    correct: 1,
    explanation:
      "SELECT FOR UPDATE — пессимистическая блокировка: выбранные строки блокируются, другие транзакции ждут или получают ошибку (FOR UPDATE NOWAIT). Используется когда нужно прочитать и изменить данные атомарно: списание баланса, бронирование.",
  },
  {
    id: 32,
    question: "Чем оптимистическая блокировка отличается от пессимистической?",
    options: [
      "Оптимистическая блокирует строки при чтении, пессимистическая — при записи",
      "Оптимистическая не блокирует строки, а проверяет версию при записи (UPDATE WHERE version = N). Пессимистическая блокирует строки сразу (FOR UPDATE)",
      "Оптимистическая работает только в NoSQL, пессимистическая — только в SQL",
      "Разницы нет — это одно и то же",
    ],
    correct: 1,
    explanation:
      "Пессимистическая: SELECT FOR UPDATE блокирует строку сразу. Оптимистическая: читаем с version, при UPDATE проверяем UPDATE ... WHERE version = old_version. Если version изменился — retry. Оптимистическая лучше при редких конфликтах, пессимистическая — при частых.",
  },
  {
    id: 33,
    question: "Как возникает deadlock в базе данных?",
    code: "-- Транзакция 1:        -- Транзакция 2:\nUPDATE accounts        UPDATE accounts\n  SET balance=...        SET balance=...\n  WHERE id=1;            WHERE id=2;\n\nUPDATE accounts        UPDATE accounts\n  SET balance=...        SET balance=...\n  WHERE id=2; -- ждёт    WHERE id=1; -- ждёт",
    options: [
      "Deadlock возникает только при использовании Serializable",
      "Две транзакции блокируют ресурсы, которые нужны друг другу — каждая ждёт вторую, создавая цикл ожидания",
      "Deadlock — это когда транзакция ждёт слишком долго",
      "Deadlock возможен только между тремя и более транзакциями",
    ],
    correct: 1,
    explanation:
      "Deadlock: T1 блокирует строку 1, T2 блокирует строку 2. Затем T1 хочет строку 2 (ждёт T2), а T2 хочет строку 1 (ждёт T1) — цикл. PostgreSQL обнаруживает deadlock и откатывает одну транзакцию. Решение: всегда блокировать ресурсы в одном порядке.",
  },

  // ── Query optimization & EXPLAIN (Q34-Q37) ───────────────────────────────
  {
    id: 34,
    question: "Как читать вывод EXPLAIN ANALYZE в PostgreSQL?",
    code: "EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 42;\n\n-- Index Scan using idx_user_id on orders\n--   (cost=0.29..8.31 rows=1 width=48)\n--   (actual time=0.015..0.016 rows=3 loops=1)",
    options: [
      "cost — стоимость в байтах, rows — количество таблиц, width — ширина индекса",
      "cost — оценка стоимости (startup..total), rows — оценка строк, actual — реальные замеры времени и строк",
      "EXPLAIN ANALYZE только показывает план, не выполняя запрос",
      "actual time показывает время создания индекса",
    ],
    correct: 1,
    explanation:
      "cost=0.29..8.31: startup cost и total cost (условные единицы). rows=1: оценка планировщика. actual time: реальное время в мс. rows=3: реальное количество строк (оценка была неточной!). Расхождение rows estimate/actual — сигнал для ANALYZE.",
  },
  {
    id: 35,
    question: "Когда PostgreSQL использует Nested Loop, Hash Join и Merge Join?",
    options: [
      "Все три дают одинаковый результат, но отличаются по скорости в зависимости от данных",
      "Nested Loop — всегда самый быстрый, остальные — fallback",
      "Hash Join — только для хеш-таблиц, Merge Join — для деревьев, Nested Loop — для графов",
      "Все три типа — устаревшие, PostgreSQL 16+ использует только Adaptive Join",
    ],
    correct: 0,
    explanation:
      "Nested Loop: эффективен для маленьких таблиц или когда есть индекс. Hash Join: строит хеш-таблицу из меньшей таблицы — хорош для больших несортированных данных. Merge Join: требует сортированные данные — эффективен с индексами. Optimizer выбирает оптимальный.",
  },
  {
    id: 36,
    question: "Что такое Sequential Scan (Seq Scan) и как его избежать?",
    options: [
      "Seq Scan — последовательное чтение всех строк таблицы. Избежать: создать подходящий индекс и убедиться, что планировщик его использует",
      "Seq Scan — это ошибка в запросе, которую нужно исправить",
      "Seq Scan невозможно избежать в PostgreSQL",
      "Seq Scan — чтение данных в случайном порядке",
    ],
    correct: 0,
    explanation:
      "Seq Scan читает таблицу строка за строкой — O(n). Для маленьких таблиц это нормально. Для больших: 1) Создать B-tree индекс. 2) Убедиться, что WHERE не использует функции на столбце. 3) Запустить ANALYZE для актуальной статистики. 4) Иногда Seq Scan быстрее (при >20% строк).",
  },
  {
    id: 37,
    question: "Чем Index Only Scan отличается от обычного Index Scan?",
    options: [
      "Index Only Scan — сканирование только одного индекса, Index Scan — всех индексов",
      "Index Only Scan читает данные только из индекса, не обращаясь к таблице (heap). Index Scan читает индекс + таблицу",
      "Index Only Scan работает только с Primary Key",
      "Разницы в производительности нет",
    ],
    correct: 1,
    explanation:
      "Index Scan: находит строку в индексе → идёт в heap (таблицу) за данными. Index Only Scan: все нужные столбцы есть в индексе → heap не нужен. Для этого нужен covering index (INCLUDE). Index Only Scan значительно быстрее на I/O-bound нагрузках.",
  },

  // ── N+1 проблема (Q38-Q40) ───────────────────────────────────────────────
  {
    id: 38,
    question: "Что такое N+1 проблема запросов?",
    code: "// Go псевдокод — плохо:\nusers := db.Query(\"SELECT * FROM users\")        // 1 запрос\nfor _, u := range users {\n    orders := db.Query(\"SELECT * FROM orders WHERE user_id = ?\", u.ID)  // N запросов\n}",
    options: [
      "Ошибка, когда запрос возвращает N+1 столбцов вместо N",
      "1 запрос для списка + N запросов для каждого элемента — O(N) запросов вместо O(1)",
      "Проблема с лимитом N+1 соединений к БД",
      "N+1 — это максимальная глубина вложенных подзапросов",
    ],
    correct: 1,
    explanation:
      "N+1: 1 запрос на список (users) + N запросов на связанные данные (orders каждого user). 100 пользователей = 101 запрос к БД. Решение: JOIN, или batch query (WHERE user_id IN (1,2,3,...)), или eager loading в ORM.",
  },
  {
    id: 39,
    question: "Как решить N+1 проблему?",
    code: "// Решение 1 — JOIN:\ndb.Query(`SELECT u.*, o.* FROM users u\n  LEFT JOIN orders o ON u.id = o.user_id`)\n\n// Решение 2 — Batch:\ndb.Query(\"SELECT * FROM users\")\ndb.Query(\"SELECT * FROM orders WHERE user_id IN ($1,$2,$3,...)\", ids...)",
    options: [
      "Увеличить timeout запросов",
      "JOIN загружает всё одним запросом, batch (IN) — двумя. Оба убирают N запросов",
      "Использовать кэш Redis между приложением и БД",
      "Перейти с SQL на NoSQL базу данных",
    ],
    correct: 1,
    explanation:
      "JOIN: 1 запрос, но дублирует данные user для каждого order. Batch IN: 2 запроса (users + orders WHERE user_id IN (...)), данные не дублируются. Batch обычно предпочтительнее. В ORM: Preload/Eager loading использует batch под капотом.",
  },
  {
    id: 40,
    question: "Как обнаружить N+1 проблему в Go-приложении?",
    options: [
      "N+1 обнаруживается только в production через мониторинг",
      "Логировать все SQL-запросы, использовать query tracing или -race детектор",
      "Логировать SQL-запросы и считать их количество на HTTP-запрос. Инструменты: middleware-логгер, pgx tracer, OpenTelemetry",
      "N+1 не существует в Go — это проблема только для ORM",
    ],
    correct: 2,
    explanation:
      "Способы обнаружения: 1) Логировать SQL и считать запросы на endpoint. 2) pgx.QueryTracer для трассировки. 3) OpenTelemetry spans для каждого запроса. 4) В тестах: обёртка над db, считающая вызовы. Красный флаг: количество запросов растёт линейно с данными.",
  },

  // ── database/sql в Go (Q41-Q46) ──────────────────────────────────────────
  {
    id: 41,
    question: "В чём разница между db.Query(), db.QueryRow() и db.Exec() в Go?",
    options: [
      "Query — SELECT с несколькими строками, QueryRow — SELECT с одной строкой, Exec — INSERT/UPDATE/DELETE",
      "Query — быстрый запрос, QueryRow — медленный, Exec — асинхронный",
      "Все три функции идентичны по поведению",
      "Query и QueryRow работают в транзакции, Exec — без",
    ],
    correct: 0,
    explanation:
      "Query() — возвращает *sql.Rows (несколько строк, нужно итерировать и закрывать). QueryRow() — возвращает *sql.Row (одна строка, Scan вызывается сразу). Exec() — для операций без возвращаемых строк (INSERT/UPDATE/DELETE), возвращает sql.Result.",
  },
  {
    id: 42,
    question: "Зачем нужны prepared statements в Go?",
    code: "stmt, err := db.Prepare(\"SELECT * FROM users WHERE id = $1\")\ndefer stmt.Close()\n\nfor _, id := range userIDs {\n    row := stmt.QueryRow(id)\n    // ...\n}",
    options: [
      "Только для предотвращения SQL injection",
      "БД парсит и оптимизирует запрос один раз, затем выполняет многократно с разными параметрами — экономит CPU БД",
      "Prepared statements обязательны в Go — без них запросы не работают",
      "Для автоматического retry при ошибках сети",
    ],
    correct: 1,
    explanation:
      "Prepared statement: БД парсит SQL, строит план выполнения один раз. При повторных вызовах передаются только параметры. Два плюса: 1) Производительность при многократном выполнении. 2) Защита от SQL injection. Минус: привязан к одному соединению в Go — при получении другого conn будет re-prepare.",
  },
  {
    id: 43,
    question: "Зачем нужны sql.NullString, sql.NullInt64 и подобные типы?",
    code: "var name sql.NullString\nerr := row.Scan(&name)\nif name.Valid {\n    fmt.Println(name.String)\n} else {\n    fmt.Println(\"NULL\")\n}",
    options: [
      "Для хранения строк и чисел в формате JSON",
      "Для обработки NULL-значений из БД — Go-типы (string, int64) не могут представить NULL",
      "Для автоматической конвертации типов между Go и SQL",
      "Для ограничения длины строки при записи в БД",
    ],
    correct: 1,
    explanation:
      "В Go string не может быть nil (zero value — пустая строка), int64 не может быть nil (zero value — 0). Но SQL-столбец может быть NULL. sql.NullString имеет поле Valid (bool) для отличия NULL от пустой строки. Альтернатива: использовать *string. С Go 1.22+ доступен обобщённый тип `sql.Null[T]`, покрывающий любой тип: `var name sql.Null[string]`. Конкретные типы (`NullString`, `NullInt64`) по-прежнему работают, но `sql.Null[T]` — более современный подход.",
  },
  {
    id: 44,
    question: "Как правильно работать с транзакциями в Go?",
    code: "tx, err := db.BeginTx(ctx, nil)\nif err != nil { return err }\ndefer tx.Rollback() // безопасно вызвать после Commit\n\n_, err = tx.ExecContext(ctx, \"UPDATE accounts SET balance = balance - $1 WHERE id = $2\", amount, fromID)\nif err != nil { return err }\n\n_, err = tx.ExecContext(ctx, \"UPDATE accounts SET balance = balance + $1 WHERE id = $2\", amount, toID)\nif err != nil { return err }\n\nreturn tx.Commit()",
    options: [
      "defer tx.Rollback() вызовет ошибку после успешного Commit",
      "Паттерн корректный: defer Rollback — no-op после Commit, обеспечивает откат при panic или ошибке",
      "Нельзя использовать defer с транзакциями — нужно явно вызывать Rollback",
      "BeginTx нужно вызывать без context",
    ],
    correct: 1,
    explanation:
      "Идиоматичный паттерн: defer tx.Rollback() — если Commit уже был вызван, Rollback вернёт sql.ErrTxDone (игнорируется). Если произошла ошибка или panic — транзакция откатится. Всегда используйте BeginTx с context для контроля timeout.",
  },
  {
    id: 45,
    question: "Зачем использовать QueryContext/ExecContext вместо Query/Exec?",
    options: [
      "Context-версии быстрее обычных",
      "Context позволяет отменить запрос по таймауту или при отмене HTTP-запроса — без context запрос может висеть вечно",
      "Context-версии обязательны начиная с Go 1.18",
      "Context нужен только для SELECT, для INSERT/UPDATE не нужен",
    ],
    correct: 1,
    explanation:
      "QueryContext(ctx, ...) позволяет: 1) Установить timeout (context.WithTimeout). 2) Отменить запрос при отмене HTTP-запроса (client disconnect). 3) Пробросить трейсинг. Без context медленный запрос может заблокировать горутину и соединение из пула надолго.",
  },
  {
    id: 46,
    question: "Как предотвратить SQL injection в Go?",
    code: "// Плохо:\ndb.Query(\"SELECT * FROM users WHERE name = '\" + name + \"'\")\n\n// Хорошо:\ndb.Query(\"SELECT * FROM users WHERE name = $1\", name)",
    options: [
      "Экранировать спецсимволы в строке вручную",
      "Использовать параметризованные запросы ($1, $2) — драйвер передаёт параметры отдельно от SQL, инъекция невозможна",
      "Проверять входные данные регулярными выражениями",
      "Использовать только хранимые процедуры",
    ],
    correct: 1,
    explanation:
      "Параметризованные запросы ($1, $2 в PostgreSQL, ? в MySQL): SQL-код и данные передаются БД отдельно. Драйвер не вставляет данные в строку запроса — инъекция принципиально невозможна. Никогда не конкатенируйте пользовательский ввод в SQL.",
  },

  // ── Пул соединений (Q47-Q49) ─────────────────────────────────────────────
  {
    id: 47,
    question: "Что настраивают SetMaxOpenConns, SetMaxIdleConns и SetConnMaxLifetime?",
    code: "db.SetMaxOpenConns(25)      // макс открытых соединений\ndb.SetMaxIdleConns(10)      // макс простаивающих\ndb.SetConnMaxLifetime(5 * time.Minute)",
    options: [
      "Размер буфера чтения, размер буфера записи и таймаут запроса",
      "MaxOpenConns — лимит соединений к БД, MaxIdleConns — сколько держать в пуле, ConnMaxLifetime — время жизни соединения",
      "Это настройки только для PostgreSQL, для MySQL они другие",
      "MaxOpenConns = количество горутин, MaxIdleConns = количество потоков",
    ],
    correct: 1,
    explanation:
      "MaxOpenConns: максимум одновременных соединений (по умолчанию — без лимита!). MaxIdleConns: сколько соединений держать в пуле для переиспользования. ConnMaxLifetime: пересоздавать соединение через N минут (для балансировщиков, смены паролей). Также существует `SetConnMaxIdleTime` (Go 1.15+) — максимальное время простоя соединения в пуле.",
  },
  {
    id: 48,
    question: "Что произойдёт, когда пул соединений исчерпан?",
    code: "db.SetMaxOpenConns(5)\n// 6-я горутина вызывает db.Query(...)  — что будет?",
    options: [
      "Запрос вернёт ошибку \"too many connections\"",
      "Горутина заблокируется и будет ждать, пока одно из 5 соединений не освободится (или context не отменится)",
      "Go автоматически увеличит лимит",
      "Запрос выполнится без соединения через буферизацию",
    ],
    correct: 1,
    explanation:
      "При исчерпании пула горутина блокируется в ожидании свободного соединения. Если передан context с таймаутом — вернёт ошибку по таймауту. Без context — может ждать вечно. Мониторинг: db.Stats() показывает WaitCount и WaitDuration.",
  },
  {
    id: 49,
    question: "В чём преимущество pgx перед стандартным database/sql?",
    options: [
      "pgx — единственный драйвер для PostgreSQL в Go",
      "pgx поддерживает нативный протокол PostgreSQL: COPY, batch queries, notifications, лучшая производительность и типизация",
      "pgx автоматически генерирует SQL-запросы из Go-структур",
      "database/sql устарел и не поддерживается",
    ],
    correct: 1,
    explanation:
      "pgx — нативный Go-драйвер для PostgreSQL. Преимущества: 1) COPY для массовой вставки. 2) Batch queries (несколько запросов за один roundtrip). 3) Listen/Notify. 4) Нативные типы (UUID, JSONB, arrays). 5) Можно использовать как через database/sql, так и напрямую.",
  },

  // ── Нормализация и дизайн (Q50) ──────────────────────────────────────────
  {
    id: 50,
    question: "Что гарантируют нормальные формы 1NF, 2NF, 3NF и когда стоит денормализовать?",
    options: [
      "1NF: атомарные значения. 2NF: нет частичных зависимостей. 3NF: нет транзитивных зависимостей. Денормализация — для ускорения чтения в аналитике",
      "Нормальные формы определяют количество таблиц в схеме",
      "1NF-3NF — это этапы миграции базы данных",
      "Денормализация запрещена — она нарушает целостность данных",
    ],
    correct: 0,
    explanation:
      "1NF: каждая ячейка содержит одно значение (нет массивов). 2NF: каждый неключевой столбец зависит от ВСЕГО первичного ключа. 3NF: нет транзитивных зависимостей (столбец зависит только от ключа, не от другого столбца). Денормализация — осознанное дублирование для скорости чтения (OLAP, отчёты).",
  },
];
