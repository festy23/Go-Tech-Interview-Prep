from collections.abc import Callable

from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

from bot.utils import ANSWER_LABELS


def blocks_keyboard(blocks: list[dict]) -> InlineKeyboardMarkup:
    buttons = []
    for block in blocks:
        # Show sub-blocks that have questions (topicCount > 0, has parent)
        if block.get("topicCount", 0) > 0 and block.get("parentBlockId"):
            block_id = block.get("id") or block.get("blockId")
            buttons.append([
                InlineKeyboardButton(
                    text=block["title"],
                    callback_data=f"quiz_block:{block_id}",
                )
            ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _options_keyboard(
    options: list[str], make_callback: Callable[[int], str],
) -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(
            text=f"{ANSWER_LABELS[i]}. {opt[:40]}",
            callback_data=make_callback(i),
        )]
        for i, opt in enumerate(options)
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def answer_keyboard(question_index: int, options: list[str]) -> InlineKeyboardMarkup:
    return _options_keyboard(options, lambda i: f"answer:{question_index}:{i}")


def daily_answer_keyboard(options: list[str]) -> InlineKeyboardMarkup:
    return _options_keyboard(options, lambda i: f"daily:{i}")


def remind_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Включить", callback_data="remind:on"),
            InlineKeyboardButton(text="❌ Выключить", callback_data="remind:off"),
        ]
    ])
