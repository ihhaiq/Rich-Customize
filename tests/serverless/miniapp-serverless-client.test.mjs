import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../app/miniapp_static/miniapp_serverless_api.js',import.meta.url),'utf8');

function loadClient(hostname='app8416656269.tgcloud.ai',{endpointResult,fetchResult}={}){
  const calls=[];
  const requests=[];
  const window={
    Telegram:{WebApp:{Serverless:{call(name,input,callback){calls.push({name,input});callback(null,endpointResult?endpointResult(input):{ok:true,pages:[]})}}}},
    crypto:{randomUUID:()=>'12345678-1234-1234-1234-123456789012'},
    fetch:async(input,init)=>{requests.push({input,init});return fetchResult?fetchResult(input,init):new Response('{}',{headers:{'content-type':'application/json'}})},
  };
  vm.runInNewContext(source,{window,location:{hostname,origin:`https://${hostname}`},URL,Request,Response,Headers,atob});
  return {window,calls,requests};
}

test('Serverless host routes page bootstrap and mutations through the verified endpoint',async()=>{
  const {window,calls}=loadClient();

  await window.fetch('/miniapp/api/session',{method:'POST',body:'{}'});
  await window.fetch('/miniapp/api/me');
  await window.fetch('/miniapp/api/pages',{
    method:'POST',
    body:JSON.stringify({title:'Example',blocks:[],buttons:[]}),
  });
  await window.fetch('/miniapp/api/pages/page_123',{
    method:'PUT',
    body:JSON.stringify({title:'Renamed',base_revision:2,blocks:[],buttons:[]}),
  });
  await window.fetch('/miniapp/api/pages/page_123?base_revision=2&base_updated_at=10',{method:'DELETE'});

  assert.deepEqual(calls.map(call=>call.name),'miniapp miniapp miniapp miniapp miniapp'.split(' '));
  assert.equal(calls[0].input.action,'pages');
  assert.equal(calls[1].input.action,'me');
  assert.equal(calls[2].input.action,'create');
  assert.equal(calls[2].input.title,'Example');
  assert.match(calls[2].input.request_id,/^web_[A-Za-z0-9]+$/);
  assert.equal(calls[3].input.action,'save');
  assert.equal(calls[3].input.page_id,'page_123');
  assert.equal(calls[3].input.base_revision,2);
  assert.equal(calls[4].input.action,'delete');
  assert.equal(calls[4].input.base_revision,2);
  assert.equal(calls[4].input.base_updated_at,10);
});

test('custom emoji pack APIs and previews route through the verified Serverless endpoint',async()=>{
  const serverlessClient=loadClient();
  await serverlessClient.window.fetch('/miniapp/api/custom-emoji/packs');
  await serverlessClient.window.fetch('/miniapp/api/custom-emoji/pack?set=pack_name');
  await serverlessClient.window.fetch('/miniapp/api/custom-emoji/pack',{
    method:'POST',
    body:JSON.stringify({set:'pack_name'}),
  });
  await serverlessClient.window.fetch('/miniapp/api/custom-emoji/packs',{
    method:'PUT',
    body:JSON.stringify({action:'reorder',names:['pack_name']}),
  });
  await serverlessClient.window.fetch('/miniapp/api/custom-emoji/packs',{
    method:'DELETE',
    body:JSON.stringify({name:'pack_name'}),
  });
  await serverlessClient.window.fetch('/miniapp/api/custom-emoji/12345');
  assert.deepEqual(serverlessClient.calls.map(call=>call.input.action),[
    'custom_emoji_packs',
    'custom_emoji_pack_read',
    'custom_emoji_pack',
    'custom_emoji_manage',
    'custom_emoji_manage',
    'custom_emoji_preview',
  ]);
  assert.equal(serverlessClient.requests.length,0);

  const cloudflareClient=loadClient('rich-customize.pages.dev');
  await cloudflareClient.window.fetch('/miniapp/api/custom-emoji/packs');
  assert.equal(cloudflareClient.calls.length,0);
  assert.equal(cloudflareClient.requests[0].input,'/miniapp/api/custom-emoji/packs');
});

test('custom emoji preview response is reconstructed as a bounded image response',async()=>{
  const client=loadClient('app8416656269.tgcloud.ai',{
    endpointResult:input=>input.action==='custom_emoji_preview'
      ? {ok:true,content_type:'image/png',data_base64:'iVBORw=='}
      : {ok:true},
  });
  const response=await client.window.fetch('/miniapp/api/custom-emoji/12345');
  assert.equal(response.headers.get('content-type'),'image/png');
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())),[0x89,0x50,0x4e,0x47]);
});

test('legacy emoji pack names are imported once into Serverless-owned state',async()=>{
  const calls=[];
  const client=loadClient('app8416656269.tgcloud.ai',{
    endpointResult(input){
      calls.push(input);
      if(input.action==='custom_emoji_packs') {
        return {ok:true,access:{migration_required:true,custom_emoji_packs:[]}};
      }
      return {ok:true,access:{migration_required:false,custom_emoji_packs:['existing_pack']}};
    },
    fetchResult:async(input,init)=>{
      if(String(input).startsWith('https://rich-customize.pages.dev/')) {
        assert.equal(new Headers(init.headers).get('X-Telegram-Init-Data'),'signed-data');
        return new Response(JSON.stringify({
          ok:true,
          access:{custom_emoji_packs:['existing_pack'],custom_emoji_pinned_pack:'existing_pack'},
        }),{headers:{'content-type':'application/json'}});
      }
      return new Response('{}',{headers:{'content-type':'application/json'}});
    },
  });
  const response=await client.window.fetch('/miniapp/api/custom-emoji/packs',{
    headers:{'X-Telegram-Init-Data':'signed-data'},
  });
  const data=await response.json();
  assert.equal(data.access.migration_required,false);
  assert.deepEqual(calls.map(call=>call.action),['custom_emoji_packs','custom_emoji_import']);
  assert.equal(calls[1].pinned_pack,'existing_pack');
  assert.equal(client.requests.length,1);
});

test('Cloudflare fallback APIs allow CORS only from this bot Serverless origin',async()=>{
  const middlewareSource=readFileSync(new URL('../../functions/_middleware.js',import.meta.url),'utf8');
  const context=vm.createContext({URL,Response,Headers});
  const middleware=new vm.SourceTextModule(middlewareSource,{context});
  await middleware.link(specifier=>{
    assert.equal(specifier,'./_lib/web-session.js');
    return new vm.SyntheticModule(['requestMiniAppSession'],function(){
      this.setExport('requestMiniAppSession',async()=>true);
    },{context});
  });
  await middleware.evaluate();
  const onRequest=middleware.namespace.onRequest;
  const allowedOrigin='https://app8416656269.tgcloud.ai';
  let continued=false;
  const preflight=await onRequest({
    request:new Request('https://rich-customize.pages.dev/miniapp/api/custom-emoji/packs',{
      method:'OPTIONS',
      headers:{Origin:allowedOrigin},
    }),
    env:{},
    next:async()=>{continued=true;return new Response('unexpected')},
  });
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),allowedOrigin);
  assert.equal(continued,false);

  const denied=await onRequest({
    request:new Request('https://rich-customize.pages.dev/miniapp/api/custom-emoji/packs',{
      method:'OPTIONS',
      headers:{Origin:'https://example.com'},
    }),
    env:{},
    next:async()=>new Response('no CORS'),
  });
  assert.equal(denied.status,200);
  assert.equal(denied.headers.get('access-control-allow-origin'),null);
});
