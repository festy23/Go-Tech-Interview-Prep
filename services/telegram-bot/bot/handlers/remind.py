from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from bot.keyboards.inline import remind_keyboard

router = Router()

_reminder_prefs: dict[int, bool] = {}


def is_reminder_enabled(tg_id: int) -> bool:
    return _reminder_prefs.get(tg_id, True)


def get_all_reminder_users() -> set[int]:
    return {uid for uid, enabled in _reminder_prefs.items() if enabled}


@router.message(Command("remind"))
async def cmd_remind(message: Message) -> None:
    tg_id = message.from_user.id
    status = "включены ✅" if is_reminder_enabled(tg_id) else "выключены ❌"
    await message.answer(
        f"🔔 Напоминания сейчас {status}\n\n"
        "Бот напоминает пройти квиз, если вы не заходили на сайт сегодня.",
        reply_markup=remind_keyboard(),
    )


@router.callback_query(F.data == "remind:on")
async def remind_on(callback: CallbackQuery) -> None:
    tg_id = callback.from_user.id
    _reminder_prefs[tg_id] = True
    await callback.message.edit_text("🔔 Напоминания включены ✅")
    await callback.answer()


@router.callback_query(F.data == "remind:off")
async def remind_off(callback: CallbackQuery) -> None:
    tg_id = callback.from_user.id
    _reminder_prefs[tg_id] = False
    await callback.message.edit_text("🔕 Напоминания выключены ❌")
    await callback.answer()
