// Pure RichText operations. Positions are grapheme boundaries on Enter-delimited lines.
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
  return { line: 0, column: emojiLines(value)[0].boundaries.length - 1 };
}

export function moveEmojiPosition(value, position, arrow, isRtl) {
  const lines = emojiLines(value);
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
  return { line, column };
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

export function insertEmojiAt(value, emojis, position) {
  const lines = emojiLines(value);
  const line = lines[Math.max(0, Math.min(lines.length - 1, position.line))];
  const offset = line.boundaries[Math.max(0, Math.min(line.boundaries.length - 1, position.column))];
  const length = String(emojiText(value)).length;
  return [sliceRich(value, 0, offset), ...clone(emojis), sliceRich(value, offset, length)]
    .filter((part) => part !== '');
}
