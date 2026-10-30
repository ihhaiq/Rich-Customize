import { blockLabel } from 'lib/editor-blocks';
import { tutorialCopy, isRtlLocale } from 'lib/i18n';
import { advice, applyAdvice, blockAt, clone, blockPaths, templateBlocks, TEMPLATE_IDS, TYPES, words } from 'lib/editor-import';
import {
  anchorName,
  anchorNavigationRichText,
} from 'lib/editor-anchors';
import { dataRichText, plainRichText } from 'lib/rich-text';
import { richMessageDirection, validateEditorLimits, validateTableRows } from 'lib/editor-blocks';
import { brandingFooterBlock } from 'lib/branding';
import { isDeveloper } from 'lib/developer-access';
import { resolveEditorEntitlement, safePlanLimit } from 'lib/subscription-policy';
import { validateStoredButton } from 'lib/button-validation';

const INPUT_NATIVE_TYPE_ALIASES = Object.freeze({
  text: 'paragraph',
  paragraph: 'paragraph',
  caption: 'paragraph',
  section_heading: 'heading',
  heading: 'heading',
  preformatted: 'pre',
  pre: 'pre',
  footer: 'footer',
  divider: 'divider',
  mathematical_expression: 'mathematical_expression',
  anchor: 'anchor',
  list: 'list',
  block_quotation: 'blockquote',
  blockquote: 'blockquote',
  expandable_block_quotation: 'expandable_blockquote',
  expandable_blockquote: 'expandable_blockquote',
  pull_quotation: 'pullquote',
  pullquote: 'pullquote',
  collage: 'collage',
  slideshow: 'slideshow',
  table: 'table',
  details: 'details',
  map: 'map',
  buttons: 'buttons',
  animation: 'animation',
  audio: 'audio',
  document: 'document',
  photo: 'photo',
  video: 'video',
  voice: 'voice_note',
  voice_note: 'voice_note',
  thinking: 'thinking',
});

function canonicalInputNativeType(value) {
  const type = String(value || '').trim();
  if (!type) return '';
  return INPUT_NATIVE_TYPE_ALIASES[type] || type;
}

function legacyNativeType(blockType, nativeType) {
  return canonicalInputNativeType(nativeType)
    || canonicalInputNativeType(blockType);
}

function nativeMediaSource(value) {
  if (Array.isArray(value) && value.length) {
    const source = value.at(-1);
    return source && typeof source === 'object' && !Array.isArray(source)
      ? source
      : null;
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function defined(target, key, value) {
  if (value !== undefined && value !== null) target[key] = value;
}

function inputMediaPayload(type, source, hasSpoiler = null) {
  const fileId = String(source?.file_id || '');
  if (!fileId) throw new Error('native ' + type + ' block has no reusable file_id');

  const media = {
    type,
    media: fileId,
  };

  if (type === 'photo') {
    if (hasSpoiler) media.has_spoiler = true;
    return media;
  }
  if (type === 'video') {
    defined(media, 'width', source.width);
    defined(media, 'height', source.height);
    defined(media, 'duration', source.duration);
    defined(media, 'supports_streaming', source.supports_streaming);
    if (hasSpoiler) media.has_spoiler = true;
    return media;
  }
  if (type === 'animation') {
    defined(media, 'width', source.width);
    defined(media, 'height', source.height);
    defined(media, 'duration', source.duration);
    if (hasSpoiler) media.has_spoiler = true;
    return media;
  }
  if (type === 'audio') {
    defined(media, 'duration', source.duration);
    defined(media, 'performer', source.performer);
    defined(media, 'title', source.title);
    return media;
  }
  if (type === 'document') {
    defined(media, 'disable_content_type_detection', source.disable_content_type_detection);
    return media;
  }
  if (type === 'voice_note') {
    defined(media, 'duration', source.duration);
    return media;
  }
  return media;
}

function normalizeNativeInputBlock(raw, fallbackType = '') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('invalid native rich block payload');
  }
  const payload = JSON.parse(JSON.stringify(raw));
  const resolvedType = canonicalInputNativeType(payload.type)
    || canonicalInputNativeType(fallbackType);
  if (!resolvedType) throw new Error('legacy native rich block is missing type');
  payload.type = resolvedType;

  if (Array.isArray(payload.blocks)) {
    payload.blocks = payload.blocks.map((child) => normalizeNativeInputBlock(child));
  }
  if (payload.type === 'list' && Array.isArray(payload.items)) {
    payload.items = payload.items.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const normalized = { ...item };
      if (Array.isArray(normalized.blocks)) {
        normalized.blocks = normalized.blocks.map((child) => normalizeNativeInputBlock(child));
      }
      return normalized;
    });
  }

  const mediaField = {
    photo: 'photo',
    video: 'video',
    animation: 'animation',
    audio: 'audio',
    document: 'document',
    voice_note: 'voice_note',
  }[payload.type];
  if (!mediaField) return payload;

  const source = nativeMediaSource(payload[mediaField]);
  if (!source) {
    throw new Error('native ' + payload.type + ' block has no reusable media');
  }
  const hasSpoiler = payload.has_spoiler === true;
  delete payload.has_spoiler;
  payload[mediaField] = inputMediaPayload(payload.type, source, hasSpoiler);
  return payload;
}

