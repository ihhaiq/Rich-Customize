// Pure RichText operations. Movement uses word boundaries on Enter-delimited lines.
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const atomic = (value) => value && typeof value === 'object' && !Array.isArray(value)
  && (['custom_emoji', 'button', 'mathematical_expression', 'date_time'].includes(value.type)
    || !Object.hasOwn(value, 'text'));

export function emojiText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(emojiText).join('');
  if (!value || typeof value !== 'object') return '';
  if (atomic(value)) return value.alternative_text || emojiText(value.button?.text) || '\ufffc';
  return emojiText(value.text);
}

export function customEmojiEntries(value) {
  const entries = [];
  let offset = 0;
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const text = String(emojiText(node));
    if (node && typeof node === 'object' && !Array.isArray(node)
      && node.type === 'custom_emoji' && node.custom_emoji_id) {
      entries.push({
        emoji: clone(node),
        offset,
        length: text.length,
      });
    }
    if (node && typeof node === 'object' && !Array.isArray(node) && !atomic(node)) {
      visit(node.text);
      return;
    }
    offset += text.length;
  };
  visit(value);
  return entries;
}

export function graphemes(text) {
  if (typeof globalThis.Intl?.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
      .map((item) => item.segment);
  }
  // Conservative fallback for V8 builds without ICU: never split a non-ASCII run.
  // Less granular movement is preferable to breaking Indic/ZWJ/combining sequences.
  return String(text).match(/[^\x00-\x7f\r\n]+|[\x00-\x7f](?:[\u0300-\u036f\ufe00-\ufe0f]+)?/gu) || [];
}

export function emojiLines(value) {
  const text = String(emojiText(value));
  const atoms = [];
  let cursor = 0;
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const length = String(emojiText(node)).length;
    if (atomic(node)) atoms.push([cursor, cursor + length]);
    else if (node && typeof node === 'object') { walk(node.text); return; }
    cursor += length;
  };
  walk(value);
  const lines = [];
  let offset = 0;
  for (const part of text.split(/(\r\n|\r|\n)/)) {
    if (/^(\r\n|\r|\n)$/.test(part)) { offset += part.length; continue; }
    const boundaries = [offset];
    let end = offset;
    for (const unit of graphemes(part)) {
      end += unit.length;
      if (!atoms.some(([a, b]) => a < end && end < b)) boundaries.push(end);
    }
    lines.push({ text: part, boundaries });
    offset += part.length;
  }
  return lines.length ? lines : [{ text: '', boundaries: [0] }];
}

export function initialEmojiPosition(value) {
  const line = emojiWordLines(value)[0];
  return { line: 0, column: line.boundaries.length - 1, offset: line.boundaries.at(-1) || 0 };
}

export function emojiWordLines(value) {
  return emojiLines(value).map((line) => {
    const start = line.boundaries[0];
    const end = start + line.text.length;
    let starts;
    if (typeof globalThis.Intl?.Segmenter === 'function') {
      starts = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(line.text)]
        .filter((part) => part.isWordLike || /[\p{Extended_Pictographic}\p{Regional_Indicator}\ufffc]/u.test(part.segment))
        .map((part) => part.index);
    } else {
      starts = [...line.text.matchAll(/\S+/gu)].map((part) => part.index);
    }
    // A stop follows each whole word, including its punctuation. Whitespace
    // never adds an extra arrow press. Keep the initial/final line positions.
    const stops = [start];
    for (const next of starts.slice(1)) {
      let offset = next;
      while (offset > 0 && /\s/u.test(line.text[offset - 1])) offset -= 1;
      if (line.boundaries.includes(start + offset)) stops.push(start + offset);
    }
    stops.push(end);
    return { text: line.text, boundaries: [...new Set(stops)].sort((a, b) => a - b) };
  });
}

export function moveEmojiPosition(value, position, arrow, isRtl) {
  const lines = emojiWordLines(value);
  let line = Math.max(0, Math.min(lines.length - 1, Number(position.line) || 0));
  let column = Math.max(0, Math.min(lines[line].boundaries.length - 1, Number(position.column) || 0));
  if (arrow === 'up' || arrow === 'down') {
    line = Math.max(0, Math.min(lines.length - 1, line + (arrow === 'up' ? -1 : 1)));
    column = Math.min(column, lines[line].boundaries.length - 1);
  } else {
    const firstLetter = lines[line].text.match(/\p{L}/u)?.[0] || '';
    const rtl = typeof isRtl === 'boolean' ? isRtl : /[\u0590-\u08ff\ufb1d-\ufeff]/u.test(firstLetter);
    const delta = (arrow === 'right' ? 1 : -1) * (rtl ? -1 : 1);
    column = Math.max(0, Math.min(lines[line].boundaries.length - 1, column + delta));
  }
  return { line, column, offset: lines[line].boundaries[column] };
}

