import { db } from 'sdk';
import { asc, desc, eq, gte, lt, sql } from 'sdk/db';
import { usageMinutes, usageRuntime, usageUsers } from 'schema';

const RUNTIME_ID = 1;
const MINUTE_RETENTION_SECONDS = 24 * 60 * 60;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function cleanText(value, limit) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, limit) : null;
}

function minuteKey(stamp) {
  return Math.floor(stamp / 60) * 60;
}

async function ensureRuntime(stamp) {
  await db.insert(usageRuntime).values({
    id: RUNTIME_ID,
    startedAt: stamp,
    totalUpdates: 0,
    failedUpdates: 0,
    handlerMsTotal: 0,
    handlerMsMax: 0,
    previewSuccess: 0,
    previewFailed: 0,
    publishSuccess: 0,
    publishFailed: 0,
    rateLimited: 0,
  }).onConflictDoNothing({ target: usageRuntime.id }).run();
}

export async function observeRequest(user, durationMs, failed = false, stamp = nowSeconds()) {
  const safeDuration = Math.max(0, Number(durationMs) || 0);
  await ensureRuntime(stamp);

  const userId = Number(user?.id);
  if (Number.isSafeInteger(userId)) {
    const userSet = {
      lastSeen: stamp,
      events: sql`${usageUsers.events} + 1`,
    };
    const username = cleanText(user?.username, 64);
    const firstName = cleanText(user?.first_name, 128);
    const lastName = cleanText(user?.last_name, 128);
    const languageCode = cleanText(user?.language_code, 16);
    if (username !== null) userSet.username = username;
    if (firstName !== null) userSet.firstName = firstName;
    if (lastName !== null) userSet.lastName = lastName;
    if (languageCode !== null) userSet.languageCode = languageCode;

    await db.insert(usageUsers).values({
      userId,
      username,
      firstName,
      lastName,
      languageCode,
      firstSeen: stamp,
      lastSeen: stamp,
      events: 1,
    }).onConflictDoUpdate({
      target: usageUsers.userId,
      set: userSet,
    }).run();
  }

  await db.insert(usageMinutes).values({
    minute: minuteKey(stamp),
    updates: 1,
    failures: failed ? 1 : 0,
    durationMs: safeDuration,
  }).onConflictDoUpdate({
    target: usageMinutes.minute,
    set: {
      updates: sql`${usageMinutes.updates} + 1`,
      failures: sql`${usageMinutes.failures} + ${failed ? 1 : 0}`,
      durationMs: sql`${usageMinutes.durationMs} + ${safeDuration}`,
    },
  }).run();

  await db.update(usageRuntime).set({
    totalUpdates: sql`${usageRuntime.totalUpdates} + 1`,
    failedUpdates: sql`${usageRuntime.failedUpdates} + ${failed ? 1 : 0}`,
    handlerMsTotal: sql`${usageRuntime.handlerMsTotal} + ${safeDuration}`,
    handlerMsMax: sql`max(${usageRuntime.handlerMsMax}, ${safeDuration})`,
  }).where(eq(usageRuntime.id, RUNTIME_ID)).run();

  if (stamp % 300 < 2) {
    await db.delete(usageMinutes)
      .where(lt(usageMinutes.minute, stamp - MINUTE_RETENTION_SECONDS))
      .run();
  }
}

export async function recordOperation(name, success = true, count = 1) {
  const amount = Math.max(0, Number.parseInt(String(count), 10) || 0);
  if (!amount) return;
  const stamp = nowSeconds();
  await ensureRuntime(stamp);

  const field = name === 'preview'
    ? (success ? 'previewSuccess' : 'previewFailed')
    : name === 'publish'
      ? (success ? 'publishSuccess' : 'publishFailed')
      : name === 'rate_limit'
        ? 'rateLimited'
        : null;
  if (!field) return;

  await db.update(usageRuntime).set({
    [field]: sql`${usageRuntime[field]} + ${amount}`,
  }).where(eq(usageRuntime.id, RUNTIME_ID)).run();
}

