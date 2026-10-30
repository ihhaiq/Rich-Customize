import { api, BotApiError, db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { usageUsers } from 'schema';
import { buildUserInfoMessage, userInfoText } from 'lib/user-info-copy';
import { subscriptionSnapshot } from 'lib/subscription-status';
import { subscriptionPlanTitle } from 'lib/subscription-rich';

export function infoCommandArgument(text) {
  if (typeof text !== 'string') return null;
  const parts = text.trim().split(/\s+/);
  const first = String(parts[0] || '').toLowerCase();
  if (/^\/info(?:@richcustomizebot)?$/.test(first)) {
    return parts.slice(1).join(' ').trim();
  }
  if (/^\/id(?:@richcustomizebot)?$/.test(first)) {
    return parts.length === 1 ? '' : null;
  }
  if (first === '@richcustomizebot') {
    const target = parts.slice(1).join(' ').trim();
    if (/^\/page(?:@richcustomizebot)?(?:\s+|$)/i.test(target)) return null;
    if (/^\/(?:info|id)(?:@richcustomizebot)?$/i.test(target)) return '';
    if (!target) return '';
    return /^@[A-Za-z0-9_]{5,32}$/.test(target) ? target : null;
  }
  return null;
}

function validUserId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function profileFromStored(row) {
  if (!row) return null;
  return {
    id: row.userId,
    username: row.username,
    first_name: row.firstName,
    last_name: row.lastName,
  };
}

async function findStoredUserById(userId) {
  const row = await db.select({
    userId: usageUsers.userId,
    username: usageUsers.username,
    firstName: usageUsers.firstName,
    lastName: usageUsers.lastName,
  }).from(usageUsers).where(eq(usageUsers.userId, userId)).get();
  return profileFromStored(row);
}

async function findStoredUserByUsername(username) {
  const row = await db.select({
    userId: usageUsers.userId,
    username: usageUsers.username,
    firstName: usageUsers.firstName,
    lastName: usageUsers.lastName,
  }).from(usageUsers)
    .where(sql`lower(${usageUsers.username}) = ${username.toLowerCase()}`)
    .get();
  return profileFromStored(row);
}

async function profilePhotoFileId(userId) {
  const profilePhotos = await api.getUserProfilePhotos({ user_id: userId, limit: 1 });
  const sizes = profilePhotos?.photos?.[0];
  const photo = Array.isArray(sizes) ? sizes.at(-1) : null;
  return typeof photo?.file_id === 'string' ? photo.file_id : '';
}

export function isProfilePhotoSendingForbidden(error) {
  if (!(error instanceof BotApiError) || Number(error.code) !== 400) return false;
  return /CHAT_SEND_PHOTOS_FORBIDDEN|(?:not enough rights|not allowed|forbidden|can't|cannot) to send photos?|photos? (?:are )?(?:not allowed|forbidden)/i
    .test(String(error.description || error.message || ''));
}

export async function findUserInfoTarget(argument) {
  const target=commandTarget({},String(argument||''));
  if(target.kind==='id')return findStoredUserById(target.id);
  if(target.kind==='username')return findStoredUserByUsername(target.username);
  return null;
}

function mergeProfile(current, stored) {
  if (!current) return stored;
  return {
    id: current.id,
    username: current.username || stored?.username || '',
    first_name: current.first_name || stored?.first_name || '',
    last_name: current.last_name || stored?.last_name || '',
  };
}

function commandTarget(message, argument) {
  if (message?.reply_to_message) {
    const repliedUser = message.reply_to_message.from || null;
    if (validUserId(repliedUser?.id)) return { kind: 'reply', user: repliedUser };
    return { kind: 'current', user: message?.from || null };
  }
  if (!argument) return { kind: 'current', user: message?.from || null };

  const query = argument.trim();
  if (/^\d+$/.test(query)) {
    const id = validUserId(query);
    return id ? { kind: 'id', id } : { kind: 'invalid' };
  }
  if (/^@[A-Za-z0-9_]{5,32}$/.test(query)) {
    return { kind: 'username', username: query.slice(1) };
  }
  return { kind: 'invalid' };
}

export async function prepareUserInfoMessage(message, argument, languageCode) {
  const target = commandTarget(message, argument);
  let user = null;

  if (target.kind === 'current') {
    user = target.user;
  } else if (target.kind === 'reply') {
    const userId = validUserId(target.user?.id);
    if (userId) {
      const stored = await findStoredUserById(userId);
      user = mergeProfile(target.user, stored);
    }
  } else if (target.kind === 'id') {
    const senderId = validUserId(message?.from?.id);
    user = senderId === target.id
      ? mergeProfile(message.from, await findStoredUserById(target.id))
      : await findStoredUserById(target.id);
  } else if (target.kind === 'username') {
    const senderUsername = String(message?.from?.username || '').toLowerCase();
    user = senderUsername === target.username.toLowerCase()
      ? mergeProfile(message.from, await findStoredUserById(message.from.id))
      : await findStoredUserByUsername(target.username);
  }

  if (!user) return null;

  let photoFileId = '';
  let photoError = false;
  try {
    photoFileId = await profilePhotoFileId(user.id);
  } catch (error) {
    photoError = true;
    console.warn('Could not load Telegram user profile photo', error?.code || error?.name || 'Error');
  }

  const subscription = await subscriptionSnapshot(user.id);
  const subscriptionTitle = subscriptionPlanTitle(
    subscription.plan,
    languageCode,
    subscription.gift,
  );
  return {
    message: buildUserInfoMessage(user, languageCode, {
      photoFileId,
      photoError,
      subscription: subscriptionTitle,
    }),
    photoFileId,
    subscription: subscriptionTitle,
    user,
  };
}

export async function handleInfoCommand(message, argument, languageCode) {
  const prepared = await prepareUserInfoMessage(message, argument, languageCode);
  if (!prepared?.message) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: userInfoText(languageCode, 'unknown'),
    });
    return;
  }

  try {
    await api.sendRichMessage({
      chat_id: message.chat.id,
      rich_message: prepared.message.rich_message,
    });
  } catch (error) {
    if (!prepared.photoFileId || !isProfilePhotoSendingForbidden(error)) throw error;
    console.warn('Telegram rejected the user-info photo; retrying the Rich Message without media');
    const richWithoutPhoto = buildUserInfoMessage(prepared.user, languageCode, {
      subscription: prepared.subscription,
    });
    await api.sendRichMessage({
      chat_id: message.chat.id,
      rich_message: richWithoutPhoto.rich_message,
    });
  }
}
