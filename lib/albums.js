import { readState, writeState, deleteState } from 'lib/storage/state';

const TTL_SECONDS=120;
function now(){return Math.floor(Date.now()/1000);}
function keyFor(message){
  return 'album:'+String(message?.chat?.id??0)+':'+String(message?.from?.id??0)+':'+String(message?.media_group_id??'');
}
export async function appendAlbumBlocks(message,blocks){
  if(!message?.media_group_id)return {albumId:null,blocks:[...(blocks??[])]};
  const key=keyFor(message),current=await readState(key,{updated_at:0,items:{}});
  const stamp=now();
  if(Number(current.updated_at??0)<stamp-TTL_SECONDS)current.items={};
  current.items??={};
  current.items[String(message.message_id)]={message_id:Number(message.message_id),blocks:[...(blocks??[])]};
  current.updated_at=stamp;
  await writeState(key,current);
  const ordered=Object.values(current.items).sort((a,b)=>Number(a.message_id)-Number(b.message_id)).flatMap(item=>item.blocks??[]);
  return {albumId:String(message.media_group_id),blocks:ordered};
}
export async function clearAlbum(message){
  if(message?.media_group_id)await deleteState(keyFor(message));
}
