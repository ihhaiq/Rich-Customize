import {
  anchorDisplayName,
  anchorTargetId,
  anchorTargets,
} from 'lib/editor-anchors';
import {
  BLOCK_SCROLL_SIZE,
  DETAILS_CHILD_TYPES,
  MEDIA_CAPTION_TYPES,
  QUOTE_TYPES,
  blockButtonText,
  blockLabel,
  normalizeBlockScrollOffset,
  tableFlag,
  tableRows,
} from 'lib/editor-blocks';
import { resolveLanguage, t } from 'lib/i18n';

export function editorLanguage(languageCode) {
  return resolveLanguage(languageCode);
}

export function editorCopy(languageCode) {
  const locale = resolveLanguage(languageCode);
  return {
    customize: t(locale, 'editor.customize_title'),
    savePage: t(locale, 'save_page'),
    chooseAction: t(locale, 'common.choose_action'),
    chooseBlock: t(locale, 'editor.choose_block'),
    choosePosition: t(locale, 'common.choose_action'),
    addBlock: t(locale, 'add_block'),
    pages: t(locale, 'pages'),
    preview: t(locale, 'ux.editor.preview'),
    undo: t(locale, 'editor.undo_button'),
    redo: t(locale, 'editor.redo_button'),
    tools: t(locale, 'editor.tools_button'),
    toolsText: t(locale, 'editor.tools_text'),
    manageButtons: t(locale, 'ux.editor.manage_buttons'),
    publish: t(locale, 'ux.editor.publish'),
    currentPositionNotice: t(locale, 'block.position_text', { current: 1, total: 1 }),
    retry: t(locale, 'ux.common.retry'),
    back: t(locale, 'ux.common.back'),
    scrollUp: t(locale, 'editor.scroll_up'),
    scrollDown: t(locale, 'editor.scroll_down'),
    chooseNewBlock: t(locale, 'editor.choose_new_block_type'),
    chooseHeading: t(locale, 'editor.choose_heading_level'),
    chooseNewHeading: t(locale, 'editor.choose_new_heading_level'),
    text: t(locale, 'block.text'),
    paragraph: t(locale, 'block.paragraph'),
    heading: t(locale, 'block.heading'),
    preformatted: t(locale, 'block.preformatted'),
    footer: t(locale, 'block.footer'),
    divider: t(locale, 'block.divider'),
    headingLevels: Array.from({ length: 6 }, (_, index) => t(locale, 'heading.level_' + (index + 1))),
    previewBlock: t(locale, 'preview_block'),
    edit: t(locale, 'edit'),
    duplicate: t(locale, 'block.duplicate_button'),
    duplicated: t(locale, 'block.duplicated'),
    delete: t(locale, 'delete'),
    changeTarget: t(locale, 'anchor.change_target'),
    moveAnchorTo: (target) => t(locale, 'anchor.move_before_target', { target }),
    deleteWithAnchor: t(locale, 'anchor.delete_with_target'),
    linkedDeleteWarning: (count) => t(locale, 'anchor.target_delete_warning', { count }),
    anchorDeleted: t(locale, 'anchor.deleted'),
    moveUp: t(locale, 'block.move_up'),
    moveDown: t(locale, 'block.move_down'),
    yesDelete: t(locale, 'ux.common.yes_delete'),
    cancel: t(locale, 'common.cancel'),
    manage: t(locale, 'edit'),
    currentPosition: t(locale, 'block.position_text', { current: 1, total: 1 }),
    positionJoin: ' / ',
    order: t(locale, 'block.order_text'),
    added: t(locale, 'block_added'),
    deleted: t(locale, 'delete'),
    empty: t(locale, 'editor.empty_hint'),
  };
}


export function editorMainText(languageCode) {
  const copy = editorCopy(languageCode);
  return copy.customize + '\n\n' + copy.chooseBlock;
}

export function editorDashboardText(session, languageCode, notice = null) {
  const locale = resolveLanguage(languageCode);
  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  const buttons = Array.isArray(session?.messageButtons) ? session.messageButtons : [];
  const lines = [];
  if (notice) lines.push(notice, '');
  lines.push(
    t(locale, 'customize'),
    t(locale, 'editor.block_count', { count: blocks.length }),
    t(locale, 'ux.editor.buttons', { count: buttons.length }),
    session?.currentPageId
      ? t(locale, 'save_page') + ': ' + (session.currentPageTitle || session.currentPageId)
      : t(locale, 'ux.editor.page_unsaved'),
    '',
    t(locale, 'common.choose_action'),
  );
  return lines.join('\n');
}

