from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    await message.answer(
        "👋 Привет! Я бот для подготовки к Go-собеседованию.\n\n"
        "Вот что я умею:\n"
        "/quiz — Пройти мини-квиз (5 вопросов)\n"
        "/stats — Посмотреть свой прогресс\n"
        "/remind — Настроить напоминания\n"
        "/help — Список команд\n\n"
        "🌐 Сайт: golangtest-ten.vercel.app"
    )
