import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

test('eligible accounts default to hidden branding and retain the account preference', async () => {
  const h = await harness({ extraModules: { branding: 'lib/branding' } });
  const now = Math.floor(Date.now() / 1000);
  h.records.editorSubscriptions.push({
    userId: 101,
    plan: 'plus',
    status: 'active',
    source: 'richdonate:verified',
    expiresAt: now + 86400,
  });

  const initial = await h.branding.getBrandingSettings(101);
  assert.equal(initial.canManage, true);
  assert.equal(initial.includeBranding, false);
  assert.equal(await h.branding.shouldIncludeBranding(101), false);

  assert.equal(await h.branding.setBrandingPreference(101, true), true);
  const visible = await h.branding.getBrandingSettings(101);
  assert.equal(visible.canManage, true);
  assert.equal(visible.includeBranding, true);
  assert.equal(await h.branding.setBrandingPreference(101, false), true);
  assert.equal(await h.branding.shouldIncludeBranding(101), false);
  assert.equal(h.records.brandingPreferences.length, 1);
});

test('free and expired accounts cannot change branding preferences', async () => {
  const h = await harness({ extraModules: { branding: 'lib/branding' } });
  const now = Math.floor(Date.now() / 1000);
  h.records.editorSubscriptions.push({
    userId: 102,
    plan: 'plus',
    status: 'active',
    source: 'richdonate:verified',
    expiresAt: now - 1,
  });

  const free = await h.branding.getBrandingSettings(103);
  assert.equal(free.canManage, false);
  assert.equal(free.includeBranding, true);
  assert.equal(await h.branding.setBrandingPreference(103, false), false);
  assert.equal(await h.branding.setBrandingPreference(102, false), false);
  assert.equal(await h.branding.shouldIncludeBranding(102), true);
  assert.equal(h.records.brandingPreferences.length, 0);
});

test('permanent branding entitlement also allows a persistent preference', async () => {
  const h = await harness({ extraModules: { branding: 'lib/branding' } });
  h.records.brandingEntitlements.push({ userId: 104, rightsRemoved: 1 });

  const initial = await h.branding.getBrandingSettings(104);
  assert.equal(initial.canManage, true);
  assert.equal(initial.includeBranding, false);
  assert.equal(await h.branding.setBrandingPreference(104, true), true);
  assert.equal(await h.branding.shouldIncludeBranding(104), true);
});

test('branding toggle callbacks set an explicit target and refresh the action label', async () => {
  const h = await harness({ extraModules: { branding: 'lib/branding' } });
  const now = Math.floor(Date.now() / 1000);
  h.records.editorSubscriptions.push({
    userId: 105,
    plan: 'plus',
    status: 'active',
    source: 'richdonate:verified',
    expiresAt: now + 86400,
  });
  const query = {
    id: 'branding-callback',
    data: 'r:branding-toggle:1',
    from: { id: 105, language_code: 'ar' },
    message: {
      chat: { id: 105, type: 'private' },
      message_id: 88,
      reply_markup: { inline_keyboard: [[{
        text: 'إظهار الحقوق',
        callback_data: 'r:branding-toggle:1',
      }]] },
    },
  };

  await h.branding.handleBrandingCallback(query);
  assert.equal(await h.branding.shouldIncludeBranding(105), true);
  assert.equal(h.calls.find(call => call.method === 'editMessageReplyMarkup')
    .args.reply_markup.inline_keyboard[0][0].callback_data, 'r:branding-toggle:0');

  await h.branding.handleBrandingCallback(query);
  assert.equal(await h.branding.shouldIncludeBranding(105), true);
});
