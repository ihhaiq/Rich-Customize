// Serverless port of the RichText conversion used by app/services/renderer.py
// and app/services/inline_buttons.py. Message entities replace aiogram's html_text.

const COLOR_STYLES = {
  r: 'danger',
  b: 'primary',
  p: 'primary',
  g: 'success',
};

const COLOR_ALIASES = {
  r: 'r', red: 'r', 'أحمر': 'r', 'احمر': 'r',
  b: 'b', blue: 'b', 'أزرق': 'b', 'ازرق': 'b',
  p: 'p', primary: 'p',
  g: 'g', green: 'g', 'أخضر': 'g', 'اخضر': 'g',
};

const TYPE_ALIASES = {
  link: 'url',
  callback: 'callback_data',
  alert: 'popup',
  webapp: 'web_app',
  login: 'login_url',
  inline: 'switch_inline_query',
  current: 'switch_inline_query_current_chat',
  cbd: 'page_callback',
  page: 'page_callback',
  'inline-here': 'switch_inline_query_current_chat',
  callbackdata: 'callback_data',
  'callback data': 'callback_data',
  'web app': 'web_app',
  'login url': 'login_url',
  'switch inline query': 'switch_inline_query',
  'switch inline query current chat': 'switch_inline_query_current_chat',
};

const BUTTON_TYPES = new Set([
  'user', 'disabled', 'url', 'callback_data', 'page_callback', 'copy',
  'popup', 'web_app', 'login_url', 'switch_inline_query',
  'switch_inline_query_current_chat',
]);

const AUDIENCE_ALIASES = {
  all: 'all',
  public: 'all',
  'عام': 'all',
  sub: 'subscribers',
  subs: 'subscribers',
  members: 'subscribers',
  'مشتركين': 'subscribers',
};

const WRAPPERS = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strikethrough',
  spoiler: 'spoiler',
  code: 'code',
};

function utf8ByteLength(value) {
  const text = String(value ?? '');
  let length = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      length += 1;
    } else if (code < 0x800) {
      length += 2;
    } else if (
      code >= 0xD800
      && code <= 0xDBFF
      && index + 1 < text.length
      && text.charCodeAt(index + 1) >= 0xDC00
      && text.charCodeAt(index + 1) <= 0xDFFF
    ) {
      length += 4;
      index += 1;
    } else {
      length += 3;
    }
  }
  return length;
}

function compact(parts) {
  const values = parts.filter((part) => part !== null && part !== '' && !(Array.isArray(part) && !part.length));
  if (!values.length) return '';
  return values.length === 1 ? values[0] : values;
}

function wrapEntity(entity, content, sourceText) {
  const type = String(entity?.type || '');
  if (Object.hasOwn(WRAPPERS, type) && content !== '') {
    return { type: WRAPPERS[type], text: content };
  }
  if (type === 'text_link' && entity.url) {
    return { type: 'url', text: content, url: String(entity.url) };
  }
  if (type === 'url') {
    return { type: 'url', text: content, url: sourceText };
  }
  if (type === 'email') {
    return { type: 'email_address', text: content, email_address: sourceText };
  }
  if (type === 'phone_number') {
    return { type: 'phone_number', text: content, phone_number: sourceText };
  }
  if (type === 'text_mention' && entity.user) {
    return { type: 'text_mention', text: content, user: entity.user };
  }
  if (type === 'custom_emoji' && entity.custom_emoji_id) {
    return {
      type: 'custom_emoji',
      custom_emoji_id: String(entity.custom_emoji_id),
      alternative_text: sourceText || '🙂',
    };
  }
  // aiogram's HTML route did not add a RichText wrapper for plain mentions,
  // commands, hashtags or pre entities in these editor text blocks.
  return content;
}

