import { PLAN_LIMITS } from './subscription-policy.js';
import { subscriptionText as tx, subscriptionLocale, subscriptionRtl } from './subscription-copy.js';

const fmt = (num) => Number(num).toLocaleString('en-US');
const expiryText = (stamp) => new Date(stamp*1000).toISOString().replace('T',' ').slice(0,16)+' UTC';

export function subscriptionPlanTitle(plan,locale,gift=false) {
  if(plan==='developer') return tx(locale,'developer');
  if(plan==='free') return tx(locale,'free');
  return (plan==='plus'?'Plus':'Golden Ticket')+(gift?' · '+tx(locale,'gift'):'');
}
export function subscriptionFeatureLines(plan,locale) {
  const policy=PLAN_LIMITS[plan==='developer'?'golden':plan]||PLAN_LIMITS.free;
  const unlimited=plan==='developer';
  const val=(name)=>unlimited?'∞':fmt(policy[name]);
  const fields=[['text','text'],['blocks','blocks'],['nestingDepth','depth'],
    ['mediaAttachments','media'],['tableColumns','columns'],['pages','pages'],['emojiPacks','packs']];
  const result=fields.map(([field,label])=>val(field)+' '+tx(locale,label));
  if(plan==='plus'||plan==='golden'||plan==='developer') result.push(tx(locale,'branding'));
  if(plan==='golden'||plan==='developer') result.push(tx(locale,'early'));
  return result;
}
export function subscriptionRemaining(expiresAt,now,locale) {
  if(!Number.isSafeInteger(expiresAt)||expiresAt<=0)return tx(locale,'noExpiry');
  const seconds=Math.max(0,expiresAt-now);
  const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600);
  return days+' '+tx(locale,'days')+' · '+hours+' '+tx(locale,'hours');
}
export function buildSubscriptionRich({plan='free',gift=false,expiresAt=0,now=Math.floor(Date.now()/1000),locale='en',reminder=false}={}) {
  const language=subscriptionLocale(locale);
  const title=subscriptionPlanTitle(plan,language,gift);
  const remaining=subscriptionRemaining(expiresAt,now,language);
  const blocks=[{type:'heading',size:1,text:title}];
  if(reminder)blocks.push({type:'paragraph',text:tx(language,'warning')});
  blocks.push({
    type:'details',summary:tx(language,'benefits'),
    blocks:subscriptionFeatureLines(plan,language).map(line=>({type:'paragraph',text:line})),
  });
  blocks.push({type:'footer',text:tx(language,'remaining')+': '+remaining+
    (expiresAt>0?' · '+tx(language,'until')+': '+expiryText(expiresAt):'')});
  return {blocks,...(subscriptionRtl(language)?{is_rtl:true}:{})};
}
export function buildSubscriptionPlain(input) {
  const locale=input.locale||'en';
  return [subscriptionPlanTitle(input.plan,locale,input.gift),tx(locale,'benefits')+':',
    ...subscriptionFeatureLines(input.plan,locale),tx(locale,'remaining')+': '+
      subscriptionRemaining(input.expiresAt||0,input.now||Math.floor(Date.now()/1000),locale)
      +(input.expiresAt?' · '+tx(locale,'until')+': '+expiryText(input.expiresAt):'')].join('\n');
}