export function buildEditorKeyboard(session, languageCode) {
  const copy = editorCopy(languageCode);
  const blocks = [...(Array.isArray(session?.blocks) ? session.blocks : [])]
    .sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));

  if (!blocks.length) {
    return {
      inline_keyboard: [[
        { text: copy.pages, callback_data: 'r:pages' },
        { text: copy.addBlock, callback_data: 'r:addmenu', style: 'primary' },
      ]],
    };
  }

  const offset = normalizeBlockScrollOffset(blocks.length, session?.blockScrollOffset);
  const visible = blocks.slice(offset, offset + BLOCK_SCROLL_SIZE);
  const rows = [];
  if (offset > 0) {
    rows.push([{ text: copy.scrollUp, callback_data: 'r:blockscroll:' + Math.max(0, offset - BLOCK_SCROLL_SIZE) }]);
  }

  for (let index = 0; index < visible.length; index += 1) {
    const block = visible[index];
    const absolute = offset + index;
    const button = {
      text: blockButtonText(block, absolute, languageCode),
      callback_data: 'r:b:' + block.id,
    };
    if (block.type === 'divider') {
      button.style = 'primary';
      rows.push([button]);
    } else {
      rows.push([
        { text: '👁︎', callback_data: 'r:peek:' + block.id },
        button,
      ]);
    }
  }

  if (offset + BLOCK_SCROLL_SIZE < blocks.length) {
    rows.push([{ text: copy.scrollDown, callback_data: 'r:blockscroll:' + (offset + BLOCK_SCROLL_SIZE) }]);
  }

  rows.push([{ text: copy.preview, callback_data: 'r:result', style: 'primary' }]);
  if (blocks.length >= 2) {
    rows.push([
      { text: copy.undo, callback_data: 'r:undo' },
      { text: copy.redo, callback_data: 'r:redo' },
    ]);
  }
  rows.push([
    { text: copy.tools, callback_data: 'r:tools', style: 'primary' },
  ]);
  rows.push([
    { text: copy.addBlock, callback_data: 'r:addmenu', style: 'primary' },
    { text: copy.publish, callback_data: 'r:post', style: 'success' },
  ]);
  return { inline_keyboard: rows };
}

export function buildEditorToolsKeyboard(languageCode) {
  const copy = editorCopy(languageCode);
  return {
    inline_keyboard: [
      [
        { text: copy.pages, callback_data: 'r:pages' },
        { text: copy.manageButtons, callback_data: 'r:buttons' },
      ],
      [{
        text: copy.savePage,
        callback_data: 'r:savepage',
        style: 'success',
      }],
      [{ text: copy.back, callback_data: 'r:back' }],
    ],
  };
}

export function buildAddBlockKeyboard(languageCode) {
  const copy = editorCopy(languageCode);
  const choices = [
    ['paragraph', 'r:add:paragraph'],
    ['heading', 'r:add:heading'],
    ['preformatted', 'r:add:preformatted'],
    ['footer', 'r:add:footer'],
    ['divider', 'r:add:divider'],
    ['mathematical_expression', 'r:add:mathematical_expression'],
    ['anchor', 'r:add:anchor'],
    ['list', 'r:add:listmenu'],
    ['blockquote', 'r:add:blockquote'],
    ['pullquote', 'r:add:pullquote'],
    ['collage', 'r:add:collage'],
    ['slideshow', 'r:add:slideshow'],
    ['table', 'r:add:table'],
    ['details', 'r:add:details'],
    ['map', 'r:add:map'],
    ['animation', 'r:add:animation'],
    ['audio', 'r:add:audio'],
    ['photo', 'r:add:photo'],
    ['document', 'r:add:document'],
    ['video', 'r:add:video'],
    ['voice', 'r:add:voice'],
  ];
  const rows = [];
  for (let index = 0; index < choices.length; index += 2) {
    rows.push(choices.slice(index, index + 2).map(([kind, callbackData]) => ({
      text: blockLabel(kind, languageCode),
      callback_data: callbackData,
    })));
  }
  rows.push([{ text: copy.back, callback_data: 'r:back' }]);
  return { inline_keyboard: rows };
}

