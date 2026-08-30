// Central Mini App localization. Telegram language codes are normalized here,
// so feature files only call MiniAppI18n.t() and never decide direction/language.
(() => {
  const dictionaries = {
    ar: {
      "app.title":"Rich Customize Beta 0.3",
      "common.cancel":"إلغاء","common.save":"حفظ","common.delete":"حذف","common.done":"تم",
      "common.all":"الكل","common.loading":"جاري التحميل…","common.unknown_error":"خطأ غير معروف",
      "top.pages":"الصفحات المحفوظة","top.more":"المزيد","top.undo":"تراجع","top.redo":"إعادة",
      "top.text":"نص","top.list":"قائمة","top.table":"جدول","top.media":"مرفق","top.math":"معادلة","top.emoji":"الإيموجي",
      "editor.canvas":"محرر الرسالة","editor.untitled":"بدون عنوان","editor.unsaved":"غير محفوظ",
      "editor.start_title":"ابدأ بالرسالة، مو بالإعدادات","editor.start_hint":"اكتب مباشرة أو أضف Block. كتابة / تفتح قائمة كل البلوكات.",
      "editor.start_writing":"¶ ابدأ الكتابة","editor.add_photo":"▧ أضف صورة",
      "editor.input_placeholder":"اكتب نصًا، أو / للأوامر","editor.add_block":"إضافة Block","editor.block_actions":"إجراءات البلوك",
      "editor.close":"إلغاء التغييرات وإغلاق المحرر","editor.send":"إرسال عبر Telegram",
      "pages.title":"الصفحات المحفوظة","pages.subtitle":"افتح صفحة أو ابدأ صفحة جديدة","pages.new":"＋ جديدة","pages.empty":"ما عندك صفحات محفوظة.",
      "send.title":"إرسال الرسالة","send.subtitle":"اختر المحادثة التي تريد النشر بيها",
      "save.saving":"جاري الحفظ…","save.new_draft":"مسودة جديدة","save.failed":"فشل الحفظ","save.saved":"تم الحفظ",
      "save.saved_at":"تم الحفظ · {time}","save.error":"فشل الحفظ: {error}",
      "save.open_in_telegram":"افتح التطبيق من داخل Telegram","save.unauthorized":"غير مصرح",
      "block.paragraph":"فقرة","block.heading":"عنوان","block.footer":"تذييل","block.preformatted":"كود",
      "block.blockquote":"اقتباس","block.pullquote":"اقتباس بارز","block.divider":"فاصل","block.anchor":"مرساة",
      "block.list":"قائمة","block.details":"تفاصيل","block.table":"جدول","block.math":"معادلة",
      "block.photo":"صورة","block.video":"فيديو","block.animation":"GIF","block.audio":"صوت",
      "block.voice":"رسالة صوتية","block.document":"ملف","block.collage":"مجموعة وسائط","block.slideshow":"شرائح","block.map":"خريطة",
      "block.text_desc":"نص عادي","block.heading_desc":"H1 إلى H6","block.footer_desc":"نص صغير","block.code_desc":"نص مهيأ مسبقًا",
      "block.quote_desc":"اقتباس نصي","block.pullquote_desc":"اقتباس مميز","block.divider_desc":"فاصل بين الأقسام","block.anchor_desc":"مرساة داخل الرسالة",
      "block.list_desc":"منقطة، مرقمة أو مهام","block.details_desc":"قسم قابل للفتح والطي","block.table_desc":"جدول قابل للتحرير","block.math_desc":"صيغة رياضية",
      "block.photo_desc":"صورة Telegram","block.video_desc":"فيديو Telegram","block.animation_desc":"صورة متحركة","block.audio_desc":"ملف صوتي",
      "block.voice_desc":"رسالة صوتية","block.document_desc":"مستند أو ملف","block.collage_desc":"مجموعة وسائط","block.slideshow_desc":"شرائح وسائط","block.map_desc":"موقع جغرافي",
      "details.title":"تفاصيل","details.title_placeholder":"عنوان التفاصيل","details.inside_count":"{count} Block داخل التفاصيل",
      "list.item":"عنصر","list.item_placeholder":"عنصر في كل سطر","list.bulleted":"منقطة","list.numbered":"مرقمة","list.tasks":"قائمة مهام",
      "media.paste_file_id":"ألصق file_id","media.items_count":"{count} عنصر وسائط","block.settings":"إعدادات {name}",
      "heading.level":"العنوان {level}","table.add_row":"إضافة صف","table.add_column":"إضافة عمود","table.show_borders":"إظهار الحدود","table.hide_borders":"إخفاء الحدود",
      "table.striped":"صفوف مخططة","table.unstriped":"إلغاء الصفوف المخططة","table.compact":"وضع مضغوط","table.uncompact":"إلغاء الوضع المضغوط",
      "action.move_up":"تحريك للأعلى","action.move_down":"تحريك للأسفل","action.delete_block":"حذف البلوك","editor.no_block_match":"ماكو Block مطابق",
      "send.add_content":"أضف محتوى للرسالة أولًا","send.save_before":"تعذر حفظ الصفحة قبل الإرسال","send.loading_destinations":"جاري تحميل المحادثات…",
      "send.private":"إرسال إليك بالخاص","send.action":"إرسال","send.preparing_failed":"تعذر تجهيز الإرسال: {error}","send.sending":"جاري الإرسال…",
      "send.sent_to":"تم الإرسال إلى {title}","send.failed":"فشل الإرسال: {error}","page.title":"الصفحة","page.new":"صفحة جديدة","page.save_now":"حفظ الآن",
      "editor.text_tools":"أدوات النص","heading.level_picker":"مستوى العنوان","button.type":"نوع الزر الغني",
      "inline.bold":"عريض","inline.italic":"مائل","inline.strike":"مشطوب","inline.underline":"تحته خط",
      "inline.code":"كود","inline.highlight":"تمييز","inline.subscript":"منخفض","inline.superscript":"مرتفع",
      "inline.spoiler":"تشويش","inline.link":"رابط","inline.add_link":"إضافة رابط","inline.edit_link":"تعديل الرابط",
      "inline.remove_link":"إزالة الرابط","inline.create_button":"إنشاء زر",
      "inline.invalid_link":"أدخل رابطًا صحيحًا يبدأ بـ https:// أو tg://",
      "button.add":"إضافة زر","button.title":"نص الزر","button.title_placeholder":"اكتب عنوان الزر",
      "button.separate":"زر في سطر منفصل","button.style":"نمط الزر","button.url":"الرابط","button.copy":"نسخ",
      "button.mention":"مستخدم","button.page":"صفحة","button.callback":"Callback","button.popup":"Popup",
      "button.value_required":"اكتب قيمة الزر","button.title_required":"اكتب نص الزر","button.create_failed":"تعذر إنشاء الزر",
      "button.editor_not_ready":"محرر الأزرار غير جاهز بعد","button.disabled":"معطّل","button.inline_search":"بحث Inline","button.search_here":"بحث هنا",
      "button.select_user":"تحديد مستخدم","button.edit_url":"تعديل الرابط","button.link_page":"ربط بصفحة محفوظة","button.edit_copy":"تعديل نص النسخ",
      "button.edit_popup":"تعديل نص التنبيه","button.edit_search":"تعديل نص البحث","button.edit_search_here":"تعديل نص البحث هنا",
      "button.convert_selection":"حوّل النص إلى زر","button.name":"اسم الزر","button.color":"لون الزر","button.rich":"زر غني",
      "button.edit_name":"تعديل اسم الزر","button.change_color":"تغيير اللون","button.to_text":"تحويل إلى نص عادي","button.delete":"حذف الزر",
      "button.default":"افتراضي","button.blue":"أزرق","button.green":"أخضر","button.red":"أحمر",
      "button.linked_page":"الصفحة المرتبطة","button.loading_pages":"جاري تحميل صفحاتك المحفوظة…","button.choose_page":"اختر الصفحة التي يفتحها الزر",
      "button.no_pages":"ما عندك صفحات محفوظة بعد","button.choose_saved_page":"اختر صفحة محفوظة للزر","button.selected_page":"تم اختيار «{title}»",
      "button.pages_failed":"تعذر تحميل الصفحات: {error}","button.copy_placeholder":"النص المطلوب نسخه","button.page_placeholder":"رمز الصفحة المحفوظة","button.popup_placeholder":"نص التنبيه",
    },
    en: {
      "app.title":"Rich Customize Beta 0.3",
      "common.cancel":"Cancel","common.save":"Save","common.delete":"Delete","common.done":"Done",
      "common.all":"All","common.loading":"Loading…","common.unknown_error":"Unknown error",
      "top.pages":"Saved pages","top.more":"More","top.undo":"Undo","top.redo":"Redo",
      "top.text":"Text","top.list":"List","top.table":"Table","top.media":"Media","top.math":"Equation","top.emoji":"Emoji",
      "editor.canvas":"Message editor","editor.untitled":"Untitled","editor.unsaved":"Not saved",
      "editor.start_title":"Start with your message","editor.start_hint":"Write directly or add a block. Type / to open all blocks.",
      "editor.start_writing":"¶ Start writing","editor.add_photo":"▧ Add photo",
      "editor.input_placeholder":"Write text, or / for commands","editor.add_block":"Add block","editor.block_actions":"Block actions",
      "editor.close":"Discard changes and close editor","editor.send":"Send via Telegram",
      "pages.title":"Saved pages","pages.subtitle":"Open a page or start a new one","pages.new":"＋ New","pages.empty":"You have no saved pages.",
      "send.title":"Send message","send.subtitle":"Choose where to publish it",
      "save.saving":"Saving…","save.new_draft":"New draft","save.failed":"Save failed","save.saved":"Saved",
      "save.saved_at":"Saved · {time}","save.error":"Save failed: {error}",
      "save.open_in_telegram":"Open this app inside Telegram","save.unauthorized":"Unauthorized",
      "block.paragraph":"Paragraph","block.heading":"Heading","block.footer":"Footer","block.preformatted":"Code",
      "block.blockquote":"Quote","block.pullquote":"Pull quote","block.divider":"Divider","block.anchor":"Anchor",
      "block.list":"List","block.details":"Details","block.table":"Table","block.math":"Equation",
      "block.photo":"Photo","block.video":"Video","block.animation":"GIF","block.audio":"Audio",
      "block.voice":"Voice message","block.document":"File","block.collage":"Collage","block.slideshow":"Slideshow","block.map":"Map",
      "block.text_desc":"Plain text","block.heading_desc":"H1 through H6","block.footer_desc":"Small text","block.code_desc":"Preformatted text",
      "block.quote_desc":"Text quote","block.pullquote_desc":"Highlighted quote","block.divider_desc":"Section separator","block.anchor_desc":"Message anchor",
      "block.list_desc":"Bulleted, numbered, or tasks","block.details_desc":"Collapsible section","block.table_desc":"Editable table","block.math_desc":"Mathematical expression",
      "block.photo_desc":"Telegram photo","block.video_desc":"Telegram video","block.animation_desc":"Animated image","block.audio_desc":"Audio file",
      "block.voice_desc":"Voice message","block.document_desc":"Document or file","block.collage_desc":"Media collection","block.slideshow_desc":"Media slides","block.map_desc":"Geographic location",
      "details.title":"Details","details.title_placeholder":"Details title","details.inside_count":"{count} blocks inside details",
      "list.item":"Item","list.item_placeholder":"One item per line","list.bulleted":"Bulleted","list.numbered":"Numbered","list.tasks":"Task list",
      "media.paste_file_id":"Paste file_id","media.items_count":"{count} media items","block.settings":"{name} settings",
      "heading.level":"Heading {level}","table.add_row":"Add row","table.add_column":"Add column","table.show_borders":"Show borders","table.hide_borders":"Hide borders",
      "table.striped":"Striped rows","table.unstriped":"Remove striped rows","table.compact":"Compact mode","table.uncompact":"Disable compact mode",
      "action.move_up":"Move up","action.move_down":"Move down","action.delete_block":"Delete block","editor.no_block_match":"No matching block",
      "send.add_content":"Add message content first","send.save_before":"Could not save the page before sending","send.loading_destinations":"Loading chats…",
      "send.private":"Send to your private chat","send.action":"Send","send.preparing_failed":"Could not prepare sending: {error}","send.sending":"Sending…",
      "send.sent_to":"Sent to {title}","send.failed":"Send failed: {error}","page.title":"Page","page.new":"New page","page.save_now":"Save now",
      "editor.text_tools":"Text tools","heading.level_picker":"Heading level","button.type":"Rich button type",
      "inline.bold":"Bold","inline.italic":"Italic","inline.strike":"Strikethrough","inline.underline":"Underline",
      "inline.code":"Code","inline.highlight":"Highlight","inline.subscript":"Subscript","inline.superscript":"Superscript",
      "inline.spoiler":"Spoiler","inline.link":"Link","inline.add_link":"Add link","inline.edit_link":"Edit link",
      "inline.remove_link":"Remove link","inline.create_button":"Create button",
      "inline.invalid_link":"Enter a valid link beginning with https:// or tg://",
      "button.add":"Add button","button.title":"Button text","button.title_placeholder":"Enter button title",
      "button.separate":"Place button on its own row","button.style":"Button style","button.url":"Link","button.copy":"Copy",
      "button.mention":"Mention","button.page":"Page","button.callback":"Callback","button.popup":"Popup",
      "button.value_required":"Enter the button value","button.title_required":"Enter button text","button.create_failed":"Could not create button",
      "button.editor_not_ready":"The button editor is not ready yet","button.disabled":"Disabled","button.inline_search":"Inline search","button.search_here":"Search here",
      "button.select_user":"Select user","button.edit_url":"Edit link","button.link_page":"Link a saved page","button.edit_copy":"Edit copied text",
      "button.edit_popup":"Edit popup text","button.edit_search":"Edit search text","button.edit_search_here":"Edit search-here text",
      "button.convert_selection":"Turn text into a button","button.name":"Button name","button.color":"Button color","button.rich":"Rich button",
      "button.edit_name":"Edit button name","button.change_color":"Change color","button.to_text":"Convert to plain text","button.delete":"Delete button",
      "button.default":"Default","button.blue":"Blue","button.green":"Green","button.red":"Red",
      "button.linked_page":"Linked page","button.loading_pages":"Loading your saved pages…","button.choose_page":"Choose the page this button opens",
      "button.no_pages":"You have no saved pages yet","button.choose_saved_page":"Choose a saved page","button.selected_page":"Selected “{title}”",
      "button.pages_failed":"Could not load pages: {error}","button.copy_placeholder":"Text to copy","button.page_placeholder":"Saved page code","button.popup_placeholder":"Popup text",
    },
    "zh-hans": {
      "app.title":"Rich Customize 测试版 0.3","common.cancel":"取消","common.save":"保存","common.delete":"删除","common.done":"完成","common.all":"全部","common.loading":"正在加载…",
      "top.pages":"已保存页面","top.more":"更多","top.undo":"撤销","top.redo":"重做","top.text":"文本","top.list":"列表","top.table":"表格","top.media":"媒体","top.math":"公式","top.emoji":"表情",
      "editor.canvas":"消息编辑器","editor.untitled":"未命名","editor.unsaved":"未保存","editor.start_title":"开始编写消息","editor.start_hint":"直接输入或添加区块。输入 / 可打开全部区块。","editor.start_writing":"¶ 开始输入","editor.add_photo":"▧ 添加图片","editor.input_placeholder":"输入文本，或输入 / 使用命令","editor.add_block":"添加区块","editor.block_actions":"区块操作","editor.close":"放弃更改并关闭","editor.send":"通过 Telegram 发送",
      "pages.title":"已保存页面","pages.subtitle":"打开页面或新建页面","pages.new":"＋ 新建","pages.empty":"暂无已保存页面。","send.title":"发送消息","send.subtitle":"选择发布位置",
      "inline.bold":"粗体","inline.italic":"斜体","inline.strike":"删除线","inline.underline":"下划线","inline.code":"代码","inline.highlight":"高亮","inline.subscript":"下标","inline.superscript":"上标","inline.spoiler":"剧透","inline.link":"链接","inline.add_link":"添加链接","inline.edit_link":"编辑链接","inline.remove_link":"移除链接","inline.create_button":"创建按钮","inline.invalid_link":"请输入以 https:// 或 tg:// 开头的有效链接",
      "button.add":"添加按钮","button.title":"按钮文字","button.title_placeholder":"输入按钮标题","button.separate":"按钮单独一行","button.style":"按钮样式","button.url":"链接","button.copy":"复制","button.mention":"提及用户","button.page":"页面","button.callback":"回调","button.popup":"弹窗","button.value_required":"请输入按钮值","button.title_required":"请输入按钮文字","button.create_failed":"无法创建按钮",
    },
    "zh-hant": {
      "app.title":"Rich Customize 測試版 0.3","common.cancel":"取消","common.save":"儲存","common.delete":"刪除","common.done":"完成","common.all":"全部","common.loading":"載入中…",
      "top.pages":"已儲存頁面","top.more":"更多","top.undo":"復原","top.redo":"重做","top.text":"文字","top.list":"清單","top.table":"表格","top.media":"媒體","top.math":"公式","top.emoji":"表情符號",
      "editor.canvas":"訊息編輯器","editor.untitled":"未命名","editor.unsaved":"未儲存","editor.start_title":"開始編寫訊息","editor.start_hint":"直接輸入或新增區塊。輸入 / 可開啟全部區塊。","editor.start_writing":"¶ 開始輸入","editor.add_photo":"▧ 新增圖片","editor.input_placeholder":"輸入文字，或輸入 / 使用命令","editor.add_block":"新增區塊","editor.block_actions":"區塊操作","editor.close":"放棄變更並關閉","editor.send":"透過 Telegram 傳送",
      "pages.title":"已儲存頁面","pages.subtitle":"開啟頁面或建立新頁面","pages.new":"＋ 新增","pages.empty":"尚無已儲存頁面。","send.title":"傳送訊息","send.subtitle":"選擇發佈位置",
      "inline.bold":"粗體","inline.italic":"斜體","inline.strike":"刪除線","inline.underline":"底線","inline.code":"程式碼","inline.highlight":"醒目提示","inline.subscript":"下標","inline.superscript":"上標","inline.spoiler":"劇透","inline.link":"連結","inline.add_link":"新增連結","inline.edit_link":"編輯連結","inline.remove_link":"移除連結","inline.create_button":"建立按鈕","inline.invalid_link":"請輸入以 https:// 或 tg:// 開頭的有效連結",
      "button.add":"新增按鈕","button.title":"按鈕文字","button.title_placeholder":"輸入按鈕標題","button.separate":"按鈕獨立一行","button.style":"按鈕樣式","button.url":"連結","button.copy":"複製","button.mention":"提及使用者","button.page":"頁面","button.callback":"回呼","button.popup":"彈出視窗","button.value_required":"請輸入按鈕值","button.title_required":"請輸入按鈕文字","button.create_failed":"無法建立按鈕",
    },
  };

  function normalize(raw) {
    const value = String(raw || "").toLowerCase().replaceAll("_", "-");
    if (value.startsWith("ar")) return "ar";
    if (["zh-tw","zh-hk","zh-mo","zh-hant"].some(code => value.startsWith(code))) return "zh-hant";
    if (value.startsWith("zh")) return "zh-hans";
    return "en";
  }

  const telegramLanguage = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  const language = normalize(telegramLanguage || navigator.language);
  const rtl = language === "ar";

  function t(key, vars = {}) {
    const template = dictionaries[language]?.[key] ?? dictionaries.en[key] ?? dictionaries.ar[key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
  }

  function apply(root = document) {
    root.querySelectorAll?.("[data-i18n]").forEach(element => {
      element.textContent = t(element.dataset.i18n);
    });
    root.querySelectorAll?.("[data-i18n-placeholder]").forEach(element => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    root.querySelectorAll?.("[data-i18n-label]").forEach(element => {
      const value = t(element.dataset.i18nLabel);
      element.setAttribute("aria-label", value);
      if (element.hasAttribute("title")) element.title = value;
    });
    const labels = {
      pageTitle:"editor.untitled",emojiBtn:"top.emoji",deleteSelectedBtn:"editor.close",sendBtn:"editor.send",
    };
    Object.entries(labels).forEach(([id,key]) => {
      const element = document.getElementById(id);
      if (!element) return;
      const value = t(key);
      element.setAttribute("aria-label", value);
      if (element.hasAttribute("title")) element.title = value;
    });
    const textTargets = [
      ["#starter strong","editor.start_title"],["#starter p","editor.start_hint"],
      ["#startWritingBtn","editor.start_writing"],["#startPhotoBtn","editor.add_photo"],
      ["#slashMenu .menu-head span:first-child","editor.add_block"],["#blockMenuTitle","editor.block_actions"],
      ["#pagesPanel .sheet-header strong","pages.title"],["#pagesPanel .sheet-header small","pages.subtitle"],
      ["#newPageBtn","pages.new"],["#emptyPages","pages.empty"],
      ["#sendPanel .sheet-header strong","send.title"],["#sendPanel .sheet-header small","send.subtitle"],
    ];
    textTargets.forEach(([selector,key]) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = t(key);
    });
    const pageTitle = document.getElementById("pageTitle");
    if (pageTitle && (!pageTitle.value || pageTitle.value === "Untitled")) pageTitle.value = t("editor.untitled");
    const slashInput = document.getElementById("slashInput");
    if (slashInput) slashInput.placeholder = t("editor.input_placeholder");
  }

  document.documentElement.lang = language;
  document.documentElement.dir = rtl ? "rtl" : "ltr";
  window.MiniAppI18n = {language,rtl,t,apply};
  window.mt = t;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => apply());
  else apply();
})();
