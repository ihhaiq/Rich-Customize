import { json, readJson, handleError, HttpError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';
import { isDeveloper } from '../../../lib/developer-access.js';

let schemaReadyPromise = null;

async function ensureSchema(db) {
  if (!db || typeof db.prepare !== 'function') throw new HttpError(500, 'Cloudflare D1 binding "DB" is not configured');
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = db.prepare(
    'CREATE TABLE IF NOT EXISTS miniapp_performance_minutes ('
    + 'minute INTEGER NOT NULL, '
    + 'metric TEXT NOT NULL, '
    + 'samples INTEGER NOT NULL DEFAULT 0, '
    + 'total_ms INTEGER NOT NULL DEFAULT 0, '
    + 'max_ms INTEGER NOT NULL DEFAULT 0, '
    + 'updated_at INTEGER NOT NULL, '
    + 'PRIMARY KEY(minute, metric)'
    + ')'
  ).run().then(() => true).catch((error) => {
    schemaReadyPromise = null;
    throw error;
  });
  return schemaReadyPromise;
}

function validSample(raw) {
  const metric = String(raw?.metric || '').trim();
  const duration = Number(raw?.duration_ms || 0);
  if (!/^[A-Za-z0-9_.-]{1,48}$/.test(metric)) return null;
  if (!Number.isFinite(duration) || duration < 0 || duration > 120000) return null;
  return { metric, duration: Math.round(duration) };
}

export async function onRequestPost(context) {
  try {
    await miniAppUser(context);
    const payload = await readJson(context.request);
    const samples = (Array.isArray(payload.samples) ? payload.samples : [])
      .slice(0, 30)
      .map(validSample)
      .filter(Boolean);
    if (!samples.length) return json({ok:true,accepted:0});

    const db = context.env?.DB;
    await ensureSchema(db);
    const minute = Math.floor(Date.now() / 60000);
    const stamp = Math.floor(Date.now() / 1000);
    const grouped = new Map();
    for (const sample of samples) {
      const current = grouped.get(sample.metric) || {count:0,total:0,max:0};
      current.count += 1;
      current.total += sample.duration;
      current.max = Math.max(current.max, sample.duration);
      grouped.set(sample.metric, current);
    }

    const statements = [];
    for (const [metric, value] of grouped) {
      statements.push(db.prepare(
        'INSERT INTO miniapp_performance_minutes(minute,metric,samples,total_ms,max_ms,updated_at) '
        + 'VALUES(?,?,?,?,?,?) '
        + 'ON CONFLICT(minute,metric) DO UPDATE SET '
        + 'samples=samples+excluded.samples, '
        + 'total_ms=total_ms+excluded.total_ms, '
        + 'max_ms=MAX(max_ms,excluded.max_ms), '
        + 'updated_at=excluded.updated_at'
      ).bind(minute, metric, value.count, value.total, value.max, stamp));
    }
    if (typeof db.batch === 'function') await db.batch(statements);
    else for (const statement of statements) await statement.run();

    if (minute % 60 === 0) {
      await db.prepare('DELETE FROM miniapp_performance_minutes WHERE minute < ?')
        .bind(minute - (14 * 24 * 60)).run().catch(() => {});
    }
    return json({ok:true,accepted:samples.length});
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestGet(context) {
  try {
    const user = await miniAppUser(context);
    if (!isDeveloper(user.id)) throw new HttpError(403, 'developer_only');
    const db = context.env?.DB;
    await ensureSchema(db);
    const currentMinute = Math.floor(Date.now() / 60000);
    const rows = await db.prepare(
      'SELECT metric, SUM(samples) AS samples, SUM(total_ms) AS total_ms, MAX(max_ms) AS max_ms '
      + 'FROM miniapp_performance_minutes WHERE minute >= ? '
      + 'GROUP BY metric ORDER BY metric ASC'
    ).bind(currentMinute - 60).all();
    const metrics = (rows?.results || []).map((row) => {
      const samples = Math.max(0, Number(row.samples || 0));
      const total = Math.max(0, Number(row.total_ms || 0));
      return {
        metric:String(row.metric || ''),
        samples,
        average_ms:samples ? Math.round(total / samples) : 0,
        max_ms:Math.max(0, Number(row.max_ms || 0)),
      };
    });
    return json({ok:true,window_minutes:60,metrics});
  } catch (error) {
    return handleError(error);
  }
}
