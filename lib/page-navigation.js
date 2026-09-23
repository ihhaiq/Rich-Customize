import { api, db } from 'sdk';
import { eq, lt } from 'sdk/db';
import { pageNavigationSessions, richPages } from 'schema';
import { buildInputRichMessage } from 'lib/editor-renderer';
import {
  buildMessageButtonsKeyboard,
  getPopupText,
  prepareMessageButtons,
} from 'lib/page-buttons';

const NAVIGATION_TTL_SECONDS = 24 * 60 * 60;
const MAX_NAVIGATION_DEPTH = 32;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function randomToken() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return String(uuid).replaceAll('-', '').slice(0, 12);
  return (
    Math.random().toString(16).slice(2)
    + Date.now().toString(16)
    + Math.random().toString(16).slice(2)
  ).slice(0, 12);
}

function languageCode(query) {
  return query?.from?.language_code || 'en';
}

function isArabic(code) {
  return String(code || '').toLowerCase().startsWith('ar');
}

function navigationState(row) {
  if (!row || !Array.isArray(row.stack) || !row.stack.every((item) => typeof item === 'string')) {
    return null;
  }
  return {
    token: String(row.token),
    userId: Number(row.userId),
    stack: [...row.stack],
    externalRoot: Boolean(row.externalRoot),
  };
}

function rootPageId(nav) {
  return nav.externalRoot || !nav.stack.length ? null : nav.stack[0];
}

function canGoBack(nav) {
  return nav.externalRoot || nav.stack.length > 1;
}

function canGoHome(nav) {
  return nav.stack.length > (nav.externalRoot ? 1 : 2);
}

function isAtRoot(nav) {
  return nav.externalRoot ? nav.stack.length === 0 : nav.stack.length <= 1;
}

async function cleanupNavigation() {
  const stamp = nowSeconds();
  await db.delete(pageNavigationSessions)
    .where(lt(pageNavigationSessions.updatedAt, stamp - NAVIGATION_TTL_SECONDS))
    .run();
}

async function getNavigation(token) {
  if (!token) return null;
  const row = await db.select().from(pageNavigationSessions)
    .where(eq(pageNavigationSessions.token, String(token))).get();
  return navigationState(row);
}

async function navigate(userId, sourcePageId, targetPageId, token = null) {
  await cleanupNavigation();
  const current = token ? await getNavigation(token) : null;
  const stamp = nowSeconds();
  let resolvedToken = token;
  let stack;
  let externalRoot;

  if (!current || current.userId !== Number(userId)) {
    resolvedToken = randomToken();
    stack = sourcePageId ? [String(sourcePageId), String(targetPageId)] : [String(targetPageId)];
    externalRoot = !sourcePageId;
  } else {
    stack = [...current.stack];
    externalRoot = current.externalRoot;
    if (sourcePageId) {
      const indexes = [];
      for (let index = 0; index < stack.length; index += 1) {
        if (stack[index] === String(sourcePageId)) indexes.push(index);
      }
      stack = indexes.length
        ? stack.slice(0, indexes.at(-1) + 1)
        : [String(sourcePageId)];
    }
    if (!stack.length || stack.at(-1) !== String(targetPageId)) {
      stack.push(String(targetPageId));
    }
    if (stack.length > MAX_NAVIGATION_DEPTH) {
      stack = [stack[0], ...stack.slice(-(MAX_NAVIGATION_DEPTH - 1))];
    }
  }

  const record = {
    token: String(resolvedToken),
    userId: Number(userId),
    stack,
    previousStack: null,
    externalRoot: externalRoot ? 1 : 0,
    updatedAt: stamp,
  };
  await db.insert(pageNavigationSessions).values(record).onConflictDoUpdate({
    target: pageNavigationSessions.token,
    set: {
      userId: record.userId,
      stack: record.stack,
      previousStack: null,
      externalRoot: record.externalRoot,
      updatedAt: record.updatedAt,
    },
  }).run();
  return navigationState(record);
}

async function back(token, userId) {
  await cleanupNavigation();
  const row = await db.select().from(pageNavigationSessions)
    .where(eq(pageNavigationSessions.token, String(token))).get();
  const current = navigationState(row);
  if (!current || current.userId !== Number(userId) || !canGoBack(current)) return null;

  const previousStack = [...current.stack];
  const stack = [...current.stack];
  if (stack.length) stack.pop();

  await db.update(pageNavigationSessions).set({
    stack,
    previousStack,
    updatedAt: nowSeconds(),
  }).where(eq(pageNavigationSessions.token, String(token))).run();

  return {
    ...current,
    stack,
  };
}

async function home(token, userId) {
  await cleanupNavigation();
  const current = await getNavigation(token);
  if (!current || current.userId !== Number(userId)) return null;
  return current;
}

async function commitBack(token, userId) {
  const current = await getNavigation(token);
  if (!current || current.userId !== Number(userId)) return;
  await db.update(pageNavigationSessions).set({
    previousStack: null,
    updatedAt: nowSeconds(),
  }).where(eq(pageNavigationSessions.token, String(token))).run();
}

