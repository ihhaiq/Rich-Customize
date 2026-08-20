from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from typing import Any, Awaitable, Callable, TypeVar

from aiogram import BaseMiddleware, Bot
from aiogram.exceptions import TelegramRetryAfter
from aiogram.methods import TelegramMethod
from aiogram.types import BotCommand, InlineKeyboardMarkup, TelegramObject

from app.translations_zh import ZH_HANS, ZH_HANT

logger = logging.getLogger(__name__)
T = TypeVar("T")

_language: ContextVar[str] = ContextVar("language", default="en")
_auto_translate: ContextVar[bool] = ContextVar("auto_translate", default=True)


EN: dict[str, str] = {
    "تخصيص الرسالة": "Customize message",
    "اختر الجزء الذي تريد تعديله:": "Choose the block you want to edit:",
    "تمت إضافة الـBlock بنجاح.": "Block added successfully.",
    "أهلًا بك في محرّر الرسائل الغنية.": "Welcome to the Rich Message Editor.",
    "أرسل /editor لبدء رسالة جديدة.": "Send /editor to start a new message.",
    "أرسل الرسالة التي تريد تخصيصها": "Send the message you want to customize.",
    "هذا النوع غير مدعوم حاليًا. أرسل نصًا أو وسائط أو Rich Message.": "This type is not supported. Send text, media, or a Rich Message.",
    "انتهت الجلسة. أرسل /editor للبدء من جديد.": "The session has expired. Send /editor to start again.",
    "هذا هو الموقع الحالي": "This is the current position.",
    "اختر نوع الـBlock الجديد:": "Choose the new block type:",
    "Thinking متاح في sendRichMessageDraft فقط ولا يمكن إضافته للنتيجة النهائية.": "Thinking is available only in sendRichMessageDraft and can't be added to the final result.",
    "نوع غير معروف.": "Unknown type.",
    "اختر مستوى العنوان:": "Choose the heading level:",
    "تمت إضافة الفاصل": "Divider added.",
    "أرسل نص الفقرة": "Send the paragraph text.",
    "أرسل عنوان القسم": "Send the section heading.",
    "أرسل النص البرمجي": "Send the preformatted code.",
    "أرسل نص التذييل": "Send the footer text.",
    "أرسل المعادلة بصيغة LaTeX": "Send the formula in LaTeX.",
    "أرسل اسم المرساة": "Send the anchor name.",
    "أرسل عناصر القائمة؛ كل عنصر في سطر منفصل": "Send the list items, one per line.",
    "أرسل صفوف الجدول؛ كل صف بسطر وافصل الأعمدة بعلامة |": "Send table rows, one per line, separating columns with |.",
    "أرسل نص الاقتباس": "Send the quotation text.",
    "أرسل نص الاقتباس البارز": "Send the pull quote text.",
    "أرسل عنوان «تفاصيل» أولًا": "Send the Details title first.",
    "أرسل صور/فيديو أو Album للكولاج": "Send photos/videos or an album for the collage.",
    "أرسل صور/فيديو أو Album لعرض الشرائح": "Send photos/videos or an album for the slideshow.",
    "أرسل موقعًا من مرفقات Telegram": "Send a location from Telegram attachments.",
    "أرسل GIF أو Animation": "Send a GIF or animation.",
    "أرسل ملف Audio": "Send an audio file.",
    "أرسل صورة": "Send a photo.",
    "أرسل فيديو": "Send a video.",
    "أرسل بصمة صوتية": "Send a voice note.",
    "اختيار غير صالح.": "Invalid selection.",
    "مستوى العنوان غير صالح.": "Invalid heading level.",
    "اخترت H": "You selected H",
    ". أرسل نص العنوان الآن.": ". Send the heading text now.",
    ". أرسل نص العنوان الجديد الآن.": ". Send the new heading text now.",
    "هذا العنوان لم يعد موجودًا.": "This heading no longer exists.",
    "انتهت عملية الإضافة. ارجع إلى المحرّر وحاول مجددًا.": "The add operation expired. Return to the editor and try again.",
    "عنوان التفاصيل يجب أن يكون نصًا.": "The Details title must be text.",
    "الآن أرسل المحتوى داخل «تفاصيل»: نصًا أو وسائط أو Album": "Now send the content inside Details: text, media, or an album.",
    "نص الاقتباس يجب أن يكون نصًا.": "The quotation must be text.",
    "أرسل اسم الكاتب، أو /skip لإضافته بدون كاتب": "Send the author name, or /skip to omit it.",
    "أرسل اسم الكاتب كنص، أو /skip.": "Send the author as text, or /skip.",
    "هذا المحتوى غير مدعوم داخل «تفاصيل».": "This content isn't supported inside Details.",
    "أرسل صورًا أو فيديوهات لهذا النوع.": "Send photos or videos for this type.",
    "أرسل موقعًا باستخدام زر المرفقات في Telegram.": "Send a location using Telegram's attachment button.",
    "نوع الوسائط غير صحيح؛ أرسل النوع الذي اخترته.": "Wrong media type; send the type you selected.",
    "هذا النوع يحتاج إلى نص.": "This type requires text.",
    "هذا الجزء لم يعد موجودًا.": "This block no longer exists.",
    "اختر مستوى العنوان الجديد:": "Choose the new heading level:",
    "أرسل النص الجديد": "Send the new text.",
    "أرسل الوصف الجديد": "Send the new caption.",
    "أرسل الصورة الجديدة": "Send the new photo.",
    "أرسل نص الفقرة الجديد": "Send the new paragraph text.",
    "أرسل عنوان القسم الجديد": "Send the new section heading.",
    "أرسل النص البرمجي الجديد": "Send the new preformatted code.",
    "أرسل التذييل الجديد": "Send the new footer.",
    "أرسل معادلة LaTeX الجديدة": "Send the new LaTeX formula.",
    "أرسل اسم المرساة الجديد": "Send the new anchor name.",
    "أرسل عناصر القائمة؛ كل عنصر في سطر": "Send list items, one per line.",
    "أرسل صفوف الجدول؛ افصل الأعمدة بعلامة |": "Send table rows; separate columns with |.",
    "أرسل نص الاقتباس الجديد": "Send the new quotation text.",
    "أرسل نص الاقتباس البارز الجديد": "Send the new pull quote text.",
    "أرسل صور/فيديو أو Album جديدًا للكولاج": "Send new photos/videos or an album for the collage.",
    "أرسل صور/فيديو أو Album جديدًا لعرض الشرائح": "Send new photos/videos or an album for the slideshow.",
    "أرسل الموقع الجديد من مرفقات Telegram": "Send the new location from Telegram attachments.",
    "أرسل الفيديو الجديد": "Send the new video.",
    "أرسل GIF جديدًا": "Send a new GIF.",
    "أرسل Audio جديدًا": "Send new audio.",
    "أرسل بصمة صوتية جديدة": "Send a new voice note.",
    "أرسل الملف الجديد": "Send the new file.",
    "أرسل الملصق الجديد": "Send the new sticker.",
    "أرسل فيديو دائريًا جديدًا": "Send a new video note.",
    "أرسل المحتوى الجديد داخل «تفاصيل»؛ يقبل نصًا أو وسائط أو ألبومًا": "Send the new content inside Details; text, media, or an album is accepted.",
    "أرسل المحتوى الجديد من النوع نفسه": "Send new content of the same type.",
    "أرسل نصًا لهذا الحقل.": "Send text for this field.",
    "عنوان التفاصيل لا يمكن حذفه؛ أرسل عنوانًا جديدًا.": "The Details title can't be removed; send a new title.",
    "نوع المحتوى غير صحيح. أرسل نفس نوع الجزء المطلوب.": "Wrong content type. Send the same required block type.",
    "تم تحديث الجزء بنجاح.": "Block updated successfully.",
    "هذا الحقل لم يعد موجودًا.": "This field no longer exists.",
    "أرسل عنوان «تفاصيل» الجديد": "Send the new Details title.",
    "أرسل تذييل الوسائط الجديد، أو /remove لحذفه": "Send the new media caption, or /remove to delete it.",
    "أرسل اسم الكاتب/المصدر الجديد، أو /remove لحذفه": "Send the new author/source, or /remove to delete it.",
    "هل تريد حذف هذا الجزء؟": "Do you want to delete this block?",
    "تم الحذف": "Deleted.",
    "لا توجد أجزاء. أرسل /editor لإنشاء رسالة جديدة.": "There are no blocks. Send /editor to create a new message.",
    "اختر الموقع الجديد:": "Choose the new position:",
    "تعذر نقل الجزء؛ ربما تغيرت الجلسة.": "Couldn't move the block; the session may have changed.",
    "تم تغيير الموقع": "Position changed.",
    "جاري إنشاء المعاينة…": "Generating preview…",
    "المعاينة جاهزة.": "Preview is ready.",
    "تعذر إنشاء المعاينة. راجع السجل لمعرفة الخطأ.": "Couldn't generate the preview. Check the log for details.",
    "تعذر إرسال النتيجة كرسالة غنية واحدة؛ لم يتم تقسيمها إلى رسائل منفصلة. راجع السجل لمعرفة البلوك المسبب.": "The result couldn't be sent as one rich message; it wasn't split into separate messages. Check the log for the block that caused the error.",
    "تعذر إرسال النتيجة كرسالة غنية واحدة؛ لم يتم تقسيمها إلى رسائل منفصلة.": "The result couldn't be sent as one rich message; it wasn't split into separate messages.",
    "السبب: ": "Reason: ",
    "تعذرت المعاينة.": "Preview failed.",
    "استخدم أزرار المحرّر، أو أرسل /editor لبدء رسالة جديدة.": "Use the editor buttons, or send /editor to start a new message.",
    "تعذرت معاينة جزء غير مدعوم.": "An unsupported block couldn't be previewed.",
    "إدارة ": "Manage ",
    "النوع: ": "Type: ",
    "اختر العملية:": "Choose an action:",
    "📦 محتوى": "📦 Content",
    "📝 نص": "📝 Text", "📝 فقرة": "📝 Paragraph", "🔠 عنوان قسم": "🔠 Section heading",
    "💻 نص برمجي": "💻 Preformatted", "🔻 تذييل": "🔻 Footer", "💬 وصف": "💬 Caption",
    "🖼 صورة": "🖼 Photo", "🎬 فيديو": "🎬 Video", "🎞 GIF": "🎞 GIF",
    "🎵 صوت": "🎵 Audio", "🎙 بصمة صوتية": "🎙 Voice note", "📄 ملف": "📄 Document",
    "🏷 ملصق": "🏷 Sticker", "⭕ فيديو دائري": "⭕ Video note", "➖ فاصل": "➖ Divider",
    "📋 قائمة": "📋 List", "▦ جدول": "▦ Table", "❝ اقتباس": "❝ Blockquote",
    "💬 اقتباس بارز": "💬 Pull quote", "📂 تفاصيل": "📂 Details", "∑ معادلة": "∑ Formula",
    "⚓ مرساة": "⚓ Anchor", "🖼 كولاج": "🖼 Collage", "🎞 عرض شرائح": "🎞 Slideshow",
    "🗺 خريطة": "🗺 Map",
    "عنوان قسم": "Section heading", "نص برمجي": "Preformatted", "بصمة صوتية": "Voice note",
    "فيديو دائري": "Video note", "اقتباس بارز": "Pull quote", "عرض شرائح": "Slideshow",
    "نص": "Text", "فقرة": "Paragraph", "تذييل": "Footer", "وصف": "Caption",
    "صورة": "Photo", "فيديو": "Video", "صوت": "Audio", "ملف": "Document",
    "ملصق": "Sticker", "فاصل": "Divider", "قائمة": "List", "جدول": "Table",
    "اقتباس": "Blockquote", "معادلة": "Formula", "مرساة": "Anchor", "كولاج": "Collage",
    "خريطة": "Map",
    "➕ إضافة Block": "➕ Add Block", "✅ النتيجة": "✅ Result",
    "📝 إنشاء منشور": "📝 Create Post",
    "إنشاء منشور": "Create Post",
    "اضغط على كل قناة أو مجموعة لتحديدها للإرسال المتعدد.": "Tap each channel or group to select it for multi-send.",
    "المحدد حالياً: ": "Currently selected: ",
    "⚙️ إعدادات وإرسال": "⚙️ Settings and Send",
    "اختر القناة أو المجموعة التي تريد إرسال المنشور إليها:": "Choose the channel or group where you want to publish:",
    "لا توجد قناة أو مجموعة مشتركة يكون فيها المستخدم والبوت مشرفين.": "There is no channel or group where both you and the bot are administrators.",
    "أضف البوت من أحد الزرين، وبعد نجاح الإضافة سيصلك إشعار هنا.": "Add the bot using one of the buttons; you will be notified here when it succeeds.",
    "➕ إضافة البوت إلى قناة": "➕ Add bot to channel",
    "➕ إضافة البوت إلى مجموعة": "➕ Add bot to group",
    "تمت إضافة البوت، لكن بدون صلاحية نشر الرسائل في القناة.": "The bot was added without permission to post messages in the channel.",
    "✅ تم الوصول إلى «": "✅ Successfully reached «",
    "📝 إرسال المنشور": "📝 Send Post",
    "اختيار محادثة غير صالح.": "Invalid chat selection.",
    "المحادثة لم تعد متاحة، أو أن صلاحيات أحد المشرفين تغيرت.": "The chat is no longer available, or an administrator's rights changed.",
    "إعدادات المنشور": "Post settings",
    "المحادثات المحددة: ": "Selected chats: ",
    "المحادثة: ": "Chat: ",
    "اختر الإعدادات ثم اضغط إرسال:": "Choose the settings, then press Send:",
    "🔕 منشور صامت": "🔕 Silent post",
    "🛡 منشور محمي": "🛡 Protected post",
    "📤 إرسال المنشور الآن": "📤 Send post now",
    "📤 إرسال إلى ": "📤 Send to ",
    " محادثة": " chats",
    "حدد محادثة واحدة على الأقل.": "Select at least one chat.",
    "تم تحديد المحادثة للإرسال": "Chat selected for sending",
    "تم إلغاء تحديد المحادثة": "Chat unselected",
    "نتيجة الإرسال:": "Send results:",
    "✅ نجح: ": "✅ Succeeded: ",
    "❌ فشل: ": "❌ Failed: ",
    "… تم اختصار قائمة النتائج": "… The results list was shortened",
    "اختر المحادثة أولًا.": "Choose a chat first.",
    "تعذر الإرسال؛ تأكد أن المستخدم والبوت ما زالا مشرفين.": "Couldn't send; make sure you and the bot are still administrators.",
    "جاري إرسال المنشور…": "Sending post…",
    "تعذر إرسال المنشور.": "Couldn't send the post.",
    "✅ تم إرسال المنشور إلى «": "✅ Post sent to «",
    "يمكنك تغيير الإعدادات وإرساله مرة أخرى:": "You can change the settings and send it again:",
    "🔘 إضافة أزرار": "🔘 Add Buttons",
    "إدارة الأزرار الشفافة": "Manage inline buttons",
    "عدد الأزرار: ": "Button count: ",
    "➕ إضافة": "➕ Add", "➖ إزالة": "➖ Remove",
    "🎨 تغيير اللون": "🎨 Change color", "↕️ تغيير الترتيب": "↕️ Reorder",
    "🧩 تغيير المحتوى": "🧩 Change action content", "✏️ تغيير العنوان": "✏️ Change title",
    "🔢 عدد الأزرار بالصف: ": "🔢 Buttons per row: ",
    "🔗 رابط أو @username": "🔗 URL or @username",
    "📋 نسخ نص": "📋 Copy text", "💬 Popup تنبيه": "💬 Popup alert",
    "👁 معاينة الأزرار": "👁 Preview buttons",
    "وصلت إلى الحد الأقصى للأزرار.": "You reached the maximum number of buttons.",
    "أرسل عنوان الزر الجديد.": "Send the new button title.",
    "اختر وظيفة الزر:": "Choose the button action:",
    "انتهت عملية إضافة الزر. حاول مجدداً.": "The add-button flow expired. Try again.",
    "أرسل النص الذي تريد نسخه عند الضغط على الزر؛ الحد الأقصى 256 حرف.": "Send the text to copy when the button is pressed; maximum 256 characters.",
    "أرسل نص التنبيه الذي سيظهر عند الضغط؛ الحد الأقصى 200 حرف.": "Send the alert text shown on press; maximum 200 characters.",
    "لا توجد أزرار بعد. أضف زرًا أولًا.": "There are no buttons yet. Add one first.",
    "اختر الزر الذي تريد إزالته:": "Choose the button to remove:",
    "اختر الزر الذي تريد تغيير لونه:": "Choose the button whose color you want to change:",
    "اختر الزر الذي تريد تغيير ترتيبه:": "Choose the button to reorder:",
    "اختر الزر الذي تريد تغيير محتواه:": "Choose the button whose action content you want to change:",
    "اختر الزر الذي تريد تغيير رابطه:": "Choose the button whose URL you want to change:",
    "اختر الزر الذي تريد تغيير عنوانه:": "Choose the button whose title you want to change:",
    "هذا الزر لم يعد موجودًا.": "This button no longer exists.",
    "تم إزالة الزر": "Button removed",
    "تغيير لون الزر: ": "Change button color: ",
    "اختر اللون:": "Choose a color:",
    "تغيير ترتيب الزر: ": "Reorder button: ",
    "⚪ شفاف": "⚪ Transparent", "🔵 أزرق": "🔵 Blue",
    "🟢 أخضر": "🟢 Green", "🔴 أحمر": "🔴 Red",
    "أرسل الرابط الجديد للزر.": "Send the button's new URL.",
    "أرسل الرابط الجديد للزر؛ يقبل @username أيضاً.": "Send the new URL; @username is also accepted.",
    "أرسل النص الجديد الذي سيتم نسخه.": "Send the new text to copy.",
    "أرسل نص التنبيه الجديد؛ الحد الأقصى 200 حرف.": "Send the new alert text; maximum 200 characters.",
    "أرسل العنوان الجديد للزر.": "Send the button's new title.",
    "هذا الزر أو اللون لم يعد موجودًا.": "This button or color no longer exists.",
    "تم تغيير اللون": "Color changed", "تعذر تغيير ترتيب الزر.": "Couldn't reorder the button.",
    "تم تغيير الترتيب": "Order changed",
    "لا توجد أزرار لمعاينتها.": "There are no buttons to preview.",
    "معاينة الأزرار:": "Button preview:", "تم فتح المعاينة": "Preview opened",
    "تم إغلاق المعاينة": "Preview closed", "أرسل قيمة نصية صحيحة.": "Send a valid text value.",
    "عنوان الزر طويل جدًا؛ الحد الأقصى 64 حرفًا.": "The button title is too long; the maximum is 64 characters.",
    "نص النسخ طويل جدًا؛ الحد الأقصى 256 حرفًا.": "The copy text is too long; the maximum is 256 characters.",
    "نص التنبيه طويل جدًا؛ الحد الأقصى 200 حرف.": "The alert text is too long; the maximum is 200 characters.",
    "نوع الزر غير صالح. ارجع إلى لوحة الإدارة وحاول مجدداً.": "Invalid button type. Return to the management panel and try again.",
    "أرسل رابط الزر الآن؛ يقبل @username أو http:// أو https:// أو tg://": "Send the button URL now; @username, http://, https://, and tg:// are accepted.",
    "الرابط غير صالح. أرسل @username أو رابطًا يبدأ بـ http:// أو https:// أو tg://": "Invalid URL. Send @username or a URL beginning with http://, https://, or tg://.",
    "تعذر إضافة الزر؛ وصلت إلى الحد الأقصى.": "Couldn't add the button; the maximum was reached.",
    "✅ تمت إضافة الزر بنجاح.": "✅ Button added successfully.",
    "✅ تم تغيير عنوان الزر.": "✅ Button title changed.",
    "✅ تم تغيير رابط الزر.": "✅ Button URL changed.",
    "✅ تم تغيير نص النسخ.": "✅ Copy text changed.",
    "✅ تم تغيير نص التنبيه.": "✅ Popup text changed.",
    "هذا التنبيه لم يعد متاحاً.": "This alert is no longer available.",
    "✅ تم إزالة الزر.": "✅ Button removed.",
    "✅ تم تغيير لون الزر.": "✅ Button color changed.",
    "✅ تم تغيير ترتيب الزر.": "✅ Button order changed.",
    "انتهت عملية تعديل الزر. ارجع إلى لوحة الإدارة وحاول مجددًا.": "The button edit expired. Return to the management panel and try again.",
    "✏️ تعديل المحتوى": "✏️ Edit content", "✏️ تعديل": "✏️ Edit",
    "📝 تعديل عنوان التفاصيل": "📝 Edit Details title", "💬 تعديل التذييل": "💬 Edit caption",
    "✍️ تعديل المصدر": "✍️ Edit source", "✍️ تعديل الكاتب": "✍️ Edit author",
    "🗑 حذف": "🗑 Delete", "↕️ تغيير الموقع": "↕️ Change position", "🔙 رجوع": "🔙 Back",
    "💭 Thinking (للمسودة فقط)": "💭 Thinking (draft only)",
    "H1 — الأكبر": "H1 — Largest", "H2 — كبير": "H2 — Large", "H3 — متوسط كبير": "H3 — Medium large",
    "H4 — متوسط": "H4 — Medium", "H5 — صغير": "H5 — Small", "H6 — الأصغر": "H6 — Smallest",
    "🗑 نعم، حذف": "🗑 Yes, delete", "إلغاء": "Cancel",
    "🧩 قالب كل البلوكات": "🧩 Every Rich Block",
    "جاري تجهيز قالب كل البلوكات…": "Building the all-block showcase…",
    "تعذر إرسال قالب كل البلوكات. راجع السجل لمعرفة الخطأ.": "Couldn't send the all-block showcase. Check the log for details.",
    "مكتبة وسائط القالب ناقصة. أضف إلى قناة الوسائط: ": "The showcase media library is incomplete. Add to the media channel: ",
    "دريفت": "draft",
    "تفاصيل": "Details",
}