function captionPayload(data) {
  const text = dataRichText(data, 'caption_rich_text', 'caption_html', 'caption_text');
  const credit = dataRichText(data, 'credit_rich_text', 'credit_html', 'credit_text');
  if ((text == null || text === '') && (credit == null || credit === '')) return null;
  return { text: text || '', credit: credit || null };
}

function generatedMediaFile(data) {
  const file = data?.file;
  return file && typeof file === 'object' && !Array.isArray(file) ? file : null;
}

function validateRichButton(button, index) {
  if (!button || typeof button !== 'object' || Array.isArray(button)) {
    throw new Error('buttons block has an invalid button at index ' + index);
  }
  const actions = [
    ['url', 'url'],
    ['callback_data', 'callback_data'],
    ['copy_text', 'copy'],
    ['web_app', 'web_app'],
    ['login_url', 'login_url'],
    ['switch_inline_query', 'switch_inline'],
    ['switch_inline_query_current_chat', 'switch_inline_current'],
    ['disabled', 'disabled'],
  ].filter(([key]) => Object.hasOwn(button, key));
  if (actions.length !== 1) {
    throw new Error('buttons block has an invalid button action at index ' + index);
  }
  const [key, type] = actions[0];
  const raw = button[key];
  const value = type === 'copy'
    ? raw?.text
    : type === 'disabled'
      ? ''
      : type === 'web_app' || type === 'login_url'
        ? raw?.url
        : raw;
  const result = validateStoredButton({ ...button, type, value });
  if (!result.ok) {
    throw new Error('buttons block has an invalid button at index ' + index + ': ' + result.code);
  }
}

