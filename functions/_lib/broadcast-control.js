export function parseBroadcastControl(text) {
  const source = String(text || '').trim();
  const newline = source.indexOf('\n');
  if (newline < 0) return null;

  const command = source.slice(0, newline).trim();
  if (!/^\/rcb_broadcast_control@richminiappsbot$/i.test(command)) return null;

  let payload;
  try {
    payload = JSON.parse(source.slice(newline + 1).trim());
  } catch {
    return null;
  }

  const version = Number(payload?.version);
  if (
    payload?.protocol !== 'RCB1'
    || payload?.kind !== 'broadcast_control'
    || !['active', 'inactive'].includes(payload?.status)
    || !Number.isSafeInteger(version)
    || version <= 0
  ) return null;

  return {
    active: payload.status === 'active' ? 1 : 0,
    version,
  };
}

export async function persistBroadcastControl(db, control) {
  await db.prepare(
    'INSERT INTO broadcast_tick_control(id, active, version, updated_at) '
    + 'VALUES(1, ?, ?, ?) '
    + 'ON CONFLICT(id) DO UPDATE SET '
    + 'active = excluded.active, version = excluded.version, updated_at = excluded.updated_at '
    + 'WHERE excluded.version > broadcast_tick_control.version'
  ).bind(control.active, control.version, Math.floor(Date.now() / 1000)).run();

  return await db.prepare(
    'SELECT active, version FROM broadcast_tick_control WHERE id = 1'
  ).first();
}