def resolve_language(language_code: str | None) -> str:
    code = (language_code or "").strip().lower().replace("_", "-")
    if code.startswith("ar"):
        return "ar"
    if code.startswith("zh"):
        if any(marker in code for marker in ("hant", "tw", "hk", "mo")):
            return "zh-hant"
        return "zh-hans"
    return "en"


def current_language() -> str:
    return _language.get()


def tr(text: str) -> str:
    language = _language.get()
    if language == "ar":
        return text
    translated = text
    for source, target in sorted(EN.items(), key=lambda item: len(item[0]), reverse=True):
        translated = translated.replace(source, target)
    chinese = ZH_HANT if language == "zh-hant" else ZH_HANS if language == "zh-hans" else None
    if chinese:
        for source, target in sorted(chinese.items(), key=lambda item: len(item[0]), reverse=True):
            translated = translated.replace(source, target)
    return translated


@contextmanager
def preserve_user_content():
    token = _auto_translate.set(False)
    try:
        yield
    finally:
        _auto_translate.reset(token)


class LocaleMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = data.get("event_from_user") or getattr(event, "from_user", None)
        token = _language.set(resolve_language(getattr(user, "language_code", None)))
        try:
            return await handler(event, data)
        finally:
            _language.reset(token)


class LocalizedBot(Bot):
    async def __call__(self, method: TelegramMethod[T], request_timeout: int | None = None) -> T:
        if _auto_translate.get() and _language.get() != "ar":
            updates: dict[str, Any] = {}
            text = getattr(method, "text", None)
            if isinstance(text, str):
                updates["text"] = tr(text)
            markup = getattr(method, "reply_markup", None)
            if isinstance(markup, InlineKeyboardMarkup):
                keyboard = [
                    [button.model_copy(update={"text": tr(button.text)}) for button in row]
                    for row in markup.inline_keyboard
                ]
                updates["reply_markup"] = markup.model_copy(update={"inline_keyboard": keyboard})
            if updates:
                method = method.model_copy(update=updates)
        return await super().__call__(method, request_timeout=request_timeout)


