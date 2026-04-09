from __future__ import annotations

import logging
from datetime import datetime, timezone

from aiogram import Bot

from bot.api_client import BackendClient
from bot.handlers.daily import store_daily_answer
from bot.handlers.remind import is_reminder_enabled
from bot.keyboards.inline import daily_answer_keyboard
from bot.utils import format_question_text

logger = logging.getLogger(__name__)


async def send_daily_question(bot: Bot, api: BackendClient) -> None:
    try:
        tg_users = await api.get_telegram_users()
        if not tg_users:
            return

        questions = await api.get_random_questions(limit=1, lang="ru")
        if not questions:
            return

        q = questions[0]
        text = format_question_text(q["question"], q.get("code"), "🎯 Вопрос дня")

        keyboard = daily_answer_keyboard(q["options"])

        for user in tg_users:
            tg_id = user["telegramId"]
            try:
                msg = await bot.send_message(
                    chat_id=tg_id,
                    text=text,
                    reply_markup=keyboard,
                    parse_mode="Markdown",
                )
                store_daily_answer(tg_id, msg.message_id, q["correct"])
            except Exception as e:
                logger.warning("Failed to send daily question to %s: %s", tg_id, e)

    except Exception as e:
        logger.error("Daily question job failed: %s", e)


async def send_smart_reminders(bot: Bot, api: BackendClient) -> None:
    try:
        tg_users = await api.get_telegram_users()
        if not tg_users:
            return

        today = datetime.now(timezone.utc).date()

        for user in tg_users:
            tg_id = user["telegramId"]

            if not is_reminder_enabled(tg_id):
                continue

            last_seen_str = user.get("lastSeenAt")
            if last_seen_str:
                last_seen = datetime.fromisoformat(last_seen_str.replace("Z", "+00:00"))
                if last_seen.date() >= today:
                    continue

            try:
                await bot.send_message(
                    chat_id=tg_id,
                    text=(
                        "📢 Напоминание!\n\n"
                        "Сегодня вы ещё не практиковались. "
                        "Пройдите хотя бы один квиз — это займёт пару минут.\n\n"
                        "/quiz — Начать квиз\n"
                        "🌐 golangtest-ten.vercel.app"
                    ),
                )
            except Exception as e:
                logger.warning("Failed to send reminder to %s: %s", tg_id, e)

    except Exception as e:
        logger.error("Smart reminder job failed: %s", e)
