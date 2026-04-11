from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.api_client import BackendClient

router = Router()


@router.message(Command("stats"))
async def cmd_stats(message: Message, api: BackendClient) -> None:
    tg_users = await api.get_telegram_users()

    tg_id = message.from_user.id
    user_entry = next((u for u in tg_users if u["telegramId"] == tg_id), None)

    if not user_entry:
        await message.answer(
            "⚠️ Аккаунт не привязан.\n"
            "Привяжите Telegram на сайте golangtest-ten.vercel.app "
            "(Меню → Подключить Telegram)"
        )
        return

    progress = await api.get_user_progress(user_entry["id"])
    by_block = progress.get("byBlock", {})

    if not by_block:
        await message.answer(
            "📊 У вас пока нет результатов.\n"
            "Начните с /quiz или на сайте!"
        )
        return

    lines = ["📊 Ваш прогресс:\n"]
    for block_id, entry in by_block.items():
        pct = entry.get("pct", 0)
        bar = "█" * (pct // 10) + "░" * (10 - pct // 10)
        lines.append(f"  {block_id}: {bar} {pct}% ({entry['score']}/{entry['total']})")

    total_score = sum(e["score"] for e in by_block.values())
    total_questions = sum(e["total"] for e in by_block.values())
    overall_pct = round(total_score / total_questions * 100) if total_questions else 0

    lines.append(f"\n🎯 Общий: {overall_pct}% ({total_score}/{total_questions})")
    lines.append("\n🌐 golangtest-ten.vercel.app")

    await message.answer("\n".join(lines))