export function buildListTypeKeyboard(languageCode, callbackPrefix = 'r:addlist', backData = 'r:addmenu') {
  const locale = resolveLanguage(languageCode);
  return {
    inline_keyboard: [
      [{ text: t(locale, 'list.bullet'), callback_data: callbackPrefix + ':bullet' }],
      [{ text: t(locale, 'list.numbered'), callback_data: callbackPrefix + ':numbered' }],
      [{ text: t(locale, 'list.checklist'), callback_data: callbackPrefix + ':checklist' }],
      [{ text: t(locale, 'common.cancel'), callback_data: backData }],
    ],
  };
}

export function buildHeadingLevelKeyboard(action, languageCode, blockId = null) {
  const copy = editorCopy(languageCode);
  const suffix = blockId ? ':' + blockId : '';
  const rows = [];
  for (let start = 1; start <= 6; start += 2) {
    const row = [];
    for (let level = start; level < Math.min(start + 2, 7); level += 1) {
      row.push({
        text: copy.headingLevels[level - 1],
        callback_data: 'r:hs:' + action + ':' + level + suffix,
      });
    }
    rows.push(row);
  }
  rows.push([{
    text: copy.back,
    callback_data: action === 'add'
      ? 'r:addmenu'
      : action === 'details'
        ? 'r:details:add'
        : 'r:b:' + blockId,
  }]);
  return { inline_keyboard: rows };
}

export function blockPage(block, blocks, languageCode) {
  const copy = editorCopy(languageCode);
  const ordered = [...blocks].sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
  let index = ordered.findIndex((item) => String(item?.id) === String(block?.id));
  if (index < 0) index = 0;
  const locale = resolveLanguage(languageCode);
  const name = blockLabel(block?.type, languageCode);
  const lines = [
    t(locale, 'block.manage_title', { name }),
    t(locale, 'block.position_text', { current: index + 1, total: ordered.length }),
    '',
    t(locale, 'block.order_text'),
  ];
  for (let position = 0; position < ordered.length; position += 1) {
    const item = ordered[position];
    const marker = String(item?.id) === String(block?.id) ? '◀️ ' : '';
    lines.push(marker + (position + 1) + '. ' + blockLabel(item?.type, languageCode));
  }
  lines.push('', copy.chooseAction);
  return lines.join('\n');
}

export function buildBlockEditorKeyboard(block, blocks, languageCode) {
  const copy = editorCopy(languageCode);
  const ordered = [...blocks].sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
  const position = Math.max(0, ordered.findIndex((item) => String(item?.id) === String(block?.id)));
  const id = String(block.id);
  const linkedAnchor = block.type === 'anchor' && Boolean(anchorTargetId(block));
  const rows = [[{
    text: copy.previewBlock,
    callback_data: 'r:pv:' + id,
    style: 'primary',
  }]];

  if (block.type !== 'divider') {
    rows.push([{ text: copy.edit, callback_data: 'r:e:' + id }]);
  }
  if (block.type === 'anchor') {
    rows.push([{ text: copy.changeTarget, callback_data: 'r:am:' + id }]);
  }
  if (block.type === 'details') {
    rows.push([{
      text: t(resolveLanguage(languageCode), 'details.edit_title_button'),
      callback_data: 'r:f:' + id + ':summary',
    }]);
    rows.push([{
      text: t(resolveLanguage(languageCode), 'details.inner_manage_button'),
      callback_data: 'r:dim:' + id,
      style: 'primary',
    }]);
  }
  if (block.type === 'table') {
    rows.push([{
      text: t(resolveLanguage(languageCode), 'table.cell_settings_button'),
      callback_data: 'r:tm:' + id,
    }]);
  }
  if (block.type === 'list' && String(block?.data?.kind || '') === 'checklist') {
    const items = Array.isArray(block?.data?.items) ? block.data.items : [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const checked = Boolean(item.is_checked);
      let label = String(item.text || (t(resolveLanguage(languageCode), 'list.unnamed_task')));
      if (label.length > 48) label = label.slice(0, 47) + '…';
      rows.push([{
        text: (checked ? '☑️ ' : '☐ ') + label,
        callback_data: 'r:ct:' + id + ':' + index,
        ...(checked ? { style: 'success' } : {}),
      }]);
    }
  }
  if (MEDIA_CAPTION_TYPES.includes(String(block.type))) {
    rows.push([
      {
        text: t(resolveLanguage(languageCode), 'media.edit_caption_button'),
        callback_data: 'r:f:' + id + ':caption',
      },
      {
        text: t(resolveLanguage(languageCode), 'media.edit_source_button'),
        callback_data: 'r:f:' + id + ':credit',
      },
    ]);
  } else if (QUOTE_TYPES.includes(String(block.type))) {
    rows.push([{
      text: t(resolveLanguage(languageCode), 'quote.edit_author_button'),
      callback_data: 'r:f:' + id + ':credit',
    }]);
  }
  if (block.type !== 'anchor') {
    rows.push([{ text: copy.duplicate, callback_data: 'r:dup:' + id }]);
  }
  rows.push([{ text: copy.delete, callback_data: 'r:d:' + id, style: 'danger' }]);
  if (!linkedAnchor) {
    rows.push([
      position <= 0
        ? { text: copy.moveUp, disabled: {} }
        : { text: copy.moveUp, callback_data: 'r:mu:' + id },
      position >= ordered.length - 1
        ? { text: copy.moveDown, disabled: {} }
        : { text: copy.moveDown, callback_data: 'r:md:' + id },
    ]);
  }
  rows.push([{ text: copy.back, callback_data: 'r:back' }]);
  return { inline_keyboard: rows };
}

