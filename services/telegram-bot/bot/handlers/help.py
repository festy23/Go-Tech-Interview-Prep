from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

router = Router()


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(
        "📚 Команды:\n\n"
        "/quiz — Выбрать тему и пройти 5 вопросов\n"
        "/stats — Прогресс по темам\n"
        "/remind — Включить/выключить напоминания\n"
        "/help — Эта справка\n\n"
        "🌐 golangtest-ten.vercel.app"
    )
