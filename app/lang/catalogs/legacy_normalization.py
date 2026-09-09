from __future__ import annotations


# Last Arabic-source UI strings that still exist while the bot migrates to
# semantic t() keys.  Keeping their English normalization centralized lets the
# runtime reuse every locale pack and prevents an Arabic literal from leaking
# into a non-Arabic session.
LEGACY_AR_TO_EN: dict[str, str] = {
    "اختر الزر الذي تريد تغيير نوعه:": "Choose the button whose type you want to change:",
    "تغيير نوع الزر: ": "Change button type: ",
    "اختر النوع الجديد:": "Choose the new type:",
    "تعذر نسخ هذا الجزء.": "Couldn't copy this block.",
    "هذا الجزء وصل إلى نهاية الترتيب.": "This block is already at the edge.",
    "تعذر نقل الجزء.": "Couldn't move the block.",
    "الموقع الجديد غير صالح.": "The new position is invalid.",
    "✅ تم تغيير نوع الزر.": "✅ Button type changed.",
    "قيمة الزر غير صالحة.": "The button value is invalid.",
    "✅ تم تغيير محتوى الزر ونوعه تلقائيًا.": "✅ Button content and type changed automatically.",
    "✅ تم تغيير محتوى الزر.": "✅ Button content changed.",
    "كود الصفحة غير موجود أو لا يخصك.": "The page code doesn't exist or doesn't belong to you.",
    "أرسل الرابط؛ يقبل @username أو http:// أو https:// أو tg://": "Send the link; @username, http://, https://, and tg:// are accepted.",
    "أرسل callback_data؛ الحد الأقصى 64 بايت.": "Send callback_data; the maximum is 64 bytes.",
    "أرسل رابط HTTPS من الدومين المربوط بالبوت عبر @BotFather ثم /setdomain.": "Send an HTTPS URL from the domain connected to the bot through @BotFather and /setdomain.",
    "أرسل الاستعلام الذي يُكتب بعد اختيار المحادثة؛ يمكن إرسال /empty لتركه فارغًا.": "Send the inline query used after choosing a chat, or /empty to leave it blank.",
    "أرسل الاستعلام الذي يُكتب في المحادثة الحالية؛ يمكن إرسال /empty.": "Send the inline query used in the current chat, or /empty.",
    "✅ تمت إضافة الزر المعطّل. اختر لونه:": "✅ Disabled button added. Choose its color:",
    "نجح: ": "Succeeded: ",
    "فشل: ": "Failed: ",
    "يمكنك تغيير الإعدادات وإرسال المنشور مرة أخرى.": "You can change the settings and send the post again.",
    "سبب الفشل: ": "Failure reason: ",
    "هذا النوع لا يملك مسار إضافة مباشر حاليًا.": "This type doesn't currently have a direct add flow.",
    "✅ تمت إضافة البلوك بنجاح.": "✅ Block added successfully.",
    "انت مو من المقربين ابتعد عني .... ": "This action is restricted to the bot owner. ",
    "الرسالة الأصلية غير متاحة.": "The original message is unavailable.",
    "تعذر الرجوع إلى الرسالة الأصلية: ": "Couldn't return to the original message: ",
    "أرسل الرابط الجديد؛ يقبل @username أيضًا.": "Send the new link; @username is also accepted.",
    "أرسل callback_data الجديدة؛ الحد الأقصى 64 بايت.": "Send the new callback_data; the maximum is 64 bytes.",
    "أرسل رابط HTTPS من الدومين المربوط عبر @BotFather ثم /setdomain.": "Send an HTTPS URL from the connected domain through @BotFather and /setdomain.",
    "أرسل استعلام Inline، أو /empty.": "Send an inline query, or /empty.",
    "أرسل استعلام Inline للمحادثة الحالية، أو /empty.": "Send an inline query for the current chat, or /empty.",
    "هذا الزر أو النوع لم يعد موجودًا.": "This button or type no longer exists.",
    "قيمة callback_data يجب أن تكون بين 1 و64 بايت.": "callback_data must be between 1 and 64 bytes.",
    "نوع الزر غير صالح لهذه العملية.": "The button type is invalid for this action.",
    "أرسل كلمة بحث صحيحة.": "Send a valid search term.",
    "✅ تم حفظ التعديلات بنفس الكود": "✅ Changes saved with the same code",
    "الصفحة الأصلية لم تعد موجودة. أرسل اسمًا لحفظها كصفحة جديدة.": "The original page no longer exists. Send a name to save it as a new page.",
    "الصفحة الأصلية لم تعد موجودة.": "The original page no longer exists.",
    "✅ تم تحديث الصفحة المحفوظة «": "✅ Saved page updated: «",
    "الصفوف المخططة": "Striped rows",
    "الوضع المضغوط": "Compact mode",
    "تفعيل": "Enable",
    "اختر الخاصية التي تريد تغييرها:": "Choose the property you want to change:",
    "اختر الخلية المطلوبة": "Choose the target cell",
    "الرقم الأول للصف، والثاني للعمود:": "The first number is the row and the second is the column:",
    "تم": "Done",
}


__all__ = ["LEGACY_AR_TO_EN"]
