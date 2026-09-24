import { api, BotApiError } from 'sdk';
import { getLegacyState, setLegacyState } from 'lib/backup-import';

const DEFAULT_SHOWCASE_MEDIA_CHANNEL_ID = -1004433851299;
const SUPPORTED_MEDIA = Object.freeze(['photo', 'video', 'animation', 'audio', 'voice']);
const MAX_MEDIA_IDS_PER_KIND = 200;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function isArabic(languageCode) {
  return String(languageCode || '').toLowerCase().startsWith('ar');
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function randomChoice(values) {
  if (!Array.isArray(values) || !values.length) return null;
  return values[Math.floor(Math.random() * values.length)] || null;
}

function reusableMedia(message) {
  if (Array.isArray(message?.photo) && message.photo.length) {
    return ['photo', String(message.photo.at(-1)?.file_id || '')];
  }
  for (const kind of ['video', 'animation', 'audio', 'voice']) {
    const item = message?.[kind];
    if (item?.file_id) return [kind, String(item.file_id)];
  }
  return null;
}

function messageContentType(message) {
  if (message?.rich_message) return 'rich_message';
  if (message?.text) return 'text';
  if (Array.isArray(message?.photo) && message.photo.length) return 'photo';
  for (const kind of ['video', 'animation', 'audio', 'voice', 'document', 'sticker']) {
    if (message?.[kind]) return kind;
  }
  return 'unknown';
}

function showcaseSnapshot(message) {
  return {
    message_id: Number(message?.message_id || 0),
    date: Number(message?.date || nowSeconds()),
    media_group_id: message?.media_group_id ?? null,
    content_type: messageContentType(message),
    text: message?.text ?? null,
    caption: message?.caption ?? null,
    rich_message: message?.rich_message ? clone(message.rich_message) : null,
  };
}

async function configuredShowcaseChannelId() {
  const state = await getLegacyState('showcase_channel');
  const configured = Number(state?.channel_id);
  return Number.isSafeInteger(configured) && configured !== 0
    ? configured
    : DEFAULT_SHOWCASE_MEDIA_CHANNEL_ID;
}

function normalizedMediaLibrary(raw) {
  const result = {};
  for (const kind of SUPPORTED_MEDIA) {
    const values = Array.isArray(raw?.[kind]) ? raw[kind] : [];
    result[kind] = values
      .filter((value) => typeof value === 'string' && value)
      .slice(-MAX_MEDIA_IDS_PER_KIND);
  }
  return result;
}

export async function rememberShowcaseChannelPost(message) {
  const chatId = Number(message?.chat?.id);
  if (!Number.isSafeInteger(chatId)) return false;
  const channelId = await configuredShowcaseChannelId();
  if (chatId !== channelId) return false;

  const channelState = await getLegacyState('showcase_channel');
  const byId = new Map();
  for (const item of Array.isArray(channelState?.messages) ? channelState.messages : []) {
    const id = Number(item?.message_id);
    if (Number.isSafeInteger(id) && id > 0) byId.set(id, clone(item));
  }
  const snapshot = showcaseSnapshot(message);
  if (snapshot.message_id > 0) byId.set(snapshot.message_id, snapshot);
  await setLegacyState('showcase_channel', {
    ...(channelState && typeof channelState === 'object' && !Array.isArray(channelState) ? channelState : {}),
    channel_id: channelId,
    updated_at: nowSeconds(),
    messages: [...byId.values()].sort((a, b) => Number(a.message_id) - Number(b.message_id)),
  });

  const extracted = reusableMedia(message);
  if (extracted) {
    const [kind, fileId] = extracted;
    const library = normalizedMediaLibrary(await getLegacyState('showcase_media'));
    if (fileId && !library[kind].includes(fileId)) {
      library[kind].push(fileId);
      library[kind] = library[kind].slice(-MAX_MEDIA_IDS_PER_KIND);
      await setLegacyState('showcase_media', library);
    }
  }
  return true;
}

function missingMedia(library, includeVoice = true) {
  return SUPPORTED_MEDIA.filter((kind) => (
    (includeVoice || kind !== 'voice') && !Array.isArray(library[kind]) || false
  )).filter((kind) => {
    if (!includeVoice && kind === 'voice') return false;
    return !Array.isArray(library[kind]) || library[kind].length === 0;
  });
}

function showcaseHtml(userId, arabic, includeVoice = true) {
  const future = nowSeconds() + 3600;
  const intro = arabic
    ? '<h1>قالب جميع Rich Blocks</h1>'
      + '<p><b>عريض</b>، <i>مائل</i>، <u>تحته خط</u>، <s>مشطوب</s>، '
      + '<code>inline code</code>، <mark>محدد</mark>، H<sub>2</sub>O، x<sup>2</sup>، '
      + '<tg-spoiler>مخفي</tg-spoiler>، <a href="https://telegram.org">رابط</a>، '
      + '<a href="mailto:test@example.com">بريد</a>، <a href="tel:+123456789">هاتف</a>، '
      + '<a href="tg://user?id=' + userId + '">إشارة للمستخدم</a>، #هاشتاك، $USD، /editor، @telegram، 4242 4242 4242 4242، '
      + '<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>، '
      + '<tg-time unix="' + future + '" format="wDT">بعد ساعة</tg-time>، '
      + '<tg-math>x^2+y^2</tg-math>.</p>'
      + '<tg-reference name="demo-note">هذا نص مرجعي.</tg-reference>'
      + '<p><a href="#demo-note">رابط إلى المرجع</a> — <a href="#demo-anchor">رابط إلى المرساة</a></p>'
    : '<h1>Every Rich Block Showcase</h1>'
      + '<p><b>Bold</b>, <i>italic</i>, <u>underline</u>, <s>strikethrough</s>, '
      + '<code>inline code</code>, <mark>marked</mark>, H<sub>2</sub>O, x<sup>2</sup>, '
      + '<tg-spoiler>spoiler</tg-spoiler>, <a href="https://telegram.org">URL</a>, '
      + '<a href="mailto:test@example.com">email</a>, <a href="tel:+123456789">phone</a>, '
      + '<a href="tg://user?id=' + userId + '">user mention</a>, #hashtag, $USD, /editor, @telegram, 4242 4242 4242 4242, '
      + '<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>, '
      + '<tg-time unix="' + future + '" format="wDT">in one hour</tg-time>, '
      + '<tg-math>x^2+y^2</tg-math>.</p>'
      + '<tg-reference name="demo-note">This is referenced text.</tg-reference>'
      + '<p><a href="#demo-note">Reference link</a> — <a href="#demo-anchor">Anchor link</a></p>';

  const headings = Array.from({ length: 6 }, (_, index) => {
    const level = index + 1;
    return '<h' + level + '>' + (arabic ? 'عنوان H' : 'Heading H') + level + '</h' + level + '>';
  }).join('');

  const labels = arabic
    ? {
        pre: 'كتلة Preformatted', footer: 'هذا هو التذييل', quote: 'نص اقتباس متعدد البلوكات',
        pull: 'اقتباس بارز', author: 'الكاتب', photo: 'صورة مع تذييل', source: 'المصدر',
        video: 'فيديو', audio: 'ملف صوتي', voice: 'بصمة صوتية', animation: 'Animation / GIF',
        details: 'تفاصيل قابلة للفتح', inside: 'فقرة داخل Details', table: 'جدول',
        collage: 'كولاج', slides: 'عرض شرائح',
      }
    : {
        pre: 'Preformatted block', footer: 'This is the footer', quote: 'A multi-block quotation',
        pull: 'A centered pull quote', author: 'The Author', photo: 'Photo with caption', source: 'Source',
        video: 'Video', audio: 'Audio file', voice: 'Voice note', animation: 'Animation / GIF',
        details: 'Expandable Details', inside: 'A paragraph inside Details', table: 'Table',
        collage: 'Collage', slides: 'Slideshow',
      };

  const voiceBlock = includeVoice
    ? '<figure><audio src="tg://audio?id=show_voice"></audio><figcaption>' + labels.voice + '</figcaption></figure>'
    : '<p><i>' + (arabic
        ? 'تعذر تضمين البصمة الصوتية بسبب إعدادات الخصوصية في حسابك.'
        : 'The voice note was omitted because of your privacy settings.') + '</i></p>';

  return intro + headings
    + '<pre><code class="language-python">print(&quot;' + labels.pre + '&quot;)</code></pre>'
    + '<hr/><a name="demo-anchor"></a>'
    + '<ul><li>Unordered item</li><li><input type="checkbox" checked>Checked</li><li><input type="checkbox">Unchecked</li></ul>'
    + '<ol start="3" type="a"><li>Ordered item</li><li value="7" type="i">Custom value</li></ol>'
    + '<blockquote><p>' + labels.quote + '</p><cite>' + labels.author + '</cite></blockquote>'
    + '<aside>' + labels.pull + '<cite>' + labels.author + '</cite></aside>'
    + '<tg-math-block>E = mc^2</tg-math-block>'
    + '<table bordered striped><caption>' + labels.table + '</caption><tr><th colspan="2">Header</th></tr>'
    + '<tr><td rowspan="2" align="center" valign="middle">Cell</td><td>One</td></tr><tr><td>Two</td></tr></table>'
    + '<details open><summary>' + labels.details + '</summary><p>' + labels.inside + '</p><hr/></details>'
    + '<figure><img src="tg://photo?id=show_photo_1" tg-spoiler/><figcaption>' + labels.photo + '<cite>' + labels.source + '</cite></figcaption></figure>'
    + '<figure><video src="tg://video?id=show_video"></video><figcaption>' + labels.video + '</figcaption></figure>'
    + '<figure><audio src="tg://audio?id=show_audio"></audio><figcaption>' + labels.audio + '</figcaption></figure>'
    + voiceBlock
    + '<figure><video src="tg://video?id=show_animation"></video><figcaption>' + labels.animation + '</figcaption></figure>'
    + '<figure><tg-map lat="33.3152" long="44.3661" zoom="12"/><figcaption>Map — Baghdad</figcaption></figure>'
    + '<tg-collage><img src="tg://photo?id=show_photo_1"/><img src="tg://photo?id=show_photo_2"/><figcaption>' + labels.collage + '</figcaption></tg-collage>'
    + '<tg-slideshow><img src="tg://photo?id=show_photo_2"/><video src="tg://video?id=show_video"></video><figcaption>' + labels.slides + '</figcaption></tg-slideshow>'
    + '<footer>' + labels.footer + '</footer>';
}

function showcaseMedia(library, includeVoice = true) {
  const missing = missingMedia(library, includeVoice);
  if (missing.length) {
    const error = new Error('missing showcase media: ' + missing.join(', '));
    error.code = 'MISSING_SHOWCASE_MEDIA';
    error.missing = missing;
    throw error;
  }

  const photo1 = randomChoice(library.photo);
  const photo2 = randomChoice(library.photo);
  const video = randomChoice(library.video);
  const animation = randomChoice(library.animation);
  const audio = randomChoice(library.audio);
  const voice = includeVoice ? randomChoice(library.voice) : null;

  const media = [
    { id: 'show_photo_1', media: { type: 'photo', media: photo1 } },
    { id: 'show_photo_2', media: { type: 'photo', media: photo2 } },
    { id: 'show_video', media: { type: 'video', media: video } },
    { id: 'show_animation', media: { type: 'animation', media: animation } },
    { id: 'show_audio', media: { type: 'audio', media: audio } },
  ];
  if (voice) media.push({ id: 'show_voice', media: { type: 'voice_note', media: voice } });
  return media;
}

function voiceForbidden(error) {
  if (!(error instanceof BotApiError)) return false;
  return String(error.description || '').toUpperCase().includes('VOICE_MESSAGES_FORBIDDEN');
}

export async function sendAllBlocksShowcase(chatId, userId, languageCode) {
  const library = normalizedMediaLibrary(await getLegacyState('showcase_media'));
  const arabic = isArabic(languageCode);
  const draftId = Math.floor(Math.random() * 2147483647) + 1;

  try {
    await api.sendRichMessageDraft({
      chat_id: Number(chatId),
      draft_id: draftId,
      rich_message: {
        html: '<tg-thinking>' + (arabic ? 'جاري تجهيز قالب كل البلوكات…' : 'Building the all-block showcase…') + '</tg-thinking>',
        ...(arabic ? { is_rtl: true } : {}),
      },
    });
  } catch (error) {
    console.warn('Could not send showcase draft', error);
  }

  try {
    return await api.sendRichMessage({
      chat_id: chatId,
      rich_message: {
        html: showcaseHtml(userId, arabic, true),
        media: showcaseMedia(library, true),
        ...(arabic ? { is_rtl: true } : {}),
      },
    });
  } catch (error) {
    if (!voiceForbidden(error)) throw error;
    return api.sendRichMessage({
      chat_id: chatId,
      rich_message: {
        html: showcaseHtml(userId, arabic, false),
        media: showcaseMedia(library, false),
        ...(arabic ? { is_rtl: true } : {}),
      },
    });
  }
}

export async function handleShowcaseMessage(message) {
  const text = String(message?.text || '').trim();
  const command = text.split(/\s+/, 1)[0].toLowerCase();
  if (!['/draft', 'draft', 'دريفت'].includes(command.replace(/@[^\s]+$/, ''))) return false;
  if (!message?.from?.id || !message?.chat?.id) return true;
  try {
    await api.sendChatAction({ chat_id: message.chat.id, action: 'typing' });
    await sendAllBlocksShowcase(
      message.chat.id,
      message.from.id,
      message.from.language_code || 'en',
    );
  } catch (error) {
    console.error('Could not build all-block showcase', error);
    await api.sendMessage({
      chat_id: message.chat.id,
      text: isArabic(message.from.language_code) ? 'فشلت المعاينة.' : 'Preview failed.',
    });
  }
  return true;
}

export async function handleShowcaseCallback(query) {
  if (String(query?.data || '') !== 'r:showcase') return false;
  await api.answerCallbackQuery({
    callback_query_id: query.id,
    text: isArabic(query.from?.language_code) ? 'جاري إنشاء المعاينة…' : 'Generating preview…',
  });
  try {
    await sendAllBlocksShowcase(
      query.from.id,
      query.from.id,
      query.from.language_code || 'en',
    );
  } catch (error) {
    console.error('Could not build callback showcase', error);
    await api.sendMessage({
      chat_id: query.from.id,
      text: isArabic(query.from?.language_code) ? 'فشلت المعاينة.' : 'Preview failed.',
    });
  }
  return true;
}
