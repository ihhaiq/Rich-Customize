import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import {
  developerBroadcastChats,
  managedChats,
  managedPublishPanels,
  richPages,
} from 'schema';
import {
  acquireEditorMutationLock,
  loadEditorSession,
  releaseEditorMutationLock,
  updateEditorSession,
  withEditorMessageLock,
} from 'lib/editor-session';
import { buildInputRichMessage } from 'lib/editor-renderer';
import {
  buildMessageButtonsKeyboard,
  prepareMessageButtons,
} from 'lib/page-buttons';
import { recordOperation } from 'lib/usage-stats';
import { resolveLanguage, resolveUserLanguage, t as i18nT, tr } from 'lib/i18n';
import { logError } from 'lib/error-log';
import { EXPECTED_PUBLISH_FAILURES, publishFailure, publishErrorDetail, normalizePublishError,
  shouldForgetDestination, publishFailureMessage } from 'lib/publish-errors';
import { getBrandingSettings, setBrandingPreference, shouldIncludeBranding } from 'lib/branding';
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import { scheduleMaxAheadTimestamp, SCHEDULE_MAX_AHEAD_SECONDS } from 'lib/schedule-policy';
import { isLegacySavedPage, isSavedPageUnchanged, legacyPagePublishOptions } from 'lib/saved-page-policy';
import { recordMarketingPublish } from 'lib/marketing-campaign';
import { resolveForumDeliveryOptions } from 'lib/forum-topics';

const ADMIN = new Set(['administrator', 'creator']);
const SUBSCRIBER = new Set(['member', 'administrator', 'creator']);
const CHANNEL_ADMIN_RIGHTS = 'post_messages+edit_messages+delete_messages+manage_chat+invite_users+restrict_members';
const GROUP_ADMIN_RIGHTS = 'delete_messages+manage_chat+invite_users+restrict_members';
const PUBLISH_DESTINATIONS_PER_PAGE = 6;
const PUBLISH_PICKER_LABELS = Object.freeze({
  ar:{all:'الكل',channels:'القنوات',groups:'المجموعات',next:'التالي',channel:'قناة',group:'مجموعة',addBot:'➕ اضف البوت الى {target}',selectedButton:'تم التحديد',selectAll:'تحديد الكل',selectAllNote:'يشمل التحديد نتائج الفلتر الحالي فقط، والمحادثات المتاحة للنشر.',allSelectedToast:'تم تحديد الكل',noneSelectableToast:'لا توجد محادثات متاحة للتحديد.'},
  de:{all:'Alle',channels:'Kanäle',groups:'Gruppen',next:'Weiter',channel:'zum Kanal',group:'zur Gruppe',addBot:'➕ Bot {target} hinzufügen',selectedButton:'Ausgewählt',selectAll:'Alle auswählen',selectAllNote:'Es gelten nur verfügbare Chats im aktuellen Filter.',allSelectedToast:'Alle verfügbaren Chats im Filter wurden ausgewählt.',noneSelectableToast:'Keine verfügbaren Chats zum Auswählen.'},
  en:{all:'All',channels:'Channels',groups:'Groups',next:'Next',channel:'the channel',group:'the group',addBot:'➕ Add the bot to {target}',selectedButton:'Selected',selectAll:'Select all',selectAllNote:'Only available chats in the current filter are selected.',allSelectedToast:'All available chats in this filter were selected.',noneSelectableToast:'No available chats to select.'},
  es:{all:'Todo',channels:'Canales',groups:'Grupos',next:'Siguiente',channel:'al canal',group:'al grupo',addBot:'➕ Añadir el bot {target}',selectedButton:'Seleccionado',selectAll:'Seleccionar todo',selectAllNote:'Solo se seleccionan los chats disponibles del filtro actual.',allSelectedToast:'Se seleccionaron todos los chats disponibles del filtro.',noneSelectableToast:'No hay chats disponibles para seleccionar.'},
  hi:{all:'सभी',channels:'चैनल',groups:'समूह',next:'अगला',channel:'चैनल',group:'समूह',addBot:'➕ बॉट को {target} में जोड़ें',selectedButton:'चयनित',selectAll:'सभी चुनें',selectAllNote:'केवल मौजूदा फ़िल्टर के उपलब्ध चैट चुने जाएंगे।',allSelectedToast:'इस फ़िल्टर के सभी उपलब्ध चैट चुन लिए गए।',noneSelectableToast:'चुनने के लिए कोई उपलब्ध चैट नहीं है।'},
  id:{all:'Semua',channels:'Kanal',groups:'Grup',next:'Berikutnya',channel:'kanal',group:'grup',addBot:'➕ Tambahkan bot ke {target}',selectedButton:'Dipilih',selectAll:'Pilih semua',selectAllNote:'Hanya chat yang tersedia dalam filter saat ini yang dipilih.',allSelectedToast:'Semua chat yang tersedia dalam filter ini dipilih.',noneSelectableToast:'Tidak ada chat yang tersedia untuk dipilih.'},
  it:{all:'Tutte',channels:'Canali',groups:'Gruppi',next:'Avanti',channel:'al canale',group:'al gruppo',addBot:'➕ Aggiungi il bot {target}',selectedButton:'Selezionato',selectAll:'Seleziona tutto',selectAllNote:'Vengono selezionate solo le chat disponibili nel filtro attuale.',allSelectedToast:'Selezionate tutte le chat disponibili in questo filtro.',noneSelectableToast:'Nessuna chat disponibile da selezionare.'},
  ja:{all:'すべて',channels:'チャンネル',groups:'グループ',next:'次へ',channel:'チャンネル',group:'グループ',addBot:'➕ ボットを{target}に追加',selectedButton:'選択済み',selectAll:'すべて選択',selectAllNote:'現在のフィルター内で利用可能なチャットのみ選択されます。',allSelectedToast:'このフィルターの利用可能なチャットをすべて選択しました。',noneSelectableToast:'選択できるチャットがありません。'},
  ko:{all:'전체',channels:'채널',groups:'그룹',next:'다음',channel:'채널',group:'그룹',addBot:'➕ 봇을 {target}에 추가',selectedButton:'선택됨',selectAll:'모두 선택',selectAllNote:'현재 필터에서 사용 가능한 대화만 선택됩니다.',allSelectedToast:'현재 필터의 사용 가능한 대화를 모두 선택했습니다.',noneSelectableToast:'선택할 수 있는 대화가 없습니다.'},
  nl:{all:'Alle',channels:'Kanalen',groups:'Groepen',next:'Volgende',channel:'aan het kanaal',group:'aan de groep',addBot:'➕ Bot toevoegen {target}',selectedButton:'Geselecteerd',selectAll:'Alles selecteren',selectAllNote:'Alleen beschikbare chats in het huidige filter worden geselecteerd.',allSelectedToast:'Alle beschikbare chats in dit filter zijn geselecteerd.',noneSelectableToast:'Geen beschikbare chats om te selecteren.'},
  pl:{all:'Wszystkie',channels:'Kanały',groups:'Grupy',next:'Dalej',channel:'do kanału',group:'do grupy',addBot:'➕ Dodaj bota {target}',selectedButton:'Wybrano',selectAll:'Zaznacz wszystko',selectAllNote:'Zaznaczane są tylko dostępne czaty z bieżącego filtra.',allSelectedToast:'Zaznaczono wszystkie dostępne czaty z tego filtra.',noneSelectableToast:'Brak dostępnych czatów do zaznaczenia.'},
  pt:{all:'Todos',channels:'Canais',groups:'Grupos',next:'Avançar',channel:'ao canal',group:'ao grupo',addBot:'➕ Adicionar o bot {target}',selectedButton:'Selecionado',selectAll:'Selecionar tudo',selectAllNote:'Apenas os chats disponíveis no filtro atual serão selecionados.',allSelectedToast:'Todos os chats disponíveis neste filtro foram selecionados.',noneSelectableToast:'Não há chats disponíveis para selecionar.'},
  ru:{all:'Все',channels:'Каналы',groups:'Группы',next:'Далее',channel:'в канал',group:'в группу',addBot:'➕ Добавить бота {target}',selectedButton:'Выбрано',selectAll:'Выбрать все',selectAllNote:'Выбираются только доступные чаты текущего фильтра.',allSelectedToast:'Выбраны все доступные чаты этого фильтра.',noneSelectableToast:'Нет доступных чатов для выбора.'},
  th:{all:'ทั้งหมด',channels:'ช่อง',groups:'กลุ่ม',next:'ถัดไป',channel:'ช่อง',group:'กลุ่ม',addBot:'➕ เพิ่มบอตไปยัง{target}',selectedButton:'เลือกแล้ว',selectAll:'เลือกทั้งหมด',selectAllNote:'เลือกเฉพาะแชตที่ใช้งานได้ในตัวกรองปัจจุบัน',allSelectedToast:'เลือกแชตที่ใช้งานได้ทั้งหมดในตัวกรองนี้แล้ว',noneSelectableToast:'ไม่มีแชตที่เลือกได้'},
  tr:{all:'Tümü',channels:'Kanallar',groups:'Gruplar',next:'İleri',channel:'kanala',group:'gruba',addBot:'➕ Botu {target} ekle',selectedButton:'Seçildi',selectAll:'Tümünü seç',selectAllNote:'Yalnızca geçerli filtredeki kullanılabilir sohbetler seçilir.',allSelectedToast:'Bu filtredeki tüm kullanılabilir sohbetler seçildi.',noneSelectableToast:'Seçilebilecek kullanılabilir sohbet yok.'},
  uk:{all:'Усі',channels:'Канали',groups:'Групи',next:'Далі',channel:'до каналу',group:'до групи',addBot:'➕ Додати бота {target}',selectedButton:'Вибрано',selectAll:'Вибрати всі',selectAllNote:'Вибираються лише доступні чати поточного фільтра.',allSelectedToast:'Вибрано всі доступні чати цього фільтра.',noneSelectableToast:'Немає доступних чатів для вибору.'},
  ur:{all:'سب',channels:'چینلز',groups:'گروپس',next:'اگلا',channel:'چینل',group:'گروپ',addBot:'➕ بوٹ کو {target} میں شامل کریں',selectedButton:'منتخب',selectAll:'سب منتخب کریں',selectAllNote:'صرف موجودہ فلٹر کی دستیاب چیٹس منتخب ہوں گی۔',allSelectedToast:'اس فلٹر کی تمام دستیاب چیٹس منتخب ہوگئیں۔',noneSelectableToast:'منتخب کرنے کے لیے کوئی دستیاب چیٹ نہیں۔'},
  vi:{all:'Tất cả',channels:'Kênh',groups:'Nhóm',next:'Tiếp',channel:'kênh',group:'nhóm',addBot:'➕ Thêm bot vào {target}',selectedButton:'Đã chọn',selectAll:'Chọn tất cả',selectAllNote:'Chỉ chọn các cuộc trò chuyện khả dụng trong bộ lọc hiện tại.',allSelectedToast:'Đã chọn tất cả cuộc trò chuyện khả dụng trong bộ lọc này.',noneSelectableToast:'Không có cuộc trò chuyện khả dụng để chọn.'},
  'zh-hans':{all:'全部',channels:'频道',groups:'群组',next:'下一步',channel:'频道',group:'群组',addBot:'➕ 将机器人添加到{target}',selectedButton:'已选择',selectAll:'全选',selectAllNote:'仅选择当前筛选条件下可用的聊天。',allSelectedToast:'已选择此筛选条件下所有可用聊天。',noneSelectableToast:'没有可选择的聊天。'},
  'zh-hant':{all:'全部',channels:'頻道',groups:'群組',next:'下一步',channel:'頻道',group:'群組',addBot:'➕ 將機器人新增至{target}',selectedButton:'已選擇',selectAll:'全選',selectAllNote:'僅選取目前篩選條件下可用的聊天。',allSelectedToast:'已選取此篩選條件下所有可用聊天。',noneSelectableToast:'沒有可選取的聊天。'},
});

