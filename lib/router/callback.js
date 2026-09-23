import { withIdempotency, slidingWindowAllow, scopeForCallback } from 'lib/runtime/request_guard';
import { storageKeyForCallback } from 'lib/editor/session';
import { handleDeveloperCallback } from 'lib/router/developer';
import { handlePageCallback } from 'lib/router/pages';
import { handlePublishCallback } from 'lib/router/publish';
import { handleEditorCallback } from 'lib/router/editor';
import { handleDetailsCallback } from 'lib/router/details';
import { handleBlockCallback } from 'lib/router/blocks';
import { handleButtonCallback } from 'lib/router/buttons';
import { answerCallback } from 'lib/router/support';
import { observeUser, recordRequest, recordOperation } from 'lib/usage';

function canonicalData(raw){
  const data=String(raw??'');
  if(data.startsWith('r:cbd:'))return 'r:page:'+data.slice('r:cbd:'.length);
  if(data.startsWith('r:cbds:'))return 'r:spage:'+data.slice('r:cbds:'.length);
  return data;
}
async function allowed(callback,data){
  const rule=scopeForCallback(data);
  if(!rule)return true;
  const ok=await slidingWindowAllow({...rule,userId:Number(callback.from?.id),member:String(callback.id??Date.now())});
  if(!ok){await recordOperation('rate_limited',{success:true});await answerCallback(callback,'طلبات كثيرة بسرعة، حاول بعد لحظات.');}
  return ok;
}
export async function handleCallbackQuery(callback,ctx={}){
  const started=Date.now();
  return withIdempotency(Number(ctx?.update?.update_id),async()=>{
    let failed=false;
    try{
      if(!callback?.from)return null;
      await observeUser(callback.from);
      const data=canonicalData(callback.data);
      if(!await allowed(callback,data))return null;
      const storageKey=storageKeyForCallback(callback);
      const handlers=[
        handleDeveloperCallback,
        handlePageCallback,
        handlePublishCallback,
        handleEditorCallback,
        handleDetailsCallback,
        handleBlockCallback,
        handleButtonCallback,
      ];
      for(const handler of handlers){
        if(await handler(callback,storageKey,data))return true;
      }
      await answerCallback(callback,'الإجراء غير متوفر أو انتهت جلسته.',true);
      return false;
    }catch(error){
      failed=true;console.error('callback handler failed',callback?.data,error);
      try{await answerCallback(callback,'تعذر تنفيذ الإجراء.',true);}catch{}
      return null;
    }finally{
      await recordRequest(Date.now()-started,{failed});
    }
  });
}
