from __future__ import annotations

import asyncio
import logging

from aiogram import Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from app.config import Settings
from app.i18n import LocaleMiddleware, LocalizedBot, configure_bot_profile
from app.routers import router


async def main() -> None:
    settings = Settings.from_env()
    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )
    bot = LocalizedBot(settings.bot_token)
    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.message.outer_middleware(LocaleMiddleware())
    dispatcher.callback_query.outer_middleware(LocaleMiddleware())
    dispatcher.my_chat_member.outer_middleware(LocaleMiddleware())
    dispatcher.include_router(router)
    await bot.delete_webhook(drop_pending_updates=True)
    await configure_bot_profile(bot)
    await dispatcher.start_polling(bot, allowed_updates=dispatcher.resolve_used_update_types())


if __name__ == "__main__":
    asyncio.run(main())