function nowSeconds(){return Math.floor(Date.now()/1000);}
function code(source){return source?.from?.language_code||'en';}
function copy(languageCode){
  const locale=resolveLanguage(languageCode);
  const picker=PUBLISH_PICKER_LABELS[locale]||PUBLISH_PICKER_LABELS.en;
  return {
    locale,
    all:picker.all,
    channels:picker.channels,
    groups:picker.groups,
    next:picker.next,
    selectedButton:picker.selectedButton,
    selectAll:picker.selectAll,
    selectAllNote:picker.selectAllNote,
    allSelectedToast:picker.allSelectedToast,
    noneSelectableToast:picker.noneSelectableToast,
    addBot:(target)=>picker.addBot.replace('{target}',target),
    channel:picker.channel,
    group:picker.group,
    create:i18nT(locale,'create_post'),
    none:tr(locale,'There is no group or channel where both you and the bot are administrators.'),
    addHint:i18nT(locale,'publish.add_hint'),
    choose:tr(locale,'Select every group or channel you want to publish to.'),
    selected:tr(locale,'Selected: '),
    select:tr(locale,'Select'),
    back:i18nT(locale,'ux.common.back'),
    silentOn:i18nT(locale,'ux.publish.silent_on'),
    silentOff:i18nT(locale,'ux.publish.silent_off'),
    protectedOn:i18nT(locale,'ux.publish.protected_on'),
    protectedOff:i18nT(locale,'ux.publish.protected_off'),
    showBranding:locale==='ar'?'إظهار الحقوق':tr(locale,'Show branding'),
    hideBranding:locale==='ar'?'إخفاء الحقوق':tr(locale,'Hide branding'),
    brandingUnavailable:locale==='ar'
      ?'هذا الخيار متاح فقط لحساب لديه اشتراك نشط أو وصول المطور أو شراء إزالة الحقوق.'
      :tr(locale,'This setting requires an active subscription, developer access, or a branding-removal purchase.'),
    send:(n)=>i18nT(locale,'ux.publish.send',{count:n}),
    settingsTitle:i18nT(locale,'post_settings'),
    selectedChats:tr(locale,'Selected chats: '),
    settingsHint:tr(locale,'Choose settings, then send:'),
    yes:i18nT(locale,'ux.publish.confirm_yes'),
    cancel:i18nT(locale,'ux.common.cancel'),
    needChat:i18nT(locale,'select_chat'),
    invalidChat:tr(locale,'Invalid chat selection.'),
    unavailable:tr(locale,'The chat is no longer available, or administrator permissions changed.'),
    accessRights:tr(locale,'Administrator access is missing; check permissions for both the bot and your account.'),
    accessLookup:tr(locale,'Could not verify access to this destination. Try again later.'),
    selectedOn:tr(locale,'Chat selected'),
    selectedOff:tr(locale,'Chat unselected'),
    sending:tr(locale,'Publishing…'),
    emptyContent:tr(locale,'Publishing failed because no blocks are available.'),
    result:tr(locale,'Send result:'),
    ok:tr(locale,'Succeeded: '),
    fail:tr(locale,'Failed: '),
    again:tr(locale,'You can change settings and send the post again.'),
    shortened:tr(locale,'… result list shortened'),
    reason:tr(locale,'Failure reason: '),
    reached:(title)=>i18nT(locale,'publish.bot_added',{title}),
    noPostRight:(title)=>i18nT(locale,'publish.bot_no_post_right',{title}),
    publish:i18nT(locale,'ux.editor.publish'),
  };
}

