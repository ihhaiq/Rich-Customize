// Rich editor, subscriber, broadcast content and recipient data stay in Telegram Serverless.
// Per-minute triggers carry due-job reminders and an ID/time-only broadcast tick
// only while Cloudflare D1 says a Serverless broadcast is active.
// The daily trigger starts ONE subscription scan cycle; unfinished batches queue RCB1 jobs.
import { dispatchDueReminders } from '../../functions/_lib/scheduling-reminders.js';
import { reserveBridgeSlot } from '../../functions/_lib/b2b-bridge.js';

const BRIDGE_CHAT_ID = -1003993506865;
const MINUTE_CRON = '* * * * *';
const RICH_DONATE_SYNC_CRON = '*/10 * * * *';
const SUBSCRIPTIONS_DAILY_CRON = '0 9 * * *'; // 09:00 UTC, once daily.

export async function broadcastTickEnabled(db) {
  const row = await db.prepare(
    'SELECT active FROM broadcast_tick_control WHERE id = 1',
  ).first();
  return Number(row?.active) === 1;
}

export default {
  async scheduled(event, env, ctx) {
    if (!env.DB || !env.B2B_BOT_TOKEN) throw new Error('Missing DB or B2B_BOT_TOKEN binding');
    const dispatch = async (text) => {
      await reserveBridgeSlot(env.DB, env); // Shared RCB1 throttle with Pages.
      const response = await fetch('https://api.telegram.org/bot' + env.B2B_BOT_TOKEN + '/sendMessage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: BRIDGE_CHAT_ID,
          text,
          disable_notification: true,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error('RCB1 relay HTTP ' + response.status);
      }
    };

    if (event.cron === SUBSCRIPTIONS_DAILY_CRON) {
      // Exactly one daily start signal. Continuation/retry batches are registered
      // by Serverless as due jobs in the existing D1 scheduler, only when needed.
      await dispatch('/rcb_subscription_tick@RichCustomizebot\n' + JSON.stringify({
        protocol: 'RCB1',
        kind: 'daily',
        tag: '#اشتراكات',
        minute: Math.floor(Date.now() / 60000),
      }));
      console.log('Daily subscription reminder scan requested');
      return;
    }

    if (event.cron === RICH_DONATE_SYNC_CRON) {
      await dispatch('/rcb_rdb_tick@RichCustomizebot\n' + JSON.stringify({
        protocol: 'RCB1',
        kind: 'richdonate_sync',
        tag: '#مزامنة_ريتش_دونيت',
        minute: Math.floor(Date.now() / 60000),
      }));
      console.log('Rich Donate B2B sync requested');
      return;
    }

    if (event.cron === MINUTE_CRON) {
      const outcome = await dispatchDueReminders(env.DB, dispatch, Math.floor(Date.now() / 1000), 10);
      console.log('Schedule reminders', outcome.claimed, outcome.delivered);
      if (!await broadcastTickEnabled(env.DB)) return;
      try {
        await dispatch('/rcb_broadcast_tick@RichCustomizebot\n' + JSON.stringify({
          protocol: 'RCB1',
          kind: 'broadcast',
          tag: '#بث',
          minute: Math.floor(Date.now() / 60000),
        }));
      } catch (error) {
        console.warn('Broadcast Cron relay failure', String(error?.message || error).slice(0, 120));
      }
      return;
    }

    throw new Error('Unknown schedule trigger: ' + String(event.cron || ''));
  },
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
