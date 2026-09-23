import { db } from 'sdk';
import { eq } from 'sdk/db';
import { botSettings } from 'schema';

export async function getSetting(key, fallback = null) {
  const row = await db.select().from(botSettings).where(eq(botSettings.key, key)).get();
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await db.insert(botSettings)
    .values({ key, value, updatedAt: Math.floor(Date.now() / 1000) })
    .onConflictDoUpdate({
      target: botSettings.key,
      set: { value, updatedAt: Math.floor(Date.now() / 1000) },
    })
    .run();
}

export async function getDeveloperIds() {
  const raw = await getSetting('developer_ids', []);
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value)),
  );
}

export async function isDeveloper(userId) {
  const ids = await getDeveloperIds();
  return ids.has(Number(userId));
}