function key(userId,chatId){return String(userId)+':'+String(chatId);}
function status(member){return String(member?.status?.value||member?.status||'');}
function isAdmin(member){return ADMIN.has(status(member));}

async function rememberChat(userId,chat){
  await db.insert(managedChats).values({
    key:key(userId,chat.id),userId:Number(userId),chatId:Number(chat.id),
    title:String(chat.title||chat.id),type:String(chat.type||''),username:chat.username||null,updatedAt:nowSeconds(),
  }).onConflictDoUpdate({target:managedChats.key,set:{
    title:String(chat.title||chat.id),type:String(chat.type||''),username:chat.username||null,updatedAt:nowSeconds(),
  }}).run();
}
async function removeUserChat(userId,chatId){await db.delete(managedChats).where(eq(managedChats.key,key(userId,chatId))).run();}
async function removeChatEverywhere(chatId){
  const rows=await db.select().from(managedChats).where(eq(managedChats.chatId,Number(chatId))).all();
  for(const row of rows)await db.delete(managedChats).where(eq(managedChats.key,row.key)).run();
  await db.delete(developerBroadcastChats)
    .where(eq(developerBroadcastChats.chatId, Number(chatId))).run();
}
async function listChats(userId){
  const rows=await db.select().from(managedChats).where(eq(managedChats.userId,Number(userId))).all();
  return rows.sort((a,b)=>String(a.title||'').toLocaleLowerCase().localeCompare(String(b.title||'').toLocaleLowerCase()));
}
async function rememberPanel(userId,chatId,messageId,selected){
  const stamp=nowSeconds();
  await db.insert(managedPublishPanels).values({userId:Number(userId),chatId:Number(chatId),messageId:Number(messageId),selectedChatIds:selected||[],updatedAt:stamp})
    .onConflictDoUpdate({target:managedPublishPanels.userId,set:{chatId:Number(chatId),messageId:Number(messageId),selectedChatIds:selected||[],updatedAt:stamp}}).run();
}
async function panel(userId){return db.select().from(managedPublishPanels).where(eq(managedPublishPanels.userId,Number(userId))).get();}
export async function clearPublishPanel(userId){await db.delete(managedPublishPanels).where(eq(managedPublishPanels.userId,Number(userId))).run();}

