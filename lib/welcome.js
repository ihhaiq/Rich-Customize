// Serverless port of app/services/welcome.py and its welcome-only locale data.
// Runtime rule: project imports use bare module names; this module has no Node/npm dependencies.

export const SHOWCASE_URL = 'https://t.me/durov/531';
export const UPDATES_URL = 'https://t.me/RichCustomize';
export const SUPPORT_URL = 'https://t.me/+D4cEzE0V7IIwYTcx';
export const ADD_GROUP_URL = 'https://t.me/RichCustomizebot?startgroup=true';
export const BOT_USERNAME = '@RichCustomizebot';

const LOCALES = {
  "en": {
    "welcome.greeting": "Hello",
    "welcome.description_before_view": "is the most distinctive bot to help you create and customize rich messages ",
    "welcome.description_after_view": " with a wide range of blocks and rich buttons, plus preview, saving, and publishing for your group or channel — all easily and safely!",
    "welcome.add_prompt": "👈🏻 Add me to your group/channel",
    "welcome.help_title": "📌 Need some help?",
    "welcome.help_check": "Check the",
    "welcome.view_button": "👁 See",
    "welcome.updates_button": "Updates channel",
    "welcome.support_button": "Support group",
    "welcome.start_prompt": "and start using the bot by pressing",
    "welcome.and": "and",
    "welcome.add_group_button": "➕ Add me to a group ➕",
    "welcome.product_description": "A complete editor for creating and customizing rich Telegram messages.",
    "welcome.add_cta": "👈🏻 Add the bot to your group or channel",
    "welcome.start_cta": "Or start now from"
  },
  "ar": {
    "welcome.greeting": "مرحبا",
    "welcome.description_before_view": "هو البوت الأكثر تميزاً لمساعدتك في إنشاء وتخصيص الرسائل الغنية ",
    "welcome.description_after_view": " باستخدام مجموعة واسعة من البلوكات والأزرار الغنية، مع المعاينة والحفظ والنشر لمجموعتك أو قناتك بكل سهولة وأمان!",
    "welcome.add_prompt": "👈🏻 أضفني في مجموعتك/قناتك",
    "welcome.help_title": "📌 بعض المساعدة؟",
    "welcome.help_check": "تحقق من",
    "welcome.view_button": "👁 انظر",
    "welcome.updates_button": "قناة التحديثات",
    "welcome.support_button": "مجموعة الدعم",
    "welcome.start_prompt": "وابدأ في استعمال البوت عن طريق الضغط على زر",
    "welcome.and": "و",
    "welcome.add_group_button": "➕ أضفني إلى مجموعة ➕",
    "welcome.product_description": "محرّر متكامل لإنشاء وتخصيص رسائل تليكرام الغنية.",
    "welcome.add_cta": "👈🏻 أضف البوت إلى مجموعتك أو قناتك",
    "welcome.start_cta": "أو ابدأ الآن من"
  },
  "es": {
    "welcome.greeting": "¡Hola",
    "welcome.description_before_view": "es el bot más especial para ayudarte a crear y personalizar mensajes enriquecidos ",
    "welcome.description_after_view": " con una amplia variedad de bloques y botones enriquecidos, además de vista previa, guardado y publicación para tu grupo o canal, ¡todo de forma fácil y segura!",
    "welcome.add_prompt": "👈🏻 Añádeme a tu grupo/canal",
    "welcome.help_title": "📌 ¿Necesitas ayuda?",
    "welcome.help_check": "Consulta",
    "welcome.view_button": "👁 Ver",
    "welcome.updates_button": "Canal de actualizaciones",
    "welcome.support_button": "Grupo de soporte",
    "welcome.start_prompt": "y empieza a usar el bot pulsando",
    "welcome.and": "y",
    "welcome.add_group_button": "➕ Añádeme a un grupo ➕",
    "welcome.product_description": "Un editor completo para crear y personalizar mensajes enriquecidos de Telegram.",
    "welcome.add_cta": "👈🏻 Añade el bot a tu grupo o canal",
    "welcome.start_cta": "O empieza ahora desde"
  },
  "fr": {
    "welcome.greeting": "Bonjour",
    "welcome.description_before_view": "est le bot le plus remarquable pour vous aider à créer et personnaliser des messages enrichis ",
    "welcome.description_after_view": " avec un large choix de blocs et de boutons enrichis, ainsi que l’aperçu, l’enregistrement et la publication pour votre groupe ou canal, le tout simplement et en toute sécurité !",
    "welcome.add_prompt": "👈🏻 Ajoutez-moi à votre groupe/canal",
    "welcome.help_title": "📌 Besoin d’aide ?",
    "welcome.help_check": "Consultez",
    "welcome.view_button": "👁 Voir",
    "welcome.updates_button": "Canal des mises à jour",
    "welcome.support_button": "Groupe d’assistance",
    "welcome.start_prompt": "et commencez à utiliser le bot en appuyant sur",
    "welcome.and": "et",
    "welcome.add_group_button": "➕ M’ajouter à un groupe ➕",
    "welcome.product_description": "Un éditeur complet pour créer et personnaliser des messages enrichis Telegram.",
    "welcome.add_cta": "👈🏻 Ajoutez le bot à votre groupe ou canal",
    "welcome.start_cta": "Ou commencez maintenant depuis"
  },
  "de": {
    "welcome.greeting": "Hallo",
    "welcome.description_before_view": "ist der besondere Bot, der dir beim Erstellen und Anpassen von Rich Messages hilft ",
    "welcome.description_after_view": " mit einer großen Auswahl an Blöcken und Rich-Buttons sowie Vorschau, Speichern und Veröffentlichen für deine Gruppe oder deinen Kanal – einfach und sicher!",
    "welcome.add_prompt": "👈🏻 Füge mich deiner Gruppe/deinem Kanal hinzu",
    "welcome.help_title": "📌 Brauchst du Hilfe?",
    "welcome.help_check": "Sieh dir an:",
    "welcome.view_button": "👁 Ansehen",
    "welcome.updates_button": "Update-Kanal",
    "welcome.support_button": "Support-Gruppe",
    "welcome.start_prompt": "und starte den Bot über",
    "welcome.and": "und",
    "welcome.add_group_button": "➕ Zu einer Gruppe hinzufügen ➕",
    "welcome.product_description": "Ein vollständiger Editor zum Erstellen und Anpassen von Telegram-Rich-Messages.",
    "welcome.add_cta": "👈🏻 Füge den Bot deiner Gruppe oder deinem Kanal hinzu",
    "welcome.start_cta": "Oder starte jetzt über"
  },
  "it": {
    "welcome.greeting": "Ciao",
    "welcome.description_before_view": "è il bot più completo per aiutarti a creare e personalizzare messaggi ricchi ",
    "welcome.description_after_view": " con un’ampia scelta di blocchi e pulsanti avanzati, oltre ad anteprima, salvataggio e pubblicazione per il tuo gruppo o canale, in modo semplice e sicuro!",
    "welcome.add_prompt": "👈🏻 Aggiungimi al tuo gruppo/canale",
    "welcome.help_title": "📌 Serve aiuto?",
    "welcome.help_check": "Controlla",
    "welcome.view_button": "👁 Guarda",
    "welcome.updates_button": "Canale aggiornamenti",
    "welcome.support_button": "Gruppo di supporto",
    "welcome.start_prompt": "e inizia a usare il bot premendo",
    "welcome.and": "e",
    "welcome.add_group_button": "➕ Aggiungimi a un gruppo ➕",
    "welcome.product_description": "Un editor completo per creare e personalizzare i messaggi ricchi di Telegram.",
    "welcome.add_cta": "👈🏻 Aggiungi il bot al tuo gruppo o canale",
    "welcome.start_cta": "Oppure inizia ora da"
  },
  "pt": {
    "welcome.greeting": "Olá",
    "welcome.description_before_view": "é o bot mais especial para ajudar você a criar e personalizar mensagens ricas ",
    "welcome.description_after_view": " com uma grande variedade de blocos e botões ricos, além de pré-visualização, salvamento e publicação para seu grupo ou canal, tudo com facilidade e segurança!",
    "welcome.add_prompt": "👈🏻 Adicione-me ao seu grupo/canal",
    "welcome.help_title": "📌 Precisa de ajuda?",
    "welcome.help_check": "Confira",
    "welcome.view_button": "👁 Ver",
    "welcome.updates_button": "Canal de atualizações",
    "welcome.support_button": "Grupo de suporte",
    "welcome.start_prompt": "e comece a usar o bot pressionando",
    "welcome.and": "e",
    "welcome.add_group_button": "➕ Adicione-me a um grupo ➕",
    "welcome.product_description": "Um editor completo para criar e personalizar mensagens ricas do Telegram.",
    "welcome.add_cta": "👈🏻 Adicione o bot ao seu grupo ou canal",
    "welcome.start_cta": "Ou comece agora por"
  },
  "nl": {
    "welcome.greeting": "Hallo",
    "welcome.description_before_view": "is de bijzondere bot die je helpt rijke berichten te maken en aan te passen ",
    "welcome.description_after_view": " met een ruime keuze aan blokken en rijke knoppen, plus voorbeeldweergave, opslaan en publiceren voor je groep of kanaal, allemaal eenvoudig en veilig!",
    "welcome.add_prompt": "👈🏻 Voeg me toe aan je groep/kanaal",
    "welcome.help_title": "📌 Hulp nodig?",
    "welcome.help_check": "Bekijk",
    "welcome.view_button": "👁 Bekijken",
    "welcome.updates_button": "Updatekanaal",
    "welcome.support_button": "Supportgroep",
    "welcome.start_prompt": "en begin de bot te gebruiken via",
    "welcome.and": "en",
    "welcome.add_group_button": "➕ Voeg me toe aan een groep ➕",
    "welcome.product_description": "Een complete editor voor het maken en aanpassen van rijke Telegram-berichten.",
    "welcome.add_cta": "👈🏻 Voeg de bot toe aan je groep of kanaal",
    "welcome.start_cta": "Of begin nu via"
  },
  "pl": {
    "welcome.greeting": "Cześć",
    "welcome.description_before_view": "to wyjątkowy bot, który pomoże Ci tworzyć i personalizować bogate wiadomości ",
    "welcome.description_after_view": " z szerokim wyborem bloków i rozbudowanych przycisków, a także podglądem, zapisywaniem i publikowaniem dla Twojej grupy lub kanału — łatwo i bezpiecznie!",
    "welcome.add_prompt": "👈🏻 Dodaj mnie do swojej grupy/kanału",
    "welcome.help_title": "📌 Potrzebujesz pomocy?",
    "welcome.help_check": "Sprawdź",
    "welcome.view_button": "👁 Zobacz",
    "welcome.updates_button": "Kanał aktualizacji",
    "welcome.support_button": "Grupa wsparcia",
    "welcome.start_prompt": "i zacznij korzystać z bota, naciskając",
    "welcome.and": "i",
    "welcome.add_group_button": "➕ Dodaj mnie do grupy ➕",
    "welcome.product_description": "Kompletny edytor do tworzenia i dostosowywania rozbudowanych wiadomości Telegram.",
    "welcome.add_cta": "👈🏻 Dodaj bota do swojej grupy lub kanału",
    "welcome.start_cta": "Albo zacznij teraz od"
  },
  "uk": {
    "welcome.greeting": "Привіт",
    "welcome.description_before_view": "це особливий бот, який допоможе створювати й налаштовувати розширені повідомлення ",
    "welcome.description_after_view": " із широким вибором блоків і розширених кнопок, а також попереднім переглядом, збереженням і публікацією для вашої групи або каналу — легко й безпечно!",
    "welcome.add_prompt": "👈🏻 Додайте мене до своєї групи/каналу",
    "welcome.help_title": "📌 Потрібна допомога?",
    "welcome.help_check": "Перевірте",
    "welcome.view_button": "👁 Переглянути",
    "welcome.updates_button": "Канал оновлень",
    "welcome.support_button": "Група підтримки",
    "welcome.start_prompt": "і почніть користуватися ботом, натиснувши",
    "welcome.and": "і",
    "welcome.add_group_button": "➕ Додати мене до групи ➕",
    "welcome.product_description": "Повноцінний редактор для створення й налаштування розширених повідомлень Telegram.",
    "welcome.add_cta": "👈🏻 Додайте бота до своєї групи або каналу",
    "welcome.start_cta": "Або почніть зараз через"
  },
  "ru": {
    "welcome.greeting": "Привет",
    "welcome.description_before_view": "— особенный бот, который поможет создавать и настраивать насыщенные сообщения ",
    "welcome.description_after_view": " с широким набором блоков и расширенных кнопок, а также предпросмотром, сохранением и публикацией для вашей группы или канала — легко и безопасно!",
    "welcome.add_prompt": "👈🏻 Добавьте меня в свою группу/канал",
    "welcome.help_title": "📌 Нужна помощь?",
    "welcome.help_check": "Проверьте",
    "welcome.view_button": "👁 Посмотреть",
    "welcome.updates_button": "Канал обновлений",
    "welcome.support_button": "Группа поддержки",
    "welcome.start_prompt": "и начните пользоваться ботом, нажав",
    "welcome.and": "и",
    "welcome.add_group_button": "➕ Добавить меня в группу ➕",
    "welcome.product_description": "Полноценный редактор для создания и настройки расширенных сообщений Telegram.",
    "welcome.add_cta": "👈🏻 Добавьте бота в свою группу или канал",
    "welcome.start_cta": "Или начните прямо сейчас через"
  },
  "tr": {
    "welcome.greeting": "Merhaba",
    "welcome.description_before_view": "zengin mesajlar oluşturup özelleştirmenize yardımcı olan özel bottur ",
    "welcome.description_after_view": " geniş blok ve zengin düğme seçeneklerinin yanı sıra önizleme, kaydetme ve yayınlama özellikleriyle grubunuz veya kanalınız için kolay ve güvenli kullanım sunar!",
    "welcome.add_prompt": "👈🏻 Beni grubunuza/kanalınıza ekleyin",
    "welcome.help_title": "📌 Yardım mı lazım?",
    "welcome.help_check": "Şunlara göz atın:",
    "welcome.view_button": "👁 Gör",
    "welcome.updates_button": "Güncelleme kanalı",
    "welcome.support_button": "Destek grubu",
    "welcome.start_prompt": "ve botu kullanmaya başlamak için şuna basın",
    "welcome.and": "ve",
    "welcome.add_group_button": "➕ Beni bir gruba ekle ➕",
    "welcome.product_description": "Telegram zengin mesajlarını oluşturup özelleştirmek için eksiksiz bir düzenleyici.",
    "welcome.add_cta": "👈🏻 Botu grubunuza veya kanalınıza ekleyin",
    "welcome.start_cta": "Ya da hemen şuradan başlayın"
  },
  "fa": {
    "welcome.greeting": "سلام",
    "welcome.description_before_view": "باتی ویژه برای کمک به ساخت و شخصی‌سازی پیام‌های غنی است ",
    "welcome.description_after_view": " با مجموعه گسترده‌ای از بلوک‌ها و دکمه‌های غنی، همراه با پیش‌نمایش، ذخیره و انتشار برای گروه یا کانال شما؛ همه به‌سادگی و با امنیت!",
    "welcome.add_prompt": "👈🏻 من را به گروه/کانال خود اضافه کنید",
    "welcome.help_title": "📌 کمی کمک لازم دارید؟",
    "welcome.help_check": "بررسی کنید",
    "welcome.view_button": "👁 مشاهده",
    "welcome.updates_button": "کانال به‌روزرسانی‌ها",
    "welcome.support_button": "گروه پشتیبانی",
    "welcome.start_prompt": "و با فشردن این دکمه استفاده از بات را شروع کنید:",
    "welcome.and": "و",
    "welcome.add_group_button": "➕ من را به گروه اضافه کن ➕",
    "welcome.product_description": "یک ویرایشگر کامل برای ساخت و شخصی‌سازی پیام‌های غنی تلگرام.",
    "welcome.add_cta": "👈🏻 بات را به گروه یا کانال خود اضافه کنید",
    "welcome.start_cta": "یا همین حالا از اینجا شروع کنید"
  },
  "ku": {
    "welcome.greeting": "Silav",
    "welcome.description_before_view": "botek taybet e ku di çêkirin û taybetkirina peyamên dewlemend de alîkariya te dike ",
    "welcome.description_after_view": " bi gelek blok û bişkojkên dewlemend, herwiha pêşdîtin, tomarkirin û weşandin ji bo koma an kanala te, hemû bi hêsanî û ewlehî!",
    "welcome.add_prompt": "👈🏻 Min li koma/kanala xwe zêde bike",
    "welcome.help_title": "📌 Alîkarî dixwazî?",
    "welcome.help_check": "Binêre",
    "welcome.view_button": "👁 Bibîne",
    "welcome.updates_button": "Kanala nûvekirinan",
    "welcome.support_button": "Koma piştgiriyê",
    "welcome.start_prompt": "û ji bo destpêkirina bikaranîna botê vê bişkojkê bitikîne:",
    "welcome.and": "û",
    "welcome.add_group_button": "➕ Min li komekê zêde bike ➕",
    "welcome.product_description": "Edîtorek temam ji bo çêkirin û taybetkirina peyamên dewlemend ên Telegramê.",
    "welcome.add_cta": "👈🏻 Botê li koma an kanala xwe zêde bike",
    "welcome.start_cta": "An jî niha ji vir dest pê bike"
  },
  "ur": {
    "welcome.greeting": "سلام",
    "welcome.description_before_view": "ایک نمایاں بوٹ ہے جو رچ پیغامات بنانے اور حسبِ ضرورت ترتیب دینے میں آپ کی مدد کرتا ہے ",
    "welcome.description_after_view": " جس میں مختلف بلاکس اور رچ بٹن، پیش نظارہ، محفوظ کرنا اور آپ کے گروپ یا چینل میں شائع کرنا شامل ہے — سب کچھ آسانی اور محفوظ طریقے سے!",
    "welcome.add_prompt": "👈🏻 مجھے اپنے گروپ/چینل میں شامل کریں",
    "welcome.help_title": "📌 کچھ مدد چاہیے؟",
    "welcome.help_check": "دیکھیں",
    "welcome.view_button": "👁 دیکھیں",
    "welcome.updates_button": "اپڈیٹس چینل",
    "welcome.support_button": "سپورٹ گروپ",
    "welcome.start_prompt": "اور بوٹ استعمال کرنا شروع کرنے کے لیے یہ بٹن دبائیں:",
    "welcome.and": "اور",
    "welcome.add_group_button": "➕ مجھے گروپ میں شامل کریں ➕",
    "welcome.product_description": "ٹیلیگرام کے رچ پیغامات بنانے اور حسبِ ضرورت ترتیب دینے کے لیے ایک مکمل ایڈیٹر۔",
    "welcome.add_cta": "👈🏻 بوٹ کو اپنے گروپ یا چینل میں شامل کریں",
    "welcome.start_cta": "یا ابھی یہاں سے شروع کریں"
  },
  "hi": {
    "welcome.greeting": "नमस्ते",
    "welcome.description_before_view": "एक खास बॉट है जो रिच मैसेज बनाने और कस्टमाइज़ करने में आपकी मदद करता है ",
    "welcome.description_after_view": " जिसमें कई तरह के ब्लॉक और रिच बटन, साथ ही प्रीव्यू, सेव और आपके ग्रुप या चैनल में पब्लिश करने की सुविधा है — सब कुछ आसानी और सुरक्षित तरीके से!",
    "welcome.add_prompt": "👈🏻 मुझे अपने ग्रुप/चैनल में जोड़ें",
    "welcome.help_title": "📌 कुछ मदद चाहिए?",
    "welcome.help_check": "देखें",
    "welcome.view_button": "👁 देखें",
    "welcome.updates_button": "अपडेट चैनल",
    "welcome.support_button": "सपोर्ट ग्रुप",
    "welcome.start_prompt": "और बॉट का इस्तेमाल शुरू करने के लिए यह बटन दबाएँ:",
    "welcome.and": "और",
    "welcome.add_group_button": "➕ मुझे ग्रुप में जोड़ें ➕",
    "welcome.product_description": "Telegram के रिच मैसेज बनाने और कस्टमाइज़ करने के लिए एक संपूर्ण एडिटर।",
    "welcome.add_cta": "👈🏻 बॉट को अपने ग्रुप या चैनल में जोड़ें",
    "welcome.start_cta": "या अभी यहाँ से शुरू करें"
  },
  "id": {
    "welcome.greeting": "Halo",
    "welcome.description_before_view": "adalah bot istimewa yang membantu Anda membuat dan menyesuaikan rich message ",
    "welcome.description_after_view": " dengan beragam blok dan rich button, ditambah pratinjau, penyimpanan, dan publikasi untuk grup atau channel Anda, semuanya dengan mudah dan aman!",
    "welcome.add_prompt": "👈🏻 Tambahkan saya ke grup/channel Anda",
    "welcome.help_title": "📌 Perlu bantuan?",
    "welcome.help_check": "Lihat",
    "welcome.view_button": "👁 Lihat",
    "welcome.updates_button": "Channel pembaruan",
    "welcome.support_button": "Grup dukungan",
    "welcome.start_prompt": "dan mulai gunakan bot dengan menekan",
    "welcome.and": "dan",
    "welcome.add_group_button": "➕ Tambahkan saya ke grup ➕",
    "welcome.product_description": "Editor lengkap untuk membuat dan menyesuaikan rich message Telegram.",
    "welcome.add_cta": "👈🏻 Tambahkan bot ke grup atau channel Anda",
    "welcome.start_cta": "Atau mulai sekarang dari"
  },
  "ja": {
    "welcome.greeting": "こんにちは",
    "welcome.description_before_view": "は、リッチメッセージの作成とカスタマイズを簡単に行える特別なボットです ",
    "welcome.description_after_view": "。豊富なブロックやリッチボタンに加え、プレビュー、保存、グループやチャンネルへの公開まで、簡単かつ安全に行えます！",
    "welcome.add_prompt": "👈🏻 グループ/チャンネルに追加してください",
    "welcome.help_title": "📌 ヘルプが必要ですか？",
    "welcome.help_check": "こちらを確認：",
    "welcome.view_button": "👁 見る",
    "welcome.updates_button": "更新チャンネル",
    "welcome.support_button": "サポートグループ",
    "welcome.start_prompt": "そして次のボタンを押してボットを使い始めてください:",
    "welcome.and": "と",
    "welcome.add_group_button": "➕ グループに追加 ➕",
    "welcome.product_description": "Telegramのリッチメッセージを作成・カスタマイズするための完全なエディターです。",
    "welcome.add_cta": "👈🏻 ボットをグループまたはチャンネルに追加",
    "welcome.start_cta": "または今すぐこちらから開始"
  },
  "ko": {
    "welcome.greeting": "안녕하세요",
    "welcome.description_before_view": "리치 메시지를 만들고 꾸미는 데 도움을 주는 특별한 봇입니다 ",
    "welcome.description_after_view": ". 다양한 블록과 리치 버튼은 물론 미리보기, 저장, 그룹 또는 채널 게시까지 쉽고 안전하게 사용할 수 있어요!",
    "welcome.add_prompt": "👈🏻 그룹/채널에 저를 추가하세요",
    "welcome.help_title": "📌 도움이 필요하신가요?",
    "welcome.help_check": "확인해 보세요:",
    "welcome.view_button": "👁 보기",
    "welcome.updates_button": "업데이트 채널",
    "welcome.support_button": "지원 그룹",
    "welcome.start_prompt": "그리고 다음 버튼을 눌러 봇 사용을 시작하세요:",
    "welcome.and": "및",
    "welcome.add_group_button": "➕ 그룹에 추가 ➕",
    "welcome.product_description": "Telegram 리치 메시지를 만들고 꾸밀 수 있는 완전한 편집기입니다.",
    "welcome.add_cta": "👈🏻 봇을 그룹 또는 채널에 추가하세요",
    "welcome.start_cta": "또는 지금 여기에서 시작하세요"
  },
  "vi": {
    "welcome.greeting": "Xin chào",
    "welcome.description_before_view": "là bot nổi bật giúp bạn tạo và tùy chỉnh rich message ",
    "welcome.description_after_view": " với nhiều loại block và rich button, cùng tính năng xem trước, lưu và đăng lên nhóm hoặc kênh của bạn một cách dễ dàng, an toàn!",
    "welcome.add_prompt": "👈🏻 Thêm tôi vào nhóm/kênh của bạn",
    "welcome.help_title": "📌 Cần trợ giúp?",
    "welcome.help_check": "Hãy xem",
    "welcome.view_button": "👁 Xem",
    "welcome.updates_button": "Kênh cập nhật",
    "welcome.support_button": "Nhóm hỗ trợ",
    "welcome.start_prompt": "và bắt đầu sử dụng bot bằng cách nhấn",
    "welcome.and": "và",
    "welcome.add_group_button": "➕ Thêm tôi vào nhóm ➕",
    "welcome.product_description": "Trình chỉnh sửa đầy đủ để tạo và tùy chỉnh rich message trên Telegram.",
    "welcome.add_cta": "👈🏻 Thêm bot vào nhóm hoặc kênh của bạn",
    "welcome.start_cta": "Hoặc bắt đầu ngay từ"
  },
  "th": {
    "welcome.greeting": "สวัสดี",
    "welcome.description_before_view": "คือบอทที่โดดเด่นสำหรับช่วยคุณสร้างและปรับแต่ง Rich Message ",
    "welcome.description_after_view": " พร้อมบล็อกและปุ่มแบบ Rich ที่หลากหลาย รวมถึงการแสดงตัวอย่าง บันทึก และเผยแพร่ไปยังกลุ่มหรือช่องของคุณได้อย่างง่ายดายและปลอดภัย!",
    "welcome.add_prompt": "👈🏻 เพิ่มฉันลงในกลุ่ม/ช่องของคุณ",
    "welcome.help_title": "📌 ต้องการความช่วยเหลือไหม?",
    "welcome.help_check": "ตรวจสอบ",
    "welcome.view_button": "👁 ดู",
    "welcome.updates_button": "ช่องอัปเดต",
    "welcome.support_button": "กลุ่มช่วยเหลือ",
    "welcome.start_prompt": "และเริ่มใช้งานบอทโดยกด",
    "welcome.and": "และ",
    "welcome.add_group_button": "➕ เพิ่มฉันลงในกลุ่ม ➕",
    "welcome.product_description": "เครื่องมือแก้ไขแบบครบถ้วนสำหรับสร้างและปรับแต่ง Rich Message บน Telegram",
    "welcome.add_cta": "👈🏻 เพิ่มบอทลงในกลุ่มหรือช่องของคุณ",
    "welcome.start_cta": "หรือเริ่มใช้งานตอนนี้จาก"
  },
  "zh-hans": {
    "welcome.greeting": "你好",
    "welcome.description_before_view": "是一款出色的机器人，可帮助你创建和自定义富消息 ",
    "welcome.description_after_view": "，并提供丰富的区块和富按钮，以及预览、保存和发布到群组或频道等功能，简单又安全！",
    "welcome.add_prompt": "👈🏻 将我添加到你的群组/频道",
    "welcome.help_title": "📌 需要帮助？",
    "welcome.help_check": "查看",
    "welcome.view_button": "👁 查看",
    "welcome.updates_button": "更新频道",
    "welcome.support_button": "支持群组",
    "welcome.start_prompt": "并点击以下按钮开始使用机器人：",
    "welcome.and": "和",
    "welcome.add_group_button": "➕ 添加到群组 ➕",
    "welcome.product_description": "一个用于创建和自定义 Telegram 富消息的完整编辑器。",
    "welcome.add_cta": "👈🏻 将机器人添加到你的群组或频道",
    "welcome.start_cta": "或立即从这里开始"
  },
  "zh-hant": {
    "welcome.greeting": "你好",
    "welcome.description_before_view": "是一款出色的機器人，可協助你建立與自訂豐富訊息 ",
    "welcome.description_after_view": "，並提供豐富的區塊和富按鈕，以及預覽、儲存與發佈到群組或頻道等功能，簡單又安全！",
    "welcome.add_prompt": "👈🏻 將我加入你的群組/頻道",
    "welcome.help_title": "📌 需要協助？",
    "welcome.help_check": "查看",
    "welcome.view_button": "👁 查看",
    "welcome.updates_button": "更新頻道",
    "welcome.support_button": "支援群組",
    "welcome.start_prompt": "並點擊以下按鈕開始使用機器人：",
    "welcome.and": "與",
    "welcome.add_group_button": "➕ 加入群組 ➕",
    "welcome.product_description": "一個用於建立與自訂 Telegram 豐富訊息的完整編輯器。",
    "welcome.add_cta": "👈🏻 將機器人加入你的群組或頻道",
    "welcome.start_cta": "或立即從這裡開始"
  }
};

