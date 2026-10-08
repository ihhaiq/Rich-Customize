import { safeEqual } from './managed-bots.js';
import { fail } from './managed-bot-service.js';
// This is a server-to-server entitlement adapter, NOT a payment processor.
// Keep disabled until the billing source verifies successful_payment/refunds and reconciles Stars.
export async function acceptLicenseEvent(request,env) {
 if(env.MANAGED_BOTS_LICENSE_PROVIDER_ENABLED!=='true'||String(env.MANAGED_BOTS_LICENSE_KEY||'').length<32)fail('license_provider_disabled',503);
 const raw=await request.text();if(raw.length>8192)fail('too_large',413);
 const timestamp=request.headers.get('X-Managed-Timestamp')||'';
 if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000)fail('unauthorized',401);
 const enc=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',enc.encode(env.MANAGED_BOTS_LICENSE_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const hex=v=>[...new Uint8Array(v)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const signature=hex(await crypto.subtle.sign('HMAC',key,enc.encode(timestamp+'.'+raw)));
 if(!safeEqual(signature,request.headers.get('X-Managed-Signature')||''))fail('unauthorized',401);
 let event;try{event=JSON.parse(raw);}catch{fail('invalid_event');}
 const {event_id,license_id,owner_id,status,expires_at,version}=event;
 if(typeof event_id!=='string'||typeof license_id!=='string'||!Number.isSafeInteger(Number(owner_id))||Number(owner_id)<=0||!/^[a-zA-Z0-9_-]{8,100}$/.test(event_id)||!/^[a-zA-Z0-9_-]{8,100}$/.test(license_id)||!/^\d{1,16}$/.test(String(owner_id))||!['active','cancelled','expired'].includes(status)||!Number.isSafeInteger(expires_at)||!Number.isSafeInteger(version)||version<1)fail('invalid_event');
 const digest=hex(await crypto.subtle.digest('SHA-256',enc.encode(raw)));
 const old=await env.DB.prepare('SELECT digest FROM managed_license_events WHERE event_id=?').bind(event_id).first();
 if(old){if(old.digest!==digest)fail('event_conflict',409);return {ok:true,duplicate:true};}
 const existing=await env.DB.prepare('SELECT owner_id,version FROM managed_bot_licenses WHERE id=?').bind(license_id).first();
 if(existing&&existing.owner_id!==String(owner_id))fail('license_owner_conflict',409);
 // Event insert + version-guarded update are atomic; event replay cannot extend a license twice.
 try{await env.DB.batch([
 env.DB.prepare('INSERT INTO managed_license_events(event_id,license_id,version,digest,received_at) VALUES(?,?,?,?,?)').bind(event_id,license_id,version,digest,Date.now()),
 env.DB.prepare(`INSERT INTO managed_bot_licenses(id,owner_id,status,expires_at,version,source_event,updated_at) VALUES(?,?,?,?,?,?,?)
 ON CONFLICT(id) DO UPDATE SET status=excluded.status,expires_at=excluded.expires_at,version=excluded.version,source_event=excluded.source_event,updated_at=excluded.updated_at
 WHERE managed_bot_licenses.version<excluded.version AND managed_bot_licenses.owner_id=excluded.owner_id`).bind(license_id,String(owner_id),status,expires_at,version,event_id,Date.now()),
 env.DB.prepare(`UPDATE managed_bots SET status='suspended',last_error='license_expired' WHERE license_id=? AND status='active' AND NOT EXISTS(SELECT 1 FROM managed_bot_licenses l WHERE l.id=managed_bots.license_id AND l.owner_id=managed_bots.owner_id AND l.status='active' AND l.expires_at>?)`).bind(license_id,Date.now())
 ]);}catch{fail('event_conflict',409);}
 return {ok:true};
}

export async function syncLicenseRows(env, ownerId, rows) {
 const owner=String(ownerId||'');
 if(!/^\d{1,16}$/.test(owner)) fail('invalid_event');
 if(!Array.isArray(rows)||rows.length>50) fail('invalid_event');
 const statements=[];
 for(const row of rows){
  const licenseId=String(row?.id||'');
  const status=String(row?.status||'');
  const expiresAt=Number(row?.expires_at);
  const version=Number(row?.version||1);
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(licenseId)||!['active','cancelled','expired'].includes(status)
   ||!Number.isSafeInteger(expiresAt)||!Number.isSafeInteger(version)||version<1)fail('invalid_event');
  const eventId=`bridge_${licenseId}_${version}`;
  const digest=`bridge:${owner}:${licenseId}:${status}:${expiresAt}:${version}`;
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO managed_license_events(event_id,license_id,version,digest,received_at) VALUES(?,?,?,?,?)')
   .bind(eventId,licenseId,version,digest,Date.now()));
  statements.push(env.DB.prepare(`INSERT INTO managed_bot_licenses(id,owner_id,status,expires_at,version,source_event,updated_at) VALUES(?,?,?,?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET status=excluded.status,expires_at=excluded.expires_at,version=excluded.version,source_event=excluded.source_event,updated_at=excluded.updated_at
   WHERE managed_bot_licenses.version<excluded.version AND managed_bot_licenses.owner_id=excluded.owner_id`)
   .bind(licenseId,owner,status,expiresAt,version,eventId,Date.now()));
 }
 if(statements.length) await env.DB.batch(statements);
 return {ok:true,synced:rows.length};
}
