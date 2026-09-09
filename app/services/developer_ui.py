from aiogram.types import InputRichMessage, RichMessageButton, RichTextButton


DATABASE_CHECK_CALLBACK = "dev:database:check"


def build_developer_rich_message(text: str) -> InputRichMessage:
    """Build developer copy with the database action embedded as RichTextButton."""
    return InputRichMessage(blocks=[
        {
            "type": "paragraph",
            "text": [
                text,
                "\n\n",
                RichTextButton(button=RichMessageButton(
                    text="فحص قاعدة البيانات",
                    callback_data=DATABASE_CHECK_CALLBACK,
                    style="primary",
                )),
            ],
        },
    ])


__all__ = ["DATABASE_CHECK_CALLBACK", "build_developer_rich_message"]
