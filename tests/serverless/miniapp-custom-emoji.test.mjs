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
    pinned_pack:'second_pack',
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
  assert.deepEqual(Array.from(stored.access.custom_emoji_packs), ['second_pack','first_pack']);
  assert.equal(stored.access.custom_emoji_pack_count, 3);
  assert.equal(stored.access.custom_emoji_pinned_pack, 'second_pack');
  assert.equal(stored.access.migration_required, false);

  const anotherOwner = await h.miniapp.handleMiniAppServerlessEndpoint(
    {action:'custom_emoji_packs'},
    {initData:{user:{id:456}}},
  );
  assert.equal(anotherOwner.access.migration_required, true);
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

test('Serverless imports Telegram emoji set metadata and serves bounded preview bytes', async () => {
  const h = await miniAppHarness();
  await assert.rejects(
    () => h.miniapp.handleMiniAppServerlessEndpoint({
      action:'custom_emoji_pack',
      set:'sample_pack',
      request_id:'emoji_add_before_import',
    }, ownerContext),
    error=>error.code==='CUSTOM_EMOJI_MIGRATION_REQUIRED',
  );
  await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_import',
    request_id:'emoji_empty_import_1',
    pack_names:[],
  }, ownerContext);
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

  h.apiState.fileContent = new Uint8Array([0x89,0x50,0x4e,0x47]);
  const preview = await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'custom_emoji_preview',
    custom_emoji_id:'12345',
  }, ownerContext);
  assert.equal(preview.content_type, 'image/png');
  assert.equal(preview.data_base64, 'iVBORw==');
});