export async function inspectPublishAccess(chatId,userId){
  try{
    const me=await api.getMe();
    const botMember=await api.getChatMember({chat_id:Number(chatId),user_id:me.id});
    const userMember=await api.getChatMember({chat_id:Number(chatId),user_id:Number(userId)});
    const chat=await api.getChat({chat_id:Number(chatId)});
    if(!isAdmin(botMember)||!isAdmin(userMember))return {ok:false,reason:'rights',chat};
    if(String(chat?.type||'')==='channel'&&!Boolean(botMember?.can_post_messages))return {ok:false,reason:'rights',chat};
    return {ok:true,chat,botMember,userMember};
  }catch(error){
    return {ok:false,reason:'lookup',error};
  }
}
export async function canPublish(chatId,userId){return Boolean((await inspectPublishAccess(chatId,userId)).ok);}
async function eligible(userId){
  const out=[];
  for(const chat of await listChats(userId)){
    const access=await inspectPublishAccess(chat.chatId,userId);
    if(access.ok){out.push(chat);continue;}
    if(access.reason==='rights')continue;
    // Transient lookup failures must not delete stored destinations.
    const failure=normalizePublishError(access.error,{kind:'chat'});
    if(failure.code==='PUBLISH_RIGHTS_MISSING')continue;
    if(shouldForgetDestination(failure.code))await removeUserChat(userId,chat.chatId);
    else out.push(chat);
  }
  return out;
}
async function addLinks(){
  const me=await api.getMe(),username=me?.username||'RichCustomizebot',base='https://t.me/'+username;
  return [base+'?startchannel&admin='+CHANNEL_ADMIN_RIGHTS,base+'?startgroup&admin='+GROUP_ADMIN_RIGHTS];
}
function buttonPayload(text,opts={}){
  return {text,...(opts.callback_data?{callback_data:opts.callback_data}:{}),...(opts.url?{url:opts.url}:{}),...(['primary','success','danger'].includes(opts.style)?{style:opts.style}:{})};
}
function richButton(text,opts={}){return {type:'button',button:buttonPayload(text,opts)};}
function richButtonsBlock(buttons,align='center'){return {type:'buttons',buttons,align};}
function cell(text,colspan=null){return {text,align:'center',valign:'middle',...(colspan?{colspan}:{})};}
function chatLink(chat){
  const username=String(chat?.username||'').replace(/^@+/,'');if(username)return 'https://t.me/'+username;
  const numeric=String(Math.abs(Number(chat.chatId||0)));
  if(['channel','supergroup'].includes(String(chat.type||''))&&numeric.startsWith('100'))return 'https://t.me/c/'+numeric.slice(3)+'/1';
  return 'tg://openmessage?chat_id='+numeric;
}
function shortChatTitle(title){
  const chars=Array.from(String(title||''));
  return chars.length>36?chars.slice(0,35).join('')+'…':chars.join('');
}
function pickerRich(chats,selected,hasDestinations,channelUrl,groupUrl,c,page=0,filter='all',accessById=new Map()){
  const cc=copy(c),set=new Set(selected||[]),totalPages=Math.max(1,Math.ceil(chats.length/PUBLISH_DESTINATIONS_PER_PAGE));
  const currentPage=Math.max(0,Math.min(totalPages-1,Number(page)||0));
  const visible=chats.slice(currentPage*PUBLISH_DESTINATIONS_PER_PAGE,(currentPage+1)*PUBLISH_DESTINATIONS_PER_PAGE);
  const rows=[],accessNotices=[];
  const filters=[
    ['all',cc.all],
    ['channels',cc.channels],
    ['groups',cc.groups],
  ];
  const pageLabel=totalPages>1?'\n'+(currentPage+1)+'/'+totalPages:'';
  const intro=cc.create+'\n\n'+(hasDestinations
    ?cc.choose+'\n'+cc.selected+set.size+pageLabel
    :cc.none);
  const blocks=[
    {type:'paragraph',text:intro},
    {type:'paragraph',text:filters.flatMap(([value,label],index)=>[
      ...(index?[' | ']:[]),
      richButton(label,{callback_data:'r:postchat:filter:'+value,style:value==='all'?'success':undefined}),
    ])},
  ];
  for(const chat of visible){
    const id=Number(chat.chatId),on=set.has(id),icon=chat.type==='channel'?'📢':'👥',access=accessById.get(id);
    const statusIcon=access?.ok?'':access?.reason==='rights'?'⚠️ ':'❔ ';
    rows.push([cell([
      richButton(statusIcon+icon+' '+shortChatTitle(chat.title||id),{url:chatLink(chat)}),
      ' | ',
      richButton(on?cc.selectedButton:cc.select,{callback_data:'r:postchat:'+id+':'+currentPage+':'+filter,style:on?'success':'primary'}),
    ])]);
    if(access&&!access.ok){
      const reason=access.reason==='rights'?cc.accessRights:cc.accessLookup;
      accessNotices.push({type:'paragraph',text:'⚠️ '+shortChatTitle(chat.title||chat.chatId)+': '+reason});
    }
  }
  if(rows.length)blocks.push({type:'table',cells:rows,is_bordered:true,is_striped:true,is_compact:true});
  blocks.push(...accessNotices);
  const allSelected=chats.length>0&&chats.every(chat=>set.has(Number(chat.chatId)));
  if(chats.length)blocks.push(richButtonsBlock([
    buttonPayload(cc.selectAll,{callback_data:'r:postchat:select_all:'+filter+':'+currentPage,style:allSelected?'success':'primary'}),
  ]));
  if(totalPages>1){
    const navigation=[];
    if(currentPage>0)navigation.push(buttonPayload('‹ '+currentPage,{callback_data:'r:postchat:page:'+filter+':'+(currentPage-1)}));
    if(currentPage+1<totalPages)navigation.push(buttonPayload((currentPage+2)+' ›',{callback_data:'r:postchat:page:'+filter+':'+(currentPage+1)}));
    if(navigation.length)blocks.push(richButtonsBlock(navigation));
  }
  if(set.size)blocks.push(richButtonsBlock([buttonPayload(cc.next,{callback_data:'r:postsettings',style:'success'})]));
  blocks.push({type:'footer',text:cc.addHint+'\n'+cc.selectAllNote});
  blocks.push(richButtonsBlock([
    buttonPayload(cc.addBot(cc.channel),{url:channelUrl}),
    buttonPayload(cc.addBot(cc.group),{url:groupUrl}),
  ]));
  return {blocks};
}
function settingsText(n,c){const cc=copy(c);return cc.settingsTitle+'\n\n'+cc.selectedChats+n+'\n'+cc.settingsHint;}
function brandingFlag(data,prefix){
  if(data===prefix)return null;
  const suffix=data.slice(prefix.length+1);
  if(suffix==='set:1')return true;
  if(suffix==='set:0')return false;
  if(suffix==='0')return true;
  if(suffix==='1')return false;
  return null;
}
async function brandingOptions(userId){
  return getBrandingSettings(userId);
}
function settingsRich(n,silent,protectedValue,includeBranding,canManageBranding,c,body=null){
  const cc=copy(c),text=body||settingsText(n,c),flag=includeBranding?'1':'0',rows=[
    [cell(richButton(silent?cc.silentOn:cc.silentOff,{callback_data:'r:pt:silent:'+flag,style:silent?'success':'primary'}),2)],
    [cell(richButton(protectedValue?cc.protectedOn:cc.protectedOff,{callback_data:'r:pt:protected:'+flag,style:protectedValue?'success':'primary'}),2)],
  ];
  if(canManageBranding){
    const nextIncludeBranding=!includeBranding;
    rows.push([cell(richButton(includeBranding?cc.hideBranding:cc.showBranding,{
      callback_data:'r:pt:branding:set:'+(nextIncludeBranding?'1':'0'),
      style:includeBranding?'primary':'success',
    }),2)]);
  }
  rows.push([cell(richButton(resolveLanguage(c)==='ar'?'جدولة المنشور':'Schedule post',{callback_data:'r:postschedule:'+flag,style:'primary'}),2)]);
  return {blocks:[
    {type:'paragraph',text},
    {type:'table',cells:rows,is_bordered:true,is_compact:true},
    richButtonsBlock([buttonPayload(cc.yes,{callback_data:'r:postsend:'+flag,style:'success'})]),
  ]};
}
function backKeyboard(data='r:back',c='en'){return {inline_keyboard:[[{text:copy(c).back,callback_data:data}]]};}
function editErrorText(error){return String(error?.description||error?.message||error).toLowerCase();}
async function editRich(query,rich,markup){
  const payload={chat_id:query.message.chat.id,message_id:query.message.message_id,rich_message:rich,reply_markup:markup};
  try{await api.editMessageText(payload);}
  catch(error){
    const detail=editErrorText(error);
    if(detail.includes('message is not modified'))return;
    if(detail.includes('canceled by new edit message request')){
      await Promise.resolve();
      try{await api.editMessageText(payload);}
      catch(retryError){
        if(editErrorText(retryError).includes('message is not modified'))return;
        throw retryError;
      }
      return;
    }
    throw error;
  }
}
async function withPublishUiLock(query,callback){
  const chatId=Number(query?.message?.chat?.id),messageId=Number(query?.message?.message_id);
  const locked=await withEditorMessageLock(chatId,messageId,callback);
  if(locked.acquired)return locked.value;
  try{await api.answerCallbackQuery({callback_query_id:query.id});}catch{}
  return true;
}
async function pickerAccessStates(chats,userId,page){
  const start=page*PUBLISH_DESTINATIONS_PER_PAGE,visible=chats.slice(start,start+PUBLISH_DESTINATIONS_PER_PAGE),states=new Map();
  for(const chat of visible)states.set(Number(chat.chatId),await inspectPublishAccess(chat.chatId,userId));
  return states;
}
async function renderPicker(query,selected,page=0,filter='all',knownAccessById=null){
  const allChats=await listChats(query.from.id),ids=new Set(allChats.map(x=>Number(x.chatId))),safe=(selected||[]).map(Number).filter(x=>ids.has(x));
  const normalizedFilter=['all','channels','groups'].includes(String(filter))?String(filter):'all';
  const chats=allChats.filter(chat=>normalizedFilter==='all'||(normalizedFilter==='channels'?chat.type==='channel':chat.type!=='channel'));
  const totalPages=Math.max(1,Math.ceil(chats.length/PUBLISH_DESTINATIONS_PER_PAGE));
  const currentPage=Math.max(0,Math.min(totalPages-1,Number.isSafeInteger(Number(page))?Number(page):0));
  const accessById=knownAccessById||await pickerAccessStates(chats,query.from.id,currentPage);
  const [channelUrl,groupUrl]=await addLinks();
  await updateEditorSession(query.from.id,{postSelectedChatIds:safe});
  await editRich(query,pickerRich(chats,safe,allChats.length,channelUrl,groupUrl,code(query),currentPage,normalizedFilter,accessById),backKeyboard('r:back',code(query)));
  await rememberPanel(query.from.id,query.message.chat.id,query.message.message_id,safe);
  return chats;
}
async function refreshPanel(userId, languageCode='en'){
  const p=await panel(userId);if(!p)return;
  const locked=await withEditorMessageLock(p.chatId,p.messageId,async()=>{
    const session=await loadEditorSession(userId,{touch:false});if(!session)return;
    const chats=await listChats(userId),ids=new Set(chats.map(x=>Number(x.chatId))),safe=(p.selectedChatIds||[]).map(Number).filter(x=>ids.has(x));
    const [channelUrl,groupUrl]=await addLinks();
    const accessById=await pickerAccessStates(chats,userId,0);
    try{await api.editMessageText({chat_id:p.chatId,message_id:p.messageId,rich_message:pickerRich(chats,safe,chats.length,channelUrl,groupUrl,languageCode,0,'all',accessById),reply_markup:backKeyboard('r:back',languageCode)});}
    catch(error){
      const detail=editErrorText(error);
      if(!detail.includes('message is not modified')&&!detail.includes('canceled by new edit message request'))throw error;
    }
  });
  if(!locked.acquired)console.warn('Skipped publish panel refresh because the message is busy',p.chatId,p.messageId);
}

