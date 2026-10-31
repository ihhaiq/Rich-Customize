(() => {
  const MARKUP_RE = /<tg-emoji\s+emoji-id\s*=\s*(["'])([1-9][0-9]{0,19})\1\s*>([^<>\r\n]+)<\/tg-emoji\s*>|!\[([^\]\r\n<>]+)\]\(tg:\/\/emoji\?id=([1-9][0-9]{0,19})\)/gi;

  function decodeHtml(value) {
    const codePoint = (number, original) => Number.isInteger(number) && number >= 0
      && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number) : original;
    return String(value || '')
      .replace(/&#x([0-9a-f]+);/gi, (raw, hex) => codePoint(Number.parseInt(hex, 16), raw))
      .replace(/&#([0-9]+);/g, (raw, number) => codePoint(Number.parseInt(number, 10), raw))
      .replaceAll('&nbsp;', '\u00a0')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&apos;', "'")
      .replaceAll('&amp;', '&');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function parseText(value) {
    const source = String(value || '');
    const replacements = [];
    const richText = [];
    let text = '';
    let html = '';
    let cursor = 0;
    for (const match of source.matchAll(MARKUP_RE)) {
      const emojiId = match[2] || match[5];
      const alternativeText = decodeHtml(match[3] || match[4] || '');
      if (!alternativeText || alternativeText.length > 64) continue;
      const start = match.index;
      const end = start + match[0].length;
      text += source.slice(cursor, start);
      html += escapeHtml(source.slice(cursor, start));
      if (start > cursor) richText.push(source.slice(cursor, start));
      const outputOffset = text.length;
      text += alternativeText;
      html += '<tg-emoji emoji-id="' + emojiId + '">' + escapeHtml(alternativeText) + '</tg-emoji>';
      replacements.push({start, end, outputOffset, length:alternativeText.length, emojiId, alternativeText});
      richText.push({type:'custom_emoji', custom_emoji_id:emojiId, alternative_text:alternativeText});
      cursor = end;
    }
    text += source.slice(cursor);
    html += escapeHtml(source.slice(cursor));
    if (cursor < source.length) richText.push(source.slice(cursor));
    const mapOffset = offset => {
      let delta = 0;
      for (const item of replacements) {
        if (offset <= item.start) break;
        if (offset < item.end) return item.outputOffset + item.length;
        delta += item.length - (item.end - item.start);
      }
      return offset + delta;
    };
    return {
      text,
      html,
      changed:replacements.length > 0,
      replacements,
      richText:replacements.length ? (richText.length === 1 ? richText[0] : richText) : source,
      mapOffset,
    };
  }

  function caretPoint(parts, offset) {
    let consumed = 0;
    for (const part of parts) {
      const end = consumed + part.length;
      if (offset <= end) {
        if (part.emoji) return {after:part.node};
        return {node:part.node, offset:Math.max(0, offset - consumed)};
      }
      consumed = end;
    }
    const last = parts.at(-1);
    if (!last) return null;
    if (last.emoji) return {after:last.node};
    return {node:last.node, offset:last.length};
  }

  function clipboardCodeText(clipboardData) {
    const plain = String(clipboardData?.getData?.('text/plain') || '');
    if (parseText(plain).changed) return plain;
    const html = String(clipboardData?.getData?.('text/html') || '');
    if (!html || !/<tg-emoji\b/i.test(html)) return '';
    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('tg-emoji[emoji-id]').forEach(tag => {
      const emojiId = String(tag.getAttribute('emoji-id') || '');
      const alternativeText = String(tag.textContent || '');
      if (!/^[1-9][0-9]{0,19}$/.test(emojiId) || !alternativeText || alternativeText.length > 64) return;
      tag.replaceWith(document.createTextNode(
        '<tg-emoji emoji-id="' + emojiId + '">' + alternativeText + '</tg-emoji>',
      ));
    });
    const text = String(template.content.textContent || '');
    return parseText(text).changed ? text : '';
  }

  function handlePaste(event) {
    const editor = event.target?.closest?.('.rich-inline-editor');
    if (!editor || event.defaultPrevented) return false;
    const text = clipboardCodeText(event.clipboardData);
    if (!text) return false;
    event.preventDefault();
    const selection = window.getSelection?.();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    range.deleteContents();
    const fragment = document.createDocumentFragment();
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let lastNode = null;
    lines.forEach((line, index) => {
      if (line) {
        lastNode = document.createTextNode(line);
        fragment.appendChild(lastNode);
      }
      if (index < lines.length - 1) {
        lastNode = document.createElement('br');
        fragment.appendChild(lastNode);
      }
    });
    if (!lastNode) {
      lastNode = document.createTextNode('');
      fragment.appendChild(lastNode);
    }
    range.insertNode(fragment);
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    convertEditor(editor);
    editor.dispatchEvent(new InputEvent('input', {
      bubbles:true,
      inputType:'insertFromPaste',
      data:text,
    }));
    return true;
  }

  function convertEditor(editor) {
    if (!editor?.isConnected) return false;
    const selection = window.getSelection?.();
    const saved = selection?.isCollapsed && editor.contains(selection.anchorNode)
      ? {node:selection.anchorNode, offset:selection.anchorOffset} : null;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement?.closest?.('tg-emoji[emoji-id]')) nodes.push(node);
    }

    let changed = false;
    for (const node of nodes) {
      const parsed = parseText(node.nodeValue || '');
      if (!parsed.changed) continue;
      const fragment = document.createDocumentFragment();
      const parts = [];
      let cursor = 0;
      for (const item of parsed.replacements) {
        if (item.start > cursor) {
          const textNode = document.createTextNode(node.nodeValue.slice(cursor, item.start));
          fragment.appendChild(textNode);
          parts.push({node:textNode, length:textNode.length, emoji:false});
        }
        const tag = document.createElement('tg-emoji');
        tag.setAttribute('emoji-id', item.emojiId);
        tag.textContent = item.alternativeText;
        tag.contentEditable = 'false';
        tag.setAttribute('aria-label', item.alternativeText);
        fragment.appendChild(tag);
        parts.push({node:tag, length:item.alternativeText.length, emoji:true});
        cursor = item.end;
      }
      if (cursor < node.nodeValue.length) {
        const textNode = document.createTextNode(node.nodeValue.slice(cursor));
        fragment.appendChild(textNode);
        parts.push({node:textNode, length:textNode.length, emoji:false});
      }
      const point = saved?.node === node ? caretPoint(parts, parsed.mapOffset(saved.offset)) : null;
      node.replaceWith(fragment);
      if (point && selection) {
        const range = document.createRange();
        if (point.after) range.setStartAfter(point.after);
        else range.setStart(point.node, point.offset);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        saved.node = null;
      }
      changed = true;
    }
    if (changed) window.RichAppleInlineEmoji?.refresh?.();
    return changed;
  }

  if (typeof document !== 'undefined') document.addEventListener('paste', handlePaste);
  window.RichCustomEmojiCode = Object.freeze({parseText, convertEditor, handlePaste});
})();
