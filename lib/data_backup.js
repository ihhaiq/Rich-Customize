import { db, InputFile } from 'sdk';
import { richPages, richState, botSettings } from 'schema';
import { DataImportError } from 'lib/errors';

const VERSION='rich-customize-serverless-backup-v1';
function bytes(text){return new TextEncoder().encode(text);}
export async function buildDataExport(){
  const [pages,state,settings]=await Promise.all([db.select().from(richPages).all(),db.select().from(richState).all(),db.select().from(botSettings).all()]);
  const payload={format:VERSION,created_at:new Date().toISOString(),pages,state,settings};
  const content=JSON.stringify(payload,null,2);
  return {filename:'rich_customize_backup_'+new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z.json',content:bytes(content),file_count:3,source_size:bytes(content).byteLength,input_file:new InputFile(bytes(content),'rich_customize_backup.json')};
}
export function prepareDataImport(filename,payload){
  const raw=payload instanceof Uint8Array?new TextDecoder().decode(payload):String(payload??'');
  if(!raw)throw new DataImportError('الملف فارغ.');
  if(new TextEncoder().encode(raw).byteLength>20*1024*1024)throw new DataImportError('حجم الملف أكبر من الحد المسموح وهو 20MB.');
  let value;try{value=JSON.parse(raw);}catch{throw new DataImportError('ملف JSON غير صالح.');}
  if(value?.format!==VERSION)throw new DataImportError('صيغة النسخة الاحتياطية غير مدعومة.');
  return value;
}
export async function applyDataImport(value){
  if(!value||value.format!==VERSION)throw new DataImportError('بيانات الاستيراد غير صالحة.');
  for(const row of value.pages??[])await db.insert(richPages).values(row).onConflictDoUpdate({target:richPages.pageId,set:row}).run();
  for(const row of value.state??[])await db.insert(richState).values(row).onConflictDoUpdate({target:richState.namespace,set:row}).run();
  for(const row of value.settings??[])await db.insert(botSettings).values(row).onConflictDoUpdate({target:botSettings.key,set:row}).run();
  return ['rich_pages','rich_state','bot_settings'];
}