export function buildTableOptionsKeyboard(blockId, languageCode) {
  const locale = resolveLanguage(languageCode);
  const choices = [
    [t(locale, 'table.shade_cell'), 'sh'],
    [t(locale, 'table.unshade_cell'), 'uh'],
    [t(locale, 'table.center_cell'), 'ce'],
    [t(locale, 'table.uncenter_cell'), 'ue'],
    [t(locale, 'table.shade_all'), 'sha'],
    [t(locale, 'table.unshade_all'), 'uha'],
    [t(locale, 'table.center_all'), 'cea'],
    [t(locale, 'table.uncenter_all'), 'uea'],
  ];
  const rows = [];
  for (let index = 0; index < choices.length; index += 2) {
    rows.push(choices.slice(index, index + 2).map(([text, action]) => ({
      text,
      callback_data: 'r:ta:' + blockId + ':' + action,
    })));
  }
  rows.push([{
    text: t(locale, 'table.appearance_settings_button'),
    callback_data: 'r:tdisplay:' + blockId,
    style: 'primary',
  }]);
  rows.push([{ text: t(locale, 'ux.common.back'), callback_data: 'r:b:' + blockId }]);
  return { inline_keyboard: rows };
}

export function buildTableCellKeyboard(block, action, languageCode) {
  const id = String(block?.id || '');
  const buttons = [];
  const rows = tableRows(block);
  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < rows[row].length; column += 1) {
      const raw = rows[row][column];
      const span = raw && typeof raw === 'object' && Number(raw.colspan || 1) > 1
        ? ' ↔' + Number(raw.colspan)
        : '';
      buttons.push({
        text: (row + 1) + '×' + (column + 1) + span,
        callback_data: 'r:tc:' + id + ':' + action + ':' + row + ':' + column,
      });
    }
  }
  const keyboard = [];
  for (let index = 0; index < buttons.length; index += 4) keyboard.push(buttons.slice(index, index + 4));
  keyboard.push([{ text: editorCopy(languageCode).back, callback_data: 'r:tm:' + id }]);
  return { inline_keyboard: keyboard };
}

