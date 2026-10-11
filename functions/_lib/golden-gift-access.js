// Advisory mirror populated ONLY by the authenticated RCB1 document response.
// Browser flags never grant access. Serverless independently checks every save.
async function schema(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS golden_gift_access (user_id INTEGER PRIMARY KEY, expires_at INTEGER NOT NULL)').run();
}
export async function storeGoldenGiftAccess(env,userId,gift) {
  const expiry=Number(gift?.expires_at);
  if(!Number.isSafeInteger(expiry)||expiry<=0) return;
  await schema(env.DB);
  await env.DB.prepare('INSERT INTO golden_gift_access(user_id,expires_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET expires_at=MAX(expires_at,excluded.expires_at)').bind(Number(userId),expiry).run();
}
export async function goldenGiftAccess(env,userId,now=Math.floor(Date.now()/1000)) {
  try {
    const row=await env.DB.prepare('SELECT expires_at FROM golden_gift_access WHERE user_id=?').bind(Number(userId)).first();
    const expires=Number(row?.expires_at)||0;
    return {Golden_ticket:expires>now,expires_at:expires,remaining_seconds:Math.max(0,expires-now)};
  } catch { return {Golden_ticket:false,expires_at:0,remaining_seconds:0}; }
}