function renderGeneratedBlock(block) {
  const kind = String(block?.type || '');
  const data = block?.data && typeof block.data === 'object' && !Array.isArray(block.data)
    ? block.data
    : {};
  const text = dataRichText(data, 'rich_text', 'html', 'text');

  if (kind === 'text' || kind === 'paragraph' || kind === 'caption') {
    return { type: 'paragraph', text: text || '' };
  }
  if (kind === 'heading') {
    return {
      type: 'heading',
      text: text || '',
      size: Math.max(1, Math.min(6, Number.parseInt(String(data.size ?? 2), 10) || 2)),
    };
  }
  if (kind === 'preformatted') {
    const payload = { type: 'pre', text: String(data.text || plainRichText(text) || '') };
    if (data.language) payload.language = String(data.language);
    return payload;
  }
  if (kind === 'footer') return { type: 'footer', text: text || '' };
  if (kind === 'divider') return { type: 'divider' };
  if (kind === 'mathematical_expression') {
    return {
      type: 'mathematical_expression',
      expression: String(data.text || plainRichText(text) || ''),
    };
  }
  if (kind === 'anchor') return { type: 'anchor', name: anchorName(block) };

  if (kind === 'buttons') {
    const buttons = Array.isArray(data.buttons) ? data.buttons : [];
    if (buttons.length !== 1) throw new Error('large button block must contain exactly one button');
    buttons.forEach(validateRichButton);
    return {
      type: 'buttons',
      buttons: buttons.map((button) => ({ ...button })),
      align: ['left', 'center', 'right'].includes(data.align) ? data.align : 'center',
    };
  }

  if (kind === 'list') {
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) throw new Error('list block has no items');
    return {
      type: 'list',
      items: items.map((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item) && Array.isArray(item.blocks)) {
          return {
            blocks: item.blocks.flatMap((child) => renderBlockPayloads(child)),
            ...(item.has_checkbox ? { has_checkbox: true } : {}),
            ...(item.is_checked ? { is_checked: true } : {}),
            ...(item.value != null ? { value: item.value } : {}),
            ...(item.type != null ? { type: item.type } : {}),
          };
        }
        const source = item && typeof item === 'object' && !Array.isArray(item)
          ? item
          : { text: String(item ?? '') };
        return {
          blocks: [{
            type: 'paragraph',
            text: dataRichText(source, 'rich_text', 'html', 'text') || '',
          }],
          ...(source.has_checkbox ? { has_checkbox: true } : {}),
          ...(source.is_checked ? { is_checked: true } : {}),
          ...(source.value != null ? { value: source.value } : {}),
          ...(source.type != null ? { type: source.type } : {}),
        };
      }),
    };
  }

  if (kind === 'table') {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (!rows.length || !rows.every((row) => Array.isArray(row) && row.length)) {
      throw new Error('table block has no cells');
    }
    return {
      type: 'table',
      cells: rows.map((row) => row.map((raw) => {
        const source = raw && typeof raw === 'object' && !Array.isArray(raw)
          ? raw
          : { text: String(raw ?? '') };
        const cell = {
          text: dataRichText(source, 'rich_text', 'html', 'text') || '',
          align: source.align || 'left',
          valign: source.valign || 'middle',
        };
        if (source.is_header != null) cell.is_header = Boolean(source.is_header);
        if (source.colspan != null) cell.colspan = Number(source.colspan);
        if (source.rowspan != null) cell.rowspan = Number(source.rowspan);
        return cell;
      })),
      ...(data.is_bordered !== false ? { is_bordered: true } : {}),
      ...(data.is_striped ? { is_striped: true } : {}),
      ...(data.is_compact ? { is_compact: true } : {}),
      ...(dataRichText(data, 'caption_rich_text', 'caption_html', 'caption_text')
        ? { caption: dataRichText(data, 'caption_rich_text', 'caption_html', 'caption_text') }
        : {}),
    };
  }

  if (kind === 'blockquote' || kind === 'pullquote') {
    const quote = dataRichText(data, 'quote_rich_text', 'quote_html', 'quote_text') || '';
    const credit = dataRichText(data, 'credit_rich_text', 'credit_html', 'credit_text') || null;
    if (kind === 'pullquote') return { type: 'pullquote', text: quote, credit };
    return { type: 'blockquote', blocks: [{ type: 'paragraph', text: quote }], credit };
  }

  if (kind === 'details' || kind === 'collage' || kind === 'slideshow') {
    const children = Array.isArray(data.children) ? [...data.children] : [];
    if (!children.length) throw new Error(kind + ' block has no children');
    children.sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
    const payload = {
      type: kind,
      blocks: children.flatMap((child) => renderBlockPayloads(child)),
    };
    if (kind === 'details') {
      payload.summary = dataRichText(data, 'summary_rich_text', 'summary_html', 'summary_text') || '…';
      if (data.is_open != null) payload.is_open = Boolean(data.is_open);
    } else {
      const caption = captionPayload(data);
      if (caption) payload.caption = caption;
    }
    return payload;
  }

  if (kind === 'map') {
    if (data.latitude == null || data.longitude == null) throw new Error('map coordinates are missing');
    const payload = {
      type: 'map',
      location: {
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
      },
      zoom: Number.parseInt(String(data.zoom ?? 15), 10) || 15,
      width: Number.parseInt(String(data.width ?? 600), 10) || 600,
      height: Number.parseInt(String(data.height ?? 400), 10) || 400,
    };
    const caption = captionPayload(data);
    if (caption) payload.caption = caption;
    return payload;
  }

  if (['photo', 'video', 'animation', 'audio', 'voice', 'document'].includes(kind)) {
    const file = generatedMediaFile(data);
    if (!file?.file_id) throw new Error(kind + ' block has no reusable file_id');
    const apiKind = kind === 'voice' ? 'voice_note' : kind;
    const payload = { type: apiKind };
    payload[apiKind] = inputMediaPayload(apiKind, file, data.has_spoiler === true);
    const caption = captionPayload(data);
    if (caption) payload.caption = caption;
    return payload;
  }

  throw new Error('unsupported rich block type: ' + kind);
}

