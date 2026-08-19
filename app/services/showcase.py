from __future__ import annotations

import asyncio
import secrets
import time

from aiogram import Bot
from aiogram.types import (
    InputMediaAnimation,
    InputMediaAudio,
    InputMediaPhoto,
    InputMediaVideo,
    InputMediaVoiceNote,
    InputRichMessage,
    InputRichMessageMedia,
    Message,
)

from app.i18n import current_language, preserve_user_content
from app.services.media_library import showcase_media_library


MEDIA_LABELS = {
    "photo": "صورة",
    "video": "فيديو",
    "animation": "GIF",
    "audio": "صوت",
    "voice": "بصمة صوتية",
}


class MissingShowcaseMedia(RuntimeError):
    def __init__(self, missing: list[str]) -> None:
        self.missing = missing
        super().__init__(", ".join(missing))


def _html(user_id: int, arabic: bool) -> str:
    future = int(time.time()) + 3600
    if arabic:
        intro = (
            '<h1>قالب جميع Rich Blocks</h1>'
            '<p><b>عريض</b>، <i>مائل</i>، <u>تحته خط</u>، <s>مشطوب</s>، '
            '<code>inline code</code>، <mark>محدد</mark>، H<sub>2</sub>O، x<sup>2</sup>، '
            '<tg-spoiler>مخفي</tg-spoiler>، <a href="https://telegram.org">رابط</a>، '
            '<a href="mailto:test@example.com">بريد</a>، <a href="tel:+123456789">هاتف</a>، '
            f'<a href="tg://user?id={user_id}">إشارة للمستخدم</a>، #هاشتاك، $USD، /editor، @telegram، 4242 4242 4242 4242، '
            '<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>، '
            f'<tg-time unix="{future}" format="wDT">بعد ساعة</tg-time>، '
            '<tg-math>x^2+y^2</tg-math>.</p>'
            '<tg-reference name="demo-note">هذا نص مرجعي.</tg-reference>'
            '<p><a href="#demo-note">رابط إلى المرجع</a> — <a href="#demo-anchor">رابط إلى المرساة</a></p>'
        )
        headings = ''.join(f'<h{level}>عنوان H{level}</h{level}>' for level in range(1, 7))
        labels = {
            "pre": "كتلة Preformatted", "footer": "هذا هو التذييل", "quote": "نص اقتباس متعدد البلوكات",
            "pull": "اقتباس بارز", "author": "الكاتب", "photo": "صورة مع تذييل", "source": "المصدر",
            "video": "فيديو", "audio": "ملف صوتي", "voice": "بصمة صوتية", "animation": "Animation / GIF",
            "details": "تفاصيل قابلة للفتح", "inside": "فقرة داخل Details", "table": "جدول",
            "collage": "كولاج", "slides": "عرض شرائح",
        }
    else:
        intro = (
            '<h1>Every Rich Block Showcase</h1>'
            '<p><b>Bold</b>, <i>italic</i>, <u>underline</u>, <s>strikethrough</s>, '
            '<code>inline code</code>, <mark>marked</mark>, H<sub>2</sub>O, x<sup>2</sup>, '
            '<tg-spoiler>spoiler</tg-spoiler>, <a href="https://telegram.org">URL</a>, '
            '<a href="mailto:test@example.com">email</a>, <a href="tel:+123456789">phone</a>, '
            f'<a href="tg://user?id={user_id}">user mention</a>, #hashtag, $USD, /editor, @telegram, 4242 4242 4242 4242, '
            '<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>, '
            f'<tg-time unix="{future}" format="wDT">in one hour</tg-time>, '
            '<tg-math>x^2+y^2</tg-math>.</p>'
            '<tg-reference name="demo-note">This is referenced text.</tg-reference>'
            '<p><a href="#demo-note">Reference link</a> — <a href="#demo-anchor">Anchor link</a></p>'
        )
        headings = ''.join(f'<h{level}>Heading H{level}</h{level}>' for level in range(1, 7))
        labels = {
            "pre": "Preformatted block", "footer": "This is the footer", "quote": "A multi-block quotation",
            "pull": "A centered pull quote", "author": "The Author", "photo": "Photo with caption", "source": "Source",
            "video": "Video", "audio": "Audio file", "voice": "Voice note", "animation": "Animation / GIF",
            "details": "Expandable Details", "inside": "A paragraph inside Details", "table": "Table",
            "collage": "Collage", "slides": "Slideshow",
        }
    return (
        intro + headings +
        f'<pre><code class="language-python">print(&quot;{labels["pre"]}&quot;)</code></pre>'
        '<hr/>'
        '<a name="demo-anchor"></a>'
        '<ul><li>Unordered item</li><li><input type="checkbox" checked>Checked</li><li><input type="checkbox">Unchecked</li></ul>'
        '<ol start="3" type="a"><li>Ordered item</li><li value="7" type="i">Custom value</li></ol>'
        f'<blockquote><p>{labels["quote"]}</p><cite>{labels["author"]}</cite></blockquote>'
        f'<aside>{labels["pull"]}<cite>{labels["author"]}</cite></aside>'
        '<tg-math-block>E = mc^2</tg-math-block>'
        f'<table bordered striped><caption>{labels["table"]}</caption><tr><th colspan="2">Header</th></tr>'
        '<tr><td rowspan="2" align="center" valign="middle">Cell</td><td>One</td></tr><tr><td>Two</td></tr></table>'
        f'<details open><summary>{labels["details"]}</summary><p>{labels["inside"]}</p><hr/></details>'
        f'<figure><img src="tg://photo?id=show_photo_1" tg-spoiler/><figcaption>{labels["photo"]}<cite>{labels["source"]}</cite></figcaption></figure>'
        f'<figure><video src="tg://video?id=show_video"></video><figcaption>{labels["video"]}</figcaption></figure>'
        f'<figure><audio src="tg://audio?id=show_audio"></audio><figcaption>{labels["audio"]}</figcaption></figure>'
        f'<figure><audio src="tg://audio?id=show_voice"></audio><figcaption>{labels["voice"]}</figcaption></figure>'
        f'<figure><video src="tg://video?id=show_animation"></video><figcaption>{labels["animation"]}</figcaption></figure>'
        '<figure><tg-map lat="33.3152" long="44.3661" zoom="12"/><figcaption>Map — Baghdad</figcaption></figure>'
        f'<tg-collage><img src="tg://photo?id=show_photo_1"/><img src="tg://photo?id=show_photo_2"/><figcaption>{labels["collage"]}</figcaption></tg-collage>'
        f'<tg-slideshow><img src="tg://photo?id=show_photo_2"/><video src="tg://video?id=show_video"></video><figcaption>{labels["slides"]}</figcaption></tg-slideshow>'
        f'<footer>{labels["footer"]}</footer>'
    )