function sliceRich(value, start, end) {
  const length = String(emojiText(value)).length;
  if (start <= 0 && end >= length) return clone(value);
  if (end <= 0 || start >= length) return '';
  if (typeof value === 'string') return value.slice(Math.max(0, start), end);
  if (Array.isArray(value)) {
    let offset = 0;
    return value.map((node) => {
      const result = sliceRich(node, start - offset, end - offset);
      offset += String(emojiText(node)).length;
      return result;
    }).filter((node) => node !== '');
  }
  if (atomic(value)) throw new Error('Emoji position splits an atomic RichText node');
  return { ...clone(value), text: sliceRich(value.text, start, end) };
}

function removeRichRange(value, start, end) {
  const length = String(emojiText(value)).length;
  if (end <= 0 || start >= length) return clone(value);
  if (typeof value === 'string') {
    return value.slice(0, Math.max(0, start)) + value.slice(Math.min(length, end));
  }
  if (Array.isArray(value)) {
    let offset = 0;
    return value.map((node) => {
      const next = removeRichRange(node, start - offset, end - offset);
      offset += String(emojiText(node)).length;
      return next;
    }).filter((node) => node !== '');
  }
  if (atomic(value)) {
    return start <= 0 && end >= length ? '' : clone(value);
  }
  return { ...clone(value), text: removeRichRange(value.text, start, end) };
}

export function positionAtOffset(value, offset) {
  const lines = emojiWordLines(value);
  const target = Math.max(0, Number(offset) || 0);
  let line = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const last = lines[index].boundaries.at(-1) || 0;
    if (target <= last || index === lines.length - 1) {
      line = index;
      break;
    }
  }
  const boundaries = lines[line].boundaries;
  let column = 0;
  for (let index = 0; index < boundaries.length; index += 1) {
    if (boundaries[index] >= target) {
      column = index;
      break;
    }
    column = index;
  }
  return { line, column, offset: target };
}

export function moveExistingEmoji(value, entry, position) {
  const start = Number(entry?.offset || 0);
  const length = Number(entry?.length || String(emojiText(entry?.emoji)).length);
  const remaining = removeRichRange(value, start, start + length);
  const adjustedOffset = start <= (position?.offset ?? start)
    ? Math.max(0, Number(position?.offset ?? start) - length)
    : Number(position?.offset ?? start);
  const target = Number.isFinite(Number(position?.offset))
    ? { ...position, offset: Math.max(0, Math.min(String(emojiText(remaining)).length, Number(position.offset))) }
    : position?.line != null && position?.column != null
      ? position
      : positionAtOffset(remaining, adjustedOffset);
  return insertPositionedEmojis(remaining, [{ emoji: entry.emoji, position: target }]);
}

export function existingEmojiPosition(value, entry) {
  const start = Number(entry?.offset || 0);
  const length = Number(entry?.length || String(emojiText(entry?.emoji)).length);
  const remaining = removeRichRange(value, start, start + length);
  return positionAtOffset(remaining, start);
}

export function insertEmojiAt(value, emojis, position) {
  return insertPositionedEmojis(value, emojis.map((emoji) => ({ emoji, position })));
}

export function insertPositionedEmojis(value, placements) {
  const lines = emojiWordLines(value);
  const entries = placements.map(({ emoji, position }, order) => {
  const line = lines[Math.max(0, Math.min(lines.length - 1, position.line))];
  const offset = Number.isFinite(Number(position?.offset))
    ? Math.max(0, Math.min(String(emojiText(value)).length, Number(position.offset)))
    : line.boundaries[Math.max(0, Math.min(line.boundaries.length - 1, position.column))];
    return { emoji, offset, order };
  }).sort((a, b) => a.offset - b.offset || a.order - b.order);
  const length = String(emojiText(value)).length;
  const result = [];
  let cursor = 0;
  for (const entry of entries) {
    if (entry.offset > cursor) result.push(sliceRich(value, cursor, entry.offset));
    result.push(clone(entry.emoji));
    cursor = entry.offset;
  }
  if (cursor < length) result.push(sliceRich(value, cursor, length));
  return result;
}