const RTL_LOCALES = new Set(['ar', 'fa', 'ku', 'ur']);

function normalizeLocale(languageCode) {
  const raw = String(languageCode || 'en').toLowerCase().replaceAll('_', '-');

  if (raw === 'zh' || raw.startsWith('zh-cn') || raw.startsWith('zh-sg') || raw.startsWith('zh-hans')) {
    return 'zh-hans';
  }
  if (raw.startsWith('zh-tw') || raw.startsWith('zh-hk') || raw.startsWith('zh-mo') || raw.startsWith('zh-hant')) {
    return 'zh-hant';
  }

  if (LOCALES[raw]) return raw;
  const base = raw.split('-')[0];
  return LOCALES[base] ? base : 'en';
}

function copyFor(languageCode) {
  const locale = normalizeLocale(languageCode);
  return { locale, copy: LOCALES[locale] || LOCALES.en };
}

function urlButton(text, url) {
  return {
    type: 'button',
    button: {
      text,
      url,
    },
  };
}

function userDisplayName(user) {
  if (!user) return '';
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return name || String(user.id || '');
}

export function buildWelcomeRichMessage(user, languageCode) {
  const { locale, copy } = copyFor(languageCode);
  const mentionText = userDisplayName(user);

  const greeting = [`${copy['welcome.greeting']} `];
  if (user?.id && mentionText) {
    greeting.push({
      type: 'text_mention',
      text: mentionText,
      user,
    });
  } else if (mentionText) {
    greeting.push(mentionText);
  }
  greeting.push('!');

  const richMessage = {
    blocks: [
      {
        type: 'heading',
        text: greeting,
        size: 3,
      },
      {
        type: 'footer',
        text: `- ${BOT_USERNAME}`,
      },
      {
        type: 'paragraph',
        text: [
          copy['welcome.product_description'],
          ' ',
          urlButton(copy['welcome.view_button'], SHOWCASE_URL),
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'footer',
        text: [
          copy['welcome.help_title'],
          '\n',
          `${copy['welcome.help_check']} `,
          urlButton(copy['welcome.updates_button'], UPDATES_URL),
          ` ${copy['welcome.and']} `,
          urlButton(copy['welcome.support_button'], SUPPORT_URL),
        ],
      },
    ],
  };

  if (RTL_LOCALES.has(locale)) {
    richMessage.is_rtl = true;
  }
  return richMessage;
}

export function buildWelcomeKeyboard(languageCode) {
  const { locale, copy } = copyFor(languageCode);
  const startEditorText = locale === 'ar'
    ? '➕ بدء المحرّر'
    : '➕ Start editor';

  return {
    inline_keyboard: [
      [
        {
          text: copy['welcome.add_group_button'],
          url: ADD_GROUP_URL,
        },
      ],
      [
        {
          text: startEditorText,
          callback_data: 'r:starteditor',
          style: 'primary',
        },
      ],
    ],
  };
}

export function buildWelcomeFallbackText(user, languageCode) {
  const { copy } = copyFor(languageCode);
  const name = userDisplayName(user);
  return [
    `${copy['welcome.greeting']}${name ? ` ${name}` : ''}!`,
    '',
    copy['welcome.product_description'],
    '',
    copy['welcome.help_title'],
    `${copy['welcome.help_check']} ${UPDATES_URL} ${copy['welcome.and']} ${SUPPORT_URL}`,
  ].join('\n');
}