function richRange(text, entities, start, end) {
  const inside = entities
    .filter((entity) => {
      const offset = Number(entity?.offset);
      const length = Number(entity?.length);
      return Number.isInteger(offset) && Number.isInteger(length)
        && length > 0 && offset >= start && offset + length <= end;
    })
    .sort((a, b) => Number(a.offset) - Number(b.offset)
      || Number(b.length) - Number(a.length));

  const top = [];
  for (const entity of inside) {
    const offset = Number(entity.offset);
    const finish = offset + Number(entity.length);
    if (top.some((parent) => {
      const parentStart = Number(parent.offset);
      const parentEnd = parentStart + Number(parent.length);
      return offset >= parentStart && finish <= parentEnd;
    })) continue;
    top.push(entity);
  }

  const parts = [];
  let cursor = start;
  for (const entity of top) {
    const entityStart = Number(entity.offset);
    const entityEnd = entityStart + Number(entity.length);
    if (entityStart > cursor) parts.push(text.slice(cursor, entityStart));
    const nested = inside.filter((candidate) => candidate !== entity);
    const content = richRange(text, nested, entityStart, entityEnd);
    parts.push(wrapEntity(entity, content, text.slice(entityStart, entityEnd)));
    cursor = entityEnd;
  }
  if (cursor < end) parts.push(text.slice(cursor, end));
  return compact(parts);
}

export function messageRichText(message) {
  const text = String(message?.text || '');
  const entities = Array.isArray(message?.entities) ? message.entities : [];
  if (!entities.length || !text) return text;
  return richRange(text, entities, 0, text.length);
}


function escapeHtmlText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function richTextToHtml(value) {
  if (value == null) return '';
  if (typeof value === 'string') return escapeHtmlText(value);
  if (Array.isArray(value)) return value.map(richTextToHtml).join('');
  if (typeof value !== 'object') return escapeHtmlText(String(value));

  const type = String(value.type || 'plain');
  const inner = richTextToHtml(value.text ?? value.children ?? '');
  const wrappers = {
    bold: 'b',
    italic: 'i',
    underline: 'u',
    strikethrough: 's',
    spoiler: 'tg-spoiler',
    code: 'code',
    marked: 'mark',
    subscript: 'sub',
    superscript: 'sup',
  };
  if (wrappers[type]) {
    const tag = wrappers[type];
    return '<' + tag + '>' + inner + '</' + tag + '>';
  }
  if (type === 'url') {
    return '<a href="' + escapeHtmlText(value.url || '') + '">' + inner + '</a>';
  }
  if (type === 'email_address') {
    return '<a href="mailto:' + escapeHtmlText(value.email_address || '') + '">' + inner + '</a>';
  }
  if (type === 'phone_number') {
    return '<a href="tel:' + escapeHtmlText(value.phone_number || '') + '">' + inner + '</a>';
  }
  if (type === 'text_mention' && value.user?.id) {
    return '<a href="tg://user?id=' + String(value.user.id) + '">' + inner + '</a>';
  }
  if (type === 'custom_emoji' && value.custom_emoji_id) {
    return '<tg-emoji emoji-id="' + escapeHtmlText(value.custom_emoji_id) + '">'
      + escapeHtmlText(value.alternative_text || plainRichText(value) || '🙂')
      + '</tg-emoji>';
  }
  return inner || escapeHtmlText(value.alternative_text || '');
}

