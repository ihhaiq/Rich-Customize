import { api, db } from 'sdk';
import { richPages, richFsm, richState } from 'schema';
import { isDeveloper } from 'lib/config';
import { loadSession, patchSession, STATE } from 'lib/editor/session';
import { answerCallback } from 'lib/router/support';
import { developerKeyboard } from 'lib/ui/keyboards';
import { buildDataExport, applyDataImport } from 'lib/data_backup';
import { usageSnapshot, topUsers } from 'lib/usage';
import { pageStatistics, countPagesForUser } from 'lib/storage/pages';
import { refreshShowcase } from 'lib/showcase';

async function panel(callback,text,extraButtons=[]){
  const blocks=[{type:'paragraph',text},{type:'buttons',buttons:[
    {text:'فحص قاعدة البيانات',callback_data:'dev:database:check',style:'primary'},
    {text:'تحديث قناة المعاينة',callback_data:'dev:showcase:refresh',style:'primary'},
    {text:'بيانات / إحصائيات',callback_data:'dev:stats',style:'primary'},
    {text:'إنشاء Snapshot الآن',callback_data:'dev:snapshot',style:'primary'},
  ],align:'center'}];
  if(extraButtons.length)blocks.push({type:'buttons',buttons:extraButtons,align:'center'});
  return api.sendRichMessage({chat_id:callback.message?.chat?.id??callback.from.id,rich_message:{blocks},reply_markup:developerKeyboard()});
}
function timeText(value){return value?new Date(Number(value)*1000).toISOString().replace('T',' ').slice(0,16)+' UTC':'—';}
function userLabel(user){return user.username?'@'+user.username:[user.first_name,user.last_name].filter(Boolean).join(' ')||String(user.user_id??'—');}
async function userStatsPage(callback,page){
  const all=await topUsers(10000);
  all.sort((a,b)=>Number(b.last_seen??0)-Number(a.last_seen??0));
  const size=10,maxPage=Math.max(0,Math.ceil(all.length/size)-1),index=Math.min(Math.max(0,page),maxPage),users=all.slice(index*size,(index+1)*size);
  const lines=['👥 إحصائيات المستخدمين','المستخدمون: '+all.length,'الصفحة: '+(index+1)+'/'+(maxPage+1),''];
  for(let i=0;i<users.length;i++){
    const user=users[i],pages=await countPagesForUser(user.user_id);
    lines.push((index*size+i+1)+') '+userLabel(user),'ID: '+user.user_id,'التفاعلات: '+Number(user.events??0)+' | الصفحات: '+pages,'اللغة: '+String(user.language_code??'—'),'أول ظهور: '+timeText(user.first_seen),'آخر ظهور: '+timeText(user.last_seen),'');
  }
  if(!users.length)lines.push('لا توجد بيانات مستخدمين بعد.');
  const buttons=[];
  if(index>0)buttons.push({text:'⬅️ السابق',callback_data:'dev:stats:users:'+(index-1),style:'primary'});
  buttons.push({text:'📊 الملخص',callback_data:'dev:stats',style:'primary'});
  if(index<maxPage)buttons.push({text:'التالي ➡️',callback_data:'dev:stats:users:'+(index+1),style:'primary'});
  return panel(callback,lines.join('\n'),buttons);
}