export async function handlePublishCallback(query){
  const data=String(query?.data||'');
  const relevant=data==='r:post'||data==='r:postlist'||data==='r:postsettings'||data.startsWith('r:postsettings:')||data==='r:postconfirm'||data.startsWith('r:postconfirm:')||data==='r:postsend'||data.startsWith('r:postsend:')||data==='r:postschedule'||data.startsWith('r:postschedule:')||data.startsWith('r:postchat:')||data.startsWith('r:pt:');
  if(!relevant)return false;
  const userId=query?.from?.id,c=code(query),cc=copy(c);
  const existing=await loadEditorSession(userId,{touch:false});if(!existing)return false;
  if(!query?.message?.chat?.id||!query?.message?.message_id){await api.answerCallbackQuery({callback_query_id:query.id});return true;}

  if(data==='r:post'){
    return withPublishUiLock(query,async()=>{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      if(!Array.isArray(latest.blocks)||!latest.blocks.length){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.emptyContent,show_alert:true});return true;}
      await updateEditorSession(userId,{postSelectedChatIds:[],postSilent:0,postProtected:0,blockScrollEnabled:0});
      await renderPicker(query,[]);await api.answerCallbackQuery({callback_query_id:query.id});return true;
    });
  }
  if(data==='r:postlist'){
    return withPublishUiLock(query,async()=>{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      await renderPicker(query,latest.postSelectedChatIds||[]);await api.answerCallbackQuery({callback_query_id:query.id});return true;
    });
  }
  if(data.startsWith('r:postchat:')){
    return withPublishUiLock(query,async()=>{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      const selectAllMatch=data.match(/^r:postchat:select_all:(all|channels|groups):(\d+)$/);
      if(selectAllMatch){
        const filter=selectAllMatch[1],page=Number(selectAllMatch[2]);
        if(!Number.isSafeInteger(page)){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.invalidChat,show_alert:true});return true;}
        const chats=(await listChats(userId)).filter(chat=>filter==='all'||(filter==='channels'?chat.type==='channel':chat.type!=='channel'));
        const accessById=new Map(),selected=new Set((latest.postSelectedChatIds||[]).map(Number));
        let selectableCount=0;
        for(const chat of chats){
          const id=Number(chat.chatId),access=await inspectPublishAccess(id,userId);
          accessById.set(id,access);
          if(access.ok){selected.add(id);selectableCount++;}
        }
        await renderPicker(query,[...selected],page,filter,accessById);
        await api.answerCallbackQuery({
          callback_query_id:query.id,
          text:selectableCount?cc.allSelectedToast:cc.noneSelectableToast,
        });
        return true;
      }
      const filterMatch=data.match(/^r:postchat:filter:(all|channels|groups)$/);
      if(filterMatch){
        await renderPicker(query,latest.postSelectedChatIds||[],0,filterMatch[1]);await api.answerCallbackQuery({callback_query_id:query.id});return true;
      }
      const pageMatch=data.match(/^r:postchat:page:(?:(all|channels|groups):)?(\d+)$/);
      if(pageMatch){
        const page=Number(pageMatch[2]),filter=pageMatch[1]||'all';
        if(!Number.isSafeInteger(page)){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.invalidChat,show_alert:true});return true;}
        await renderPicker(query,latest.postSelectedChatIds||[],page,filter);await api.answerCallbackQuery({callback_query_id:query.id});return true;
      }
      const selectionMatch=data.match(/^r:postchat:(-?\d+)(?::(\d+))?(?::(all|channels|groups))?$/);
      const id=Number(selectionMatch?.[1]),page=Number(selectionMatch?.[2]||0),filter=selectionMatch?.[3]||'all';
      if(!Number.isSafeInteger(id)||!Number.isSafeInteger(page)||page<0){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.invalidChat,show_alert:true});return true;}
      const registered=(await listChats(userId)).find(x=>Number(x.chatId)===id);
      if(!registered){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.unavailable,show_alert:true});return true;}
      const selected=(latest.postSelectedChatIds||[]).map(Number),index=selected.indexOf(id);let notice;
      if(index>=0){selected.splice(index,1);notice=cc.selectedOff;}
      else{
        const access=await inspectPublishAccess(id,userId);
        if(!access.ok){
          const message=access.reason==='rights'?cc.accessRights:cc.accessLookup;
          await api.answerCallbackQuery({callback_query_id:query.id,text:message,show_alert:true});return true;
        }
        selected.push(id);notice=cc.selectedOn;
      }
      await renderPicker(query,selected,page,filter);await api.answerCallbackQuery({callback_query_id:query.id,text:notice});return true;
    });
  }
  if(data==='r:postsettings'||data.startsWith('r:postsettings:')||data==='r:postconfirm'||data.startsWith('r:postconfirm:')){
    return withPublishUiLock(query,async()=>{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      const chats=await listChats(userId),ids=new Set(chats.map(x=>Number(x.chatId))),selected=(latest.postSelectedChatIds||[]).map(Number).filter(x=>ids.has(x));
      if(!selected.length){await updateEditorSession(userId,{postSelectedChatIds:[]});await api.answerCallbackQuery({callback_query_id:query.id,text:cc.needChat,show_alert:true});return true;}
      const branding=await brandingOptions(userId);
      await updateEditorSession(userId,{postSelectedChatIds:selected});await clearPublishPanel(userId);
      await editRich(query,settingsRich(selected.length,Boolean(latest.postSilent),Boolean(latest.postProtected),branding.includeBranding,branding.canManage,c),backKeyboard('r:postlist',c));
      await api.answerCallbackQuery({callback_query_id:query.id});return true;
    });
  }
  if(data.startsWith('r:pt:')){
    return withPublishUiLock(query,async()=>{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      const selected=(latest.postSelectedChatIds||[]).map(Number);if(!selected.length){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.needChat,show_alert:true});return true;}
      const parts=data.split(':'),option=parts[2];
      let branding=await brandingOptions(userId);
      let silent=Boolean(latest.postSilent),protectedValue=Boolean(latest.postProtected),includeBranding=branding.includeBranding;
      if(option==='silent')silent=!silent;
      else if(option==='protected')protectedValue=!protectedValue;
      else if(option==='branding'){
        const desired=brandingFlag(data,'r:pt:branding');
        if(!branding.canManage||typeof desired!=='boolean'){
          await api.answerCallbackQuery({callback_query_id:query.id,text:cc.brandingUnavailable,show_alert:true});return true;
        }
        if(!await setBrandingPreference(userId,desired)){
          await api.answerCallbackQuery({callback_query_id:query.id,text:cc.brandingUnavailable,show_alert:true});return true;
        }
        branding=await brandingOptions(userId);
        includeBranding=branding.includeBranding;
      }
      else{await api.answerCallbackQuery({callback_query_id:query.id,text:cc.invalidChat,show_alert:true});return true;}
      await updateEditorSession(userId,{postSilent:silent?1:0,postProtected:protectedValue?1:0});
      await editRich(query,settingsRich(selected.length,silent,protectedValue,includeBranding,branding.canManage,c),backKeyboard('r:postlist',c));await api.answerCallbackQuery({callback_query_id:query.id});return true;
    });
  }
  if(data==='r:postschedule'||data.startsWith('r:postschedule:')){
    return withPublishUiLock(query,async()=>{
      const latest=await loadEditorSession(userId);
      if(!latest||!Array.isArray(latest.blocks)||!latest.blocks.length){
        await api.answerCallbackQuery({callback_query_id:query.id,text:cc.emptyContent,show_alert:true});return true;
      }
      const ids=[...new Set((latest.postSelectedChatIds||[]).map(Number))];
      if(!ids.length){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.needChat,show_alert:true});return true;}
      const branding=await brandingOptions(userId);
      const pendingState=branding.canManage
        ?branding.includeBranding?2:3
        :1;
      await updateEditorSession(userId,{postSchedulePending:pendingState});
      const entitlement=await getEditorEntitlement(userId);
      const maximum=scheduleMaxAheadTimestamp(entitlement,nowSeconds());
      const hasExtendedWindow=maximum>nowSeconds()+SCHEDULE_MAX_AHEAD_SECONDS;
      const text=resolveLanguage(c)==='ar'
        ?'أرسل موعد الجدولة\n\nMM-DD hh:mm AM/PM\nمثال: 10-28 10:19 PM\nتوقيت بغداد (GMT+3). الحد الأقصى '+(hasExtendedWindow?'شهران.':'٤ أيام.')
        :'Send the scheduled time\n\nMM-DD hh:mm AM/PM\nExample: 10-28 10:19 PM\nBaghdad time (GMT+3). Maximum: '+(hasExtendedWindow?'two months.':'4 days.');
      await api.answerCallbackQuery({callback_query_id:query.id,text:resolveLanguage(c)==='ar'?'أرسل تاريخ ووقت الجدولة في الخاص':'Send the date and time in private chat'});
      await api.sendMessage({
        chat_id:userId,
        text,
        reply_markup:{
          keyboard:[[{text:resolveLanguage(c)==='ar'?'إلغاء':'Cancel'}]],
          resize_keyboard:true,
          one_time_keyboard:true,
        },
      });
      return true;
    });
  }
  if(data==='r:postsend'||data.startsWith('r:postsend:')){
    const mutationLock=await acquireEditorMutationLock(userId);if(!mutationLock){await api.answerCallbackQuery({callback_query_id:query.id});return true;}
    try{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      if(!Array.isArray(latest.blocks)||!latest.blocks.length){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.emptyContent,show_alert:true});return true;}
      const selected=(latest.postSelectedChatIds||[]).map(Number);if(!selected.length){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.needChat,show_alert:true});return true;}
      const registered=new Map((await listChats(userId)).map(x=>[Number(x.chatId),x]));
      const branding=await brandingOptions(userId);
      const includeBranding=branding.includeBranding;
      const quotaSavedPage=latest.currentPageId
        ? await db.select().from(richPages).where(eq(richPages.pageId,String(latest.currentPageId))).get()
        : null;
      const savedPage = quotaSavedPage && Number(quotaSavedPage.ownerId)===Number(userId)
        ? quotaSavedPage : null;
      const entitlement=await getEditorEntitlement(userId);
      const legacy = savedPage && isLegacySavedPage(savedPage,userId,entitlement);
      if (legacy && !isSavedPageUnchanged(savedPage,latest)) {
        await api.answerCallbackQuery({callback_query_id:query.id,show_alert:true,text:
          resolveLanguage(c)==='ar'
            ? 'هذه الصفحة تتجاوز حدود باقتك؛ افتح النسخة المحفوظة من صفحاتك حتى تنشرها بدون تعديل.'
            : 'This page exceeds your current plan. Reopen the saved version to publish it unchanged.'});
        return true;
      }
      await api.answerCallbackQuery({callback_query_id:query.id,text:cc.sending});
      const publishBlocks = legacy ? savedPage.blocks : latest.blocks;
      const publishButtons = legacy ? savedPage.buttons : latest.messageButtons;
      const publishButtonsPerRow = legacy ? savedPage.buttonsPerRow : latest.buttonsPerRow;
      const publishedButtons=await prepareMessageButtons(publishButtons || []);
      let tutorialDeliveryKey = null;
      const succeeded=[],failed=[],reasons=[];
      for(const chatId of [...new Set(selected.filter(Number.isSafeInteger))]){
        const title=String(registered.get(chatId)?.title||chatId);
        try{
          const access=await inspectPublishAccess(chatId,userId);
          if(!access.ok){
            if(access.reason==='rights')throw publishFailure('PUBLISH_RIGHTS_MISSING','Missing administrator rights');
            throw access.error || new Error('Could not verify destination access');
          }
          const topicOptions=await resolveForumDeliveryOptions(chatId,access.chat);
          const markup=publishedButtons.length?buildMessageButtonsKeyboard(publishedButtons,{buttonsPerRow:Number(publishButtonsPerRow||1),sourcePageId:latest.currentPageId||null}):undefined;
          const publishedMessage = await sendRichMessageSafe({chat_id:chatId,...topicOptions,rich_message:buildInputRichMessage(publishBlocks||[],{userId:query.from.id,sourcePageId:latest.currentPageId||null,includeBranding,entitlement,technicalOnly:Boolean(legacy)}),...(markup?{reply_markup:markup}:{}),disable_notification:Boolean(latest.postSilent),protect_content:Boolean(latest.postProtected)});
          if (!tutorialDeliveryKey && Number(publishedMessage?.message_id) > 0) tutorialDeliveryKey = chatId + ':' + publishedMessage.message_id;
          succeeded.push(title);
        }catch(error){
          failed.push(title);
          const normalized=normalizePublishError(error,{kind:'chat'});
          if(reasons.length<12)reasons.push(title+': '+publishFailureMessage(normalized,resolveLanguage(c)));
          if(shouldForgetDestination(normalized.code)&&normalized.code!=='PUBLISH_RIGHTS_MISSING'){
            try{await removeUserChat(userId,chatId);}catch(cleanupError){console.warn('Could not forget inaccessible chat',cleanupError);}
          }
          if(!EXPECTED_PUBLISH_FAILURES.has(String(normalized.code||''))){
            await logError('publish.send',error,{
              userId,chatId,callbackData:query?.data,
              extra:'target_chat='+chatId+'; normalized_code='+String(normalized.code||'PUBLISH_FAILED'),
            });
          }else console.warn('Publish rejected by Telegram',normalized.code,chatId);
        }
      }
      try{
        if(succeeded.length){
          await recordOperation('publish',true,succeeded.length);
          try{await recordMarketingPublish(userId, tutorialDeliveryKey);}catch(error){console.warn('Could not record campaign conversion',error);}
        }
        if(failed.length)await recordOperation('publish',false,failed.length);
      }catch(statsError){console.warn('Could not record publish stats',statsError);}
      const lines=[cc.result,'✅ '+cc.ok+succeeded.length,'❌ '+cc.fail+failed.length,...succeeded.slice(0,10).map(x=>'✅ '+x),...failed.slice(0,10).map(x=>'❌ '+x)];
      if(reasons.length)lines.push('',cc.reason+reasons.join('\n'));
      if(failed.length>reasons.length)lines.push('… '+(failed.length-reasons.length)+' مجموعات أخرى لم يمكن عرض سببها هنا.');
      if(succeeded.length+failed.length>20)lines.push(cc.shortened);
      lines.push('',cc.again);
      const ui=await withEditorMessageLock(query.message.chat.id,query.message.message_id,async()=>{
        await editRich(query,settingsRich(selected.length,Boolean(latest.postSilent),Boolean(latest.postProtected),includeBranding,branding.canManage,c,lines.join('\n')),backKeyboard('r:postlist',c));
      });
      if(!ui.acquired)console.warn('Skipped publish result UI update because the message is busy',query.message.chat.id,query.message.message_id);
      return true;
    }finally{await releaseEditorMutationLock(mutationLock);}
  }
  return false;
}

