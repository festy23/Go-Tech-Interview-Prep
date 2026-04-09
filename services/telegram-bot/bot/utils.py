ANSWER_LABELS = ["A", "B", "C", "D"]


def answer_feedback(chosen: int, correct: int) -> str:
    label = ANSWER_LABELS[correct]
    if chosen == correct:
        return f"✅ Верно! Ответ: {label}"
    return f"❌ Неверно. Правильный ответ: {label}"


def format_question_text(question: str, code: str | None, header: str) -> str:
    text = f"{header}\n\n{question}"
    if code:
        text += f"\n\n```go\n{code}\n```"
    return text
