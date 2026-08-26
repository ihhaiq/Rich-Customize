from __future__ import annotations

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
    "{Button name:url https://example.com#b}",
    "{Profile:user#p}",
    "{Action:callback_data action:1#r}",
    "{Next page:cbd a86d3132#b}",
    "{Subscribers only:cbd a86d3132#b sub}",
    "{Alert:popup This is the alert text#r}",
    "{Copy:copy text to copy#g}",
    "{Search:switch_inline_query search words}",
    "{Search here:switch_inline_query_current_chat search words}",
    "{Disabled:disabled#r}",
    "",
    "Two buttons side by side:",
    "{Accept:callback_data yes#g} {Reject:callback_data no#r}",
)


def _localized_prompt(prompt: str) -> str:
    source = _EDITOR_PROMPTS.get(prompt, prompt)
    return tr(source)


def button_syntax_examples() -> str:
    return "\n".join(tr(line) if line else "" for line in _GUIDE_LINES)


def button_guide_blocks(prompt: str) -> list[dict[str, Any]]:
    localized_prompt = _localized_prompt(prompt)
    syntax = tr("Syntax: {button name:type value#color}")
    colors = tr(
        "Colors: #r red, #b or #p blue, #g green, and no code for the default color."
    )
    examples = button_syntax_examples()
    return [
        new_block("paragraph", {
            "text": localized_prompt,
            "html": f"<p>{localized_prompt}</p>",
        }),
        new_block("details", {
            "summary_html": tr("📘 Inline button guide — tap to open"),
            "children": [
                new_block("paragraph", {
                    "text": syntax,
                    "html": f"<p>{syntax}</p>",
                }),
                new_block("blockquote", {
                    "quote_text": examples,
                    "quote_html": examples,
                    "parse_inline_buttons": False,
                }),
                new_block("paragraph", {
                    "text": colors,
                    "html": f"<p>{colors}</p>",
                }),
            ],
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
            f"{localized_prompt}\n\n{tr('📘 Inline button guide:')}\n{examples}",
            reply_markup=reply_markup,
        )


def install_into(editor_core) -> None:
    """Patch the compatibility core until button handlers are fully split out."""
    editor_core._button_guide_blocks = button_guide_blocks
    editor_core._answer_with_button_guide = answer_with_button_guide
    editor_core.BUTTON_SYNTAX_EXAMPLES = button_syntax_examples()
