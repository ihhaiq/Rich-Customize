import { dataRichText, richTextToHtml, plainRichText } from 'lib/rich-text';
import { parseRichMessage } from 'lib/editor-import';

const clone = (value) => JSON.parse(JSON.stringify(value));
const at = (object, path) => path.reduce((item, key) => item?.[key], object);

// Descriptors address the original storage model, so adding emoji never converts
// an imported table/media block or discards its layout, links or metadata.
export function emojiTargets(block) {
  if (!block) return [];
  const targets = [];
  const generated = (object, path, prefix = '') => {
    const keys = prefix ? [prefix + '_rich_text', prefix + '_html', prefix + '_text']
      : ['rich_text', 'html', 'text'];
    targets.push({ path, keys, value: dataRichText(object, ...keys), label: prefix || 'text' });
  };
  const direct = (path, value, label) => targets.push({ path, value, label, direct: true });
  const native = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (['paragraph', 'text', 'heading', 'section_heading', 'footer', 'pullquote', 'pull_quotation'].includes(node.type)) {
      direct([...path, 'text'], node.text || '', 'text');
    }
    if (node.type === 'details') direct([...path, 'summary'], node.summary || '', 'summary');
    if (node.type === 'table') {
      (node.cells || []).forEach((row, r) => row.forEach((cell, c) => {
        if (cell.text != null) direct([...path, 'cells', r, c, 'text'], cell.text, 'cell');
      }));
      if (node.caption != null) direct([...path, 'caption'], node.caption, 'caption');
    } else if (['photo', 'video', 'audio', 'animation', 'voice_note', 'document', 'map', 'collage', 'slideshow'].includes(node.type)) {
      direct([...path, 'caption', 'text'], node.caption?.text || '', 'caption');
      if (node.caption?.credit) direct([...path, 'caption', 'credit'], node.caption.credit, 'credit');
    }
    if (node.credit) direct([...path, 'credit'], node.credit, 'credit');
    (node.blocks || []).forEach((child, index) => native(child, [...path, 'blocks', index]));
    (node.items || []).forEach((item, i) => (item.blocks || []).forEach((child, j) => native(child, [...path, 'items', i, 'blocks', j])));
  };
  const visit = (item, path) => {
    const data = item.data || {};
    const root = [...path, 'data'];
    if (data.native && data.native_data) { native(data.native_data, [...root, 'native_data']); return; }
    if (['paragraph', 'text', 'heading', 'footer', 'caption'].includes(item.type)) generated(data, root);
    if (['blockquote', 'pullquote'].includes(item.type)) generated(data, root, 'quote');
    if (item.type === 'details') generated(data, root, 'summary');
    if (['table', 'photo', 'video', 'animation', 'audio', 'voice', 'document', 'map', 'collage', 'slideshow'].includes(item.type)) generated(data, root, 'caption');
    if (data.credit_html || data.credit_rich_text || data.credit_text) generated(data, root, 'credit');
    if (item.type === 'table') (data.rows || []).forEach((row, r) => row.forEach((cell, c) => {
      // Empty objects are invisible cells of an imported/merged table.
      if (cell && typeof cell === 'object' && !['text', 'html', 'rich_text'].some((key) => Object.hasOwn(cell, key))) return;
      generated(typeof cell === 'object' ? cell : { text: String(cell ?? '') }, [...root, 'rows', r, c]);
      targets.at(-1).label = 'cell';
    }));
    if (item.type === 'list') (data.items || []).forEach((entry, i) => {
      if (Array.isArray(entry?.blocks)) entry.blocks.forEach((child, j) => visit(child, [...root, 'items', i, 'blocks', j]));
      else generated(typeof entry === 'object' ? entry : { text: String(entry ?? '') }, [...root, 'items', i]);
    });
    for (const key of ['children', 'media_children']) (data[key] || []).forEach((child, index) => visit(child, [...root, key, index]));
  };
  visit(block, []);
  return targets;
}

export function applyEmojiTarget(block, target, value) {
  const result = clone(block);
  if (target.direct) {
    const parent = target.path.slice(0, -1).reduce((item, key) => (item[key] ??= {}), result);
    parent[target.path.at(-1)] = clone(value);
    // Native blocks also have editable derived fields. Refresh them so a later
    // title/media edit cannot restore stale text from before emoji insertion.
    const nativeIndex = target.path.indexOf('native_data');
    const owner = at(result, target.path.slice(0, nativeIndex - 1));
    const fresh = parseRichMessage({ rich_message: { blocks: [owner.data.native_data] } })[0];
    const merge = (oldBlock, newBlock) => {
      for (const key of ['children', 'media_children']) {
        if (Array.isArray(newBlock.data[key])) newBlock.data[key] = newBlock.data[key].map((child, i) => {
          const oldChild = oldBlock.data[key]?.[i];
          return oldChild ? merge(oldChild, child) : child;
        });
      }
      return { ...oldBlock, data: { ...oldBlock.data, ...newBlock.data } };
    };
    owner.data = merge(owner, fresh).data;
  } else {
    let object = at(result, target.path);
    if (!object || typeof object !== 'object') {
      object = {};
      at(result, target.path.slice(0, -1))[target.path.at(-1)] = object;
    }
    const [rich, html, text] = target.keys;
    object[rich] = clone(value);
    object[html] = richTextToHtml(value);
    object[text] = plainRichText(value);
  }
  return result;
}