function windowStats(rows, cutoff) {
  const selected = rows.filter((row) => Number(row.minute) >= cutoff);
  const updates = selected.reduce((sum, row) => sum + Number(row.updates || 0), 0);
  const failures = selected.reduce((sum, row) => sum + Number(row.failures || 0), 0);
  const durationMs = selected.reduce((sum, row) => sum + Number(row.durationMs || 0), 0);
  return { updates, failures, durationMs };
}

export async function usageSummary(stamp = nowSeconds()) {
  const trackedUsers = await db.$count(usageUsers);
  const profiledUsersRow = await db.get(sql.raw('SELECT COUNT(*) AS count FROM usage_users WHERE username IS NOT NULL OR first_name IS NOT NULL'));
  const usernamesRow = await db.get(sql.raw('SELECT COUNT(*) AS count FROM usage_users WHERE username IS NOT NULL'));
  const eventsRow = await db.get(sql.raw('SELECT COALESCE(SUM(events), 0) AS events FROM usage_users'));
  const oldestRow = await db.get(sql.raw('SELECT MIN(first_seen) AS oldest, MAX(last_seen) AS latest FROM usage_users'));

  const active1h = await db.$count(usageUsers, gte(usageUsers.lastSeen, stamp - 3600));
  const active24h = await db.$count(usageUsers, gte(usageUsers.lastSeen, stamp - 86400));
  const active7d = await db.$count(usageUsers, gte(usageUsers.lastSeen, stamp - 7 * 86400));
  const active30d = await db.$count(usageUsers, gte(usageUsers.lastSeen, stamp - 30 * 86400));
  const new24h = await db.$count(usageUsers, gte(usageUsers.firstSeen, stamp - 86400));
  const new7d = await db.$count(usageUsers, gte(usageUsers.firstSeen, stamp - 7 * 86400));
  const new30d = await db.$count(usageUsers, gte(usageUsers.firstSeen, stamp - 30 * 86400));

  const languageRows = await db.all(sql.raw(
    `SELECT language_code, COUNT(*) AS count
     FROM usage_users
     WHERE language_code IS NOT NULL AND language_code != ''
     GROUP BY language_code
     ORDER BY count DESC, language_code ASC
     LIMIT 5`,
  ));

  const currentMinute = minuteKey(stamp);
  const minuteRows = await db.select().from(usageMinutes)
    .where(gte(usageMinutes.minute, currentMinute - 59 * 60))
    .orderBy(asc(usageMinutes.minute)).all();
  const one = windowStats(minuteRows, currentMinute);
  const five = windowStats(minuteRows, currentMinute - 4 * 60);
  const sixty = windowStats(minuteRows, currentMinute - 59 * 60);
  const runtime = await db.select().from(usageRuntime).where(eq(usageRuntime.id, RUNTIME_ID)).get();

  return {
    trackedUsers,
    profiledUsers: Number(profiledUsersRow?.count || 0),
    usersWithUsername: Number(usernamesRow?.count || 0),
    events: Number(eventsRow?.events || 0),
    oldestSeen: oldestRow?.oldest == null ? null : Number(oldestRow.oldest),
    latestSeen: oldestRow?.latest == null ? null : Number(oldestRow.latest),
    active1h,
    active24h,
    active7d,
    active30d,
    new24h,
    new7d,
    new30d,
    languages: languageRows.map((row) => ({
      code: String(row.language_code),
      count: Number(row.count || 0),
    })),
    operational: {
      startedAt: Number(runtime?.startedAt || stamp),
      requestsCurrentMinute: one.updates,
      requestsPerMinute5m: five.updates / 5,
      requestsLastHour: sixty.updates,
      failuresCurrentMinute: one.failures,
      failuresLast5m: five.failures,
      failuresLastHour: sixty.failures,
      avgResponseMsCurrentMinute: one.updates ? one.durationMs / one.updates : 0,
      avgResponseMs5m: five.updates ? five.durationMs / five.updates : 0,
      avgResponseMsAll: Number(runtime?.totalUpdates || 0)
        ? Number(runtime?.handlerMsTotal || 0) / Number(runtime.totalUpdates)
        : 0,
      maxResponseMs: Number(runtime?.handlerMsMax || 0),
      totalUpdates: Number(runtime?.totalUpdates || 0),
      failedUpdates: Number(runtime?.failedUpdates || 0),
      previewSuccess: Number(runtime?.previewSuccess || 0),
      previewFailed: Number(runtime?.previewFailed || 0),
      publishSuccess: Number(runtime?.publishSuccess || 0),
      publishFailed: Number(runtime?.publishFailed || 0),
      rateLimited: Number(runtime?.rateLimited || 0),
    },
  };
}

