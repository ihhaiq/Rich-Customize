// Read-only statistics from Serverless-owned subscription and delivery data.
// Reachability is an estimate, never a claim that every tracked user is contactable. 0000
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
    unavailable:unreachable, confirmedReachable, unverified:Math.max(0,known-unreachable-confirmedReachable),
    tiers, activePlans:tiers.plus+tiers.golden+tiers.gift, goldenTotal:tiers.golden+tiers.gift,
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
    FROM (SELECT user_id FROM usage_users UNION SELECT user_id FROM editor_subscriptions
      UNION SELECT user_id FROM golden_claims) u
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

// Union preserves subscribers even if their usage profile has not been populated.
export function activeSubscribersSql(stamp=Math.floor(Date.now()/1000)) {
  const time=Math.max(0,Math.floor(Number(stamp)||0));
  const developers=DEVELOPER_IDS.filter(id=>Number.isSafeInteger(id)&&id>0).join(',')||'-1';
  return `WITH gifts AS (
    SELECT user_id,activated_at,expires_at FROM (
      SELECT user_id,activated_at,expires_at,
        ROW_NUMBER() OVER(PARTITION BY user_id
          ORDER BY expires_at DESC,activated_at DESC) AS rank
      FROM golden_claims WHERE expires_at>${time}
    ) WHERE rank=1
  ), paid AS (
    SELECT user_id,plan,started_at,expires_at FROM editor_subscriptions
    WHERE status='active' AND source='richdonate:verified'
      AND plan IN ('plus','golden') AND expires_at>${time}
  ), owners AS (
    SELECT user_id FROM gifts UNION SELECT user_id FROM paid
  ) SELECT o.user_id,
    u.username,u.first_name,u.last_name,
    CASE WHEN g.user_id IS NOT NULL THEN 'golden' ELSE p.plan END AS plan,
    CASE WHEN g.user_id IS NOT NULL THEN g.activated_at ELSE p.started_at END AS started_at,
    CASE WHEN g.user_id IS NOT NULL THEN g.expires_at ELSE p.expires_at END AS expires_at
  FROM owners o LEFT JOIN gifts g ON g.user_id=o.user_id
  LEFT JOIN paid p ON p.user_id=o.user_id
  LEFT JOIN usage_users u ON u.user_id=o.user_id
  WHERE o.user_id>0 AND o.user_id NOT IN (${developers})`;
}
export async function activeSubscribersPage(requestedPage=0,stamp=Math.floor(Date.now()/1000)) {
  const source=activeSubscribersSql(stamp);
  const counts=await db.all(sql.raw(`SELECT plan,COUNT(*) AS total FROM (${source}) GROUP BY plan`));
  const plus=Number(counts.find(r=>r.plan==='plus')?.total)||0;
  const golden=Number(counts.find(r=>r.plan==='golden')?.total)||0;
  const total=plus+golden,maxPage=Math.max(0,Math.ceil(total/10)-1);
  const page=Math.min(maxPage,Math.max(0,Math.floor(Number(requestedPage)||0)));
  const users=await db.all(sql.raw(`${source} ORDER BY o.user_id LIMIT 10 OFFSET ${page*10}`));
  return {users,total,plus,golden,page,maxPage};
}