export function messageHtmlText(message) {
  return richTextToHtml(messageRichText(message));
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, raw) => String.fromCodePoint(Number.parseInt(raw, 10)))
    .replaceAll('&nbsp;', '\u00a0')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function parseAttrs(raw) {
  const attrs = {};
  const pattern = /([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = pattern.exec(raw || '')) !== null) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

const HTML_WRAPPERS = {
  b: 'bold',
  strong: 'bold',
  i: 'italic',
  em: 'italic',
  u: 'underline',
  ins: 'underline',
  s: 'strikethrough',
  strike: 'strikethrough',
  del: 'strikethrough',
  'tg-spoiler': 'spoiler',
  code: 'code',
  mark: 'marked',
  sub: 'subscript',
  sup: 'superscript',
};

function closeFrame(stack, tag) {
  if (stack.length <= 1) return;
  const frame = stack.pop();
  if (frame.tag !== tag) {
    stack.at(-1).parts.push(...frame.parts);
    return;
  }

  const content = compact(frame.parts);
  let wrapped = content;
  const richType = HTML_WRAPPERS[tag];
  if (richType && content !== '') {
    wrapped = { type: richType, text: content };
  } else if (tag === 'a' && content !== '') {
    const href = frame.attrs.href || '';
    if (href.startsWith('mailto:')) {
      wrapped = { type: 'email_address', text: content, email_address: href.slice(7) };
    } else if (href.startsWith('tel:')) {
      wrapped = { type: 'phone_number', text: content, phone_number: href.slice(4) };
    } else if (href.startsWith('#')) {
      wrapped = { type: 'anchor_link', text: content, anchor_name: href.slice(1) };
    } else if (href) {
      wrapped = { type: 'url', text: content, url: href };
    }
  } else if (tag === 'tg-emoji') {
    const emojiId = frame.attrs['emoji-id'] || '';
    if (emojiId) {
      wrapped = {
        type: 'custom_emoji',
        custom_emoji_id: emojiId,
        alternative_text: plainRichText(content) || '🙂',
      };
    }
  }
  stack.at(-1).parts.push(wrapped);
}

export function htmlRichText(value, fallback = '') {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;

  const stack = [{ tag: 'root', attrs: {}, parts: [] }];
  const tokenRe = /<[^>]*>|[^<]+/g;
  let token;
  while ((token = tokenRe.exec(value)) !== null) {
    const raw = token[0];
    if (!raw.startsWith('<')) {
      const data = decodeHtml(raw);
      if (data) stack.at(-1).parts.push(data);
      continue;
    }
    if (/^<br\s*\/?>$/i.test(raw)) {
      stack.at(-1).parts.push('\n');
      continue;
    }
    const end = raw.match(/^<\s*\/\s*([A-Za-z0-9_-]+)\s*>$/);
    if (end) {
      closeFrame(stack, end[1].toLowerCase());
      continue;
    }
    const start = raw.match(/^<\s*([A-Za-z0-9_-]+)([\s\S]*?)\/?\s*>$/);
    if (!start) continue;
    const tag = start[1].toLowerCase();
    stack.push({ tag, attrs: parseAttrs(start[2]), parts: [] });
    if (/\/\s*>$/.test(raw)) closeFrame(stack, tag);
  }
  while (stack.length > 1) closeFrame(stack, stack.at(-1).tag);
  const result = compact(stack[0].parts);
  return result === '' || (Array.isArray(result) && !result.length) ? fallback : result;
}

export function plainRichText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(plainRichText).join('');
  if (typeof value === 'object') return plainRichText(value.text ?? value.alternative_text ?? '');
  return String(value);
}

