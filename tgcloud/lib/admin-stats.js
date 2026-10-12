// Read-only statistics from Serverless-owned subscription and delivery data.
// Reachability is an estimate, never a claim that every tracked user is contactable.
import { db } from 'sdk';
import { sql } from 'sdk/db';
import { DEVELOPER_IDS } from 'lib/developer-access';

export function normalizeAudienceStats(tierRows, reachabilityRow, knownUsers) {
  const tiers = { free:0, plus:0, golden:0, gift:0, developer:0 };
  for (const row of tierRows || []) {
    if (Object.prototype.hasOwnProperty.call(tiers, row?.tier)) {
      tiers[row.tier] += Math.max(0, Number(row.total) || 0);
    }
  }
  const known = Math.max(0, Number(knownUsers)||0);
  const unreachable = Math.min(known, Math.max(0, Number(reachabilityRow?.unreachable)||0));
  const confirmedReachable = Math.min(known-unreachable, Math.max(0, Number(reachabilityRow?.confirmed)||0));
  return {
    known, estimatedAvailable:known-unreachable,
    unavailable, confirmedReachable, unverified:Math.max(0,known-unreachable-confirmedReachable),
    tiers,
  };
}

export async function audienceAndSubscriptionStats(stamp=Math.floor(Date.now()/1000)) {
  const time=Math.max(0,Math.floor(Number(stamp)||0));
  // This comes only from the deployed developer list, never a request parameter.
  const developers=DEVELOPER_IDS.filter(id=>Number.isSafeInteger(id)&&id>0).join(',')||'-1';
  const tierRows=await db.all(sql.raw(`
    SELECT CASE
      WHEN u.user_id IN (${developers}) THEN 'developer'
      WHEN EXISTS (
        SELECT 1 FROM golden_claims g
        WHERE g.user_id=u.user_id AND g.expires_at>${time}
      ) THEN 'gift'
      WHEN s.user_id IS NOT NULL THEN s.plan
      ELSE 'free'
    END AS tier, COUNT(*) AS total
    FROM usage_users u
    LEFT JOIN editor_subscriptions s ON
      s.user_id=u.user_id AND s.status='active'
      AND s.source='richdonate:verified' AND s.plan IN ('plus','golden')
      AND s.expires_at>${time}
    GROUP BY tier
  `));
  // Latest definitive Telegram result for each user. A later incoming update
  // means a previously unavailable user has contacted the bot again.
  const reach=await db.get(sql.raw(`
    WITH latest AS (
      SELECT user_id,status,updated_at,
        ROW_NUMBER() OVER(PARTITION BY user_id
          ORDER BY updated_at DESC,month DESC) AS rank
      FROM golden_announcements
    )
    SELECT COUNT(*) AS known,
      COALESCE(SUM(CASE WHEN a.status='unavailable'
        AND a.updated_at>=u.last_seen THEN 1 ELSE 0 END),0) AS unreachable,
      COALESCE(SUM(CASE WHEN a.status='sent' THEN 1 ELSE 0 END),0) AS confirmed
    FROM usage_users u
    LEFT JOIN latest a ON a.user_id=u.user_id AND a.rank=1
  `));
  return normalizeAudienceStats(tierRows,reach,reach?.known);
}