async function rollbackBack(token, userId) {
  const row = await db.select().from(pageNavigationSessions)
    .where(eq(pageNavigationSessions.token, String(token))).get();
  const current = navigationState(row);
  if (!current || current.userId !== Number(userId) || !Array.isArray(row.previousStack)) return;
  await db.update(pageNavigationSessions).set({
    stack: row.previousStack,
    previousStack: null,
    updatedAt: nowSeconds(),
  }).where(eq(pageNavigationSessions.token, String(token))).run();
}

async function finishNavigation(token) {
  await db.delete(pageNavigationSessions)
    .where(eq(pageNavigationSessions.token, String(token))).run();
}

async function getPage(pageId) {
  return db.select().from(richPages)
    .where(eq(richPages.pageId, String(pageId || ''))).get();
}

function navigationButtons(nav, code) {
  const buttons = [];
  if (canGoBack(nav)) {
    buttons.push({
      text: isArabic(code) ? '🔙 رجوع' : '🔙 Back',
      callback_data: 'r:pback:' + nav.token,
    });
  }
  if (canGoHome(nav)) {
    buttons.push({
      text: isArabic(code) ? '🏠 الرئيسية' : '🏠 Home',
      callback_data: 'r:phome:' + nav.token,
      style: 'primary',
    });
  }
  return buttons;
}

async function pagePayload(page, nav, code) {
  const prepared = await prepareMessageButtons(page.buttons || []);
  return {
    richMessage: buildInputRichMessage(
      page.blocks || [],
      {
        sourcePageId: page.pageId,
        navigationToken: nav.token,
        navigationButtons: navigationButtons(nav, code),
      },
    ),
    replyMarkup: buildMessageButtonsKeyboard(prepared, {
      buttonsPerRow: Number(page.buttonsPerRow || 1),
      sourcePageId: page.pageId,
      navigationToken: nav.token,
    }),
  };
}

async function isChatSubscriber(chatId, userId) {
  try {
    const member = await api.getChatMember({
      chat_id: chatId,
      user_id: userId,
    });
    return ['member', 'administrator', 'creator'].includes(String(member?.status || ''));
  } catch {
    return false;
  }
}

function errorText(error, code) {
  const reason = String(error?.description || error?.message || error);
  return (isArabic(code) ? 'تعذر فتح الصفحة: ' : 'Could not open page: ') + reason.slice(0, 160);
}

async function sendOrReplacePage(query, richMessage, replyMarkup) {
  const message = query.message;
  if (!message?.chat?.id) throw new Error('Guest message context is unavailable');
  const chatId = message.chat.id;
  const chatType = String(message.chat.type || '');

  if (message.ephemeral_message_id) {
    return api.editEphemeralMessageText({
      chat_id: chatId,
      receiver_user_id: query.from.id,
      ephemeral_message_id: message.ephemeral_message_id,
      rich_message: richMessage,
      reply_markup: replyMarkup,
    });
  }

  if (['group', 'supergroup', 'channel'].includes(chatType)) {
    return api.sendRichMessage({
      chat_id: chatId,
      rich_message: richMessage,
      reply_markup: replyMarkup,
      ephemeral_message_parameters: {
        receiver_user_id: query.from.id,
        callback_query_id: query.id,
        replace_callback_query_message: true,
      },
    });
  }

  return api.sendRichMessage({
    chat_id: query.from.id,
    rich_message: richMessage,
    reply_markup: replyMarkup,
  });
}

async function renderNavigationPage(query, pageId, nav) {
  const code = languageCode(query);
  const page = await getPage(pageId);
  if (!page) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: isArabic(code)
        ? 'هذه الصفحة لم تعد موجودة أو انتهت صلاحيتها.'
        : 'This page no longer exists or has expired.',
      show_alert: true,
    });
    return false;
  }
  try {
    const payload = await pagePayload(page, nav, code);
    if (query.message?.ephemeral_message_id) {
      await api.editEphemeralMessageText({
        chat_id: query.message.chat.id,
        receiver_user_id: query.from.id,
        ephemeral_message_id: query.message.ephemeral_message_id,
        rich_message: payload.richMessage,
        reply_markup: payload.replyMarkup,
      });
    } else {
      await api.sendRichMessage({
        chat_id: query.message.chat.id,
        rich_message: payload.richMessage,
        reply_markup: payload.replyMarkup,
      });
    }
  } catch (error) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: errorText(error, code),
      show_alert: true,
    });
    return false;
  }
  return true;
}