function normalizeButtonUrl(value) {
  let raw = String(value || '').trim();
  if (!raw || /\s/.test(raw)) return null;
  if (/^@[A-Za-z0-9_]{5,32}$/.test(raw)) return 'https://t.me/' + raw.slice(1);

  if (!raw.includes('://') && /^(?:[\w-]+\.)+[\w-]+(?::[0-9]+)?(?:[/?#]|$)/u.test(raw)) {
    raw = 'https://' + raw;
  }

  const http = raw.match(/^(https?):\/\/([^/?#]+)([^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i);
  if (http) {
    let authority = http[2];
    const path = http[3] || '';
    const at = authority.lastIndexOf('@');
    if (at >= 0) authority = authority.slice(at + 1);
    let hostname = authority;
    if (hostname.startsWith('[')) {
      const closing = hostname.indexOf(']');
      hostname = closing >= 0 ? hostname.slice(1, closing) : hostname;
    } else {
      hostname = hostname.split(':', 1)[0];
    }
    if (!hostname) return null;
    if (!hostname.includes('.') && !path.replaceAll('/', '') && /^[A-Za-z0-9_]{5,32}$/.test(hostname)) {
      return 'https://t.me/' + hostname;
    }
    if (!hostname.includes('.')) return null;
    return raw;
  }

  if (/^tg:(?:\/\/)?[^?#\s]+(?:[?#].*)?$/i.test(raw)) return raw;
  return null;
}

function markerParts(marker) {
  if (!marker.startsWith('{') || !marker.endsWith('}')) return null;
  const body = marker.slice(1, -1).trim();
  const hyphenIndex = body.indexOf('-');
  const colonIndex = body.indexOf(':');
  const newSyntax = hyphenIndex >= 0 && (colonIndex < 0 || hyphenIndex < colonIndex);
  let title;
  let specification;
  if (newSyntax) {
    title = body.slice(0, hyphenIndex);
    specification = body.slice(hyphenIndex + 1);
  } else if (body.includes(':')) {
    [title, specification] = body.split(/:(.*)/s, 2);
  } else {
    return null;
  }
  title = String(title || '').trim();
  specification = String(specification || '').trim();
  if (!title || title.length > 64 || !specification) return null;

  let audience = 'all';
  let color = null;
  while (specification) {
    const colorMatch = specification.match(/#\s*([rbpg])\s*$/i);
    if (colorMatch) {
      color = colorMatch[1].toLowerCase();
      specification = specification.slice(0, colorMatch.index).trimEnd();
      continue;
    }
    const optionMatch = specification.match(/\s*-\s*([^\s-]+)\s*$/);
    if (optionMatch) {
      const option = optionMatch[1].toLowerCase();
      if (Object.hasOwn(COLOR_ALIASES, option)) {
        color = COLOR_ALIASES[option];
        specification = specification.slice(0, optionMatch.index).trimEnd();
        continue;
      }
      if (Object.hasOwn(AUDIENCE_ALIASES, option)) {
        audience = AUDIENCE_ALIASES[option];
        specification = specification.slice(0, optionMatch.index).trimEnd();
        continue;
      }
    }
    const audienceMatch = specification.match(/\s+([^\s]+)\s*$/);
    if (audienceMatch && Object.hasOwn(AUDIENCE_ALIASES, audienceMatch[1].toLowerCase())) {
      audience = AUDIENCE_ALIASES[audienceMatch[1].toLowerCase()];
      specification = specification.slice(0, audienceMatch.index).trimEnd();
      continue;
    }
    break;
  }

  const typed = specification.match(/^([\w-]+(?:\s+[\w-]+)*)\s*:\s*([\s\S]*)$/u);
  const typedName = typed ? typed[1].toLowerCase() : '';
  const typedType = TYPE_ALIASES[typedName] || typedName;
  let buttonType;
  let value;
  if (typed && BUTTON_TYPES.has(typedType)) {
    buttonType = typedType;
    value = typed[2].trim();
  } else if (newSyntax) {
    const rawType = specification.toLowerCase();
    const known = TYPE_ALIASES[rawType] || rawType;
    if (BUTTON_TYPES.has(known)) {
      buttonType = known;
      value = '';
    } else {
      buttonType = 'url';
      value = specification.trim();
    }
  } else {
    const pieces = specification.split(/\s+/, 2);
    const rawType = pieces[0].toLowerCase();
    buttonType = TYPE_ALIASES[rawType] || rawType;
    value = pieces.length === 2 ? specification.slice(pieces[0].length).trim() : '';
  }
  return [title, buttonType, value, color, audience];
}

function buttonPayload(title, buttonType, value, color, audience = 'all') {
  const button = { text: title };
  const style = COLOR_STYLES[color || ''];
  if (style) button.style = style;

  if (buttonType === 'url') {
    const url = normalizeButtonUrl(value);
    if (!url) return null;
    button.url = url;
  } else if (buttonType === 'user') {
    if (!/^\d+$/.test(value)) return null;
    button.url = 'tg://user?id=' + value;
  } else if (buttonType === 'callback_data') {
    const length = utf8ByteLength(value);
    if (length < 1 || length > 64) return null;
    button.callback_data = value;
  } else if (buttonType === 'page_callback') {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(value.trim())) return null;
    button.callback_data = (audience === 'subscribers' ? 'r:cbds:' : 'r:cbd:') + value.trim();
  } else if (buttonType === 'copy') {
    if (!value || value.length > 256) return null;
    button.copy_text = { text: value };
  } else if (buttonType === 'popup') {
    const callback = 'r:poptext:' + value;
    if (!value || utf8ByteLength(callback) > 64) return null;
    button.callback_data = callback;
  } else if (buttonType === 'web_app') {
    if (!value.startsWith('https://')) return null;
    button.web_app = { url: value };
  } else if (buttonType === 'login_url') {
    if (!value.startsWith('https://')) return null;
    button.login_url = { url: value };
  } else if (buttonType === 'switch_inline_query') {
    button.switch_inline_query = value === '/empty' ? '' : value;
  } else if (buttonType === 'switch_inline_query_current_chat') {
    button.switch_inline_query_current_chat = value === '/empty' ? '' : value;
  } else if (buttonType === 'disabled') {
    button.disabled = {};
  } else {
    return null;
  }
  return { type: 'button', button };
}

export function findUserButtonMarkers(text) {
  const markers = [];
  const pattern = /\{([^{}\n]+)\}/g;
  let match;
  while ((match = pattern.exec(String(text || ''))) !== null) {
    const parts = markerParts(match[0]);
    if (!parts) continue;
    const [title, buttonType, value, color] = parts;
    if (buttonType === 'user' && !value) {
      markers.push({
        marker: match[0],
        title,
        color: color || null,
      });
    }
  }
  return markers;
}

export function resolveUserButtonMarker(value, marker, userId, username = null) {
  const parts = markerParts(String(marker || ''));
  if (!parts) return value;
  const [title, , , color] = parts;
  const suffix = color ? '#' + color : '';
  const cleanUsername = String(username || '').trim().replace(/^@+/, '');
  const target = cleanUsername
    ? 'https://t.me/' + cleanUsername
    : 'tg://user?id=' + String(userId);
  const replacement = '{' + title + ':url ' + target + suffix + '}';

  function replace(input) {
    if (typeof input === 'string') {
      const index = input.indexOf(marker);
      if (index < 0) return input;
      return input.slice(0, index) + replacement + input.slice(index + marker.length);
    }
    if (Array.isArray(input)) return input.map(replace);
    if (input && typeof input === 'object') {
      const result = {};
      for (const [key, item] of Object.entries(input)) result[key] = replace(item);
      return result;
    }
    return input;
  }

  return replace(value);
}

export function inlineButtonRichText(value) {
  if (Array.isArray(value)) {
    const result = [];
    for (const item of value) {
      const parsed = inlineButtonRichText(item);
      if (Array.isArray(parsed)) result.push(...parsed);
      else result.push(parsed);
    }
    return result;
  }
  if (value && typeof value === 'object') {
    const payload = { ...value };
    if (Object.hasOwn(payload, 'text')) payload.text = inlineButtonRichText(payload.text);
    return payload;
  }
  if (typeof value !== 'string') return value;

  const pattern = /\{([^{}\n]+)\}/g;
  const result = [];
  let cursor = 0;
  let changed = false;
  let match;
  while ((match = pattern.exec(value)) !== null) {
    const parts = markerParts(match[0]);
    if (!parts) continue;
    const payload = buttonPayload(...parts);
    if (!payload) continue;
    if (match.index > cursor) result.push(value.slice(cursor, match.index));
    result.push(payload);
    cursor = match.index + match[0].length;
    changed = true;
  }
  if (!changed) return value;
  if (cursor < value.length) result.push(value.slice(cursor));
  return result.length === 1 ? result[0] : result;
}

export function dataRichText(data, richKey = 'rich_text', htmlKey = 'html', textKey = 'text') {
  let value;
  if (data?.[richKey] !== null && data?.[richKey] !== undefined && data?.[richKey] !== '' && !(Array.isArray(data?.[richKey]) && !data[richKey].length)) {
    value = data[richKey];
  } else {
    value = htmlRichText(data?.[htmlKey], String(data?.[textKey] || ''));
  }
  if (data?.parse_inline_buttons === false) return value;
  return inlineButtonRichText(value);
}
