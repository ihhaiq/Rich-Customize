import { db } from 'sdk';
import { and, eq } from 'sdk/db';
import { legacyStates } from 'schema';
import { blockId } from 'lib/editor-blocks';

const key=id=>'tutorial:v1:'+Number(id);
export async function readTutorial(userId) {
  const row=await db.select().from(legacyStates).where(eq(legacyStates.namespace,key(userId))).get();
  if(!row)return null;
  const state=row.payload;
  if(state?.version!==1 || Number(state.userId)!==Number(userId))throw new Error('TUTORIAL_STATE_VERSION');
  return {...state,storageRevision:row.updatedAt};
}
export function initialTutorial(userId,chatId,messageId) {
  return {version:1,userId:Number(userId),chatId:Number(chatId),messageId:Number(messageId),epoch:blockId().slice(0,8),revision:0,step:'home',active:true,blocks:[],undo:null,pending:null,pageId:null,pageRevision:null,pageTitle:null,events:{},lastInputId:0,createdAt:Math.floor(Date.now()/1000)};
}
export async function writeTutorial(state,previous) {
  const updatedAt=Math.max(Date.now(),Number(previous?.storageRevision||0)+1);
  const payload={...state,revision:Number(previous?.revision||0)+1};delete payload.storageRevision;
  let rows;
  if(previous)rows=await db.update(legacyStates).set({payload,updatedAt}).where(and(eq(legacyStates.namespace,key(state.userId)),eq(legacyStates.updatedAt,previous.storageRevision))).returning({namespace:legacyStates.namespace}).run();
  else rows=await db.insert(legacyStates).values({namespace:key(state.userId),payload,updatedAt}).onConflictDoNothing({target:legacyStates.namespace}).returning({namespace:legacyStates.namespace}).run();
  if(!rows?.length)throw new Error('TUTORIAL_CONFLICT');
  return {...payload,storageRevision:updatedAt};
}
