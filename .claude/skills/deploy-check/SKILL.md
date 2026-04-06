---
name: deploy-check
description: Проверить статус деплоя на Vercel и работоспособность production API.
---

Проверь что production сайт работает корректно.

## Шаги

1. Проверь доступность сайта:
```bash
curl -s -o /dev/null -w "%{http_code}" https://golangtest-ten.vercel.app/
```

2. Проверь API блоков (должны быть title и topics):
```bash
curl -s 'https://golangtest-ten.vercel.app/api/blocks?lang=ru' | python3 -c "
import json,sys
d=json.load(sys.stdin)
for b in d['data']:
    has_title = bool(b.get('title'))
    print(f\"{b['id']}: title={'OK' if has_title else 'MISSING'} quizId={b.get('quizId')}\")
"
```

3. Проверь каждый квиз (должны возвращать вопросы):
```bash
for qid in 1 2 3 4 5; do
  count=$(curl -s "https://golangtest-ten.vercel.app/api/questions?quizId=$qid&lang=ru" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
  echo "Quiz $qid: $count questions"
done
```

4. Сравни с локальной БД и сообщи расхождения.
