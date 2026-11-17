import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';

async function miniAppHarness() {
  return harness({extraModules:{miniapp:'lib/miniapp-bridge'}});
}

const ownerContext = {initData:{user:{id:123}}};

test('Serverless emoji pack state is owner-scoped and imports legacy names only once', async () => {
  const h = await miniAppHarness();
  const initial = await h.miniapp.handleMiniAppServerlessEndpoint(
    {action:'custom_emoji_packs'},
    ownerContext,
  );
  assert.equal(initial.access.migration_required, true);
  assert.deepEqual(Array.from(initial.access.custom_emoji_packs), []);

  await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_import',
    request_id:'emoji_import_123',
    pack_names:['first_pack','second_pack','third_pack'],
    pinned_pack:'third_pack',
  }, ownerContext);
  await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_import',
    request_id:'emoji_import_456',
    pack_names:['replacement_pack'],
  }, ownerContext);

  const stored = await h.miniapp.handleMiniAppServerlessEndpoint(
    {action:'custom_emoji_packs'},
    ownerContext,
  );
  assert.deepEqual(Array.from(stored.access.custom_emoji_packs), ['first_pack','second_pack']);
  assert.equal(stored.access.custom_emoji_pack_count, 3);
  assert.equal(stored.access.custom_emoji_pinned_pack, 'third_pack');
  assert.equal(stored.access.migration_required, false);

  h.apiState.pack = {
    name:'third_pack',
    title:'Third',
    sticker_type:'custom_emoji',
    stickers:[{custom_emoji_id:'12345'}],
  };
  h.apiState.customEmojiStickers = [{
    custom_emoji_id:'12345',
    emoji:'🙂',
    file_id:'sticker-file',
    thumbnail:{file_id:'preview-file'},
  }];
  await assert.rejects(
    h.miniapp.handleMiniAppServerlessEndpoint({
      action:'custom_emoji_pack',
      set:'https://t.me/addemoji/third_pack',
      request_id:'emoji_hidden_123',
    }, ownerContext),
    (error) => error.code === 'CUSTOM_EMOJI_PACK_NOT_FOUND',
  );

  h.apiState.pack.name = 'first_pack';
  const visiblePack = await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_pack',
    set:'https://t.me/addemoji/first_pack',
    request_id:'emoji_visible_123',
  }, ownerContext);
  assert.equal(visiblePack.pack.name, 'first_pack');
  const afterHiddenRead = await h.miniapp.handleMiniAppServerlessEndpoint(
    {action:'custom_emoji_packs'},
    ownerContext,
  );
  assert.equal(afterHiddenRead.access.custom_emoji_pack_count, 3);

  const anotherOwner = await h.miniapp.handleMiniAppServerlessEndpoint(
    {action:'custom_emoji_packs'},
    {initData:{user:{id:456}}},
  );
  assert.equal(anotherOwner.access.migration_required, true);
});

test('Developer can add a pack while legacy import is unavailable, then merge old packs later', async () => {
  const h = await miniAppHarness();
  const developerContext = {initData:{user:{id:8997225441}}};
  h.apiState.pack = {
    name:'new_pack',
    title:'New',
    sticker_type:'custom_emoji',
    stickers:[{custom_emoji_id:'12345'}],
  };
  h.apiState.customEmojiStickers = [{custom_emoji_id:'12345',emoji:'🙂',file_id:'sticker-file'}];

  const added = await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_pack',
    set:'new_pack',
    request_id:'emoji_add_while_legacy_pending',
  }, developerContext);
  assert.deepEqual(Array.from(added.access.custom_emoji_packs), ['new_pack']);
  assert.equal(added.access.migration_required, true);

  await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_import',
    request_id:'emoji_merge_legacy_later',
    pack_names:['old_pack'],
    pinned_pack:'old_pack',
  }, developerContext);
  const stored = await h.miniapp.handleMiniAppServerlessEndpoint(
    {action:'custom_emoji_packs'},
    developerContext,
  );
  assert.deepEqual(Array.from(stored.access.custom_emoji_packs), ['old_pack','new_pack']);
  assert.equal(stored.access.custom_emoji_pack_count, 2);
  assert.equal(stored.access.custom_emoji_pinned_pack, 'old_pack');
  assert.equal(stored.access.migration_required, false);
});

test('Serverless emoji pack manager pins, reorders, and deletes the verified owner list', async () => {
  const h = await miniAppHarness();
  await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_import',
    request_id:'emoji_import_789',
    pack_names:['first_pack','second_pack'],
  }, ownerContext);

  await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_manage',
    manage_action:'pin',
    name:'second_pack',
    request_id:'emoji_pin_123',
  }, ownerContext);
  let state = await h.miniapp.handleMiniAppServerlessEndpoint(
    {action:'custom_emoji_packs'},
    ownerContext,
  );
  assert.deepEqual(Array.from(state.access.custom_emoji_packs), ['second_pack','first_pack']);

  await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_manage',
    manage_action:'reorder',
    names:['first_pack','second_pack'],
    request_id:'emoji_order_123',
  }, ownerContext);
  await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_manage',
    manage_action:'delete',
    name:'second_pack',
    request_id:'emoji_delete_123',
  }, ownerContext);

  state = await h.miniapp.handleMiniAppServerlessEndpoint(
    {action:'custom_emoji_packs'},
    ownerContext,
  );
  assert.deepEqual(Array.from(state.access.custom_emoji_packs), ['first_pack']);
});

test('Serverless lets users add packs while legacy import is pending and merges it later', async () => {
  const h = await miniAppHarness();
  h.apiState.pack = {
    name:'sample_pack',
    title:'Sample',
    sticker_type:'custom_emoji',
    stickers:[{custom_emoji_id:'12345'}],
  };
  h.apiState.customEmojiStickers = [{
    custom_emoji_id:'12345',
    emoji:'🙂',
    file_id:'sticker-file',
    thumbnail:{file_id:'preview-file'},
  }];
  const result = await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_pack',
    set:'https://t.me/addemoji/sample_pack',
    request_id:'emoji_add_123',
  }, ownerContext);

  assert.equal(result.pack.name, 'sample_pack');
  assert.deepEqual(Array.from(result.pack.emojis).map(item=>({...item})), [{
    custom_emoji_id:'12345',
    emoji:'🙂',
    preview_file_id:'preview-file',
  }]);
  const retried = await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_pack',
    set:'https://t.me/addemoji/sample_pack',
    request_id:'emoji_add_retry_456',
  }, ownerContext);
  assert.equal(retried.pack.name, 'sample_pack');
  assert.deepEqual(Array.from(retried.access.custom_emoji_packs), ['sample_pack']);

  const pendingImport = await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_packs',
  }, ownerContext);
  assert.equal(pendingImport.access.migration_required, true);

  await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_import',
    request_id:'emoji_import_after_add',
    pack_names:['legacy_pack'],
    pinned_pack:'legacy_pack',
  }, ownerContext);
  const merged = await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_packs',
  }, ownerContext);
  assert.deepEqual(Array.from(merged.access.custom_emoji_packs), ['legacy_pack','sample_pack']);
  assert.equal(merged.access.migration_required, false);

  h.apiState.fileContent = new Uint8Array([0x89,0x50,0x4e,0x47]);
  const preview = await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_preview',
    custom_emoji_id:'12345',
  }, ownerContext);
  assert.equal(preview.content_type, 'image/png');
  assert.equal(preview.data_base64, 'iVBORw==');
});
