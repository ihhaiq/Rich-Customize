import { api, db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { usageUsers } from 'schema';
import { buildUserInfoMessage, userInfoText } from 'lib/user-info-copy';

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
    return { kind: 'reply', user: message.reply_to_message.from || null };
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

export async function handleInfoCommand(message, argument, languageCode) {
  const target = commandTarget(message, argument);
  let user = null;

  if (target.kind === 'reply' || target.kind === 'current') {
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

  const result = buildUserInfoMessage(user, languageCode);
  await api.sendMessage({
    chat_id: message.chat.id,
    ...(result || { text: userInfoText(languageCode, 'unknown') }),
  });
}