export async function handleMyChatMember(update){
  const chat=update?.chat,newMember=update?.new_chat_member,actor=update?.from;
  if (actor?.id && !actor.language_code) actor.language_code = await resolveUserLanguage(actor);
  if(!chat?.id)return;
  if(!isAdmin(newMember)){await removeChatEverywhere(chat.id);return;}
  const chatType=String(chat.type||'');
  if(chatType==='channel'&&!Boolean(newMember?.can_post_messages)){
    await db.delete(developerBroadcastChats)
      .where(eq(developerBroadcastChats.chatId, Number(chat.id))).run();
    if(actor?.id){try{await api.sendMessage({chat_id:actor.id,text:copy(actor.language_code).noPostRight(chat.title||String(chat.id))});}catch{}}
    return;
  }
  if(['channel','group','supergroup'].includes(chatType)){
    await db.insert(developerBroadcastChats).values({
      chatId:Number(chat.id),
      title:String(chat.title||chat.id),
      type:chatType,
      username:chat.username||null,
      discoveredAt:nowSeconds(),
    }).onConflictDoUpdate({target:developerBroadcastChats.chatId,set:{
      title:String(chat.title||chat.id),
      type:chatType,
      username:chat.username||null,
    }}).run();
  }
  if(!actor?.id||actor?.is_bot)return;
  await rememberChat(actor.id,chat);
  await refreshPanel(actor.id, actor.language_code || 'en');
  try{await api.sendMessage({chat_id:actor.id,text:copy(actor.language_code).reached(chat.title||String(chat.id)),reply_markup:{inline_keyboard:[[{text:copy(actor.language_code).publish,callback_data:'r:postchat:'+chat.id,style:'success'}]]}});}catch{}
}

