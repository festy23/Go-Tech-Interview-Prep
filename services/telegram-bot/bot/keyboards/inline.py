from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton


def blocks_keyboard(blocks: list[dict]) -> InlineKeyboardMarkup:
    buttons = []
    for block in blocks:
        if block.get("quizId") is not None:
            buttons.append([
                InlineKeyboardButton(
                    text=block["title"],
                    callback_data=f"quiz_block:{block['blockId']}",
                )
            ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def answer_keyboard(question_index: int, options: list[str]) -> InlineKeyboardMarkup:
    labels = ["A", "B", "C", "D"]
    buttons = []
    for i, option in enumerate(options):
        text = f"{labels[i]}. {option[:40]}"
        buttons.append([
            InlineKeyboardButton(
                text=text,
                callback_data=f"answer:{question_index}:{i}",
            )
        ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def daily_answer_keyboard(options: list[str]) -> InlineKeyboardMarkup:
    labels = ["A", "B", "C", "D"]
    buttons = []
    for i, option in enumerate(options):
        text = f"{labels[i]}. {option[:40]}"
        buttons.append([
            InlineKeyboardButton(
                text=text,
                callback_data=f"daily:{i}",
            )
        ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def remind_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Включить", callback_data="remind:on"),
            InlineKeyboardButton(text="❌ Выключить", callback_data="remind:off"),
        ]
    ])