export async function usageUsersPage(page = 0, pageSize = 10) {
  const size = Math.min(25, Math.max(1, Number(pageSize) || 10));
  const total = await db.$count(usageUsers);
  const maxPage = Math.max(0, Math.ceil(total / size) - 1);
  const safePage = Math.min(Math.max(0, Number(page) || 0), maxPage);
  const users = await db.select().from(usageUsers)
    .orderBy(desc(usageUsers.lastSeen), desc(usageUsers.events), asc(usageUsers.userId))
    .limit(size)
    .offset(safePage * size)
    .all();
  return { users, total, page: safePage, maxPage };
}

export async function exportUsageStats(stamp = nowSeconds()) {
  const users = await db.select().from(usageUsers).orderBy(asc(usageUsers.userId)).all();
  const minuteRows = await db.select().from(usageMinutes).orderBy(asc(usageMinutes.minute)).all();
  const runtime = await db.select().from(usageRuntime).where(eq(usageRuntime.id, RUNTIME_ID)).get();
  const mappedUsers = {};
  for (const user of users) {
    mappedUsers[String(user.userId)] = {
      first_seen: Number(user.firstSeen),
      last_seen: Number(user.lastSeen),
      events: Number(user.events || 0),
      username: user.username ?? null,
      first_name: user.firstName ?? null,
      last_name: user.lastName ?? null,
      language_code: user.languageCode ?? null,
    };
  }
  const minuteBuckets = {};
  for (const row of minuteRows) {
    minuteBuckets[String(row.minute)] = {
      updates: Number(row.updates || 0),
      failures: Number(row.failures || 0),
      duration_ms: Number(row.durationMs || 0),
    };
  }
  return {
    version: 2,
    started_at: Number(runtime?.startedAt || stamp),
    users: mappedUsers,
    operational: {
      total_updates: Number(runtime?.totalUpdates || 0),
      failed_updates: Number(runtime?.failedUpdates || 0),
      handler_ms_total: Number(runtime?.handlerMsTotal || 0),
      handler_ms_max: Number(runtime?.handlerMsMax || 0),
      minute_buckets: minuteBuckets,
      operations: {
        preview_success: Number(runtime?.previewSuccess || 0),
        preview_failed: Number(runtime?.previewFailed || 0),
        publish_success: Number(runtime?.publishSuccess || 0),
        publish_failed: Number(runtime?.publishFailed || 0),
        rate_limited: Number(runtime?.rateLimited || 0),
      },
    },
  };
}

