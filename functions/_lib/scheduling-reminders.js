// RCB1 schedule reminder protocol. Cloudflare stores IDs/times ONLY, never post contents.
// Inputs to handleScheduleBridgeEvent MUST be preauthenticated by the Telegram
// webhook secret, exact bridge-chat check, and pinned main-bot identity.
export const JOB_ID_RE = /^sch_[a-f0-9]{32}$/;
export const SCHEDULE_REMINDER_MAX_AHEAD = 4 * 86400;
const PROTOCOL = 'RCB1';
const TARGET_RE = /^\/(rcb_schedule_register|rcb_schedule_cancel|rcb_schedule_result)@richminiappsbot\s+([\s\S]+)$/i;

export function parseScheduleBridgeEvent(source) {
  const match = String(source || '').trim().match(TARGET_RE);
  if (!match) return null;
  let payload;
  try { payload = JSON.parse(match[2]); } catch { return null; }
  if (!payload || Array.isArray(payload) || typeof payload !== 'object'
    || payload.protocol !== PROTOCOL || !JOB_ID_RE.test(String(payload.job_id || ''))
    || !Number.isSafeInteger(payload.revision) || payload.revision < 1) return null;
  const type = { rcb_schedule_register: 'register', rcb_schedule_cancel: 'cancel', rcb_schedule_result: 'result' }[match[1].toLowerCase()];
  if (type === 'register' && (!Number.isSafeInteger(payload.run_at) || payload.run_at <= 0)) return null;
  if (type === 'result' && !['sent', 'partially_sent', 'failed', 'uncertain', 'canceled'].includes(payload.status)) return null;
  return { type, jobId: payload.job_id, revision: payload.revision, runAt: payload.run_at, status: payload.status };
}

export async function handleScheduleBridgeEvent(db, event, now = Math.floor(Date.now() / 1000)) {
  const { type, jobId, revision } = event;
  if (type === 'register') {
    if (event.runAt > now + SCHEDULE_REMINDER_MAX_AHEAD + 60 || event.runAt < now - 60) {
      return { ok: false, code: 'SCHEDULE_TIME_INVALID' };
    }
    // A newer revision (including cancellation) always wins. Same-revision replay
    // never reactivates a completed/cancelled row.
    await db.prepare(
      "INSERT INTO schedule_reminders(job_id,revision,run_at,status,next_attempt_at,updated_at) "+
      "VALUES(?, ?, ?, 'pending', ?, ?) ON CONFLICT(job_id) DO UPDATE SET "+
      "revision=excluded.revision,run_at=excluded.run_at,status='pending', "+
      "next_attempt_at=excluded.next_attempt_at,attempts=0,updated_at=excluded.updated_at "+
      "WHERE schedule_reminders.revision < excluded.revision"
    ).bind(jobId, revision, event.runAt, event.runAt, now).run();
  } else if (type === 'cancel') {
    // Tombstones prevent reordered REGISTER packets for this same revision.
    await db.prepare(
      "INSERT INTO schedule_reminders(job_id,revision,run_at,status,next_attempt_at,updated_at) "+
      "VALUES(?, ?, 0, 'canceled', 0, ?) ON CONFLICT(job_id) DO UPDATE SET "+
      "revision=excluded.revision,status='canceled',next_attempt_at=0,updated_at=excluded.updated_at "+
      "WHERE schedule_reminders.revision <= excluded.revision"
    ).bind(jobId, revision, now).run();
  } else if (type === 'result') {
    const updated = await db.prepare(
      "UPDATE schedule_reminders SET status=?, next_attempt_at=0,updated_at=? "+
      "WHERE job_id=? AND revision=? AND status IN ('pending','dispatching','awaiting_ack')"
    ).bind(event.status, now, jobId, revision).run();
    return { ok: true, changed: updated.meta?.changes || 0 };
  } else return { ok: false, code: 'INVALID_ACTION' };
  return { ok: true };
}

export function scheduleDueCommand(jobId, revision, attempt) {
  if (!JOB_ID_RE.test(jobId) || !Number.isSafeInteger(revision) || !Number.isSafeInteger(attempt)) {
    throw new Error('Invalid reminder identity');
  }
  return '/rcb_schedule_due@RichCustomizebot\n' + JSON.stringify({
    protocol: PROTOCOL, request_id: 'rem_' + jobId + '_' + revision + '_' + attempt,
    job_id: jobId, revision,
  });
}

export async function dispatchDueReminders(db, deliver, now = Math.floor(Date.now() / 1000), limit = 50) {
  const rows = await db.prepare(
    "SELECT job_id,revision,run_at,attempts FROM schedule_reminders "+
    "WHERE status IN ('pending','dispatching','awaiting_ack') AND run_at<=? AND next_attempt_at<=? "+
    "AND attempts<8 ORDER BY run_at LIMIT ?"
  ).bind(now, now, Math.max(1, Math.min(100, Number(limit) || 50))).all();
  let claimed = 0, delivered = 0;
  for (const row of rows.results || []) {
    const attempt = Number(row.attempts) + 1;
    const claim = await db.prepare(
      "UPDATE schedule_reminders SET status='dispatching',attempts=?,next_attempt_at=?,updated_at=? "+
      "WHERE job_id=? AND revision=? AND attempts=? AND status IN ('pending','dispatching','awaiting_ack') "+
      "AND run_at<=? AND next_attempt_at<=?"
    ).bind(attempt, now + 120, now, row.job_id, row.revision, row.attempts, now, now).run();
    if (!claim.meta?.changes) continue;
    claimed++;
    try {
      await deliver(scheduleDueCommand(row.job_id, Number(row.revision), attempt));
      delivered++;
      await db.prepare(
        "UPDATE schedule_reminders SET status='awaiting_ack',updated_at=? WHERE job_id=? AND revision=? "+
        "AND status='dispatching' AND attempts=?"
      ).bind(now, row.job_id, row.revision, attempt).run();
    } catch (error) {
      const cooldown = Math.min(900, 30 * (2 ** Math.min(attempt, 5)));
      await db.prepare(
        "UPDATE schedule_reminders SET status=?,next_attempt_at=?,updated_at=? "+
        "WHERE job_id=? AND revision=? AND status='dispatching' AND attempts=?"
      ).bind(attempt >= 8 ? 'exhausted' : 'pending', attempt >= 8 ? 0 : now + cooldown,
        now, row.job_id, row.revision, attempt).run();
      console.warn('Schedule reminder relay failure', row.job_id, String(error?.message || error).slice(0, 120));
    }
  }
  return { claimed, delivered };
}
