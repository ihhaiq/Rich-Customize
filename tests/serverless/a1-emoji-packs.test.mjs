import test from 'node:test';
import assert from 'node:assert/strict';
import { REGULAR_CUSTOM_EMOJI_PACK_LIMIT, claimCustomEmojiPack, customEmojiPackAccess } from '../../functions/_lib/custom-emoji-packs.js';

function mockD1(){
  const packs=new Map();
  const primary=new Map([[123,'legacyPack']]);
  const get=owner=>packs.get(owner)||new Set();
  const db={
    prepare(sql){
      let args=[];
      const statement={
        bind(...values){args=values;return statement;},
        async run(){
          if(sql.startsWith('INSERT OR IGNORE INTO miniapp_custom_emoji_packs') && sql.includes('SELECT user_id, pack_name')){
            for(const [owner,name] of primary){const found=get(owner);found.add(name);packs.set(owner,found);}
          } else if(sql.startsWith('INSERT OR IGNORE INTO miniapp_custom_emoji_packs') && sql.includes('SELECT ?, ?, ? WHERE')){
            const [owner,name,,checkOwner,limit]=args;
            assert.equal(owner,checkOwner);
            const found=get(owner);
            if(found.size<limit)found.add(name);
            packs.set(owner,found);
          } else if(sql.startsWith('INSERT OR IGNORE INTO miniapp_custom_emoji_packs') && sql.includes('VALUES')){
            const [owner,name]=args;
            const found=get(owner);found.add(name);packs.set(owner,found);
          }
          return {success:true};
        },
        async first(){
          if(sql.includes('COALESCE(MAX(sort_order)'))return {max_order:-1};
          if(sql.startsWith('SELECT pack_name FROM miniapp_custom_emoji_packs')){
            const [owner,name]=args;
            return get(owner).has(name)?{pack_name:name}:null;
          }
          return null;
        },
        async all(){
          if(sql.includes('FROM miniapp_custom_emoji_packs p')){
            return {results:[...get(args[0])].map(name=>({pack_name:name}))};
          }
          return {results:[]};
        },
      };
      return statement;
    },
  };
  return {DB:db};
}

test('free quota is two, old primary pack is retained, and a third is rejected',async()=>{
  assert.equal(REGULAR_CUSTOM_EMOJI_PACK_LIMIT,2);
  const env=mockD1();
  const before=await customEmojiPackAccess(env,123);
  assert.deepEqual(before.packNames,['legacyPack']);
  const after=await claimCustomEmojiPack(env,123,'newPack');
  assert.deepEqual(after.packNames,['legacyPack','newPack']);
  await assert.rejects(
    ()=>claimCustomEmojiPack(env,123,'thirdPack'),
    error=>error?.status===403&&error?.message==='custom_emoji_pack_limit'
  );
  const again=await claimCustomEmojiPack(env,123,'legacyPack');
  assert.equal(again.packCount,2);
});

test('pack quota is safe under simultaneous insert attempts',async()=>{
  const env=mockD1();
  const outcome=await Promise.allSettled([
    claimCustomEmojiPack(env,456,'alpha'),
    claimCustomEmojiPack(env,456,'beta'),
    claimCustomEmojiPack(env,456,'gamma'),
  ]);
  assert.equal(outcome.filter(x=>x.status==='fulfilled').length,2);
  assert.equal(outcome.filter(x=>x.status==='rejected').length,1);
  assert.equal((await customEmojiPackAccess(env,456)).packCount,2);
});

test('unlimited developer contract stays separate from free customer quota',async()=>{
  const env=mockD1();
  for(let i=0;i<5;i++)await claimCustomEmojiPack(env,789,'dev'+i,{unlimited:true});
  const access=await customEmojiPackAccess(env,789,{unlimited:true});
  assert.equal(access.unlimited,true);
  assert.equal(access.packCount,5);
  assert.equal(access.limit,null);
});