export async function handleDeveloperCallback(callback,storageKey,data){
  if(!data.startsWith('dev:'))return false;
  if(!await isDeveloper(callback.from?.id)){await answerCallback(callback,'هذا الخيار للمطوّر فقط.',true);return true;}

  if(data==='dev:export'){
    await answerCallback(callback,'جاري تجهيز ملف التصدير…');
    try{
      const exported=await buildDataExport();
      await api.sendDocument({
        chat_id:callback.message?.chat?.id??callback.from.id,
        document:exported.input_file,
        caption:'✅ تم تصدير بيانات Serverless بنجاح.\nالحجم: '+exported.source_size.toLocaleString()+' بايت\n\nاحتفظ بالملف في مكان آمن.',
      });
    }catch(error){console.error('developer export failed',error);await api.sendMessage({chat_id:callback.from.id,text:'تعذر تصدير البيانات.'});}
    return true;
  }
  if(data==='dev:import'){
    await patchSession(storageKey,{pending_import:null},{state:STATE.DEV_WAITING_IMPORT});
    await api.sendMessage({chat_id:callback.message?.chat?.id??callback.from.id,text:'📤 أرسل الآن ملف JSON الذي تم تصديره من نسخة Serverless.\nالحد الأقصى: 20MB.'});
    await answerCallback(callback);return true;
  }
  if(data==='dev:import:confirm'){
    const session=await loadSession(storageKey),pending=session.data.pending_import;
    if(!pending){await patchSession(storageKey,{pending_import:null},{state:STATE.MANAGING});await answerCallback(callback,'انتهت صلاحية الملف؛ ارفعه مجددًا.',true);return true;}
    await answerCallback(callback,'جاري استيراد البيانات…');
    try{
      const imported=await applyDataImport(pending);
      await patchSession(storageKey,{pending_import:null},{state:STATE.MANAGING});
      await panel(callback,'✅ تم استيراد البيانات بنجاح.\nالجداول: '+imported.join('، '));
    }catch(error){console.error('developer import failed',error);await api.sendMessage({chat_id:callback.from.id,text:'تعذر استيراد البيانات: '+String(error?.message??error)});}
    return true;
  }
  if(data==='dev:import:cancel'){
    await patchSession(storageKey,{pending_import:null},{state:STATE.MANAGING});
    await panel(callback,'تم إلغاء الاستيراد.');await answerCallback(callback);return true;
  }
  if(data==='dev:stats'){
    await answerCallback(callback);
    const [usage,pages,fsmCount,stateCount]=await Promise.all([
      usageSnapshot(),pageStatistics(),db.$count(richFsm),db.$count(richState),
    ]);
    const languages=Object.entries(usage.languages??{}).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,5).map(([k,v])=>k+': '+v).join('، ')||'—';
    const text=[
      '📊 بيانات / إحصائيات','','👥 المستخدمون',
      'الإجمالي المعروف: '+usage.tracked_users,
      'نشطون آخر ساعة: '+usage.active_1h,
      'نشطون آخر 24 ساعة: '+usage.active_24h,
      'نشطون آخر 7 أيام: '+usage.active_7d,
      'نشطون آخر 30 يوم: '+usage.active_30d,
      'جدد آخر 24 ساعة: '+usage.new_24h,
      'جدد آخر 7 أيام: '+usage.new_7d,
      'أكثر اللغات: '+languages,
      'إجمالي التفاعلات: '+usage.events,'',
      '🗄 Telegram Serverless DB',
      'الحالة: SQLite مدمجة',
      'FSM sessions: '+fsmCount,
      'State namespaces: '+stateCount,
      'الصفحات المحفوظة: '+pages.pages,
      'مستخدمون لديهم صفحات: '+pages.page_owners,
      'أقدم بيانات: '+timeText(usage.oldest_seen??pages.oldest_page),
    ].join('\n');
    await panel(callback,text,[{text:'👥 إحصائيات المستخدمين',callback_data:'dev:stats:users:0',style:'primary'},{text:'🔄 تحديث',callback_data:'dev:stats',style:'primary'}]);
    return true;
  }
  if(data.startsWith('dev:stats:users:')){
    const page=Math.max(0,Number.parseInt(data.split(':').at(-1),10)||0);
    await answerCallback(callback);await userStatsPage(callback,page);return true;
  }
  if(data==='dev:snapshot'){
    await answerCallback(callback,'جاري إنشاء النسخة…');
    const exported=await buildDataExport();
    await api.sendDocument({chat_id:callback.from.id,document:exported.input_file,caption:'✅ Snapshot Serverless جاهز.'});
    return true;
  }
  if(data==='dev:database:check'){
    await answerCallback(callback,'جاري فحص قاعدة البيانات…');
    try{
      const [pages,fsm,state]=await Promise.all([db.$count(richPages),db.$count(richFsm),db.$count(richState)]);
      await panel(callback,'✅ قاعدة Telegram Serverless متصلة.\n\nالوضع: SQLite مدمجة\nالصفحات: '+pages+'\nFSM: '+fsm+'\nState namespaces: '+state);
    }catch(error){console.error('db check failed',error);await panel(callback,'❌ تعذر الوصول إلى قاعدة Telegram Serverless: '+String(error?.message??error));}
    return true;
  }
  if(data==='dev:showcase:refresh'){
    await answerCallback(callback,'جاري تحديث قناة المعاينة…');
    try{
      const result=await refreshShowcase(callback.from.id);
      await panel(callback,'✅ تم تحديث قناة المعاينة.\n\nالعناصر قبل الفحص: '+result.total+'\nالحالي: '+result.retained+'\nالمحذوف: '+result.removed+'\nتعذر التحقق من: '+result.failed_checks);
    }catch(error){console.error('showcase refresh failed',error);await panel(callback,'❌ تعذر تحديث قناة المعاينة.');}
    return true;
  }
  await answerCallback(callback,'خيار مطوّر غير معروف.',true);return true;
}