export async function isChatSubscriber(chatId,userId){
  try{const member=await api.getChatMember({chat_id:Number(chatId),user_id:Number(userId)});return SUBSCRIBER.has(status(member));}catch{return false;}
}


function collectCustomEmojiIds(value, out = new Set()) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((item) => collectCustomEmojiIds(item, out));
    return out;
  }
  if (typeof value !== 'object') return out;

  if (String(value.type || '') === 'custom_emoji') {
    const id = String(value.custom_emoji_id || '').trim();
    if (/^[1-9][0-9]{0,19}$/.test(id)) out.add(id);
    return out;
  }

  Object.values(value).forEach((item) => collectCustomEmojiIds(item, out));
  return out;
}

function mapCustomEmojiNodes(value, alternatives, { plain = false } = {}) {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => mapCustomEmojiNodes(item, alternatives, { plain }));
  }
  if (typeof value !== 'object') return value;

  if (String(value.type || '') === 'custom_emoji') {
    const id = String(value.custom_emoji_id || '').trim();
    const verified = alternatives?.get?.(id) || '';
    const fallback = String(verified || value.alternative_text || '🙂');

    if (plain || !verified) return fallback;

    return {
      ...value,
      custom_emoji_id: id,
      // Telegram requires the alternative to be a valid emoji; using the
      // exact value returned by getCustomEmojiStickers prevents
      // RICH_MESSAGE_EMOJI_INVALID for mismatched/fallback alternatives.
      alternative_text: verified,
    };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      mapCustomEmojiNodes(item, alternatives, { plain }),
    ]),
  );
}

async function verifiedCustomEmojiAlternatives(richMessage) {
  const ids = [...collectCustomEmojiIds(richMessage)];
  if (!ids.length) return new Map();

  const alternatives = new Map();
  for (let offset = 0; offset < ids.length; offset += 200) {
    const chunk = ids.slice(offset, offset + 200);
    const stickers = await api.getCustomEmojiStickers({
      custom_emoji_ids: chunk,
    });

    for (const sticker of Array.isArray(stickers) ? stickers : []) {
      const id = String(sticker?.custom_emoji_id || '').trim();
      const emoji = String(sticker?.emoji || '').trim();
      if (/^[1-9][0-9]{0,19}$/.test(id) && emoji) alternatives.set(id, emoji);
    }
  }
  return alternatives;
}

function isRichEmojiInvalid(error) {
  return /RICH_MESSAGE_EMOJI_INVALID/i.test(
    String(error?.description || error?.message || error || ''),
  );
}

export async function sendRichMessageSafe(payload) {
  const original = payload?.rich_message || {};
  let verified = original;

  try {
    const alternatives = await verifiedCustomEmojiAlternatives(original);
    if (alternatives.size || collectCustomEmojiIds(original).size) {
      verified = mapCustomEmojiNodes(original, alternatives);
    }
  } catch (error) {
    // Metadata verification failure must not mutate otherwise valid content.
    // Telegram itself will still validate the outgoing rich message.
    console.warn('Could not verify custom emoji metadata before publish', error);
  }

  try {
    return await api.sendRichMessage({
      ...payload,
      rich_message: verified,
    });
  } catch (error) {
    if (!isRichEmojiInvalid(error)) throw error;

    // Last-resort compatibility path: if Telegram still rejects a custom emoji
    // (stale/deleted ID, destination permission, old cached Mini App pack),
    // keep the user's message sendable by downgrading only those custom emoji
    // to their regular alternatives instead of failing the whole publication.
    const plain = mapCustomEmojiNodes(verified, new Map(), { plain: true });
    console.warn('Telegram rejected a custom emoji; retrying with plain alternatives');
    return api.sendRichMessage({
      ...payload,
      rich_message: plain,
    });
  }
}

function richTextHasContent(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.some(richTextHasContent);
  if (typeof value !== 'object') return Boolean(String(value));
  if (String(value.type || '') === 'custom_emoji') return Boolean(value.custom_emoji_id);
  if (String(value.type || '') === 'button') return true;
  return richTextHasContent(value.text)
    || richTextHasContent(value.children)
    || Boolean(value.alternative_text);
}

