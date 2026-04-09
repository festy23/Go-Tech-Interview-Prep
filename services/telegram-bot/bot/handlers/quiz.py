import uuid

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from bot.api_client import BackendClient
from bot.keyboards.inline import answer_keyboard, blocks_keyboard
from bot.states.quiz import QuizState
from bot.utils import answer_feedback, format_question_text

router = Router()


@router.message(Command("quiz"))
async def cmd_quiz(message: Message, state: FSMContext, api: BackendClient) -> None:
    blocks = await api.get_blocks(lang="ru")
    if not blocks:
        await message.answer("Нет доступных квизов.")
        return

    await state.set_state(QuizState.choosing_block)
    await message.answer(
        "📝 Выбери тему для квиза:",
        reply_markup=blocks_keyboard(blocks),
    )


@router.callback_query(QuizState.choosing_block, F.data.startswith("quiz_block:"))
async def on_block_chosen(
    callback: CallbackQuery,
    state: FSMContext,
    api: BackendClient,
) -> None:
    block_id = callback.data.split(":", 1)[1]
    questions = await api.get_random_questions(block_id=block_id, limit=5, lang="ru")

    if not questions:
        await callback.message.edit_text("В этом блоке пока нет вопросов.")
        await state.clear()
        return

    await state.set_state(QuizState.answering)
    await state.update_data(
        questions=questions,
        block_id=block_id,
        current=0,
        score=0,
        session_id=str(uuid.uuid4()),
    )

    await _send_question(callback.message, questions, 0)
    await callback.answer()


@router.callback_query(QuizState.answering, F.data.startswith("answer:"))
async def on_answer(
    callback: CallbackQuery,
    state: FSMContext,
    api: BackendClient,
) -> None:
    parts = callback.data.split(":")
    chosen = int(parts[2])

    data = await state.get_data()
    questions = data["questions"]
    current = data["current"]
    score = data["score"]
    q = questions[current]

    is_correct = chosen == q["correct"]
    if is_correct:
        score += 1

    feedback = answer_feedback(chosen, q["correct"])

    if q.get("explanation"):
        feedback += f"\n\n💡 {q['explanation']}"

    next_index = current + 1
    total = len(questions)

    if next_index >= total:
        feedback += f"\n\n🏁 Результат: {score}/{total}"

        pct = round(score / total * 100)
        if pct >= 90:
            feedback += " — Senior-ready! 🔥"
        elif pct >= 70:
            feedback += " — Strong Middle 💪"
        elif pct >= 50:
            feedback += " — Middle 👍"
        else:
            feedback += " — Подучи ещё! 📚"

        await callback.message.edit_text(feedback)
        await state.clear()
    else:
        await callback.message.edit_text(feedback)
        await state.update_data(current=next_index, score=score)
        await _send_question(callback.message, questions, next_index)

    await callback.answer()


async def _send_question(message: Message, questions: list[dict], index: int) -> None:
    q = questions[index]
    header = f"❓ Вопрос {index + 1}/{len(questions)}"
    text = format_question_text(q["question"], q.get("code"), header)
    await message.answer(
        text,
        reply_markup=answer_keyboard(index, q["options"]),
        parse_mode="Markdown",
    )
