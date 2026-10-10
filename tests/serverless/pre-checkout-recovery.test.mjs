import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../tgcloud/handlers/pre_checkout_query.js', import.meta.url), 'utf8')
  .replace(/^import .*?;\s*$/gm, '')
  .replace('export default async function', 'const handler = async function');
function makeHandler(api, branding, managed, logError) {
  return new Function('api', 'handleBrandingPreCheckout', 'handleManagedBotPreCheckout', 'logError',
    source + '\nreturn handler;')(api, branding, managed, logError);
}
const query = {id:'checkout-1',from:{id:14,language_code:'ar'},invoice_payload:'unexpected',currency:'XTR',total_amount:50};

test('unknown invoice payload is refused, never approved or left pending', async () => {
  const replies=[];
  const api={answerPreCheckoutQuery:async payload=>replies.push(payload)};
  const handler=makeHandler(api, async()=>false, async()=>false, async()=>{});
  await handler(query);
  assert.equal(replies.length,1);
  assert.equal(replies[0].ok,false);
  assert.match(replies[0].error_message,/غير معروف/);
});
test('database failure during pre-checkout produces a safe denial and diagnostic log', async () => {
  const replies=[], logs=[];
  const handler=makeHandler({answerPreCheckoutQuery:async payload=>replies.push(payload)},
    async()=>{throw new Error('DB_SECRET_DETAILS');},async()=>false,
    async(...args)=>logs.push(args));
  await handler(query,{update:{update_id:123}});
  assert.equal(replies[0].ok,false);
  assert.doesNotMatch(replies[0].error_message,/DB_SECRET_DETAILS/);
  assert.equal(logs[0][0],'payment.pre_checkout');
  assert.equal(logs[0][2].updateId,123);
});
test('successful validation is not followed by a second denial', async () => {
  const replies=[];
  const handler=makeHandler({answerPreCheckoutQuery:async payload=>replies.push(payload)},
    async()=>{replies.push({ok:true});return true;},async()=>{throw new Error('must not run');},async()=>{});
  await handler(query);
  assert.deepEqual(replies,[{ok:true}]);
});
test('when Telegram cannot deliver denial, keep the underlying failure visible', async () => {
  const handler=makeHandler({answerPreCheckoutQuery:async()=>{throw new Error('Telegram offline');}},
    async()=>{throw new Error('DB failed');},async()=>false,async()=>{});
  await assert.rejects(handler(query),/DB failed/);
});
