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
      "editor.start_writing":"ابدأ الكتابة","editor.add_photo":"أضف صورة",
      "editor.input_placeholder":"اكتب نصًا، أو / للأوامر","editor.add_block":"إضافة Block","editor.block_actions":"إجراءات البلوك",
      "editor.close":"إلغاء التغييرات وإغلاق المحرر","editor.send":"إرسال عبر Telegram",
      "pages.title":"الصفحات المحفوظة","pages.subtitle":"افتح صفحة أو ابدأ صفحة جديدة","pages.new":"جديدة","pages.empty":"ما عندك صفحات محفوظة.",
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
      "media.pick_photo":"اختيار صورة من المعرض","media.pick_video":"اختيار فيديو من المعرض","media.pick_animation":"اختيار GIF أو MP4",
      "media.pick_audio":"اختيار ملف صوتي","media.pick_voice":"اختيار تسجيل أو ملف صوتي","media.pick_document":"اختيار ملف من الجهاز",
      "media.unsupported":"نوع الوسائط غير مدعوم","media.no_file":"لم يتم اختيار ملف","media.too_large":"حجم الملف أكبر من {size} MB",
      "media.uploaded":"تم رفع {name} وربطه بـ Telegram","media.upload_failed":"فشل الرفع: {error}","media.uploading_telegram":"جاري الرفع إلى Telegram…",
      "media.ready":"جاهز للإرسال{file}","media.picker_hint":"اختر من المعرض أو مستكشف الملفات؛ يحصل البوت على file_id تلقائيًا.",
      "media.uploading":"جاري الرفع…","media.change":"تغيير {name}","media.choose_images_videos":"اختر صورًا أو فيديوهات",
      "media.added_count":"تمت إضافة {count} من الوسائط","media.some_failed":"فشل رفع بعض الوسائط: {error}","media.uploading_multiple":"جاري رفع الوسائط…",
      "media.container_hint":"{count} عنصر · يمكنك اختيار عدة صور أو فيديوهات دفعة واحدة","media.add_images_videos":"إضافة صور أو فيديوهات",
      "media.location":"الموقع","media.locating":"جاري تحديد موقعك…","media.location_set":"تم تحديد الموقع · {lat}, {lon}",
      "media.location_hint":"استخدم موقع الجهاز بدل كتابة الإحداثيات يدويًا.","media.update_location":"تحديث موقعي","media.use_location":"استخدام موقعي الحالي",
      "media.geolocation_unsupported":"الجهاز أو WebView لا يدعم تحديد الموقع","media.location_success":"تم تحديد الموقع",
      "media.location_permission":"اسمح للتطبيق بالوصول إلى الموقع","media.location_failed":"تعذر تحديد الموقع",
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
      "button.callback_data":"بيانات Callback","button.generic":"زر","button.linked_success":"تم ربط الزر بصفحة «{title}»","button.save_page_failed":"تعذر حفظ الصفحة","button.pick_user_in_chat":"اختر المستخدم من محادثة البوت","button.user_picker_failed":"تعذر فتح اختيار المستخدم: {error}","button.search_placeholder":"كلمة البحث","button.search_here_placeholder":"كلمة البحث هنا","button.value_placeholder":"القيمة","button.active":"نشط","button.accept":"موافقة","button.decline":"رفض",
      "editor.write_text":"اكتب نصًا…","preview.message":"معاينة الرسالة","preview.back_to_edit":"الرجوع للتحرير","preview.mode":"وضع المعاينة","multi.select_blocks":"تحديد عدة بلوكات","multi.selected_count":"{count} محدد","multi.move_up":"تحريك المحدد للأعلى","multi.move_down":"تحريك المحدد للأسفل","multi.mode":"تحديد متعدد","block.drag":"اسحب لتغيير موقع البلوك","block.drag_short":"اسحب لتغيير الموقع","block.select":"تحديد البلوك","editor.no_command_match":"ماكو أمر أو Block مطابق",
      "details.add_inner":"إضافة Block داخل التفاصيل","details.collapse":"إغلاق التفاصيل","details.expand":"توسعة التفاصيل","details.expanded":"مفتوحة","details.collapsed":"مطوية","details.delete_inner":"حذف البلوك من التفاصيل","details.empty":"ماكو محتوى داخل التفاصيل بعد","details.write_inside":"اكتب داخل التفاصيل، أو / لإضافة Block","list.task":"مهمة",
      "editor.add_author":"إضافة الكاتب","editor.write_code":"اكتب الكود…","editor.write_quote":"اكتب الاقتباس…","editor.write_pullquote":"اكتب الاقتباس البارز…","page.options":"خيارات الصفحة","top.more_blocks":"بلوكات أخرى",
      "math.write_latex":"اكتب صيغة LaTeX","math.edit_hint":"اضغط لتعديل المعادلة","math.add_hint":"اضغط لإضافة المعادلة","math.edit":"تعديل المعادلة","math.quick_symbols":"رموز رياضية سريعة","math.separate_line":"صيغة في سطر منفصل","math.preview":"المعاينة","math.preview_hint":"اكتب صيغة LaTeX حتى تظهر المعاينة هنا",
      "session.discarding":"جاري إلغاء التغييرات…","session.discarded":"تم إلغاء التغييرات","session.discard_failed":"تعذر إلغاء التغييرات","session.discard_error":"تعذر إلغاء العمل: {error}","session.discard_prepare_failed":"تعذر تجهيز إلغاء التغييرات","session.restored":"تم استرجاع جلسة التحرير",
      "emoji.apple":"إيموجي Apple","emoji.recent":"الأخيرة","emoji.recent_empty":"الإيموجيات المستخدمة مؤخرًا راح تظهر هنا","emoji.smileys":"الوجوه","emoji.people":"الأشخاص","emoji.hearts":"القلوب","emoji.nature":"الحيوانات والطبيعة","emoji.food":"الطعام","emoji.activity":"النشاط","emoji.travel":"السفر","emoji.objects":"الأشياء","emoji.symbols":"الرموز","emoji.flags":"الأعلام","emoji.loading_apple":"جاري تحميل إيموجي Apple…","emoji.load_failed":"تعذر تحميل إيموجي Apple: {error}",
      "table.no_next_cell":"ماكو خلية تالية حتى تندمج وياها","table.not_merged":"الخلية مو مدمجة","table.keep_one_row":"الجدول لازم يبقى بيه صف واحد على الأقل","table.keep_one_column":"الجدول لازم يبقى بيه عمود واحد على الأقل","table.customize":"تخصيص الجدول","table.cell":"الخلية","table.row":"الصف","table.column":"العمود","table.alignment":"المحاذاة","table.align_left":"محاذاة يسار","table.align_center":"توسيط أفقي","table.align_right":"محاذاة يمين","table.align_top":"محاذاة للأعلى","table.align_middle":"توسيط عمودي","table.align_bottom":"محاذاة للأسفل","table.shade_scope":"تلوين {scope}","table.merge_next":"دمج مع الخلية التالية","table.unmerge":"فك دمج الخلية","table.add_row_above":"إضافة صف للأعلى","table.add_row_below":"إضافة صف للأسفل","table.delete_row":"حذف الصف","table.add_column_before":"إضافة عمود قبل","table.add_column_after":"إضافة عمود بعد","table.delete_column":"حذف العمود","table.cell_options":"خيارات الخلية والصف والعمود",
    },
    en: {
      "app.title":"Rich Customize Beta 0.3",
      "common.cancel":"Cancel","common.save":"Save","common.delete":"Delete","common.done":"Done",
      "common.all":"All","common.loading":"Loading…","common.unknown_error":"Unknown error",
      "top.pages":"Saved pages","top.more":"More","top.undo":"Undo","top.redo":"Redo",
      "top.text":"Text","top.list":"List","top.table":"Table","top.media":"Media","top.math":"Equation","top.emoji":"Emoji",
      "editor.canvas":"Message editor","editor.untitled":"Untitled","editor.unsaved":"Not saved",
      "editor.start_title":"Start with your message","editor.start_hint":"Write directly or add a block. Type / to open all blocks.",
      "editor.start_writing":"Start writing","editor.add_photo":"Add photo",
      "editor.input_placeholder":"Write text, or / for commands","editor.add_block":"Add block","editor.block_actions":"Block actions",
      "editor.close":"Discard changes and close editor","editor.send":"Send via Telegram",
      "pages.title":"Saved pages","pages.subtitle":"Open a page or start a new one","pages.new":"New","pages.empty":"You have no saved pages.",
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
      "media.pick_photo":"Choose a photo from gallery","media.pick_video":"Choose a video from gallery","media.pick_animation":"Choose a GIF or MP4",
      "media.pick_audio":"Choose an audio file","media.pick_voice":"Choose a recording or audio file","media.pick_document":"Choose a file from device",
      "media.unsupported":"Unsupported media type","media.no_file":"No file was selected","media.too_large":"File is larger than {size} MB",
      "media.uploaded":"{name} uploaded and linked to Telegram","media.upload_failed":"Upload failed: {error}","media.uploading_telegram":"Uploading to Telegram…",
      "media.ready":"Ready to send{file}","media.picker_hint":"Choose from the gallery or file browser; the bot gets the file_id automatically.",
      "media.uploading":"Uploading…","media.change":"Change {name}","media.choose_images_videos":"Choose images or videos",
      "media.added_count":"Added {count} media items","media.some_failed":"Some media failed to upload: {error}","media.uploading_multiple":"Uploading media…",
      "media.container_hint":"{count} items · you can choose multiple images or videos at once","media.add_images_videos":"Add images or videos",
      "media.location":"Location","media.locating":"Finding your location…","media.location_set":"Location set · {lat}, {lon}",
      "media.location_hint":"Use your device location instead of entering coordinates manually.","media.update_location":"Update my location","media.use_location":"Use my current location",
      "media.geolocation_unsupported":"This device or WebView does not support location","media.location_success":"Location set",
      "media.location_permission":"Allow the app to access your location","media.location_failed":"Could not determine location",
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
      "button.callback_data":"Callback data","button.generic":"Button","button.linked_success":"Button linked to “{title}”","button.save_page_failed":"Could not save the page","button.pick_user_in_chat":"Choose the user in the bot chat","button.user_picker_failed":"Could not open user picker: {error}","button.search_placeholder":"Search text","button.search_here_placeholder":"Search-here text","button.value_placeholder":"Value","button.active":"Active","button.accept":"Accept","button.decline":"Decline",
      "editor.write_text":"Write text…","preview.message":"Preview message","preview.back_to_edit":"Back to editing","preview.mode":"Preview mode","multi.select_blocks":"Select multiple blocks","multi.selected_count":"{count} selected","multi.move_up":"Move selected up","multi.move_down":"Move selected down","multi.mode":"Multi-select","block.drag":"Drag to move block","block.drag_short":"Drag to move","block.select":"Select block","editor.no_command_match":"No matching command or block",
      "details.add_inner":"Add a block inside details","details.collapse":"Collapse details","details.expand":"Expand details","details.expanded":"Expanded","details.collapsed":"Collapsed","details.delete_inner":"Delete block from details","details.empty":"No content inside details yet","details.write_inside":"Write inside details, or / to add a block","list.task":"Task",
      "editor.add_author":"Add author","editor.write_code":"Write code…","editor.write_quote":"Write quote…","editor.write_pullquote":"Write pull quote…","page.options":"Page options","top.more_blocks":"More blocks",
      "math.write_latex":"Write a LaTeX expression","math.edit_hint":"Tap to edit equation","math.add_hint":"Tap to add equation","math.edit":"Edit equation","math.quick_symbols":"Quick math symbols","math.separate_line":"Equation on a separate line","math.preview":"Preview","math.preview_hint":"Enter LaTeX to preview it here",
      "session.discarding":"Discarding changes…","session.discarded":"Changes discarded","session.discard_failed":"Could not discard changes","session.discard_error":"Could not discard work: {error}","session.discard_prepare_failed":"Could not prepare discard","session.restored":"Editing session restored",
      "emoji.apple":"Apple Emoji","emoji.recent":"Recent","emoji.recent_empty":"Recently used emoji will appear here","emoji.smileys":"Smileys","emoji.people":"People","emoji.hearts":"Hearts","emoji.nature":"Animals and nature","emoji.food":"Food","emoji.activity":"Activities","emoji.travel":"Travel","emoji.objects":"Objects","emoji.symbols":"Symbols","emoji.flags":"Flags","emoji.loading_apple":"Loading Apple Emoji…","emoji.load_failed":"Could not load Apple Emoji: {error}","emoji.catalog_unavailable":"The emoji catalog is unavailable",
      "table.no_next_cell":"There is no next cell to merge with","table.not_merged":"This cell is not merged","table.keep_one_row":"The table must keep at least one row","table.keep_one_column":"The table must keep at least one column","table.customize":"Customize table","table.cell":"Cell","table.row":"Row","table.column":"Column","table.alignment":"Alignment","table.align_left":"Align left","table.align_center":"Center horizontally","table.align_right":"Align right","table.align_top":"Align top","table.align_middle":"Center vertically","table.align_bottom":"Align bottom","table.shade_scope":"Shade {scope}","table.merge_next":"Merge with next cell","table.unmerge":"Unmerge cell","table.add_row_above":"Add row above","table.add_row_below":"Add row below","table.delete_row":"Delete row","table.add_column_before":"Add column before","table.add_column_after":"Add column after","table.delete_column":"Delete column","table.cell_options":"Cell, row, and column options",
    },
    ru: {
      "app.title":"Rich Customize Beta 0.3","common.cancel":"Отмена","common.save":"Сохранить","common.delete":"Удалить","common.done":"Готово","common.all":"Все","common.loading":"Загрузка…","common.unknown_error":"Неизвестная ошибка",
      "top.pages":"Сохранённые страницы","top.more":"Ещё","top.undo":"Отменить","top.redo":"Повторить","top.text":"Текст","top.list":"Список","top.table":"Таблица","top.media":"Медиа","top.math":"Формула","top.emoji":"Эмодзи",
      "editor.canvas":"Редактор сообщения","editor.untitled":"Без названия","editor.unsaved":"Не сохранено","editor.start_title":"Начните с сообщения","editor.start_hint":"Пишите сразу или добавьте блок. Введите /, чтобы открыть все блоки.","editor.start_writing":"Начать писать","editor.add_photo":"Добавить фото","editor.input_placeholder":"Введите текст или / для команд","editor.add_block":"Добавить блок","editor.block_actions":"Действия с блоком","editor.close":"Отменить изменения и закрыть редактор","editor.send":"Отправить через Telegram",
      "pages.title":"Сохранённые страницы","pages.subtitle":"Откройте страницу или создайте новую","pages.new":"Новая","pages.empty":"Сохранённых страниц пока нет.","send.title":"Отправить сообщение","send.subtitle":"Выберите место публикации",
      "save.saving":"Сохранение…","save.new_draft":"Новый черновик","save.failed":"Не удалось сохранить","save.saved":"Сохранено","save.saved_at":"Сохранено · {time}","save.error":"Ошибка сохранения: {error}","save.open_in_telegram":"Откройте приложение внутри Telegram","save.unauthorized":"Нет доступа",
      "block.paragraph":"Абзац","block.heading":"Заголовок","block.footer":"Подпись","block.preformatted":"Код","block.blockquote":"Цитата","block.pullquote":"Выделенная цитата","block.divider":"Разделитель","block.anchor":"Якорь","block.list":"Список","block.details":"Подробности","block.table":"Таблица","block.math":"Формула","block.photo":"Фото","block.video":"Видео","block.animation":"GIF","block.audio":"Аудио","block.voice":"Голосовое сообщение","block.document":"Файл","block.collage":"Коллаж","block.slideshow":"Слайд-шоу","block.map":"Карта",
      "block.text_desc":"Обычный текст","block.heading_desc":"От H1 до H6","block.footer_desc":"Мелкий текст","block.code_desc":"Предварительно форматированный текст","block.quote_desc":"Текстовая цитата","block.pullquote_desc":"Выделенная цитата","block.divider_desc":"Разделитель разделов","block.anchor_desc":"Якорь внутри сообщения","block.list_desc":"Маркированный, нумерованный или список задач","block.details_desc":"Сворачиваемый раздел","block.table_desc":"Редактируемая таблица","block.math_desc":"Математическое выражение","block.photo_desc":"Фото Telegram","block.video_desc":"Видео Telegram","block.animation_desc":"Анимация","block.audio_desc":"Аудиофайл","block.voice_desc":"Голосовое сообщение","block.document_desc":"Документ или файл","block.collage_desc":"Набор медиа","block.slideshow_desc":"Слайды с медиа","block.map_desc":"Географическое местоположение",
      "details.title":"Подробности","details.title_placeholder":"Заголовок раздела","details.inside_count":"Блоков внутри: {count}","list.item":"Элемент","list.item_placeholder":"Один элемент на строку","list.bulleted":"Маркированный","list.numbered":"Нумерованный","list.tasks":"Список задач",
      "media.paste_file_id":"Вставьте file_id","media.items_count":"Медиафайлов: {count}","block.settings":"Настройки: {name}","media.pick_photo":"Выбрать фото из галереи","media.pick_video":"Выбрать видео из галереи","media.pick_animation":"Выбрать GIF или MP4","media.pick_audio":"Выбрать аудиофайл","media.pick_voice":"Выбрать запись или аудиофайл","media.pick_document":"Выбрать файл на устройстве","media.unsupported":"Этот тип медиа не поддерживается","media.no_file":"Файл не выбран","media.too_large":"Размер файла превышает {size} МБ","media.uploaded":"{name} загружено и связано с Telegram","media.upload_failed":"Ошибка загрузки: {error}","media.uploading_telegram":"Загрузка в Telegram…","media.ready":"Готово к отправке{file}","media.picker_hint":"Выберите файл из галереи или проводника; бот автоматически получит file_id.","media.uploading":"Загрузка…","media.change":"Заменить: {name}","media.choose_images_videos":"Выберите изображения или видео","media.added_count":"Добавлено медиафайлов: {count}","media.some_failed":"Не удалось загрузить часть медиа: {error}","media.uploading_multiple":"Загрузка медиа…","media.container_hint":"Элементов: {count} · можно выбрать несколько изображений или видео сразу","media.add_images_videos":"Добавить изображения или видео","media.location":"Местоположение","media.locating":"Определение местоположения…","media.location_set":"Местоположение определено · {lat}, {lon}","media.location_hint":"Используйте геолокацию устройства вместо ручного ввода координат.","media.update_location":"Обновить местоположение","media.use_location":"Использовать моё местоположение","media.geolocation_unsupported":"Устройство или WebView не поддерживает геолокацию","media.location_success":"Местоположение определено","media.location_permission":"Разрешите приложению доступ к местоположению","media.location_failed":"Не удалось определить местоположение",
      "heading.level":"Заголовок {level}","table.add_row":"Добавить строку","table.add_column":"Добавить столбец","table.show_borders":"Показать границы","table.hide_borders":"Скрыть границы","table.striped":"Чередующиеся строки","table.unstriped":"Убрать чередование строк","table.compact":"Компактный режим","table.uncompact":"Отключить компактный режим","action.move_up":"Переместить вверх","action.move_down":"Переместить вниз","action.delete_block":"Удалить блок","editor.no_block_match":"Подходящих блоков нет",
      "send.add_content":"Сначала добавьте содержимое сообщения","send.save_before":"Не удалось сохранить страницу перед отправкой","send.loading_destinations":"Загрузка чатов…","send.private":"Отправить в личный чат","send.action":"Отправить","send.preparing_failed":"Не удалось подготовить отправку: {error}","send.sending":"Отправка…","send.sent_to":"Отправлено: {title}","send.failed":"Ошибка отправки: {error}","page.title":"Страница","page.new":"Новая страница","page.save_now":"Сохранить сейчас",
      "editor.text_tools":"Инструменты текста","heading.level_picker":"Уровень заголовка","button.type":"Тип расширенной кнопки","inline.bold":"Жирный","inline.italic":"Курсив","inline.strike":"Зачёркнутый","inline.underline":"Подчёркнутый","inline.code":"Код","inline.highlight":"Выделение","inline.subscript":"Нижний индекс","inline.superscript":"Верхний индекс","inline.spoiler":"Спойлер","inline.link":"Ссылка","inline.add_link":"Добавить ссылку","inline.edit_link":"Изменить ссылку","inline.remove_link":"Удалить ссылку","inline.create_button":"Создать кнопку","inline.invalid_link":"Введите корректную ссылку, начинающуюся с https:// или tg://",
      "button.add":"Добавить кнопку","button.title":"Текст кнопки","button.title_placeholder":"Введите название кнопки","button.separate":"Разместить кнопку в отдельной строке","button.style":"Стиль кнопки","button.url":"Ссылка","button.copy":"Копировать","button.mention":"Пользователь","button.page":"Страница","button.callback":"Callback","button.popup":"Всплывающее окно","button.value_required":"Введите значение кнопки","button.title_required":"Введите текст кнопки","button.create_failed":"Не удалось создать кнопку","button.editor_not_ready":"Редактор кнопок ещё не готов","button.disabled":"Отключена","button.inline_search":"Встроенный поиск","button.search_here":"Искать здесь","button.select_user":"Выбрать пользователя","button.edit_url":"Изменить ссылку","button.link_page":"Связать с сохранённой страницей","button.edit_copy":"Изменить копируемый текст","button.edit_popup":"Изменить текст окна","button.edit_search":"Изменить текст поиска","button.edit_search_here":"Изменить локальный поиск","button.convert_selection":"Преобразовать текст в кнопку","button.name":"Название кнопки","button.color":"Цвет кнопки","button.rich":"Расширенная кнопка","button.edit_name":"Изменить название","button.change_color":"Изменить цвет","button.to_text":"Преобразовать в обычный текст","button.delete":"Удалить кнопку","button.default":"По умолчанию","button.blue":"Синий","button.green":"Зелёный","button.red":"Красный","button.linked_page":"Связанная страница","button.loading_pages":"Загрузка сохранённых страниц…","button.choose_page":"Выберите страницу, которую откроет кнопка","button.no_pages":"Сохранённых страниц пока нет","button.choose_saved_page":"Выберите сохранённую страницу","button.selected_page":"Выбрано: «{title}»","button.pages_failed":"Не удалось загрузить страницы: {error}","button.copy_placeholder":"Текст для копирования","button.page_placeholder":"Код сохранённой страницы","button.popup_placeholder":"Текст всплывающего окна",
      "button.callback_data":"Данные Callback","button.generic":"Кнопка","button.linked_success":"Кнопка связана со страницей «{title}»","button.save_page_failed":"Не удалось сохранить страницу","button.pick_user_in_chat":"Выберите пользователя в чате с ботом","button.user_picker_failed":"Не удалось открыть выбор пользователя: {error}","button.search_placeholder":"Текст поиска","button.search_here_placeholder":"Текст поиска в этом чате","button.value_placeholder":"Значение","button.active":"Активная","button.accept":"Подтвердить","button.decline":"Отклонить",
      "editor.write_text":"Введите текст…","preview.message":"Предпросмотр сообщения","preview.back_to_edit":"Вернуться к редактированию","preview.mode":"Режим предпросмотра","multi.select_blocks":"Выбрать несколько блоков","multi.selected_count":"Выбрано: {count}","multi.move_up":"Переместить выбранное вверх","multi.move_down":"Переместить выбранное вниз","multi.mode":"Множественный выбор","block.drag":"Перетащите, чтобы переместить блок","block.drag_short":"Перетащите для перемещения","block.select":"Выбрать блок","editor.no_command_match":"Подходящих команд или блоков нет"
      ,"details.add_inner":"Добавить блок внутрь подробностей","details.collapse":"Свернуть подробности","details.expand":"Развернуть подробности","details.expanded":"Развернуто","details.collapsed":"Свернуто","details.delete_inner":"Удалить блок из подробностей","details.empty":"Внутри пока нет содержимого","details.write_inside":"Введите текст внутри или /, чтобы добавить блок","list.task":"Задача",
      "editor.add_author":"Добавить автора","editor.write_code":"Введите код…","editor.write_quote":"Введите цитату…","editor.write_pullquote":"Введите выделенную цитату…","page.options":"Параметры страницы","top.more_blocks":"Другие блоки",
      "math.write_latex":"Введите выражение LaTeX","math.edit_hint":"Нажмите, чтобы изменить формулу","math.add_hint":"Нажмите, чтобы добавить формулу","math.edit":"Изменить формулу","math.quick_symbols":"Быстрые математические символы","math.separate_line":"Формула в отдельной строке","math.preview":"Предпросмотр","math.preview_hint":"Введите LaTeX, чтобы увидеть результат здесь",
      "session.discarding":"Отмена изменений…","session.discarded":"Изменения отменены","session.discard_failed":"Не удалось отменить изменения","session.discard_error":"Не удалось отменить работу: {error}","session.discard_prepare_failed":"Не удалось подготовить отмену изменений","session.restored":"Сеанс редактирования восстановлен",
      "emoji.apple":"Эмодзи Apple","emoji.recent":"Недавние","emoji.recent_empty":"Недавно использованные эмодзи появятся здесь","emoji.smileys":"Смайлы","emoji.people":"Люди","emoji.hearts":"Сердца","emoji.nature":"Животные и природа","emoji.food":"Еда","emoji.activity":"Занятия","emoji.travel":"Путешествия","emoji.objects":"Объекты","emoji.symbols":"Символы","emoji.flags":"Флаги","emoji.loading_apple":"Загрузка эмодзи Apple…","emoji.load_failed":"Не удалось загрузить эмодзи Apple: {error}","emoji.catalog_unavailable":"Каталог эмодзи недоступен",
      "table.no_next_cell":"Нет следующей ячейки для объединения","table.not_merged":"Эта ячейка не объединена","table.keep_one_row":"В таблице должна остаться хотя бы одна строка","table.keep_one_column":"В таблице должен остаться хотя бы один столбец","table.customize":"Настройка таблицы","table.cell":"Ячейка","table.row":"Строка","table.column":"Столбец","table.alignment":"Выравнивание","table.align_left":"По левому краю","table.align_center":"По центру горизонтально","table.align_right":"По правому краю","table.align_top":"По верхнему краю","table.align_middle":"По центру вертикально","table.align_bottom":"По нижнему краю","table.shade_scope":"Заливка: {scope}","table.merge_next":"Объединить со следующей ячейкой","table.unmerge":"Разъединить ячейку","table.add_row_above":"Добавить строку сверху","table.add_row_below":"Добавить строку снизу","table.delete_row":"Удалить строку","table.add_column_before":"Добавить столбец слева","table.add_column_after":"Добавить столбец справа","table.delete_column":"Удалить столбец","table.cell_options":"Параметры ячейки, строки и столбца"
    },
    "zh-hans": {
      "app.title":"Rich Customize 测试版 0.3","common.cancel":"取消","common.save":"保存","common.delete":"删除","common.done":"完成","common.all":"全部","common.loading":"正在加载…",
      "top.pages":"已保存页面","top.more":"更多","top.undo":"撤销","top.redo":"重做","top.text":"文本","top.list":"列表","top.table":"表格","top.media":"媒体","top.math":"公式","top.emoji":"表情",
      "editor.canvas":"消息编辑器","editor.untitled":"未命名","editor.unsaved":"未保存","editor.start_title":"开始编写消息","editor.start_hint":"直接输入或添加区块。输入 / 可打开全部区块。","editor.start_writing":"开始输入","editor.add_photo":"添加图片","editor.input_placeholder":"输入文本，或输入 / 使用命令","editor.add_block":"添加区块","editor.block_actions":"区块操作","editor.close":"放弃更改并关闭","editor.send":"通过 Telegram 发送",
      "pages.title":"已保存页面","pages.subtitle":"打开页面或新建页面","pages.new":"新建","pages.empty":"暂无已保存页面。","send.title":"发送消息","send.subtitle":"选择发布位置",
      "inline.bold":"粗体","inline.italic":"斜体","inline.strike":"删除线","inline.underline":"下划线","inline.code":"代码","inline.highlight":"高亮","inline.subscript":"下标","inline.superscript":"上标","inline.spoiler":"剧透","inline.link":"链接","inline.add_link":"添加链接","inline.edit_link":"编辑链接","inline.remove_link":"移除链接","inline.create_button":"创建按钮","inline.invalid_link":"请输入以 https:// 或 tg:// 开头的有效链接",
      "button.add":"添加按钮","button.title":"按钮文字","button.title_placeholder":"输入按钮标题","button.separate":"按钮单独一行","button.style":"按钮样式","button.url":"链接","button.copy":"复制","button.mention":"提及用户","button.page":"页面","button.callback":"回调","button.popup":"弹窗","button.value_required":"请输入按钮值","button.title_required":"请输入按钮文字","button.create_failed":"无法创建按钮",
      "media.pick_photo":"从相册选择照片","media.pick_video":"从相册选择视频","media.pick_animation":"选择 GIF 或 MP4","media.pick_audio":"选择音频文件","media.pick_voice":"选择录音或音频文件","media.pick_document":"从设备选择文件",
      "media.unsupported":"不支持的媒体类型","media.no_file":"未选择文件","media.too_large":"文件大于 {size} MB","media.uploaded":"{name} 已上传并关联到 Telegram","media.upload_failed":"上传失败：{error}","media.uploading_telegram":"正在上传到 Telegram…","media.ready":"可发送{file}","media.picker_hint":"从相册或文件浏览器选择；机器人会自动获取 file_id。","media.uploading":"正在上传…","media.change":"更换{name}","media.choose_images_videos":"选择图片或视频","media.added_count":"已添加 {count} 个媒体项目","media.some_failed":"部分媒体上传失败：{error}","media.uploading_multiple":"正在上传媒体…","media.container_hint":"{count} 个项目 · 可一次选择多张图片或多个视频","media.add_images_videos":"添加图片或视频","media.location":"位置","media.locating":"正在获取位置…","media.location_set":"位置已设置 · {lat}, {lon}","media.location_hint":"使用设备位置，无需手动输入坐标。","media.update_location":"更新我的位置","media.use_location":"使用当前位置","media.geolocation_unsupported":"此设备或 WebView 不支持定位","media.location_success":"位置已设置","media.location_permission":"请允许应用访问你的位置","media.location_failed":"无法获取位置",
    },
    "zh-hant": {
      "app.title":"Rich Customize 測試版 0.3","common.cancel":"取消","common.save":"儲存","common.delete":"刪除","common.done":"完成","common.all":"全部","common.loading":"載入中…",
      "top.pages":"已儲存頁面","top.more":"更多","top.undo":"復原","top.redo":"重做","top.text":"文字","top.list":"清單","top.table":"表格","top.media":"媒體","top.math":"公式","top.emoji":"表情符號",
      "editor.canvas":"訊息編輯器","editor.untitled":"未命名","editor.unsaved":"未儲存","editor.start_title":"開始編寫訊息","editor.start_hint":"直接輸入或新增區塊。輸入 / 可開啟全部區塊。","editor.start_writing":"開始輸入","editor.add_photo":"新增圖片","editor.input_placeholder":"輸入文字，或輸入 / 使用命令","editor.add_block":"新增區塊","editor.block_actions":"區塊操作","editor.close":"放棄變更並關閉","editor.send":"透過 Telegram 傳送",
      "pages.title":"已儲存頁面","pages.subtitle":"開啟頁面或建立新頁面","pages.new":"新增","pages.empty":"尚無已儲存頁面。","send.title":"傳送訊息","send.subtitle":"選擇發佈位置",
      "inline.bold":"粗體","inline.italic":"斜體","inline.strike":"刪除線","inline.underline":"底線","inline.code":"程式碼","inline.highlight":"醒目提示","inline.subscript":"下標","inline.superscript":"上標","inline.spoiler":"劇透","inline.link":"連結","inline.add_link":"新增連結","inline.edit_link":"編輯連結","inline.remove_link":"移除連結","inline.create_button":"建立按鈕","inline.invalid_link":"請輸入以 https:// 或 tg:// 開頭的有效連結",
      "button.add":"新增按鈕","button.title":"按鈕文字","button.title_placeholder":"輸入按鈕標題","button.separate":"按鈕獨立一行","button.style":"按鈕樣式","button.url":"連結","button.copy":"複製","button.mention":"提及使用者","button.page":"頁面","button.callback":"回呼","button.popup":"彈出視窗","button.value_required":"請輸入按鈕值","button.title_required":"請輸入按鈕文字","button.create_failed":"無法建立按鈕",
      "media.pick_photo":"從相簿選擇照片","media.pick_video":"從相簿選擇影片","media.pick_animation":"選擇 GIF 或 MP4","media.pick_audio":"選擇音訊檔案","media.pick_voice":"選擇錄音或音訊檔案","media.pick_document":"從裝置選擇檔案",
      "media.unsupported":"不支援的媒體類型","media.no_file":"未選擇檔案","media.too_large":"檔案大於 {size} MB","media.uploaded":"{name} 已上傳並連結至 Telegram","media.upload_failed":"上傳失敗：{error}","media.uploading_telegram":"正在上傳至 Telegram…","media.ready":"可傳送{file}","media.picker_hint":"從相簿或檔案瀏覽器選擇；機器人會自動取得 file_id。","media.uploading":"正在上傳…","media.change":"更換{name}","media.choose_images_videos":"選擇圖片或影片","media.added_count":"已新增 {count} 個媒體項目","media.some_failed":"部分媒體上傳失敗：{error}","media.uploading_multiple":"正在上傳媒體…","media.container_hint":"{count} 個項目 · 可一次選擇多張圖片或多段影片","media.add_images_videos":"新增圖片或影片","media.location":"位置","media.locating":"正在取得位置…","media.location_set":"位置已設定 · {lat}, {lon}","media.location_hint":"使用裝置位置，無需手動輸入座標。","media.update_location":"更新我的位置","media.use_location":"使用目前位置","media.geolocation_unsupported":"此裝置或 WebView 不支援定位","media.location_success":"位置已設定","media.location_permission":"請允許應用程式存取你的位置","media.location_failed":"無法取得位置",
    },
  };

  function normalize(raw) {
    const value = String(raw || "").toLowerCase().replaceAll("_", "-");
    if (value.startsWith("ar")) return "ar";
    if (value.startsWith("ru")) return "ru";
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
      ["#slashMenu .menu-head span:first-child","editor.add_block"],["#blockMenuTitle","editor.block_actions"],
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
