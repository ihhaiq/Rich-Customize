from __future__ import annotations

EDITOR_PHRASES: dict[str, str] = {
    "math.add_prompt": "Send or forward a ready Rich Message that contains a Math block.",
    "math.edit_prompt": "Send or forward a ready Rich Message that contains the new Math block.",
    "math.ready_missing": "This Rich Message does not contain a Math block. Send a message that already contains Math.",
}

EDITOR_AR_PHRASES: dict[str, str] = {
    "math.add_prompt": "أرسل أو حوّل رسالة غنية جاهزة تحتوي على بلوك Math.",
    "math.edit_prompt": "أرسل أو حوّل الرسالة الغنية الجاهزة التي تحتوي على بلوك Math الجديد.",
    "math.ready_missing": "هذه الرسالة الغنية لا تحتوي على بلوك Math. أرسل رسالة جاهزة تحتوي على المعادلة.",
}

EDITOR_KEY_TRANSLATIONS: dict[str, dict[str, str]] = {
    "es": {
        "math.add_prompt": "Envía o reenvía un Rich Message listo que contenga un bloque Math.",
        "math.edit_prompt": "Envía o reenvía el Rich Message listo que contenga el nuevo bloque Math.",
        "math.ready_missing": "Este Rich Message no contiene un bloque Math. Envía un mensaje que ya contenga la fórmula.",
    },
    "fr": {
        "math.add_prompt": "Envoyez ou transférez un Rich Message prêt contenant un bloc Math.",
        "math.edit_prompt": "Envoyez ou transférez le Rich Message prêt contenant le nouveau bloc Math.",
        "math.ready_missing": "Ce Rich Message ne contient aucun bloc Math. Envoyez un message contenant déjà la formule.",
    },
    "de": {
        "math.add_prompt": "Sende oder leite eine fertige Rich Message mit einem Math-Block weiter.",
        "math.edit_prompt": "Sende oder leite die fertige Rich Message mit dem neuen Math-Block weiter.",
        "math.ready_missing": "Diese Rich Message enthält keinen Math-Block. Sende eine Nachricht, die die Formel bereits enthält.",
    },
    "it": {
        "math.add_prompt": "Invia o inoltra un Rich Message già pronto che contenga un blocco Math.",
        "math.edit_prompt": "Invia o inoltra il Rich Message già pronto che contenga il nuovo blocco Math.",
        "math.ready_missing": "Questo Rich Message non contiene un blocco Math. Invia un messaggio che contenga già la formula.",
    },
    "pt": {
        "math.add_prompt": "Envie ou encaminhe um Rich Message pronto que contenha um bloco Math.",
        "math.edit_prompt": "Envie ou encaminhe o Rich Message pronto que contenha o novo bloco Math.",
        "math.ready_missing": "Este Rich Message não contém um bloco Math. Envie uma mensagem que já contenha a fórmula.",
    },
    "nl": {
        "math.add_prompt": "Stuur of stuur een kant-en-klaar Rich Message door met een Math-blok.",
        "math.edit_prompt": "Stuur of stuur het kant-en-klare Rich Message door met het nieuwe Math-blok.",
        "math.ready_missing": "Dit Rich Message bevat geen Math-blok. Stuur een bericht dat de formule al bevat.",
    },
    "pl": {
        "math.add_prompt": "Wyślij lub przekaż gotową Rich Message zawierającą blok Math.",
        "math.edit_prompt": "Wyślij lub przekaż gotową Rich Message zawierającą nowy blok Math.",
        "math.ready_missing": "Ta Rich Message nie zawiera bloku Math. Wyślij wiadomość, która już zawiera wzór.",
    },
    "uk": {
        "math.add_prompt": "Надішліть або перешліть готове Rich Message, що містить блок Math.",
        "math.edit_prompt": "Надішліть або перешліть готове Rich Message з новим блоком Math.",
        "math.ready_missing": "Це Rich Message не містить блоку Math. Надішліть повідомлення, у якому вже є формула.",
    },
    "ru": {
        "math.add_prompt": "Отправьте или перешлите готовое Rich Message с блоком Math.",
        "math.edit_prompt": "Отправьте или перешлите готовое Rich Message с новым блоком Math.",
        "math.ready_missing": "В этом Rich Message нет блока Math. Отправьте сообщение, в котором формула уже есть.",
    },
    "tr": {
        "math.add_prompt": "Math bloğu içeren hazır bir Rich Message gönderin veya iletin.",
        "math.edit_prompt": "Yeni Math bloğunu içeren hazır Rich Message'ı gönderin veya iletin.",
        "math.ready_missing": "Bu Rich Message içinde Math bloğu yok. Formülü zaten içeren bir mesaj gönderin.",
    },
    "fa": {
        "math.add_prompt": "یک Rich Message آماده که دارای بلوک Math است ارسال یا فوروارد کنید.",
        "math.edit_prompt": "Rich Message آماده‌ای را که دارای بلوک Math جدید است ارسال یا فوروارد کنید.",
        "math.ready_missing": "این Rich Message بلوک Math ندارد. پیامی را بفرستید که از قبل فرمول را داشته باشد.",
    },
    "ku": {
        "math.add_prompt": "Rich Messageeke amade ku bloka Math tê de heye bişîne an jî forward bike.",
        "math.edit_prompt": "Rich Messagea amade ku bloka Math a nû tê de heye bişîne an forward bike.",
        "math.ready_missing": "Di vê Rich Message de bloka Math tune. Peyamek bişîne ku formul jixwe tê de hebe.",
    },
    "ur": {
        "math.add_prompt": "ایک تیار Rich Message بھیجیں یا فارورڈ کریں جس میں Math بلاک موجود ہو۔",
        "math.edit_prompt": "وہ تیار Rich Message بھیجیں یا فارورڈ کریں جس میں نیا Math بلاک موجود ہو۔",
        "math.ready_missing": "اس Rich Message میں Math بلاک موجود نہیں۔ ایسا پیغام بھیجیں جس میں فارمولا پہلے سے موجود ہو۔",
    },
    "hi": {
        "math.add_prompt": "एक तैयार Rich Message भेजें या फ़ॉरवर्ड करें जिसमें Math ब्लॉक हो।",
        "math.edit_prompt": "वह तैयार Rich Message भेजें या फ़ॉरवर्ड करें जिसमें नया Math ब्लॉक हो।",
        "math.ready_missing": "इस Rich Message में Math ब्लॉक नहीं है। ऐसा संदेश भेजें जिसमें फ़ॉर्मूला पहले से मौजूद हो।",
    },
    "id": {
        "math.add_prompt": "Kirim atau teruskan Rich Message siap pakai yang berisi blok Math.",
        "math.edit_prompt": "Kirim atau teruskan Rich Message siap pakai yang berisi blok Math baru.",
        "math.ready_missing": "Rich Message ini tidak berisi blok Math. Kirim pesan yang sudah berisi rumus.",
    },
    "ja": {
        "math.add_prompt": "Math ブロックを含む完成済みの Rich Message を送信または転送してください。",
        "math.edit_prompt": "新しい Math ブロックを含む完成済みの Rich Message を送信または転送してください。",
        "math.ready_missing": "この Rich Message には Math ブロックがありません。数式をすでに含むメッセージを送信してください。",
    },
    "ko": {
        "math.add_prompt": "Math 블록이 포함된 완성된 Rich Message를 보내거나 전달하세요.",
        "math.edit_prompt": "새 Math 블록이 포함된 완성된 Rich Message를 보내거나 전달하세요.",
        "math.ready_missing": "이 Rich Message에는 Math 블록이 없습니다. 수식이 이미 포함된 메시지를 보내세요.",
    },
    "vi": {
        "math.add_prompt": "Gửi hoặc chuyển tiếp một Rich Message hoàn chỉnh có chứa khối Math.",
        "math.edit_prompt": "Gửi hoặc chuyển tiếp Rich Message hoàn chỉnh có chứa khối Math mới.",
        "math.ready_missing": "Rich Message này không có khối Math. Hãy gửi một tin nhắn đã chứa công thức.",
    },
    "th": {
        "math.add_prompt": "ส่งหรือส่งต่อ Rich Message ที่พร้อมใช้งานและมีบล็อก Math",
        "math.edit_prompt": "ส่งหรือส่งต่อ Rich Message ที่พร้อมใช้งานและมีบล็อก Math ใหม่",
        "math.ready_missing": "Rich Message นี้ไม่มีบล็อก Math โปรดส่งข้อความที่มีสูตรอยู่แล้ว",
    },
    "zh-hans": {
        "math.add_prompt": "发送或转发一条已包含 Math 区块的现成 Rich Message。",
        "math.edit_prompt": "发送或转发一条已包含新 Math 区块的现成 Rich Message。",
        "math.ready_missing": "这条 Rich Message 不包含 Math 区块。请发送一条已经包含公式的消息。",
    },
    "zh-hant": {
        "math.add_prompt": "傳送或轉傳一則已包含 Math 區塊的現成 Rich Message。",
        "math.edit_prompt": "傳送或轉傳一則已包含新 Math 區塊的現成 Rich Message。",
        "math.ready_missing": "這則 Rich Message 不包含 Math 區塊。請傳送一則已經包含公式的訊息。",
    },
}

__all__ = ["EDITOR_AR_PHRASES", "EDITOR_KEY_TRANSLATIONS", "EDITOR_PHRASES"]
