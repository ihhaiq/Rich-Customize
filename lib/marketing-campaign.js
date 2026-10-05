import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { marketingCampaignAttribution } from 'schema';
import { isDeveloper } from 'lib/developer-access';

const SOURCES = new Set(['ad_a', 'ad_b', 'ad_c']);

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function normalizeMarketingSource(value) {
  const source = String(value || '').trim().toLowerCase();
  return SOURCES.has(source) ? source : '';
}

export async function recordMarketingStart(userId, source) {
  const id = Number(userId);
  const normalized = normalizeMarketingSource(source);
  if (!Number.isSafeInteger(id) || !normalized) return false;

  const stamp = nowSeconds();
  await db.insert(marketingCampaignAttribution).values({
    userId: id,
    source: normalized,
    attributedAt: stamp,
    firstPublishAt: null,
    updatedAt: stamp,
  }).onConflictDoNothing({
    target: marketingCampaignAttribution.userId,
  }).run();
  return true;
}

export async function recordMarketingPublish(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id)) return false;

  const row = await db.select().from(marketingCampaignAttribution)
    .where(eq(marketingCampaignAttribution.userId, id))
    .get();
  if (!row || row.firstPublishAt) return false;

  const stamp = nowSeconds();
  await db.update(marketingCampaignAttribution).set({
    firstPublishAt: stamp,
    updatedAt: stamp,
  }).where(eq(marketingCampaignAttribution.userId, id)).run();
  return true;
}

function landingCopy(source) {
  if (source === 'ad_a') {
    return {
      heading: 'تعرف شلون تنعمل هاي الرسائل؟',
      body: [
        'سوِّ منشورات Telegram أغنى من النص والصورة العادية.',
        '',
        'عناوين، تفاصيل، جداول، قوائم، أزرار وإيموجي بريميوم — من محرر واحد.',
      ].join('\n'),
    };
  }
  if (source === 'ad_b') {
    return {
      heading: 'Rich Messages بدون برمجة',
      body: [
        'ابنِ رسالة Telegram غنية كاملة من المحرر، بدون كتابة كود.',
        '',
        'رتب البلوكات، عاين النتيجة، وبعدها انشرها مباشرة لقناتك أو مجموعتك.',
      ].join('\n'),
    };
  }
  return {
    heading: 'غيّر شكل منشورات قناتك',
    body: [
      'الرسالة التي أمامك مثال على النتيجة التي يقدر Rich Customize يصنعها.',
      '',
      'عناوين + تفاصيل + جداول + قوائم + أزرار + Premium Emoji، وكلها من داخل Telegram.',
    ].join('\n'),
  };
}

export async function sendMarketingLanding(message, source) {
  const normalized = normalizeMarketingSource(source);
  if (!normalized || !message?.chat?.id || !message?.from?.id) return false;

  await recordMarketingStart(message.from.id, normalized);
  const copy = landingCopy(normalized);

  await api.sendRichMessage({
    chat_id: message.chat.id,
    rich_message: {
      is_rtl: true,
      blocks: [
        { type: 'heading', size: 2, text: copy.heading },
        { type: 'paragraph', text: copy.body },
        { type: 'divider' },
        { type: 'footer', text: 'جرّب النتيجة بنفسك من @RichCustomizebot' },
      ],
    },
    reply_markup: {
      inline_keyboard: [
        [{
          text: 'ابدأ المحرر',
          callback_data: 'r:starteditor',
          style: 'primary',
        }],
        [{
          text: 'شاهد أمثلة',
          callback_data: 'r:showcase',
        }],
      ],
    },
  });
  return true;
}


export async function sendMarketingCampaignSummary(message) {
  if (!message?.chat?.id || !isDeveloper(message?.from?.id)) return false;

  const rows = await db.select().from(marketingCampaignAttribution).all();
  const stats = Object.fromEntries([...SOURCES].map((source) => [
    source,
    { attributed: 0, published: 0 },
  ]));

  for (const row of rows) {
    const source = normalizeMarketingSource(row?.source);
    if (!source) continue;
    stats[source].attributed += 1;
    if (row?.firstPublishAt) stats[source].published += 1;
  }

  const lines = ['📊 نتائج حملات Rich Customize', ''];
  for (const source of ['ad_a', 'ad_b', 'ad_c']) {
    const item = stats[source];
    const rate = item.attributed
      ? Math.round((item.published / item.attributed) * 1000) / 10
      : 0;
    lines.push(
      source.toUpperCase()
      + ': دخول ' + item.attributed
      + ' | أول نشر ' + item.published
      + ' | التحويل ' + rate + '%',
    );
  }

  await api.sendMessage({
    chat_id: message.chat.id,
    text: lines.join('\n'),
  });
  return true;
}
