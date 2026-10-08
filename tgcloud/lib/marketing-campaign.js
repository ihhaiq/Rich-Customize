import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { marketingCampaignAttribution } from 'schema';
import { isDeveloper } from 'lib/developer-access';
import { isRtlLocale, resolveUserLanguage } from 'lib/i18n';
import { marketingCopy } from 'lib/marketing-copy';

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

export async function sendMarketingLanding(message, source) {
  const normalized = normalizeMarketingSource(source);
  if (!normalized || !message?.chat?.id || !message?.from?.id) return false;

  await recordMarketingStart(message.from.id, normalized);
  const locale = await resolveUserLanguage(message.from);
  const copy = marketingCopy(locale, normalized);
  const campaign = copy.campaign;

  await api.sendRichMessage({
    chat_id: message.chat.id,
    rich_message: {
      blocks: [
        { type: 'heading', size: 2, text: campaign.heading },
        { type: 'paragraph', text: campaign.body },
        {
          type: 'details',
          summary: copy.detailsTitle,
          blocks: [{
            type: 'list',
            items: copy.detailsItems.map((text) => ({
              blocks: [{ type: 'paragraph', text }],
            })),
          }],
        },
        { type: 'divider' },
        { type: 'footer', text: campaign.note + '\n@RichCustomizebot' },
      ],
      ...(isRtlLocale(locale) ? { is_rtl: true } : {}),
    },
    reply_markup: {
      inline_keyboard: [
        [{
          text: copy.startButton,
          callback_data: 'r:starteditor',
          style: 'primary',
        }],
        [{
          text: copy.examplesButton,
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
  const order = ['ad_a', 'ad_b', 'ad_c'];
  const labels = {
    ad_a: 'A · فضول',
    ad_b: 'B · بدون برمجة',
    ad_c: 'C · النتيجة',
  };
  const stats = Object.fromEntries(order.map((source) => [
    source,
    { attributed: 0, published: 0 },
  ]));

  for (const row of rows) {
    const source = normalizeMarketingSource(row?.source);
    if (!source) continue;
    stats[source].attributed += 1;
    if (row?.firstPublishAt) stats[source].published += 1;
  }

  const data = order.map((source) => {
    const item = stats[source];
    const rate = item.attributed
      ? Math.round((item.published / item.attributed) * 1000) / 10
      : 0;
    return { source, label: labels[source], ...item, rate };
  });

  const totalIn = data.reduce((sum, item) => sum + item.attributed, 0);
  const totalPublished = data.reduce((sum, item) => sum + item.published, 0);
  const totalRate = totalIn
    ? Math.round((totalPublished / totalIn) * 1000) / 10
    : 0;

  const active = data.filter((item) => item.attributed > 0);
  const best = active.length
    ? [...active].sort((a, b) => b.rate - a.rate || b.published - a.published)[0]
    : null;

  const tableRows = [
    [
      { text: 'الحملة', is_header: true, align: 'center' },
      { text: 'دخلوا', is_header: true, align: 'center' },
      { text: 'نشروا', is_header: true, align: 'center' },
      { text: 'التحويل', is_header: true, align: 'center' },
    ],
    ...data.map((item) => ([
      { text: item.label, align: 'center' },
      { text: String(item.attributed), align: 'center' },
      { text: String(item.published), align: 'center' },
      { text: String(item.rate) + '%', align: 'center' },
    ])),
    [
      { text: 'الإجمالي', is_header: true, align: 'center' },
      { text: String(totalIn), is_header: true, align: 'center' },
      { text: String(totalPublished), is_header: true, align: 'center' },
      { text: String(totalRate) + '%', is_header: true, align: 'center' },
    ],
  ];

  const blocks = [
    { type: 'heading', size: 2, text: 'إحصائيات الحملات' },
    {
      type: 'paragraph',
      text: totalIn
        ? 'المهم هنا مو عدد اللي دخلوا فقط؛ شوف منو وصل لأول نشر فعلي.'
        : 'لحد الآن ماكو بيانات. افتح روابط الحملات وابدأ التجربة.',
    },
    {
      type: 'table',
      cells: tableRows,
      is_bordered: true,
      is_compact: true,
      is_striped: true,
    },
    { type: 'divider' },
    {
      type: 'paragraph',
      text: [
        'الإجمالي: ' + totalIn + ' دخلوا',
        'أول نشر: ' + totalPublished,
        'نسبة التحويل: ' + totalRate + '%',
      ].join('\n'),
    },
  ];

  if (best) {
    blocks.push({
      type: 'footer',
      text: 'الأفضل هسه: ' + best.label + ' — ' + best.rate + '% وصلوا لأول نشر.',
    });
  } else {
    blocks.push({
      type: 'footer',
      text: 'روابط التجربة: /start ad_a · /start ad_b · /start ad_c',
    });
  }

  await api.sendRichMessage({
    chat_id: message.chat.id,
    rich_message: {
      is_rtl: true,
      blocks,
    },
    reply_markup: {
      inline_keyboard: [[
        { text: 'A', url: 'https://t.me/RichCustomizebot?start=ad_a' },
        { text: 'B', url: 'https://t.me/RichCustomizebot?start=ad_b' },
        { text: 'C', url: 'https://t.me/RichCustomizebot?start=ad_c' },
      ]],
    },
  });
  return true;
}