function nativeTablePayload(data) {
  const payload = JSON.parse(JSON.stringify(data.native_data));
  const own = (key) => Object.prototype.hasOwnProperty.call(data, key);

  // Mini App table controls historically updated the editable top-level flags
  // without updating native_data. Prefer explicit editable flags so old/stale
  // native tables render exactly as the editor shows them.
  if (own('is_bordered')) payload.is_bordered = data.is_bordered !== false;
  if (own('is_striped')) payload.is_striped = Boolean(data.is_striped);
  if (own('is_compact')) payload.is_compact = Boolean(data.is_compact);

  return payload;
}

function renderBlockPayloads(block) {
  const kind = String(block?.type || '');
  const data = block?.data && typeof block.data === 'object' && !Array.isArray(block.data)
    ? block.data
    : {};

  if (data.native && data.native_data && typeof data.native_data === 'object' && !Array.isArray(data.native_data)) {
    const nativePayload = kind === 'table'
      ? nativeTablePayload(data)
      : data.native_data;
    return [normalizeNativeInputBlock(
      nativePayload,
      legacyNativeType(kind, data.native_type),
    )];
  }

  if ((kind === 'blockquote' || kind === 'pullquote') && Array.isArray(data.media_children) && data.media_children.length) {
    const nested = data.media_children.flatMap((child) => renderBlockPayloads(child));
    const quote = dataRichText(data, 'quote_rich_text', 'quote_html', 'quote_text');
    if (quote != null && quote !== '') nested.push({ type: 'paragraph', text: quote });
    return [{
      type: 'blockquote',
      blocks: nested,
      credit: dataRichText(data, 'credit_rich_text', 'credit_html', 'credit_text') || null,
    }];
  }
  return [renderGeneratedBlock(block)];
}

function resolveInlinePageCallbacks(value, sourcePageId = null, navigationToken = null) {
  if (Array.isArray(value)) {
    return value.map((item) => resolveInlinePageCallbacks(item, sourcePageId, navigationToken));
  }
  if (!value || typeof value !== 'object') return value;

  const payload = {};
  for (const [key, item] of Object.entries(value)) {
    payload[key] = resolveInlinePageCallbacks(item, sourcePageId, navigationToken);
  }

  const callback = payload.callback_data;
  if (typeof callback === 'string' && callback.startsWith('r:cbd:')) {
    const parts = ['r:page', callback.slice('r:cbd:'.length)];
    if (sourcePageId) {
      parts.push(String(sourcePageId));
      if (navigationToken) parts.push(String(navigationToken));
    }
    payload.callback_data = parts.join(':');
  } else if (typeof callback === 'string' && callback.startsWith('r:cbds:')) {
    const parts = ['r:spage', callback.slice('r:cbds:'.length)];
    if (sourcePageId) {
      parts.push(String(sourcePageId));
      if (navigationToken) parts.push(String(navigationToken));
    }
    payload.callback_data = parts.join(':');
  }
  return payload;
}

