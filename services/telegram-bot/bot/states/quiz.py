from aiogram.fsm.state import State, StatesGroup


class QuizState(StatesGroup):
    choosing_block = State()
    answering = State()