function richBlockHasContent(block) {
  const type = String(block?.type || '');
  if (['divider', 'anchor', 'map', 'photo', 'video', 'animation', 'audio', 'document', 'voice_note', 'buttons'].includes(type)) {
    return true;
  }
  if (type === 'mathematical_expression') return Boolean(String(block?.expression || ''));
  if (type === 'table') {
    return Array.isArray(block?.cells) && block.cells.some(row => (
      Array.isArray(row) && row.some(cell => richTextHasContent(cell?.text))
    ));
  }
  if (type === 'list') {
    return Array.isArray(block?.items) && block.items.some(item => (
      Array.isArray(item?.blocks) && item.blocks.some(richBlockHasContent)
    ));
  }
  if (['details', 'collage', 'slideshow', 'blockquote'].includes(type)) {
    return richTextHasContent(block?.summary)
      || richTextHasContent(block?.text)
      || (Array.isArray(block?.blocks) && block.blocks.some(richBlockHasContent));
  }
  return richTextHasContent(block?.text) || richTextHasContent(block?.caption?.text);
}

async function publishBridgePageContent({
  ownerId,
  page,
  sourcePageId = null,
  kind = 'private',
  chatId = null,
}) {
  const userId = Number(ownerId);
  const id = sourcePageId == null ? null : String(sourcePageId);

  let targetChatId = userId;
  let topicOptions = {};
  if (String(kind) === 'chat') {
    const requested = Number(chatId);
    if (!Number.isSafeInteger(requested)) {
      const error = new Error('Invalid chat_id');
      error.code = 'INVALID_CHAT_ID';
      throw error;
    }
    const registered = (await listChats(userId))
      .some((item) => Number(item.chatId) === requested);
    if (!registered) {
      throw publishFailure(
        'PUBLISH_CHAT_UNAVAILABLE',
        'This chat is no longer registered for publishing.',
      );
    }

    const access = await inspectPublishAccess(requested, userId);
    if (!access.ok) {
      const failure = access.reason === 'rights'
        ? publishFailure(
            'PUBLISH_RIGHTS_MISSING',
            'Publishing permissions are missing for this chat.',
          )
        : normalizePublishError(access.error, { kind: 'chat' });
      if (shouldForgetDestination(failure.code)) {
        try { await removeUserChat(userId, requested); } catch {}
      }
      throw failure;
    }
    targetChatId = requested;
    topicOptions = await resolveForumDeliveryOptions(requested, access.chat);
  } else if (String(kind) !== 'private') {
    const error = new Error('Invalid destination kind');
    error.code = 'INVALID_DESTINATION';
    throw error;
  }

  const prepared = await prepareMessageButtons(page.buttons || []);
  const replyMarkup = prepared.length
    ? buildMessageButtonsKeyboard(prepared, {
        buttonsPerRow: Number(page.buttonsPerRow || 1),
        sourcePageId: id,
      })
    : undefined;

  const includeBranding = await shouldIncludeBranding(userId);
  let richMessage;
  try {
    richMessage = buildInputRichMessage(page.blocks || [], {
      userId,
      sourcePageId: id,
      includeBranding,
      entitlement:await getEditorEntitlement(userId),
      ...(id != null ? legacyPagePublishOptions(page, userId, await getEditorEntitlement(userId)) : {}),
    });
  } catch (error) {
    const detail = publishErrorDetail(error);
    if (/no reusable (file_id|media)/i.test(detail)) {
      throw publishFailure('PUBLISH_MEDIA_INVALID',
        'A media block has not been uploaded to Telegram. Upload or remove it before sending.', error);
    }
    if (/unsupported rich block type|block has no|missing (type|coordinates)|invalid native rich block/i.test(detail)) {
      throw publishFailure('PUBLISH_CONTENT_INVALID',
        'One of the message blocks is incomplete. Fix it before sending.', error);
    }
    throw error;
  }
  if (
    id == null
    && (!Array.isArray(richMessage?.blocks) || !richMessage.blocks.some(richBlockHasContent))
  ) {
    const error = new Error('The current editor content is empty');
    error.code = 'EMPTY_PAGE';
    throw error;
  }

  let sent;
  try {
    sent = await sendRichMessageSafe({
      chat_id: targetChatId,
      ...topicOptions,
      rich_message: richMessage,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  } catch (error) {
    const normalized = normalizePublishError(error, { kind: String(kind) });
    try {
      await recordOperation('publish', false, 1);
    } catch (statsError) {
      console.warn('Could not record failed Mini App publish stats', statsError);
    }

    if (String(kind) === 'chat' && shouldForgetDestination(normalized.code)) {
      try { await removeUserChat(userId, targetChatId); } catch {}
    }

    if (!EXPECTED_PUBLISH_FAILURES.has(String(normalized.code || ''))) {
      try {
        await logError('publish.send', error, {
          userId,
          chatId: targetChatId,
          extra: 'miniapp_b2b=1; page_id=' + String(id || 'direct')
            + '; normalized_code=' + String(normalized.code || 'PUBLISH_FAILED'),
        });
      } catch (logFailure) {
        console.warn('Could not log failed Mini App publish', logFailure);
      }
    } else {
      console.warn(
        'Mini App publish rejected with user-actionable error',
        normalized.code,
        targetChatId,
      );
    }
    throw normalized;
  }

  try {
    await recordOperation('publish', true, 1);
    await recordMarketingPublish(userId, Number(sent?.message_id) > 0 ? targetChatId + ':' + sent.message_id : null);
  } catch (statsError) {
    console.warn('Could not record successful Mini App publish stats', statsError);
  }

  return {
    chat_id: Number(targetChatId),
    message_id: Number(sent?.message_id || 0) || null,
  };
}

export async function publishSavedPageFromBridge({
  ownerId,
  pageId,
  kind = 'private',
  chatId = null,
}) {
  const userId = Number(ownerId);
  const id = String(pageId || '');
  const page = await db.select().from(richPages)
    .where(eq(richPages.pageId, id)).get();

  if (!page || Number(page.ownerId) !== userId) {
    const error = new Error('Page not found');
    error.code = 'PAGE_NOT_FOUND';
    throw error;
  }

  return publishBridgePageContent({
    ownerId: userId,
    page,
    sourcePageId: id,
    kind,
    chatId,
  });
}

export async function publishPageContentFromBridge({
  ownerId,
  blocks,
  buttons = [],
  buttonsPerRow = 1,
  kind = 'private',
  chatId = null,
}) {
  return publishBridgePageContent({
    ownerId,
    page: {
      blocks: Array.isArray(blocks) ? blocks : [],
      buttons: Array.isArray(buttons) ? buttons : [],
      buttonsPerRow: Number(buttonsPerRow || 1),
    },
    sourcePageId: null,
    kind,
    chatId,
  });
}

export async function listMiniAppDestinations(ownerId) {
  const userId = Number(ownerId);
  const destinations = [];

  let privateTitle = String(userId);
  try {
    const privateChat = await api.getChat({ chat_id: userId });
    privateTitle = String(
      privateChat?.first_name
      || privateChat?.username
      || privateChat?.title
      || userId,
    );
  } catch {}

  destinations.push({
    kind: 'private',
    chat_id: userId,
    title: privateTitle,
    type: 'private',
  });

  for (const chat of await eligible(userId)) {
    destinations.push({
      kind: 'chat',
      chat_id: Number(chat.chatId),
      title: String(chat.title || chat.chatId),
      type: String(chat.type || 'chat'),
    });
  }

  return destinations;
}
