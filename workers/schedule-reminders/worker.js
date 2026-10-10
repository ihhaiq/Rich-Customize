// Separate timer ONLY: the rich editor remains on Telegram Serverless.
// D1 and relay credentials are the existing RCB1 bridge resources.
import { dispatchDueReminders } from '../../functions/_lib/scheduling-reminders.js';
import { reserveBridgeSlot } from '../../functions/_lib/b2b-bridge.js';

export default {
  async scheduled(event, env, ctx) {
    if (!env.DB || !env.B2B_BOT_TOKEN) throw new Error('Missing DB or B2B_BOT_TOKEN binding');
    const dispatch = async (text) => {
      await reserveBridgeSlot(env.DB, env); // Share existing B2B throttle with Pages requests.
      const response = await fetch('https://api.telegram.org/bot' + env.B2B_BOT_TOKEN + '/sendMessage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: -1003993506865,
          text,
          disable_notification: true,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error('RCB1 relay HTTP ' + response.status);
      }
    };
    const outcome = await dispatchDueReminders(env.DB, dispatch, Math.floor(Date.now()/1000), 10);
    console.log('Schedule reminders', outcome.claimed, outcome.delivered);
  },
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