def _profile_state_path(bot: Bot) -> Path:
    configured = os.getenv("BOT_PROFILE_STATE", "").strip()
    return Path(configured) if configured else Path("data") / f"bot_profile_state_{bot.id}.json"


def _load_profile_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_profile_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def _profile_signature(profiles: dict[str | None, dict[str, Any]]) -> str:
    serializable: dict[str, Any] = {}
    for language_code, profile in profiles.items():
        serializable[language_code or "default"] = {
            "name": profile["name"],
            "description": profile["description"],
            "short": profile["short"],
            "commands": [
                {"command": command.command, "description": command.description}
                for command in profile["commands"]
            ],
        }
    raw = json.dumps(serializable, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _same_commands(current: list[BotCommand], desired: list[BotCommand]) -> bool:
    return [(item.command, item.description) for item in current] == [
        (item.command, item.description) for item in desired
    ]


async def configure_bot_profile(bot: Bot) -> None:
    profiles = {
        None: {
            "name": "Rich Message Editor",
            "description": "Create and customize Telegram Rich Messages with structured blocks, media, details, quotations, lists, tables, and previews.",
            "short": "Create and customize Telegram Rich Messages.",
            "commands": [BotCommand(command="editor", description="Start a new rich message"), BotCommand(command="draft", description="Show every Rich Block"), BotCommand(command="start", description="Open the bot")],
        },
        "en": {
            "name": "Rich Message Editor",
            "description": "Create and customize Telegram Rich Messages with structured blocks, media, details, quotations, lists, tables, and previews.",
            "short": "Create and customize Telegram Rich Messages.",
            "commands": [BotCommand(command="editor", description="Start a new rich message"), BotCommand(command="draft", description="Show every Rich Block"), BotCommand(command="start", description="Open the bot")],
        },
        "ar": {
            "name": "محرّر الرسائل الغنية",
            "description": "أنشئ وخصّص رسائل Telegram الغنية باستخدام البلوكات والوسائط والتفاصيل والاقتباسات والقوائم والجداول والمعاينة.",
            "short": "إنشاء وتخصيص رسائل Telegram الغنية.",
            "commands": [BotCommand(command="editor", description="بدء رسالة غنية جديدة"), BotCommand(command="draft", description="عرض قالب جميع البلوكات"), BotCommand(command="start", description="فتح البوت")],
        },
        "zh": {
            "name": "富消息编辑器",
            "description": "使用结构化区块、媒体、详情、引用、列表、表格和预览来创建并自定义 Telegram 富消息。",
            "short": "创建并自定义 Telegram 富消息。",
            "commands": [
                BotCommand(command="editor", description="开始创建新的富消息"),
                BotCommand(command="draft", description="显示所有富消息区块"),
                BotCommand(command="start", description="打开机器人"),
            ],
        },
    }
    signature = _profile_signature(profiles)
    state_path = _profile_state_path(bot)
    state = _load_profile_state(state_path)
    if state.get("applied_signature") == signature:
        logger.info("Bot profile is already configured; skipping profile API calls")
        return

    now = int(time.time())
    retry_after_until = int(state.get("retry_after_until", 0) or 0)
    if retry_after_until > now:
        logger.warning(
            "Bot profile setup is paused by Telegram flood control; retry in %s seconds",
            retry_after_until - now,
        )
        return

    completed = True
    for language_code, profile in profiles.items():
        try:
            current_name = await bot.get_my_name(language_code=language_code)
            if current_name.name != profile["name"]:
                await bot.set_my_name(name=profile["name"], language_code=language_code)

            current_description = await bot.get_my_description(language_code=language_code)
            if current_description.description != profile["description"]:
                await bot.set_my_description(
                    description=profile["description"], language_code=language_code,
                )

            current_short = await bot.get_my_short_description(language_code=language_code)
            if current_short.short_description != profile["short"]:
                await bot.set_my_short_description(
                    short_description=profile["short"], language_code=language_code,
                )

            current_commands = await bot.get_my_commands(language_code=language_code)
            if not _same_commands(current_commands, profile["commands"]):
                await bot.set_my_commands(
                    commands=profile["commands"], language_code=language_code,
                )
        except TelegramRetryAfter as error:
            retry_after = max(int(error.retry_after), 1)
            _save_profile_state(
                state_path,
                {
                    "applied_signature": state.get("applied_signature"),
                    "retry_after_until": int(time.time()) + retry_after + 5,
                },
            )
            logger.warning(
                "Telegram paused bot profile changes; retry in %s seconds. "
                "Remaining profile requests were skipped.",
                retry_after,
            )
            return
        except Exception:
            completed = False
            logger.exception("Failed to configure bot profile for language=%s", language_code or "default")

    if completed:
        _save_profile_state(
            state_path,
            {"applied_signature": signature, "retry_after_until": 0},
        )
        logger.info("Bot profile configuration is up to date")
