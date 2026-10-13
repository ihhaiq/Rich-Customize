import { db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { legacyStates } from 'schema';

const WEEK = 7 * 24 * 60 * 60;
const publishKey = id => 'tutorial-publish:v1:' + id;
const returnKey = id => 'tutorial-return:v1:' + id;

// Called only after a confirmed editor publish, once per operation rather than
// once per destination. Separate insert-only receipts cannot overwrite draft CAS.
export async function recordTutorialPublish(userId, deliveryKey, stamp = Math.floor(Date.now() / 1000)) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0 || !/^[-\d]+:\d+$/.test(String(deliveryKey || ''))) return false;
  const guide = await db.select().from(legacyStates)
    .where(eq(legacyStates.namespace, 'tutorial:v1:' + id)).get();
  const started = Number(guide?.payload?.events?.started);
  if (guide?.payload?.version !== 1 || Number(guide.payload.userId) !== id || !(started > 0) || stamp < started) return false;
  const receipt = { version: 1, userId: id, startedAt: started, firstPublishAt: stamp, deliveryKey: String(deliveryKey) };
  const inserted = await db.insert(legacyStates).values({
    namespace: publishKey(id), payload: receipt, updatedAt: stamp,
  }).onConflictDoNothing({ target: legacyStates.namespace }).returning({ namespace: legacyStates.namespace }).run();
  if (inserted?.length) return true;
  const first = (await db.select().from(legacyStates)
    .where(eq(legacyStates.namespace, publishKey(id))).get())?.payload;
  if (first?.version !== 1 || first.deliveryKey === receipt.deliveryKey
    || Math.floor(stamp / 86400) <= Math.floor(first.firstPublishAt / 86400)
    || stamp > first.firstPublishAt + WEEK) return false;
  const returned = await db.insert(legacyStates).values({
    namespace: returnKey(id),
    payload: { version: 1, userId: id, firstPublishAt: first.firstPublishAt, returnedAt: stamp },
    updatedAt: stamp,
  }).onConflictDoNothing({ target: legacyStates.namespace }).returning({ namespace: legacyStates.namespace }).run();
  return Boolean(returned?.length);
}

// Aggregate in the database: neither draft content nor user IDs leave this query.
// Campaign first-publish timestamps backfill only publishes after guide start.
export const TUTORIAL_FUNNEL_SQL = `
  WITH guides AS (
    SELECT json_extract(payload,'$.userId') AS user_id,
      json_extract(payload,'$.events') AS events,
      json_extract(payload,'$.events.started') AS started
    FROM legacy_states
    WHERE namespace GLOB 'tutorial:v1:[0-9]*' AND json_valid(payload)
      AND json_extract(payload,'$.version')=1
      AND namespace='tutorial:v1:' || json_extract(payload,'$.userId')
      AND json_extract(payload,'$.events.started')>0
  ), cohort AS (
    SELECT g.events,g.started,
      CASE WHEN m.source IN ('ad_a','ad_b','ad_c') THEN m.source ELSE 'direct' END AS source,
      COALESCE(json_extract(p.payload,'$.firstPublishAt'),
        CASE WHEN m.first_publish_at>=g.started THEN m.first_publish_at END) AS published,
      json_extract(r.payload,'$.returnedAt') AS returned
    FROM guides g
    LEFT JOIN marketing_campaign_attribution m ON m.user_id=g.user_id
    LEFT JOIN legacy_states p ON p.namespace='tutorial-publish:v1:' || g.user_id
    LEFT JOIN legacy_states r ON r.namespace='tutorial-return:v1:' || g.user_id
  )
  SELECT source,COUNT(*) AS started,
    SUM(CASE WHEN json_extract(events,'$.first_block')>0 THEN 1 ELSE 0 END) AS first_block,
    SUM(CASE WHEN json_extract(events,'$.template')>0 THEN 1 ELSE 0 END) AS template,
    SUM(CASE WHEN json_extract(events,'$.advice')>0 THEN 1 ELSE 0 END) AS advice,
    SUM(CASE WHEN json_extract(events,'$.advice_applied')>0 THEN 1 ELSE 0 END) AS advice_applied,
    SUM(CASE WHEN json_extract(events,'$.completed')>0 THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN json_extract(events,'$.saved')>0 THEN 1 ELSE 0 END) AS saved,
    SUM(CASE WHEN json_extract(events,'$.cbd_demo')>0 THEN 1 ELSE 0 END) AS cbd_demo,
    SUM(CASE WHEN json_extract(events,'$.editor_handoff')>0 THEN 1 ELSE 0 END) AS editor_handoff,
    SUM(CASE WHEN published>=started THEN 1 ELSE 0 END) AS published,
    SUM(CASE WHEN CAST(returned/86400 AS INTEGER)>CAST(published/86400 AS INTEGER) AND returned<=published+604800 THEN 1 ELSE 0 END) AS returned
  FROM cohort GROUP BY source
`;

export async function tutorialFunnelRows() {
  return await db.all(sql.raw(TUTORIAL_FUNNEL_SQL));
}

export function tutorialFunnelBlock(rows) {
  const stages = [
    ['started', 'بدؤوا الدليل'], ['first_block', 'أضافوا أول بلوك'],
    ['template', 'استعملوا قالباً'], ['advice', 'طلبوا رأياً'],
    ['advice_applied', 'طبّقوا الاقتراح'], ['completed', 'وصلوا للإكمال'],
    ['saved', 'حفظوا صفحة'], ['cbd_demo', 'جرّبوا CBD'],
    ['editor_handoff', 'نقلوا للمحرر'], ['published', 'نشروا بعد بدء الدليل'],
    ['returned', 'عادوا للنشر خلال 7 أيام'],
  ];
  const sources = ['ad_a', 'ad_b', 'ad_c', 'direct'];
  const count = (source, stage) => Math.max(0, Number(rows.find(row => row.source === source)?.[stage]) || 0);
  const cell = (text, header = false) => ({ text: String(text), align: 'center', ...(header ? { is_header: true } : {}) });
  return { type: 'details', summary: 'مراحل الدليل — من البداية للنشر', blocks: [
    { type: 'paragraph', text: 'كل رقم يمثل مستخدمين مختلفين وصلوا للمرحلة، مو عدد الضغطات. بعض المراحل اختيارية؛ الحفظ والمعاينة مو نشر. «مباشر» يعني بدون نسبة حملة مسجلة.' },
    { type: 'table', is_bordered: true, is_compact: true, cells: [
      ['المرحلة', 'A', 'B', 'C', 'مباشر', 'الإجمالي'].map(text => cell(text, true)),
      ...stages.map(([key, label]) => [cell(label), ...sources.map(source => cell(count(source, key))), cell(sources.reduce((sum, source) => sum + count(source, key), 0))]),
    ] },
    { type: 'footer', text: 'النشر هنا إرسال ناجح من المحرر أو التطبيق المصغّر بعد بدء الدليل. العودة تُحسب بنشر في يوم UTC لاحق خلال 7 أيام من أول نشر؛ ليست جدولة أو تجربة CBD. أرقام العودة تبدأ من تفعيل هذا التتبع، وقد تكون غير مكتملة قبل مرور 7 أيام. هذه علاقة زمنية، مو دليل أن الدليل وحده سبب النشر.' },
  ] };
}
