// Shared validation for the isolated managed-bot runtime.
const encoder = new TextEncoder();
export function isSafeBotKey(key) {
  return typeof key === 'string' && /^[a-f0-9]{32,64}$/.test(key);
}
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x=encoder.encode(a), y=encoder.encode(b);
  let diff=x.length ^ y.length;
  for (let i=0; i<Math.max(x.length,y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
export function validUpdate(update) {
  return Boolean(update && typeof update === 'object' && !Array.isArray(update)
    && Number.isSafeInteger(update.update_id) && update.update_id >= 0);
}
export function responseJson(value, status=200) {
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