export function buildTableDisplayKeyboard(block, languageCode) {
  const id = String(block?.id || '');
  const locale = resolveLanguage(languageCode);
  const data = block?.data && typeof block.data === 'object' ? block.data : {};
  const native = data.native_data && typeof data.native_data === 'object' ? data.native_data : {};
  const hasCaption = Boolean(
    data.caption_rich_text || data.caption_html || data.caption_text || native.caption
  );
  return {
    inline_keyboard: [
      [{ text: (tableFlag(block, 'is_bordered') ? '✅ ' : '❌ ') + t(locale, 'table.borders'), callback_data: 'r:ttoggle:' + id + ':is_bordered' }],
      [{ text: (tableFlag(block, 'is_striped') ? '✅ ' : '❌ ') + t(locale, 'table.striped_rows'), callback_data: 'r:ttoggle:' + id + ':is_striped' }],
      [{ text: (tableFlag(block, 'is_compact') ? '✅ ' : '❌ ') + t(locale, 'table.compact_mode'), callback_data: 'r:ttoggle:' + id + ':is_compact' }],
      [{ text: t(locale, hasCaption ? 'table.edit_caption' : 'table.add_caption'), callback_data: 'r:tcaption:' + id }],
      [{ text: t(locale, 'ux.common.back'), callback_data: 'r:tm:' + id }],
    ],
  };
}

export function buildDetailsContentKeyboard(childCount, languageCode) {
  const locale = resolveLanguage(languageCode);
  const rows = [[{
    text: t(locale, 'details.inner_add_button'),
    callback_data: 'r:details:add',
    style: 'primary',
  }]];
  if (Number(childCount) > 0) {
    rows.push([{
      text: t(locale, 'details.finish_button', { count: Number(childCount) }),
      callback_data: 'r:details:finish',
      style: 'success',
    }]);
  }
  rows.push([{ text: t(locale, 'ux.common.back'), callback_data: 'r:details:cancel' }]);
  return { inline_keyboard: rows };
}

export function buildDetailsChildTypeKeyboard(languageCode) {
  const rows = [];
  for (let index = 0; index < DETAILS_CHILD_TYPES.length; index += 2) {
    rows.push(DETAILS_CHILD_TYPES.slice(index, index + 2).map((kind) => ({
      text: blockLabel(kind, languageCode),
      callback_data: 'r:details:type:' + kind,
    })));
  }
  rows.push([{ text: editorCopy(languageCode).back, callback_data: 'r:details:content' }]);
  return { inline_keyboard: rows };
}

export function buildDetailsInnerBlocksKeyboard(details, languageCode) {
  const id = String(details?.id || '');
  const children = [...(Array.isArray(details?.data?.children) ? details.data.children : [])]
    .sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
  const rows = children.map((child, index) => [{
    text: (index + 1) + '. ' + blockLabel(child?.type, languageCode),
    callback_data: 'r:di:' + id + ':' + child.id,
  }]);
  rows.push([{ text: editorCopy(languageCode).back, callback_data: 'r:b:' + id }]);
  return { inline_keyboard: rows };
}

export function buildDetailsInnerBlockKeyboard(details, child, languageCode) {
  const detailsId = String(details?.id || '');
  const childId = String(child?.id || '');
  const children = [...(Array.isArray(details?.data?.children) ? details.data.children : [])]
    .sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
  const position = Math.max(0, children.findIndex((item) => String(item?.id) === childId));
  const prefix = detailsId + ':' + childId;
  const locale = resolveLanguage(languageCode);
  const rows = [[{ text: t(locale, 'ux.editor.preview'), callback_data: 'r:dip:' + prefix, style: 'primary' }]];
  if (child?.type !== 'divider') rows.push([{ text: t(locale, 'edit'), callback_data: 'r:die:' + prefix }]);
  if (MEDIA_CAPTION_TYPES.includes(String(child?.type || ''))) {
    rows.push([
      { text: t(locale, 'media.edit_caption_button'), callback_data: 'r:dif:' + prefix + ':caption' },
      { text: t(locale, 'media.edit_source_button'), callback_data: 'r:dif:' + prefix + ':credit' },
    ]);
  } else if (QUOTE_TYPES.includes(String(child?.type || ''))) {
    rows.push([{ text: t(locale, 'quote.edit_author_button'), callback_data: 'r:dif:' + prefix + ':credit' }]);
  } else if (!['footer', 'divider', 'anchor'].includes(String(child?.type || ''))) {
    rows.push([{ text: t(locale, 'details.inner_add_footer'), callback_data: 'r:dif:' + prefix + ':add_footer' }]);
  }
  rows.push([{ text: t(locale, 'delete'), callback_data: 'r:did:' + prefix, style: 'danger' }]);
  rows.push([
    position <= 0 ? { text: t(locale, 'block.move_up'), disabled: {} } : { text: t(locale, 'block.move_up'), callback_data: 'r:dimu:' + prefix },
    position >= children.length - 1 ? { text: t(locale, 'block.move_down'), disabled: {} } : { text: t(locale, 'block.move_down'), callback_data: 'r:dimd:' + prefix },
  ]);
  rows.push([{ text: t(locale, 'ux.common.back'), callback_data: 'r:dim:' + detailsId }]);
  return { inline_keyboard: rows };
}

