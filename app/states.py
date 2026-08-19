from aiogram.fsm.state import State, StatesGroup


class RichEditorStates(StatesGroup):
    waiting_input = State()
    managing = State()
    editing_block = State()
    adding_block = State()
    editing_button = State()
