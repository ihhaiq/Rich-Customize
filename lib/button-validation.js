const BUTTON_TYPES = new Set([
  'url',
  'callback_data',
  'copy',
  'popup',
  'web_app',
  'login_url',
  'switch_inline',
  'switch_inline_current',
  'disabled',
  'page',
]);

const BUTTON_STYLES = new Set(['default', 'primary', 'success', 'danger', 'link']);

function utf8Length(value) {
  return new TextEncoder().encode(String(value || '')).length;
}

function validUrl(value, httpsOnly = false) {
  const raw = String(value || '').trim();
  if (!raw || /\s/.test(raw) || raw.length > 256) return false;
  if (httpsOnly) return /^https:\/\/[^\s]+$/i.test(raw);
  return /^(?:https?:\/\/|tg:\/\/)[^\s]+$/i.test(raw);
}

function valueOf(button) {
  if (button?.value != null) return String(button.value);
  return String(button?.url || '');
}

export function validateStoredButton(button, index = 0) {
  if (!button || typeof button !== 'object' || Array.isArray(button)) {
    return { ok: false, code: 'BUTTON_OBJECT', index };
  }

  const text = String(button.text || '').trim();
  if (!text || text.length > 64) {
    return { ok: false, code: 'BUTTON_TEXT', index };
  }

  const type = String(button.type || 'url');
  if (!BUTTON_TYPES.has(type)) {
    return { ok: false, code: 'BUTTON_TYPE', index };
  }

  const style = String(button.style || 'default');
  if (!BUTTON_STYLES.has(style)) {
    return { ok: false, code: 'BUTTON_STYLE', index };
  }

  if (button.position != null) {
    const position = Number(button.position);
    if (!Number.isInteger(position) || position < 0 || position > 999) {
      return { ok: false, code: 'BUTTON_POSITION', index };
    }
  }

  if (button.row_end != null && typeof button.row_end !== 'boolean') {
    return { ok: false, code: 'BUTTON_ROW_END', index };
  }

  const value = valueOf(button);
  if (type === 'disabled') return { ok: true };

  if (type === 'url' && !validUrl(value, false)) {
    return { ok: false, code: 'BUTTON_URL', index };
  }

  if ((type === 'web_app' || type === 'login_url') && !validUrl(value, true)) {
    return { ok: false, code: 'BUTTON_HTTPS_URL', index };
  }

  if (type === 'callback_data') {
    const size = utf8Length(value);
    if (size < 1 || size > 64) {
      return { ok: false, code: 'BUTTON_CALLBACK_DATA', index };
    }
  }

  if (type === 'copy' && (value.length < 1 || value.length > 256)) {
    return { ok: false, code: 'BUTTON_COPY', index };
  }

  if (type === 'popup' && (value.length < 1 || value.length > 200)) {
    return { ok: false, code: 'BUTTON_POPUP', index };
  }

  if (
    (type === 'switch_inline' || type === 'switch_inline_current')
    && value.length > 256
  ) {
    return { ok: false, code: 'BUTTON_INLINE_QUERY', index };
  }

  if (type === 'page' && !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    return { ok: false, code: 'BUTTON_PAGE_ID', index };
  }

  return { ok: true };
}

export function validateStoredButtons(buttons, maxButtons = 100) {
  if (!Array.isArray(buttons)) {
    return { ok: false, code: 'BUTTONS_ARRAY' };
  }
  if (buttons.length > maxButtons) {
    return { ok: false, code: 'BUTTONS_LIMIT' };
  }
  for (let index = 0; index < buttons.length; index += 1) {
    const result = validateStoredButton(buttons[index], index);
    if (!result.ok) return result;
  }
  return { ok: true };
}
