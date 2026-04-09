from aiogram import Router
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import Message

from bot.api_client import BackendClient

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject, api: BackendClient) -> None:
    # Check for deep link: /start link_<token>
    if command.args and command.args.startswith("link_"):
        token = command.args[5:]  # Remove "link_" prefix
        tg_id = message.from_user.id

        try:
            result = await api.verify_telegram_link(token, tg_id)
            if result.get("linked"):
                await message.answer(
                    "✅ Аккаунт успешно привязан!\n\n"
                    "Теперь вам доступны:\n"
                    "/quiz — Пройти квиз\n"
                    "/stats — Ваш прогресс\n"
                    "/remind — Напоминания"
                )
            else:
                await message.answer("❌ Не удалось привязать аккаунт. Попробуйте ещё раз на сайте.")
        except Exception:
            await message.answer(
                "❌ Ссылка недействительна или истекла.\n"
                "Создайте новую на сайте (Меню → Подключить Telegram)."
            )
        return

    # Normal /start — show welcome
    await message.answer(
        "👋 Привет! Я бот для подготовки к Go-собеседованию.\n\n"
        "Вот что я умею:\n"
        "/quiz — Пройти мини-квиз (5 вопросов)\n"
        "/stats — Посмотреть свой прогресс\n"
        "/remind — Настроить напоминания\n"
        "/help — Список команд\n\n"
        "🌐 Сайт: golangtest-ten.vercel.app"
    )
