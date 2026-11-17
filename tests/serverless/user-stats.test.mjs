import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

test('user analytics distinguish private bot conversations from group and bot updates', async () => {
  const h = await harness({ extraModules: { usage: 'lib/usage-stats' } });

  await h.usage.observeRequest({
    id: 101,
    username: 'private_user',
    first_name: 'User',
  }, 10, false, 1_800_000_000, false);
  assert.equal(h.records.usageUsers[0].privateSeenAt, null);

  await h.usage.observeRequest({
    id: 101,
    username: 'private_user',
    first_name: 'User',
  }, 10, false, 1_800_000_001, true);
  assert.equal(h.records.usageUsers[0].privateSeenAt, 1_800_000_001);

  await h.usage.observeRequest({
    id: 202,
    is_bot: true,
    username: 'another_bot',
  }, 10, false, 1_800_000_002, true);
  assert.equal(h.records.usageUsers.length, 1);
});

test('usage-stat backups preserve private-conversation evidence without inventing legacy values', async () => {
  const h = await harness({ extraModules: { usage: 'lib/usage-stats' } });
  h.records.usageUsers.push({
    userId: 303,
    username: 'stored_user',
    firstName: 'Stored',
    lastName: null,
    languageCode: 'ar',
    firstSeen: 1_800_000_000,
    lastSeen: 1_800_000_100,
    privateSeenAt: 1_800_000_050,
    events: 4,
  });

  const exported = await h.usage.exportUsageStats(1_800_000_200);
  assert.equal(exported.users['303'].private_seen_at, 1_800_000_050);

  const imported = await harness({ extraModules: { usage: 'lib/usage-stats' } });
  await imported.usage.importUsageStats({
    users: {
      303: { first_seen: 1_800_000_000, last_seen: 1_800_000_100, private_seen_at: 1_800_000_050 },
      404: { first_seen: 1_800_000_000, last_seen: 1_800_000_100 },
    },
  });
  assert.equal(imported.records.usageUsers.find(user => user.userId === 303).privateSeenAt, 1_800_000_050);
  assert.equal(imported.records.usageUsers.find(user => user.userId === 404).privateSeenAt, null);
});