function navigationButtonBlock(buttons) {
  if (!Array.isArray(buttons) || !buttons.length) return [];
  return [{
    type: 'buttons',
    buttons: buttons.map((button) => ({ ...button })),
    align: 'center',
  }];
}

// Validate the actual outgoing payload, including imported native tables and
// tables nested inside lists/details. The editable cache is not always the
// structure ultimately sent to the Bot API.
function validateRenderedTables(blocks, technicalOnly = false) {
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    if (block.type === 'table') {
      const result = validateTableRows(block.cells, null, { technicalOnly });
      if (!result.ok) {
        throw new Error('EDITOR_LIMIT:' + result.code + ':' + result.actual + ':' + result.limit);
      }
    }
    if (Array.isArray(block.blocks)) validateRenderedTables(block.blocks, technicalOnly);
    if (Array.isArray(block.items)) {
      for (const item of block.items) {
        if (Array.isArray(item?.blocks)) validateRenderedTables(item.blocks, technicalOnly);
      }
    }
  }
}

export function validateRenderedPayloadLimits(payloads, { userId = null, entitlement = null, technicalOnly = false } = {}) {
  let blocks = 0, media = 0, depth = 0, chars = 0;
  const mediaTypes = new Set(['photo','video','animation','audio','voice_note','document']);
  const textLength = value => {
    if (typeof value === 'string') return value.length;
    if (Array.isArray(value)) return value.reduce((n, x) => n + textLength(x), 0);
    if (!value || typeof value !== 'object') return 0;
    // RichText nesting: text is the single body-bearing field.
    return textLength(value.text ?? value.children ?? value.content ?? '');
  };
  function visit(items, level) {
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || typeof item !== 'object') continue;
      blocks += 1;
      depth = Math.max(depth, level);
      if (mediaTypes.has(item.type)) media += 1;
      if (item.type === 'table' && Array.isArray(item.cells)) {
        blocks += item.cells.length;
        for (const row of item.cells) {
          for (const cell of Array.isArray(row) ? row : []) chars += textLength(cell.text);
        }
      } else if (item.type === 'list' && Array.isArray(item.items)) {
        blocks += item.items.length;
        for (const listItem of item.items) {
          if (Array.isArray(listItem?.blocks)) visit(listItem.blocks, level + 1);
          else chars += textLength(listItem?.text);
        }
      } else {
        chars += textLength(item.text) + textLength(item.summary) + textLength(item.caption) + textLength(item.credit) + textLength(item.buttons);
      }
      if (Array.isArray(item.blocks)) visit(item.blocks, level + 1);
      if (blocks > 500 || media > 50 || depth > 16 || chars > 32768) break;
    }
  }
  visit(payloads, 1);
  for (const [code, actual, limit] of [
    ['blocks', blocks, 500], ['media_attachments', media, 50],
    ['nesting_depth', depth, 16], ['characters', chars, 32768],
  ]) {
    if (actual > limit) throw new Error('EDITOR_LIMIT:' + code + ':' + actual + ':' + limit);
  }
  // The published rich message also contains generated navigation, anchor
  // labels and the branding footer. Charge their actual size to the user's
  // product quota; checking the draft alone can undercount the final message.
  // Trusted legacy saved-page replay and developers bypass product quotas
  // only; neither can bypass Telegram's technical limits above.
  if (!technicalOnly && !isDeveloper(userId)) {
    const trusted = entitlement || resolveEditorEntitlement();
    for (const [code, key, actual] of [
      ['blocks', 'blocks', blocks],
      ['media_attachments', 'mediaAttachments', media],
      ['nesting_depth', 'nestingDepth', depth],
      ['characters', 'text', chars],
    ]) {
      const limit = safePlanLimit(trusted, key);
      if (actual > limit) throw new Error('EDITOR_LIMIT:' + code + ':' + actual + ':' + limit);
    }
  }
}