async function restoreNavigationRoot(query, nav) {
  const code = languageCode(query);
  if (query.message?.ephemeral_message_id) {
    await api.deleteEphemeralMessage({
      chat_id: query.message.chat.id,
      receiver_user_id: query.from.id,
      ephemeral_message_id: query.message.ephemeral_message_id,
    });
    return true;
  }
  const root = rootPageId(nav);
  if (root) {
    return renderNavigationPage(query, root, {
      ...nav,
      stack: [root],
      externalRoot: false,
    });
  }
  await api.answerCallbackQuery({
    callback_query_id: query.id,
    text: isArabic(code)
      ? 'الرسالة الأصلية موجودة فوق.'
      : 'The original message is above.',
    show_alert: true,
  });
  return false;
}

async function openPage(query, requireSubscription) {
  const code = languageCode(query);
  if (!query.message?.chat?.id) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: isArabic(code)
        ? 'تعذر تحديد محادثة رسالة Guest.'
        : 'Could not determine the Guest message chat.',
      show_alert: true,
    });
    return true;
  }

  if (
    requireSubscription
    && !await isChatSubscriber(query.message.chat.id, query.from.id)
  ) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: isArabic(code) ? 'انت مو من المقربين ابتعد عني .... ' : 'You are not subscribed.',
      show_alert: true,
    });
    return true;
  }

  const parts = String(query.data || '').split(':');
  const targetId = parts[2] || '';
  const sourceId = parts[3] || null;
  const token = parts[4] || null;
  const page = await getPage(targetId);
  if (!page) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: isArabic(code)
        ? 'هذه الصفحة لم تعد موجودة أو انتهت صلاحيتها.'
        : 'This page no longer exists or has expired.',
      show_alert: true,
    });
    return true;
  }

  const nav = await navigate(query.from.id, sourceId, targetId, token);
  try {
    const payload = await pagePayload(page, nav, code);
    await sendOrReplacePage(query, payload.richMessage, payload.replyMarkup);
  } catch (error) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: errorText(error, code),
      show_alert: true,
    });
    return true;
  }

  try {
    await api.answerCallbackQuery({ callback_query_id: query.id });
  } catch {}
  return true;
}

export async function handlePageNavigationCallback(query) {
  const data = String(query?.data || '');
  if (data.startsWith('r:poptext:')) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: data.slice('r:poptext:'.length),
      show_alert: true,
    });
    return true;
  }
  if (data.startsWith('r:popup:')) {
    const token = data.slice('r:popup:'.length);
    const value = await getPopupText(token);
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: value == null
        ? (isArabic(languageCode(query)) ? 'هذا التنبيه لم يعد متاحاً.' : 'This alert is no longer available.')
        : value.slice(0, 200),
      show_alert: true,
    });
    return true;
  }
  if (data.startsWith('r:page:')) return openPage(query, false);
  if (data.startsWith('r:spage:')) return openPage(query, true);

  if (data.startsWith('r:pback:')) {
    const token = data.slice('r:pback:'.length);
    const nav = await back(token, query.from.id);
    if (!nav) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: isArabic(languageCode(query)) ? 'انتهت صلاحية التنقل.' : 'Navigation expired.',
        show_alert: true,
      });
      return true;
    }
    let restored = false;
    try {
      if (isAtRoot(nav)) {
        restored = await restoreNavigationRoot(query, nav);
        if (restored) await finishNavigation(token);
        else await rollbackBack(token, query.from.id);
      } else {
        restored = await renderNavigationPage(query, nav.stack.at(-1), nav);
        if (restored) await commitBack(token, query.from.id);
        else await rollbackBack(token, query.from.id);
      }
    } catch (error) {
      await rollbackBack(token, query.from.id);
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: errorText(error, languageCode(query)),
        show_alert: true,
      });
      return true;
    }
    if (restored) {
      try { await api.answerCallbackQuery({ callback_query_id: query.id }); } catch {}
    }
    return true;
  }

  if (data.startsWith('r:phome:')) {
    const token = data.slice('r:phome:'.length);
    const nav = await home(token, query.from.id);
    if (!nav) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: isArabic(languageCode(query)) ? 'انتهت صلاحية التنقل.' : 'Navigation expired.',
        show_alert: true,
      });
      return true;
    }
    try {
      const restored = await restoreNavigationRoot(query, nav);
      if (restored) {
        await finishNavigation(token);
        try { await api.answerCallbackQuery({ callback_query_id: query.id }); } catch {}
      }
    } catch (error) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: errorText(error, languageCode(query)),
        show_alert: true,
      });
    }
    return true;
  }

  if (data === 'r:ephemeral:restore') {
    if (!query.message?.chat?.id || !query.message?.ephemeral_message_id) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: isArabic(languageCode(query))
          ? 'الرسالة الأصلية غير متاحة.'
          : 'The original message is unavailable.',
        show_alert: true,
      });
      return true;
    }
    try {
      await api.deleteEphemeralMessage({
        chat_id: query.message.chat.id,
        receiver_user_id: query.from.id,
        ephemeral_message_id: query.message.ephemeral_message_id,
      });
      await api.answerCallbackQuery({ callback_query_id: query.id });
    } catch (error) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: errorText(error, languageCode(query)),
        show_alert: true,
      });
    }
    return true;
  }

  return false;
}
