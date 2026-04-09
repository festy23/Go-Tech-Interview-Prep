from aiogram import F, Router
from aiogram.types import CallbackQuery

router = Router()

_daily_answers: dict[tuple[int, int], int] = {}


def store_daily_answer(tg_id: int, message_id: int, correct: int) -> None:
    _daily_answers[(tg_id, message_id)] = correct


@router.callback_query(F.data.startswith("daily:"))
async def on_daily_answer(callback: CallbackQuery) -> None:
    chosen = int(callback.data.split(":")[1])
    tg_id = callback.from_user.id
    msg_id = callback.message.message_id

    correct = _daily_answers.get((tg_id, msg_id))
    if correct is None:
        await callback.answer("Время ответа истекло")
        return

    labels = ["A", "B", "C", "D"]
    if chosen == correct:
        text = f"✅ Верно! Ответ: {labels[correct]}"
    else:
        text = f"❌ Неверно. Правильный ответ: {labels[correct]}"

    await callback.message.edit_text(
        callback.message.text + f"\n\n{text}",
    )

    _daily_answers.pop((tg_id, msg_id), None)
    await callback.answer()
