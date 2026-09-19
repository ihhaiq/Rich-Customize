from __future__ import annotations

import re
from html.parser import HTMLParser

from aiogram import Bot
from aiogram.types import BufferedInputFile, InputRichMessage

from app.i18n import preserve_user_content, t


HTML_MESSAGE_LIMIT = 25_000


class _ContentProbe(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.has_content = False

    def handle_data(self, data: str) -> None:
        self.has_content |= bool(data.strip())

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.has_content |= tag in {"hr", "img", "video", "audio", "tg-document", "tg-map", "tg-button"}


def has_export_content(code: str) -> bool:
    probe = _ContentProbe()
    probe.feed(code)
    probe.close()
    return probe.has_content


def export_filename(page_title: str | None) -> str:
    name = re.sub(r'[\\/<>:"|?*\x00-\x1f\x7f]', "_", page_title or "").strip(" .")
    # نخلي مجال للامتداد ضمن حدود اسم الملف، بدون تغيير محتوى الكود.
    name = name.encode("utf-8")[:180].decode("utf-8", errors="ignore")
    return f"{name}_html.txt" if name else "message_html.txt"


async def send_html_export(
    bot: Bot, chat_id: int, code: str, *, page_title: str | None = None,
) -> None:
    if not has_export_content(code):
        raise ValueError("No content to export")
    with preserve_user_content():
        # len(str) يحسب حروف Unicode، مو بايتات UTF-8.
        if len(code) > HTML_MESSAGE_LIMIT:
            await bot.send_document(
                chat_id=chat_id,
                document=BufferedInputFile(code.encode("utf-8"), filename=export_filename(page_title)),
                caption=t("editor.html_export_file"),
                parse_mode=None,
                protect_content=False,
            )
            return
        await bot.send_rich_message(
            chat_id=chat_id,
            rich_message=InputRichMessage(
                blocks=[
                    {"type": "heading", "size": 2, "text": t("editor.html_export_title")},
                    {"type": "divider"},
                    # code داخل الفقرة حتى يننسخ كله، بدون تفسير HTML أو escaping إضافي.
                    {"type": "paragraph", "text": {"type": "code", "text": code}},
                    {"type": "divider"},
                    {"type": "footer", "text": t("editor.html_export_footer")},
                ],
                is_rtl=False,
                skip_entity_detection=True,
            ),
            protect_content=False,
        )