function copyFor(languageCode, key) {
  return editorCopy(languageCode)[key] || key;
}

export function buildDetailsInnerDeleteKeyboard(detailsId, childId, languageCode) {
  return {
    inline_keyboard: [[
      { text: editorCopy(languageCode).yesDelete, callback_data: 'r:didok:' + detailsId + ':' + childId, style: 'danger' },
      { text: editorCopy(languageCode).cancel, callback_data: 'r:di:' + detailsId + ':' + childId },
    ]],
  };
}

export function buildBlockPositionKeyboard(blocks, blockId, languageCode) {
  const copy = editorCopy(languageCode);
  const ordered = [...(Array.isArray(blocks) ? blocks : [])]
    .sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
  const rows = ordered.map((block, index) => {
    const current = String(block?.id) === String(blockId);
    return [{
      text: (current ? '✅ ' : '') + String(index + 1),
      ...(current
        ? { disabled: {} }
        : { callback_data: 'r:mt:' + blockId + ':' + index }),
    }];
  });
  rows.push([{ text: copy.back, callback_data: 'r:b:' + blockId }]);
  return { inline_keyboard: rows };
}

export function buildDeleteConfirmationKeyboard(blockId, languageCode) {
  const copy = editorCopy(languageCode);
  return {
    inline_keyboard: [[
      { text: copy.yesDelete, callback_data: 'r:dc:' + blockId, style: 'danger' },
      { text: copy.cancel, callback_data: 'r:b:' + blockId },
    ]],
  };
}


export function buildErrorRecoveryKeyboard(languageCode) {
  const copy = editorCopy(languageCode);
  return {
    inline_keyboard: [[
      { text: copy.retry, callback_data: 'r:result', style: 'primary' },
      { text: copy.back, callback_data: 'r:back' },
    ]],
  };
}


export function linkedAnchorDeleteText(count, languageCode) {
  return editorCopy(languageCode).linkedDeleteWarning(count);
}

export function buildLinkedAnchorDeleteKeyboard(blockId, blocks, languageCode) {
  const copy = editorCopy(languageCode);
  const ordered = [...(Array.isArray(blocks) ? blocks : [])].sort(
    (a, b) => Number(a?.position || 0) - Number(b?.position || 0),
  );
  const candidates = anchorTargets(ordered, [blockId]);
  const rows = candidates.map((target) => {
    const index = ordered.findIndex((item) => String(item?.id) === String(target?.id));
    return [{
      text: copy.moveAnchorTo(blockButtonText(target, Math.max(0, index), languageCode)),
      callback_data: 'r:adr:' + blockId + ':' + target.id,
    }];
  });
  rows.push([{
    text: copy.deleteWithAnchor,
    callback_data: 'r:adc:' + blockId,
    style: 'danger',
  }]);
  rows.push([{ text: copy.cancel, callback_data: 'r:b:' + blockId }]);
  return { inline_keyboard: rows };
}

export function buildAnchorTargetKeyboard(blocks, languageCode, callbackPrefix, backData) {
  const copy = editorCopy(languageCode);
  const ordered = [...(Array.isArray(blocks) ? blocks : [])].sort(
    (a, b) => Number(a?.position || 0) - Number(b?.position || 0),
  );
  const rows = anchorTargets(ordered).map((target) => {
    const index = ordered.findIndex((item) => String(item?.id) === String(target?.id));
    return [{
      text: blockButtonText(target, Math.max(0, index), languageCode),
      callback_data: callbackPrefix + ':' + target.id,
    }];
  });
  rows.push([{ text: copy.cancel, callback_data: backData }]);
  return { inline_keyboard: rows };
}

export function anchorTargetPrompt(block, languageCode) {
  const name = anchorDisplayName(block);
  return t(resolveLanguage(languageCode), 'anchor.choose_target', { name });
}
