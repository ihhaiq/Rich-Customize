import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { editorGiftEntitlements, goldenClaims } from 'schema';
import { isDeveloper } from 'lib/developer-access';
import { getEditorSubscriptionState } from 'lib/editor-subscriptions';
import { buildSubscriptionRich, buildSubscriptionPlain } from 'lib/subscription-rich';

export async function subscriptionSnapshot(userId, now=Math.floor(Date.now()/1000)) {
  const id=Number(userId);
  if(!Number.isSafeInteger(id)||id<=0)throw new Error('Invalid subscriber identity');
  if(isDeveloper(id))return {plan:'developer',gift:false,expiresAt:0};
  const paid=await getEditorSubscriptionState(id,{now});
  const verified=paid.active?paid.plan:null;
  const manualGifts=await db.select().from(editorGiftEntitlements)
    .where(eq(editorGiftEntitlements.userId,id)).all();
  const queuedGift=manualGifts
    .filter(row=>Number(row.startedAt)>now&&Number(row.expiresAt)>Number(row.startedAt))
    .sort((a,b)=>Number(a.startedAt)-Number(b.startedAt))[0];
  const claims=await db.select().from(goldenClaims).where(eq(goldenClaims.userId,id)).all();
  const giftExpires=Math.max(0,...claims.map(row=>Number(row.expiresAt)||0));
  if(giftExpires>now) return {plan:'golden',gift:true,expiresAt:giftExpires,
    ...(queuedGift?{queuedGift:{plan:queuedGift.plan,startsAt:Number(queuedGift.startedAt),
      expiresAt:Number(queuedGift.expiresAt)}}:{}),
    underlyingPlan:verified||'free',underlyingExpiresAt:verified?Number(paid.expiresAt):0};
  if(verified)return {plan:verified,gift:false,expiresAt:Number(paid.expiresAt),
    ...(queuedGift?{queuedGift:{plan:queuedGift.plan,startsAt:Number(queuedGift.startedAt),
      expiresAt:Number(queuedGift.expiresAt)}}:{})};
  return {plan:'free',gift:false,expiresAt:0,
    ...(queuedGift?{queuedGift:{plan:queuedGift.plan,startsAt:Number(queuedGift.startedAt),
      expiresAt:Number(queuedGift.expiresAt)}}:{})};
}
export async function sendSubscriptionStatus(message,locale) {
  if(message?.chat?.type!=='private'||!message?.from?.id)return false;
  const state=await subscriptionSnapshot(message.from.id);
  const rich={...state,locale};
  try {
    await api.sendRichMessage({chat_id:message.chat.id,rich_message:buildSubscriptionRich(rich)});
  } catch(error) {
    console.warn('Subscription rich display failed; using text fallback',String(error?.message||error));
    await api.sendMessage({chat_id:message.chat.id,text:buildSubscriptionPlain(rich)});
  }
  return true;
}