export async function importUsageStats(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { users: 0 };
  const stamp = nowSeconds();
  await ensureRuntime(stamp);
  let importedUsers = 0;
  const rawUsers = payload.users && typeof payload.users === 'object' && !Array.isArray(payload.users)
    ? payload.users
    : {};
  for (const [rawId, raw] of Object.entries(rawUsers)) {
    const userId = Number(rawId);
    if (!Number.isSafeInteger(userId) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const firstSeen = Number(raw.first_seen) || stamp;
    const lastSeen = Number(raw.last_seen) || firstSeen;
    const events = Math.max(0, Number(raw.events) || 0);
    const username = cleanText(raw.username, 64);
    const firstName = cleanText(raw.first_name, 128);
    const lastName = cleanText(raw.last_name, 128);
    const languageCode = cleanText(raw.language_code, 16);
    const profileUpdates = {};
    if (username !== null) profileUpdates.username = username;
    if (firstName !== null) profileUpdates.firstName = firstName;
    if (lastName !== null) profileUpdates.lastName = lastName;
    if (languageCode !== null) profileUpdates.languageCode = languageCode;

    await db.insert(usageUsers).values({
      userId,
      username,
      firstName,
      lastName,
      languageCode,
      firstSeen,
      lastSeen,
      events,
    }).onConflictDoUpdate({
      target: usageUsers.userId,
      set: {
        firstSeen: sql`min(${usageUsers.firstSeen}, ${firstSeen})`,
        lastSeen: sql`max(${usageUsers.lastSeen}, ${lastSeen})`,
        events: sql`max(${usageUsers.events}, ${events})`,
        ...profileUpdates,
      },
    }).run();
    importedUsers += 1;
  }

  const operational = payload.operational && typeof payload.operational === 'object'
    ? payload.operational
    : {};
  const operations = operational.operations && typeof operational.operations === 'object'
    ? operational.operations
    : {};
  const startedAt = Number(payload.started_at) || stamp;
  const incoming = {
    totalUpdates: Math.max(0, Number(operational.total_updates) || 0),
    failedUpdates: Math.max(0, Number(operational.failed_updates) || 0),
    handlerMsTotal: Math.max(0, Number(operational.handler_ms_total) || 0),
    handlerMsMax: Math.max(0, Number(operational.handler_ms_max) || 0),
    previewSuccess: Math.max(0, Number(operations.preview_success) || 0),
    previewFailed: Math.max(0, Number(operations.preview_failed) || 0),
    publishSuccess: Math.max(0, Number(operations.publish_success) || 0),
    publishFailed: Math.max(0, Number(operations.publish_failed) || 0),
    rateLimited: Math.max(0, Number(operations.rate_limited) || 0),
  };
  await db.update(usageRuntime).set({
    startedAt: sql`min(${usageRuntime.startedAt}, ${startedAt})`,
    totalUpdates: sql`max(${usageRuntime.totalUpdates}, ${incoming.totalUpdates})`,
    failedUpdates: sql`max(${usageRuntime.failedUpdates}, ${incoming.failedUpdates})`,
    handlerMsTotal: sql`max(${usageRuntime.handlerMsTotal}, ${incoming.handlerMsTotal})`,
    handlerMsMax: sql`max(${usageRuntime.handlerMsMax}, ${incoming.handlerMsMax})`,
    previewSuccess: sql`max(${usageRuntime.previewSuccess}, ${incoming.previewSuccess})`,
    previewFailed: sql`max(${usageRuntime.previewFailed}, ${incoming.previewFailed})`,
    publishSuccess: sql`max(${usageRuntime.publishSuccess}, ${incoming.publishSuccess})`,
    publishFailed: sql`max(${usageRuntime.publishFailed}, ${incoming.publishFailed})`,
    rateLimited: sql`max(${usageRuntime.rateLimited}, ${incoming.rateLimited})`,
  }).where(eq(usageRuntime.id, RUNTIME_ID)).run();

  const buckets = operational.minute_buckets && typeof operational.minute_buckets === 'object'
    ? operational.minute_buckets
    : {};
  for (const [rawMinute, raw] of Object.entries(buckets)) {
    const minute = Number(rawMinute);
    if (!Number.isSafeInteger(minute) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const values = {
      minute,
      updates: Math.max(0, Number(raw.updates) || 0),
      failures: Math.max(0, Number(raw.failures) || 0),
      durationMs: Math.max(0, Number(raw.duration_ms) || 0),
    };
    await db.insert(usageMinutes).values(values).onConflictDoUpdate({
      target: usageMinutes.minute,
      set: {
        updates: sql`max(${usageMinutes.updates}, ${values.updates})`,
        failures: sql`max(${usageMinutes.failures}, ${values.failures})`,
        durationMs: sql`max(${usageMinutes.durationMs}, ${values.durationMs})`,
      },
    }).run();
  }
  return { users: importedUsers };
}
