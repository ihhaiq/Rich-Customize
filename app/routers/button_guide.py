from __future__ import annotations

import html
from typing import Any

from aiogram.exceptions import TelegramAPIError
from aiogram.types import Message

from app.i18n import tr
from app.services.factory import new_block
from app.services.renderer import build_input_rich_message


_EDITOR_PROMPTS = {
    "أرسل الرسالة التي تريد تخصيصها. تقدر تكتب تنسيق الزر داخل النص بأي مكان.":
        "Send the message you want to customize. You can place button syntax anywhere in the text.",
}

_GUIDE_LINES = (
    "{Button name - T.ME/IHHAI #b}",
    "{Profile - USER #p}",
    "{Next page - CBD:code #color}",
    "{Alert - alert: Alert text #color}",
    "{Copy - copy: text to copy #g}",
    "{Search - switch_inline_query: search words}",
    "{Search here - switch_inline_query_current_chat: search words}",
    "{Disabled - disabled #r}",
    "",
    "Two buttons side by side:",
    "{Website - T.ME/IHHAI #b} {Copy - copy: text #g}",
)

_GUIDE_SECTIONS = (
    ("• Link button:", ("{Button name - T.ME/IHHAI #b}",)),
    ("• User or channel button:", ("{Profile - USER #p}",)),
    ("• Saved page button:", ("{Next page - CBD:code #color}",)),
    ("• Alert button:", ("{Alert - alert: Alert text #color}",)),
    ("• Copy button:", ("{Copy - copy: text to copy #g}",)),
    ("• Inline search buttons:", (
        "{Search - switch_inline_query: search words}",
        "{Search here - switch_inline_query_current_chat: search words}",
    )),
    ("• Disabled button:", ("{Disabled - disabled #r}",)),
    ("• Two buttons side by side:", (
        "{Website - T.ME/IHHAI #b} {Copy - copy: text #g}",
    )),
)


def _localized_prompt(prompt: str) -> str:
    source = _EDITOR_PROMPTS.get(prompt, prompt)
    return tr(source)


def button_syntax_examples() -> str:
    return "\n".join(tr(line) if line else "" for line in _GUIDE_LINES)


def button_guide_blocks(prompt: str) -> list[dict[str, Any]]:
    localized_prompt = _localized_prompt(prompt)
    syntax = tr("Syntax: {button name - function: content #color}")
    colors = tr(
        "Colors: #r red, #b or #p blue, #g green. RED, BLUE, GREEN and Arabic color names are also accepted."
    )
    children = [
        new_block("paragraph", {
            "text": syntax,
            "html": f"<p>{syntax}</p>",
        }),
    ]
    for heading, example_lines in _GUIDE_SECTIONS:
        localized_heading = tr(heading)
        example = "\n".join(tr(line) for line in example_lines)
        children.extend([
            new_block("paragraph", {
                "text": localized_heading,
                "html": f"<p>{localized_heading}</p>",
            }),
            new_block("preformatted", {
                "text": example,
                "html": f"<pre>{html.escape(example)}</pre>",
                "parse_inline_buttons": False,
            }),
        ])
    children.append(new_block("paragraph", {
        "text": colors,
        "html": f"<p>{colors}</p>",
    }))
    return [
        new_block("paragraph", {
            "text": localized_prompt,
            "html": f"<p>{localized_prompt}</p>",
        }),
        new_block("details", {
            "summary_html": tr("📘 Inline button guide — tap to open"),
            "children": children,
        }),
    ]


async def answer_with_button_guide(
    message: Message,
    prompt: str,
    reply_markup=None,
) -> Message:
    localized_prompt = _localized_prompt(prompt)
    examples = button_syntax_examples()
    try:
        return await message.bot.send_rich_message(
            chat_id=message.chat.id,
            rich_message=build_input_rich_message(button_guide_blocks(prompt)),
            reply_markup=reply_markup,
        )
    except TelegramAPIError:
        return await message.answer(
            (
                f"{html.escape(localized_prompt)}\n\n"
                f"{html.escape(tr('📘 Inline button guide:'))}\n"
                f"<pre>{html.escape(examples)}</pre>"
            ),
            reply_markup=reply_markup,
            parse_mode="HTML",
        )