export function buildInputRichMessage(
  blocks,
  {
    userId = null,
    sourcePageId = null,
    navigationToken = null,
    navigationButtons = null,
    includeBranding = false,
    previousBlocks = null,
    entitlement = null,
    technicalOnly = false,
  } = {},
) {
  if (!Array.isArray(blocks) || !blocks.length) {
    throw new Error('The rich message has no blocks');
  }
  const limit = validateEditorLimits(blocks, userId, { previousBlocks, entitlement, technicalOnly });
  if (!limit.ok) {
    throw new Error('EDITOR_LIMIT:' + limit.code + ':' + limit.actual + ':' + limit.limit);
  }
  const ordered = [...blocks].sort(
    (a, b) => Number(a?.position || 0) - Number(b?.position || 0),
  );
  const payloads = [];
  const anchorNavigation = anchorNavigationRichText(ordered);
  if (anchorNavigation != null) {
    payloads.push({ type: 'paragraph', text: anchorNavigation });
  }
  payloads.push(...ordered.flatMap((block) => renderBlockPayloads(block)));
  payloads.push(...navigationButtonBlock(navigationButtons));
  if (includeBranding) payloads.push(brandingFooterBlock());
  validateRenderedTables(payloads, technicalOnly);
  // System-generated navigation/branding is part of the final Telegram
  // message. Reject technical overflows after adding these blocks as well.
  validateRenderedPayloadLimits(payloads, { userId, entitlement, technicalOnly });
  const direction = richMessageDirection(ordered);
  return {
    blocks: resolveInlinePageCallbacks(
      payloads,
      sourcePageId,
      navigationToken,
    ),
    ...(typeof direction === 'boolean' ? { is_rtl: direction } : {}),
  };
}

export function buildSingleBlockRichMessage(block, options = {}) {
  return buildInputRichMessage([{ ...block, position: 0 }], options);
}


