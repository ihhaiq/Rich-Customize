import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = new URL('../../app/miniapp_static/', import.meta.url);
const offersSource = readFileSync(new URL('subscription_offers.js', root), 'utf8');

class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this.handlers = {};
    this.isConnected = true;
  }
  append(...items) { this.children.push(...items); }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener(event, handler) { this.handlers[event] = handler; }
  remove() { this.isConnected = false; }
  focus() {}
}
function loadOffers(language = 'ar') {
  const body = new Node('body');
  const document = {
    body,
    activeElement: null,
    createElement: tag => new Node(tag),
    addEventListener() {},
    removeEventListener() {},
  };
  const links = [];
  const window = {
    MiniAppI18n: { language },
    Telegram: { WebApp: { openTelegramLink(url) { links.push(url); } } },
    location: { href: '' },
  };
  runInNewContext(offersSource, { window, document, Intl });
  return { api:window.RichSubscriptionOffers, body, links };
}
function walk(node, fn) {
  if (fn(node)) return node;
  for (const child of node.children || []) {
    const result = walk(child,fn);
    if (result) return result;
  }
  return null;
}

test('quota offers recognize text, emoji packs and generic limits only', () => {
  const {api} = loadOffers();
  assert.equal(api.quotaKind({ message:'editor limit exceeded: characters (20001/20000)' }), 'text');
  assert.equal(api.quotaKind({ code:'EDITOR_LIMIT_CHARACTERS' }), 'text');
  assert.equal(api.quotaKind({ code:'custom_emoji_pack_limit' }), 'emojiPacks');
  assert.equal(api.quotaKind({ code:'PAGE_LIMIT' }), 'other');
  assert.equal(api.quotaKind({ message:'EDITOR_LIMIT:blocks:31:30' }), 'other');
  assert.equal(api.quotaKind({ code:'PAGE_CONFLICT' }), null);
  assert.equal(api.quotaKind({ message:'invalid user token' }), null);
});

test('text limit opens factual comparison and specific donation-bot deep link', () => {
  const {api,body,links} = loadOffers('ar');
  assert.equal(api.showForError({message:'editor limit exceeded: characters (20001/20000)'}),true);
  const dialog = walk(body,node=>node.attrs['role']==='dialog');
  assert.ok(dialog);
  assert.equal(dialog.attrs['aria-modal'],'true');
  const anchor = walk(dialog,node=>node.tag==='a');
  assert.equal(anchor.href,'https://t.me/richDonateBot?start=rich_plans_text');
  const planContent = [];
  (function visit(node){if(node.textContent)planContent.push(node.textContent);for(const c of node.children||[])visit(c)})(dialog);
  const text=planContent.join(' ');
  assert.match(text,/Plus/);
  assert.match(text,/Golden Ticket/);
  assert.match(text,/قيد التجهيز/);
  assert.match(text,/مو متاحتين للبيع/);
  // All owner-approved plan benefits are shown, but not sold before billing.
  assert.match(text,/الصفحات المحفوظة/);
  assert.match(text,/البلوكات/);
  assert.match(text,/سجل نسخ الصفحة/);
  assert.match(text,/الوصول المبكر/);
  assert.match(text,/إزالة الحقوق/);
  assert.match(text,/آخر ٥ نسخ/);
  assert.match(text,/آخر ٢٠ نسخة/);
  assert.match(text,/عند التفعيل/);
  assert.match(text,/فكرة مستقبلية غير معتمدة/);
  assert.match(text,/١٥٠ نجمة/);
  assert.match(text,/٣٥٠ نجمة/);
  assert.doesNotMatch(text,/القوالب المحفوظة/);
  let prevented = false;
  anchor.handlers.click({preventDefault(){prevented = true;}});
  assert.equal(prevented,true);
  assert.deepEqual(links,['https://t.me/richDonateBot?start=rich_plans_text']);
});

test('emoji quota opens pack-specific deep link; other errors do not upsell', () => {
  const {api,body}=loadOffers('en');
  assert.equal(api.showForError({message:'network error'}),false);
  assert.equal(body.children.length,0);
  assert.equal(api.show('emojiPacks',{actual:2,limit:2}),true);
  const anchor=walk(body,node=>node.tag==='a');
  assert.equal(anchor.href,'https://t.me/richDonateBot?start=rich_plans_emoji');
  assert.equal(api.linkFor('other'),'https://t.me/richDonateBot?start=rich_plans_limits');
});