def _showcase_media() -> list[InputRichMessageMedia]:
    missing = showcase_media_library.missing_types()
    if missing:
        raise MissingShowcaseMedia(missing)
    photo_1 = showcase_media_library.random_id("photo")
    photo_2 = showcase_media_library.random_id("photo")
    video = showcase_media_library.random_id("video")
    animation = showcase_media_library.random_id("animation")
    audio = showcase_media_library.random_id("audio")
    voice = showcase_media_library.random_id("voice")
    assert all((photo_1, photo_2, video, animation, audio, voice))
    return [
        InputRichMessageMedia(id="show_photo_1", media=InputMediaPhoto(media=photo_1)),
        InputRichMessageMedia(id="show_photo_2", media=InputMediaPhoto(media=photo_2)),
        InputRichMessageMedia(id="show_video", media=InputMediaVideo(media=video)),
        InputRichMessageMedia(id="show_animation", media=InputMediaAnimation(media=animation)),
        InputRichMessageMedia(id="show_audio", media=InputMediaAudio(media=audio)),
        InputRichMessageMedia(id="show_voice", media=InputMediaVoiceNote(media=voice)),
    ]


async def send_all_blocks_showcase(bot: Bot, chat_id: int, user_id: int) -> Message:
    arabic = current_language() == "ar"
    final_html = _html(user_id, arabic)
    media = _showcase_media()
    thinking = "جاري تجهيز قالب كل البلوكات…" if arabic else "Building the all-block showcase…"
    with preserve_user_content():
        await bot.send_rich_message_draft(
            chat_id=chat_id,
            draft_id=secrets.randbelow(2_147_483_647) + 1,
            rich_message=InputRichMessage(
                html=f"<tg-thinking>{thinking}</tg-thinking>",
                is_rtl=arabic,
            ),
        )
        await asyncio.sleep(1)
        return await bot.send_rich_message(
            chat_id=chat_id,
            rich_message=InputRichMessage(html=final_html, media=media, is_rtl=arabic),
        )