export function guideCallback(state,action) { return 'tut:'+state.epoch+':'+state.revision+':'+action; }
function inert(value) {
  if(Array.isArray(value))return value.map(inert);
  if(!value||typeof value!=='object')return value;
  if(value.type==='button')return String(value.button?.text||'');
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,inert(item)]));
}
export function tutorialView(state,locale,entitlement,notice='') {
  const c=tutorialCopy(locale),w=(ar,en)=>words(locale,ar,en);
  const b=(text,action)=>({text,callback_data:guideCallback(state,action)});
  const allBlocks=text=>({text,callback_data:'r:showcase'});
  const richButton=(text,action)=>({type:'button',button:b(text,action)});
  const paragraph=text=>({type:'paragraph',text});
  let text=c.intro,rows=[],extra=[],preview=state.blocks||[],backButton=null,previousButton=null,nextButton=null;
  const back=()=>{backButton=b(c.back,'back');};
  const options=()=>({type:'details',summary:c.optionsTitle,blocks:[
    paragraph([richButton(c.save,'save')]),
    paragraph([richButton(c.cbd,'cbd')]),
    paragraph([richButton(c.guest,'guest')]),
    paragraph([richButton(c.publishHow,'publish')]),
  ]});
  switch(state.step) {
    case 'home':
      text=c.homeDescription;
      rows=[
        [b(c.build,'build'),b(c.templates,'templates')],
        [allBlocks(c.all)],
      ];
      extra.push(options());
      if(state.handedOff)extra.push(paragraph(w('هاي نسخة الدليل قبل الانتقال للمحرر. تعديلاتك اللاحقة بالمحرر تبقى هناك.','This is the guide snapshot from before the editor handoff. Later editor changes remain in the editor.')));
      if(preview.length)extra.push(paragraph([richButton(c.resume,'preview')]));
      preview=[];break;
    case 'build':text=c.choose;rows=[[b(c.heading,'add:heading'),b(c.table,'add:table')],[b(c.own,'choose')]];back();break;
    case 'catalog':case 'choose': {
      text=state.step==='catalog'?w('اختَر بلوكاً حتى تتعرّف عليه وتجرّبه داخل الدليل.','Choose a block to learn about it and try it in the guide.'):c.choose;
      const start=Math.min(state.listOffset||0,Math.max(0,TYPES.length-1));
      const buttons=TYPES.slice(start,start+8).map(type=>b(blockLabel(type,locale),(state.step==='catalog'?'inspect:':'add:')+type));
      for(let i=0;i<buttons.length;i+=2)rows.push(buttons.slice(i,i+2));
      if(start)previousButton=b(c.previous,'list:'+Math.max(0,start-8));
      if(start+8<TYPES.length)nextButton=b(c.next,'list:'+(start+8));
      back();break;
    }
    case 'inspect':
      preview=state.example?[state.example]:[];
      text=blockLabel(state.inspectType,locale)+' — '+inputHelp(state.inspectType,c);
      rows=[[b(w('أضيفه لمنشوري','Add it to my post'),'add:'+state.inspectType),allBlocks(c.all)]];back();break;
    case 'input':
      text=blockLabel(state.pending.type,locale)+'\n'+inputHelp(state.pending.type,c);
      if(['slideshow','collage'].includes(state.pending.type)){
        rows.push([b(c.mediaDone,'mediaDone')]);
        const children=state.pending.children||[];
        text+='\n'+w('الوسائط المضافة: ','Media added: ')+children.length;
        if(children.length){
          preview=clone(preview);
          const draft={type:state.pending.type,position:preview.length,data:{children}};
          const target=state.pending.path!=null?blockAt(preview,state.pending.path):null;
          if(target)target.data={children};else preview.push(draft);
        }
      }
      back();break;
    case 'preview':
      text=c.fullPreview;rows=[[b(c.opinion,'advice'),b(c.own,'choose')],[b(c.edit,'edit'),b(c.done,'complete')]];
      if(state.undo)rows.push([b(c.undo,'undo'),b(c.exit,'pause')]);
      else rows.push([b(c.exit,'pause')]);
      back();break;
    case 'advice': {
      const suggestion=advice(preview,locale);text=suggestion.text+'\n\n'+c.preview;
      if(suggestion.kind!=='none') {
        preview=applyAdvice(preview,locale);
        rows.push([b(c.apply,'apply')]);
      }
      rows.push([b(c.own,'choose')]);back();break;
    }
    case 'templates':
      text=c.template;{
        const buttons=TEMPLATE_IDS.map((id,i)=>b(c.templateNames[i],'template:'+id));
        for(let i=0;i<buttons.length;i+=2)rows.push(buttons.slice(i,i+2));
      }back();preview=[];break;
    case 'template':case 'replace':
      text=state.step==='replace'?c.replace:c.template;
      preview=templateBlocks(state.template,locale);
      rows=[[b(state.step==='replace'?c.confirm:c.use,state.step==='replace'?'replaceTemplate':'useTemplate')]];back();break;
    case 'edit': {
      text=c.select;
      const items=blockPaths(preview),offset=state.listOffset||0;
      rows=items.slice(offset,offset+8).map(({path,block})=>[b(path+' · '+blockLabel(block.type,locale),'edit:'+path)]);
      if(offset)previousButton=b(c.previous,'list:'+Math.max(0,offset-8));
      if(offset+8<items.length)nextButton=b(c.next,'list:'+(offset+8));
      back();break;
    }
    case 'complete':
      text=c.completeOptions;
      rows=[[b(c.editor,'handoff'),b(c.edit,'edit')]];
      extra.push(options());back();break;
    case 'publish':
      text=state.blocks.length?c.publishSteps:c.empty+'\n\n'+c.publishSteps;
      if(state.blocks.length)rows=[[b(c.editor,'handoff')]];
      else rows=[[b(c.build,'build'),b(c.templates,'templates')]];
      back();break;
    case 'save':text=c.savePrompt;back();break;
    case 'saved':
      text=c.saved;extra.push(paragraph({type:'code',text:state.pageId}));
      extra.push(paragraph({type:'button',button:{text:c.copy,copy_text:{text:state.pageId}}}));
      rows=[[b(c.cbd,'cbd'),b(c.guest,'guest')]];back();break;
    case 'cbd':case 'guest': {
      const saved=state.pageId&&!state.dirty;
      text=saved?(state.step==='cbd'?c.cbdText:c.guestText):c.needSave;
      if(saved){const code=state.step==='cbd'?'{'+w('افتح الصفحة','Open page')+' - CBD:'+state.pageId+' #b}':'@RichCustomizebot '+state.pageId;
        extra.push(paragraph({type:'code',text:code}),paragraph({type:'button',button:{text:c.copy,copy_text:{text:code}}}));}
      else rows.push([b(c.save,'save')]);
      if(saved && state.step==='cbd')extra.push(paragraph([richButton(w('جرّب فتح الصفحة هنا','Try opening the page here'),'trycbd')]));
      if(state.demoBlocks)preview=state.demoBlocks;
      back();break;
    }
    case 'handoff':text=c.handoff;rows=[[b(c.openExisting,'existing')]];back();break;
    case 'paused':text=c.paused;rows=[[b(c.resume,'preview')]];back();break;
    case 'save_retry':text=c.failed;rows=[[b(c.save,'retrySave')]];back();break;
    default:text=c.intro;rows=[[b(c.home,'home')]];
  }
  if(state.previewFailed){preview=[];rows.push([b(w('أعد تحميل المعاينة','Reload preview'),'refresh')]);notice=notice||w('تعذّر عرض الوسائط. محتوى منشورك محفوظ؛ تگدر تعيد المحاولة أو تختار قالباً آخر.','Media could not be displayed. Your draft is kept; retry or choose another layout.');}
  const header=[{type:'heading',size:2,text:c.entry},paragraph(text)];
  if(notice)header.push(paragraph(notice));
  let blocks=[...header,...extra];
  try{
    if(preview.length){
      const content=inert(buildInputRichMessage(preview,{userId:state.userId,entitlement,technicalOnly:true})).blocks;
      blocks=[...header,{type:'divider'},...content,{type:'divider'},...extra];
    }
    validateRenderedPayloadLimits(blocks,{technicalOnly:true});
  }
  catch(error){
    if(!preview.length||!/^EDITOR_LIMIT:(?:blocks|media_attachments|nesting_depth|characters):/.test(String(error?.message||'')))throw error;
    blocks=[{type:'heading',size:2,text:c.entry},paragraph(c.previewTooLarge)];
    rows=[[b(c.edit,'edit'),b(c.editor,'handoff')]];
    previousButton=null;nextButton=null;
    backButton=null;
    validateRenderedPayloadLimits(blocks,{technicalOnly:true});
  }
  if(previousButton||backButton||nextButton){
    rows.push([...(previousButton?[previousButton]:[]),...(backButton?[backButton]:[]),...(nextButton?[nextButton]:[])]);
  } else if(backButton)rows.push([backButton]);
  return {rich_message:{blocks,...(isRtlLocale(locale)?{is_rtl:true}:{})},reply_markup:{inline_keyboard:rows.filter(row=>row.length)}};
}
function inputHelp(type,c) {
  if(type==='table')return c.tableInput;
  if(type==='list')return c.listInput;
  if(type==='details')return c.detailsInput;
  if(type==='map')return c.locationInput;
  if(['photo','video','animation','audio','voice','document','slideshow','collage'].includes(type))return c.mediaInput;
  return c.input;
}
