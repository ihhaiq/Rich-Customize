import {
  BLOCK_SCROLL_SIZE,
  blockButtonText,
  blockLabel,
  normalizeBlockScrollOffset,
} from 'lib/editor-blocks';

const COPY = {
  en: {
    customize: 'Customize message',
    blockCount: 'Block count',
    buttons: 'Buttons',
    savePage: '💾 Save Page',
    chooseAction: 'Choose an action:',
    addBlock: '➕ Add block',
    pages: '📚 My Pages',
    preview: '👁 Preview',
    undo: '↩️ Undo',
    redo: '↪️ Redo',
    tools: '🛠 More tools',
    publish: '📤 Publish',
    retry: '🔄 Try again',
    back: '🔙 Back',
    scrollUp: '⬆️ Up',
    scrollDown: '⬇️ Scroll',
    chooseNewBlock: 'Choose the new block type:',
    chooseHeading: 'Choose the heading level:',
    chooseNewHeading: 'Choose the new heading level:',
    text: '📝 Text',
    paragraph: '📝 Paragraph',
    heading: '🔠 Section heading',
    preformatted: '💻 Preformatted',
    footer: '🔻 Footer',
    divider: '➖ Divider',
    headingLevels: [
      'H1 — Largest', 'H2 — Large', 'H3 — Medium large',
      'H4 — Medium', 'H5 — Small', 'H6 — Smallest',
    ],
    previewBlock: '👁 Preview this Block',
    edit: '✏️ Edit',
    duplicate: '📋 Duplicate Block',
    duplicated: 'Block duplicated.',
    delete: '🗑 Delete',
    moveUp: '⬆️ Move up',
    moveDown: '⬇️ Move down',
    yesDelete: '🗑 Yes, delete',
    cancel: 'Cancel',
    manage: 'Manage',
    currentPosition: 'Current position',
    positionJoin: ' of ',
    order: 'Block order:',
    added: '✅ Block added successfully.',
    deleted: '🗑 Delete',
    empty: 'Customize message\n\nAdd a Block or open one of your saved pages:',
  },
  ar: {
    customize: 'تخصيص الرسالة',
    blockCount: 'عدد البلوكات',
    buttons: 'الأزرار',
    savePage: '💾 حفظ الصفحة',
    chooseAction: 'اختر العملية:',
    addBlock: '➕ إضافة بلوك',
    pages: '📚 صفحاتي',
    preview: '👁 معاينة',
    undo: '↩️ تراجع',
    redo: '↪️ إعادة',
    tools: '🛠 أدوات إضافية',
    publish: '📤 نشر',
    retry: '🔄 حاول مجددًا',
    back: '🔙 رجوع',
    scrollUp: '⬆️ صعود',
    scrollDown: '⬇️ تمرير',
    chooseNewBlock: 'اختر نوع الـBlock الجديد:',
    chooseHeading: 'اختر مستوى العنوان:',
    chooseNewHeading: 'اختر مستوى العنوان الجديد:',
    text: '📝 نص',
    paragraph: '📝 فقرة',
    heading: '🔠 عنوان قسم',
    preformatted: '💻 نص برمجي',
    footer: '🔻 تذييل',
    divider: '➖ فاصل',
    headingLevels: [
      'H1 — الأكبر', 'H2 — كبير', 'H3 — متوسط كبير',
      'H4 — متوسط', 'H5 — صغير', 'H6 — الأصغر',
    ],
    previewBlock: '👁 معاينة هذا الـBlock',
    edit: '✏️ تعديل',
    duplicate: '📋 نسخ الـBlock',
    duplicated: 'تم نسخ الـBlock.',
    delete: '🗑 حذف',
    moveUp: '⬆️ للأعلى',
    moveDown: '⬇️ للأسفل',
    yesDelete: '🗑 نعم، حذف',
    cancel: 'إلغاء',
    manage: 'إدارة',
    currentPosition: 'الموقع الحالي',
    positionJoin: ' من ',
    order: 'ترتيب البلوكات:',
    added: '✅ تمت إضافة البلوك بنجاح.',
    deleted: '🗑 حذف',
    empty: 'تخصيص الرسالة\n\nأضف Block أو افتح إحدى صفحاتك المحفوظة:',
  },
};

export function editorLanguage(languageCode) {
  return String(languageCode || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function editorCopy(languageCode) {
  return COPY[editorLanguage(languageCode)];
}

export function editorDashboardText(session, languageCode, notice = null) {
  const copy = editorCopy(languageCode);
  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  const buttons = Array.isArray(session?.messageButtons) ? session.messageButtons : [];
  const lines = [];
  if (notice) lines.push(notice, '');
  lines.push(
    copy.customize,
    copy.blockCount + ': ' + blocks.length,
    copy.buttons + ': ' + buttons.length,
    copy.savePage + ': ' + (session?.currentPageId ? (session.currentPageTitle || session.currentPageId) : '—'),
    '',
    copy.chooseAction,
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

export function buildAddBlockKeyboard(languageCode) {
  const copy = editorCopy(languageCode);
  const choices = [
    [copy.paragraph, 'paragraph'],
    [copy.heading, 'heading'],
    [copy.preformatted, 'preformatted'],
    [copy.footer, 'footer'],
    [copy.divider, 'divider'],
  ];
  const rows = [];
  for (let index = 0; index < choices.length; index += 2) {
    rows.push(choices.slice(index, index + 2).map(([text, kind]) => ({
      text,
      callback_data: 'r:add:' + kind,
    })));
  }
  rows.push([{ text: copy.back, callback_data: 'r:back' }]);
  return { inline_keyboard: rows };
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
    callback_data: action === 'add' ? 'r:addmenu' : 'r:b:' + blockId,
  }]);
  return { inline_keyboard: rows };
}

export function blockPage(block, blocks, languageCode) {
  const copy = editorCopy(languageCode);
  const ordered = [...blocks].sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
  let index = ordered.findIndex((item) => String(item?.id) === String(block?.id));
  if (index < 0) index = 0;
  const name = blockLabel(block?.type, languageCode);
  const lines = [
    copy.manage + ' ' + name,
    copy.currentPosition + ': ' + (index + 1) + copy.positionJoin + ordered.length,
    '',
    copy.order,
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
  const rows = [[{
    text: copy.previewBlock,
    callback_data: 'r:pv:' + id,
    style: 'primary',
  }]];

  if (block.type !== 'divider') {
    rows.push([{ text: copy.edit, callback_data: 'r:e:' + id }]);
  }
  rows.push([{ text: copy.duplicate, callback_data: 'r:dup:' + id }]);
  rows.push([{ text: copy.delete, callback_data: 'r:d:' + id, style: 'danger' }]);
  rows.push([
    position <= 0
      ? { text: copy.moveUp, disabled: {} }
      : { text: copy.moveUp, callback_data: 'r:mu:' + id },
    position >= ordered.length - 1
      ? { text: copy.moveDown, disabled: {} }
      : { text: copy.moveDown, callback_data: 'r:md:' + id },
  ]);
  rows.push([{ text: copy.back, callback_data: 'r:back' }]);
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
