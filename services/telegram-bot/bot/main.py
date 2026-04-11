import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from bot.api_client import BackendClient
from bot.config import settings
from bot.handlers import daily, help, quiz, remind, start, stats
from bot.scheduler.jobs import send_daily_question, send_smart_reminders

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def main() -> None:
    bot = Bot(
        token=settings.telegram_bot_token,
        default=DefaultBotProperties(parse_mode="HTML"),
    )
    storage = RedisStorage.from_url(settings.redis_url)
    dp = Dispatcher(storage=storage)

    api = BackendClient()

    dp.include_router(start.router)
    dp.include_router(help.router)
    dp.include_router(quiz.router)
    dp.include_router(stats.router)
    dp.include_router(remind.router)
    dp.include_router(daily.router)

    dp["api"] = api

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        send_daily_question,
        trigger=CronTrigger(
            hour=settings.daily_question_hour,
            minute=settings.daily_question_minute,
        ),
        kwargs={"bot": bot, "api": api},
        id="daily_question",
        replace_existing=True,
    )
    scheduler.add_job(
        send_smart_reminders,
        trigger=CronTrigger(
            hour=settings.reminder_hour,
            minute=settings.reminder_minute,
        ),
        kwargs={"bot": bot, "api": api},
        id="smart_reminders",
        replace_existing=True,
    )
    scheduler.start()

    logger.info("Bot starting (long-polling)...")

    try:
        await dp.start_polling(bot)
    finally:
        await api.close()
        scheduler.shutdown()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
