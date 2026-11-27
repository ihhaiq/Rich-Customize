import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

const developerId = 8997225441;

async function developerHarness({ queryHandler = null, users = [] } = {}) {
  const loggedErrors = [];
  const h = await harness({
    extraModules: { developer: 'lib/developer' },
    queryHandler,
    moduleMocks: {
      'lib/admin-stats': {
        audienceAndSubscriptionStats: async () => ({}),
      },
      'lib/developer-access': {
        developerAccessConfigured: () => true,
        isDeveloper: userId => Number(userId) === developerId,
      },
      'lib/backup-import': {
        MAX_IMPORT_ARCHIVE_BYTES: 20 * 1024 * 1024,
        applyPreparedBackup: async () => ({}),
        buildDataExport: async () => ({}),
        createPageSnapshot: async () => ({}),
        getLegacyState: async () => null,
        pageSnapshotRestoreDrill: async () => ({}),
        prepareBackupImport: () => ({}),
        setLegacyState: async () => {},
      },
      'lib/usage-stats': {
        usageSummary: async () => ({}),
        usageUsersPage: async (page) => ({
          users,
          page,
          maxPage: 0,
          total: 0,
        }),
      },
      'lib/bot-profile': {
        syncBotProfiles: async () => ({}),
      },
      'lib/error-log': {
        configureErrorLogChannel: async () => ({}),
        disableErrorLogChannel: async () => {},
        errorLogConfig: async () => ({}),
        logError: async (scope, error, context) => {
          loggedErrors.push({ scope, error, context });
        },
        testErrorLogChannel: async () => {},
        testErrorLogTemplate: async () => {},
      },
    },
  });
  h.apiState.me = { id: 8997225442, is_bot: true, username: 'RichCustomizebot' };
  h.apiState.members = {
    [String(h.apiState.me.id)]: { status: 'administrator' },
  };
  h.loggedErrors = loggedErrors;
  return h;
}

async function startBroadcast(h, label = 'Broadcast test message') {
  const query = data => ({
    id: 'broadcast-helper-' + data,
    from: { id: developerId },
    data,
    message: { chat: { id: developerId, type: 'private' }, message_id: 50 },
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast'));
  await h.developer.handleDeveloperPendingMessage({
    from: { id: developerId },
    chat: { id: developerId, type: 'private' },
    message_id: 60,
    text: label,
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast:confirm'));
  const active = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:active');
  return {
    jobNamespace: 'developer_broadcast:v1:job:' + active.payload.jobId,
    active,
  };
}

test('developer panel command in a group does not open or expose admin actions', async () => {
  const h = await developerHarness();

  await h.developer.openDeveloperPanel({
    from: { id: developerId },
    chat: { id: -1001, type: 'supergroup' },
  });

  const response = h.calls.find(call => call.method === 'sendMessage');
  assert.equal(response.args.chat_id, -1001);
  assert.match(response.args.text, /المحادثة الخاصة/);
  assert.equal(h.calls.some(call => call.method === 'sendRichMessage'), false);
});

test('developer import prompt keeps confirmation controls inline and returns to the compact home menu', async () => {
  const h = await developerHarness();
  const query = data => ({
    id: 'import-menu-' + data,
    from: { id: developerId },
    data,
    message: { chat: { id: developerId, type: 'private' }, message_id: 50 },
  });

  await h.developer.handleDeveloperCallback(query('dev:import'));
  const prompt = h.calls.find(call => call.method === 'editMessageText');
  assert.deepEqual(prompt.args.reply_markup.inline_keyboard.map(row =>
    row.map(button => button.callback_data)), [['dev:import:cancel']]);
  assert.doesNotMatch(JSON.stringify(prompt.args.rich_message), /callback_data|type":"button/);

  const cancelStart = h.calls.length;
  await h.developer.handleDeveloperCallback(query('dev:import:cancel'));
  const home = h.calls.slice(cancelStart).find(call => call.method === 'editMessageText');
  assert.deepEqual(home.args.reply_markup.inline_keyboard.map(row =>
    row.map(button => button.callback_data)), [
    ['dev:stats', 'dev:broadcast:menu'],
    ['dev:backup:menu', 'dev:tools:menu'],
  ]);
});

test('callbacks from a group cannot run developer actions', async () => {
  const h = await developerHarness();

  await h.developer.handleDeveloperCallback({
    id: 'group-panel',
    from: { id: developerId },
    data: 'dev:export',
    message: { chat: { id: -1001, type: 'supergroup' }, message_id: 50 },
  });

  assert.equal(h.calls.some(call => call.method === 'sendDocument'), false);
  assert.equal(h.calls.some(call => call.method === 'sendRichMessage'), false);
  assert.equal(h.calls.at(-1).method, 'answerCallbackQuery');
  assert.equal(h.calls.at(-1).args.show_alert, true);
});

test('plain-text panel fallback retains report content and actions', async () => {
  const h = await developerHarness();
  h.apiState.richSendError = 'rich messages unavailable';

  await h.developer.handleDeveloperCallback({
    id: 'private-panel',
    from: { id: developerId },
    data: 'dev:stats:users:0',
    message: { chat: { id: developerId, type: 'private' } },
  });

  const fallback = h.calls.find(call => call.method === 'sendMessage');
  assert.match(fallback.args.text, /إحصائيات المستخدمين/);
  assert.match(fallback.args.text, /المستخدمون:/);
  const buttons = fallback.args.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some(button => button.callback_data === 'dev:stats'));
  assert.ok(buttons.some(button => button.callback_data === 'dev:home'));
});

test('developer pending input never sends a legacy panel response back to a group', async () => {
  const h = await developerHarness();
  h.records.developerStates.push({
    userId: developerId,
    state: 'waiting_error_log_channel',
    fileId: null,
    fileName: null,
    createdAt: Math.floor(Date.now() / 1000),
    summary: { panelChatId: -1001, panelMessageId: 50 },
  });

  await h.developer.handleDeveloperPendingMessage({
    from: { id: developerId },
    chat: { id: developerId, type: 'private' },
    text: '@errors',
  });

  assert.equal(h.calls.some(call => call.args?.chat_id === -1001), false);
  assert.ok(h.calls.some(call => call.method === 'sendRichMessage' && call.args.chat_id === developerId));
});

test('failed text fallback for an existing panel is surfaced', async () => {
  const h = await developerHarness();
  h.apiState.editError = 'message edit unavailable';

  await assert.rejects(
    () => h.developer.handleDeveloperCallback({
      id: 'private-panel',
      from: { id: developerId },
      data: 'dev:stats:users:0',
      message: { chat: { id: developerId, type: 'private' }, message_id: 50 },
    }),
    /message edit unavailable/,
  );
});

test('user page statistics fetch page counts in one query with validated owner IDs', async () => {
  const statements = [];
  const h = await developerHarness({
    users: [
      { userId: 123, username: 'one', events: 3 },
      { userId: 456, username: 'two', events: 1 },
      { userId: '123); DROP TABLE rich_pages; --', events: 0 },
    ],
    queryHandler: (statement) => {
      statements.push(statement.query);
      return [
        { owner_id: 123, page_count: 2 },
        { owner_id: 456, page_count: 0 },
      ];
    },
  });
  h.apiState.richSendError = 'rich messages unavailable';

  await h.developer.handleDeveloperCallback({
    id: 'private-panel',
    from: { id: developerId },
    data: 'dev:stats:users:0',
    message: { chat: { id: developerId, type: 'private' } },
  });

  assert.equal(statements.length, 1);
  assert.match(statements[0], /owner_id IN \(123,456\)/);
  const fallback = h.calls.find(call => call.method === 'sendMessage');
  assert.match(fallback.args.text, /الصفحات: 2/);
  assert.match(fallback.args.text, /الصفحات: 0/);
});

test('developer broadcasts copy the rich source to the tracked audience in Cron-sized batches', async () => {
  const statements = [];
  const h = await developerHarness({
    queryHandler: statement => {
      statements.push(statement.query);
      if (statement.query.includes('MAX(audience.user_id)')) {
        return [{ total: 2, max_user_id: 202, private_users: 1 }];
      }
      if (statement.query.includes('user_id > 202')) return [];
      if (statement.query.includes('user_id > 101')) return [{ user_id: 202 }];
      return [{ user_id: 101 }];
    },
  });
  const query = data => ({
    id: 'broadcast-' + data,
    from: { id: developerId },
    data,
    message: { chat: { id: developerId, type: 'private' }, message_id: 50 },
  });

  await h.developer.handleDeveloperCallback(query('dev:broadcast'));
  await h.developer.handleDeveloperPendingMessage({
    from: { id: developerId },
    chat: { id: developerId, type: 'private' },
    message_id: 60,
    text: 'Formatted *announcement*',
    entities: [{ type: 'bold', offset: 11, length: 12 }],
  });
  const confirmation = h.calls.filter(call => call.method === 'editMessageText').at(-1);
  assert.match(JSON.stringify(confirmation.args.rich_message), /2/);

  await h.developer.handleDeveloperCallback(query('dev:broadcast:confirm'));
  const jobRecord = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:active');
  assert.equal(jobRecord.payload.status, 'running');
  const jobNamespace = 'developer_broadcast:v1:job:' + jobRecord.payload.jobId;
  const job = h.records.legacyStates.find(row => row.namespace === jobNamespace).payload;
  assert.equal(job.privateUsers, 1);
  assert.equal(job.sourceMessageId, 60);
  assert.equal(job.sourceChatId, developerId);
  const controlMessages = () => h.calls.filter(call => call.method === 'sendMessage'
    && call.args.chat_id === -1003993506865
    && call.args.text?.startsWith('/rcb_broadcast_control@Richminiappsbot\n'));
  const startControl = controlMessages().at(-1);
  assert.ok(startControl);
  const startPayload = JSON.parse(startControl.args.text.split('\n')[1]);
  assert.equal(startPayload.status, 'active');
  assert.equal(startPayload.tag, '#بث');

  const minute = Math.floor(Date.now() / 60000) + 1;
  await h.developer.runDeveloperBroadcastTick(minute);
  await h.developer.runDeveloperBroadcastTick(minute);
  const deliveryCopies = h.calls.filter(call => call.method === 'copyMessage'
    && call.args.from_chat_id === developerId
    && call.args.chat_id !== developerId);
  assert.deepEqual(deliveryCopies.map(call => call.args.chat_id), [101]);

  await h.developer.runDeveloperBroadcastTick(minute + 1);
  await h.developer.runDeveloperBroadcastTick(minute + 2);
  const completed = h.records.legacyStates.find(row => row.namespace === jobNamespace).payload;
  assert.equal(completed.status, 'done');
  assert.equal(completed.sent, 2);
  const stopPayload = JSON.parse(controlMessages().at(-1).args.text.split('\n')[1]);
  assert.equal(stopPayload.status, 'inactive');
  assert.equal(stopPayload.tag, '#بث');
  assert.equal(h.calls.some(call => call.method === 'sendMessage'
    && call.args.text?.includes('اكتمل الإرسال ويجري إرسال تقرير النتائج')), true);
  assert.ok(statements.some(queryText => queryText.includes('private_seen_at')));
  const recipientQuery = statements.find(queryText =>
    queryText.includes('ORDER BY audience.user_id ASC'));
  assert.match(recipientQuery, /UNION SELECT owner_id AS user_id FROM rich_pages/);
  assert.match(recipientQuery, /UNION SELECT user_id FROM editor_sessions/);
  assert.match(recipientQuery, /developer_broadcast_exclusions/);
});

test('developer broadcast does not start when Cloudflare control activation fails', async () => {
  const h = await developerHarness({
    queryHandler: statement => statement.query.includes('MAX(audience.user_id)')
      ? [{ total: 1, max_user_id: 101, private_users: 1 }]
      : statement.query.includes('user_id > 101') ? [] : [{ user_id: 101 }],
  });
  h.apiState.messageSendErrors = {
    '-1003993506865': new Error('bridge unavailable'),
  };
  const { active, jobNamespace } = await startBroadcast(h);
  const job = h.records.legacyStates.find(row => row.namespace === jobNamespace).payload;

  assert.equal(active.payload.status, 'failed');
  assert.equal(job.status, 'failed');
  assert.equal(job.failureReason, 'broadcast_control_failed');
  assert.equal(h.calls.some(call => call.method === 'copyMessage'
    && call.args.chat_id === 101), false);
  const controlMessages = () => h.calls.filter(call => call.method === 'sendMessage'
    && call.args.chat_id === -1003993506865
    && call.args.text?.startsWith('/rcb_broadcast_control@Richminiappsbot\n'));
  const retryMinute = Math.floor(Date.now() / 60000) + 1;
  const beforeRetry = controlMessages().length;
  await h.developer.runDeveloperBroadcastTick(retryMinute);
  await h.developer.runDeveloperBroadcastTick(retryMinute);
  assert.equal(controlMessages().length, beforeRetry + 1);
  const stopPayload = JSON.parse(controlMessages().at(-1).args.text.split('\n')[1]);
  assert.equal(stopPayload.status, 'inactive');
  assert.equal(stopPayload.tag, '#بث');
  assert.equal(h.calls.some(call => call.method === 'sendMessage'
    && call.args.chat_id === developerId
    && /لم يبدأ إرسال الرسائل/.test(call.args.text || '')), true);
});

test('developer broadcasts copy messages to newly registered administrator chats', async () => {
  const chatId = -1009001001;
  const h = await developerHarness({
    queryHandler: (statement, { records }) => {
      if (statement.query.includes('MAX(audience.user_id)')) {
        return [{
          total: 0,
          max_user_id: 0,
          private_users: 0,
          total_chats: records.developerBroadcastChats.length,
          min_chat_id: chatId,
        }];
      }
      if (statement.query.includes('SELECT chats.chat_id')) {
        const cursor = Number(statement.query.match(/chats\.chat_id < (-?\d+)/)?.[1]);
        const excluded = records.developerBroadcastExclusions
          .some(row => row.destinationId === chatId);
        return cursor > chatId && !excluded
          ? [{ chat_id: chatId, title: 'Rich Customize updates', type: 'channel' }]
          : [];
      }
      return [];
    },
  });
  h.records.developerBroadcastChats.push({
    chatId,
    title: 'Rich Customize updates',
    type: 'channel',
    username: 'RichCustomize',
    discoveredAt: Math.floor(Date.now() / 1000) - 1,
  });

  const { jobNamespace } = await startBroadcast(h, 'Channel announcement');
  const minute = Math.floor(Date.now() / 60000) + 1;
  await h.developer.runDeveloperBroadcastTick(minute);
  await h.developer.runDeveloperBroadcastTick(minute + 1);

  const job = h.records.legacyStates.find(row => row.namespace === jobNamespace).payload;
  assert.equal(job.status, 'done');
  assert.equal(job.sent, 1);
  assert.equal(job.totalChats, 1);
  assert.ok(h.calls.some(call => call.method === 'copyMessage'
    && call.args.chat_id === chatId));
  assert.ok(h.calls.some(call => call.method === 'sendMessage'
    && call.args.text?.includes('اكتملت محاولات الإرسال لكل المستلمين المؤهلين')));
});

test('terminal channel permission failures are explained and excluded from later broadcasts', async () => {
  const chatId = -1009001002;
  const h = await developerHarness({
    queryHandler: (statement, { records }) => {
      if (statement.query.includes('MAX(audience.user_id)')) {
        return [{
          total: 0,
          max_user_id: 0,
          private_users: 0,
          total_chats: 1,
          min_chat_id: chatId,
        }];
      }
      if (statement.query.includes('SELECT chats.chat_id')) {
        const cursor = Number(statement.query.match(/chats\.chat_id < (-?\d+)/)?.[1]);
        const excluded = records.developerBroadcastExclusions
          .some(row => row.destinationId === chatId);
        return cursor > chatId && !excluded
          ? [{ chat_id: chatId, title: 'Announcements', type: 'channel' }]
          : [];
      }
      return [];
    },
  });
  h.records.developerBroadcastChats.push({
    chatId,
    title: 'Announcements',
    type: 'channel',
    discoveredAt: Math.floor(Date.now() / 1000) - 1,
  });
  h.apiState.copyMessageErrors = {
    [String(chatId)]: new h.BotApiError(403, 'Forbidden: not enough rights to send messages to the chat'),
  };

  const { jobNamespace } = await startBroadcast(h, 'Channel permission failure');
  const minute = Math.floor(Date.now() / 60000) + 1;
  await h.developer.runDeveloperBroadcastTick(minute);
  await h.developer.runDeveloperBroadcastTick(minute + 1);

  const job = h.records.legacyStates.find(row => row.namespace === jobNamespace).payload;
  assert.equal(job.status, 'done');
  assert.equal(job.failed, 1);
  assert.equal(h.records.developerBroadcastExclusions[0].destinationId, chatId);
  assert.equal(h.records.developerBroadcastExclusions[0].reasonCode, 'MISSING_SEND_PERMISSION');
  assert.equal(h.calls.filter(call => call.method === 'copyMessage'
    && call.args.chat_id === chatId).length, 1);
  const report = h.calls.find(call => call.method === 'sendDocument');
  const content = new TextDecoder().decode(new Uint8Array(Object.values(report.args.document.data)));
  assert.match(content, /قناة\/مجموعة\tتعذر الإرسال\tالبوت لا يملك صلاحية الإرسال في المحادثة/);
});

test('developer broadcasts skip official-channel subscribers before private delivery', async () => {
  const h = await developerHarness({
    queryHandler: statement => {
      if (statement.query.includes('MAX(audience.user_id)')) {
        return [{ total: 1, max_user_id: 101, private_users: 1, total_chats: 0, min_chat_id: 0 }];
      }
      if (statement.query.includes('ORDER BY audience.user_id ASC')) {
        return statement.query.includes('audience.user_id > 101') ? [] : [{ user_id: 101 }];
      }
      return [];
    },
  });
  h.apiState.members['@RichCustomize:101'] = { status: 'member' };

  const { jobNamespace } = await startBroadcast(h);
  const minute = Math.floor(Date.now() / 60000) + 1;
  await h.developer.runDeveloperBroadcastTick(minute);
  await h.developer.runDeveloperBroadcastTick(minute + 1);

  const job = h.records.legacyStates.find(row => row.namespace === jobNamespace).payload;
  assert.equal(job.status, 'done');
  assert.equal(job.sent, 0);
  assert.equal(job.skippedSubscribers, 1);
  assert.equal(h.calls.some(call => call.method === 'copyMessage'
    && call.args.chat_id === 101), false);
  assert.ok(h.calls.some(call => call.method === 'sendMessage'
    && /مستثنون لأنهم مشتركوا @RichCustomize: [١1]/.test(call.args.text || '')));
});

test('bot accounts are stored as permanent broadcast exclusions', async () => {
  const h = await developerHarness();
  await h.developer.excludeDeveloperBroadcastBot(7654321);

  assert.deepEqual(h.records.developerBroadcastExclusions[0], {
    destinationId: 7654321,
    destinationType: 'user',
    reasonCode: 'BOT_ACCOUNT',
    reasonDetail: '',
    excludedAt: h.records.developerBroadcastExclusions[0].excludedAt,
  });
});

test('new administrator chats enter the future broadcast registry and are removed after demotion', async () => {
  const h = await harness({ extraModules: { publish: 'lib/publish' } });
  const update = {
    from: { id: 7001, language_code: 'en' },
    chat: { id: -1009002002, type: 'supergroup', title: 'Announcements' },
    new_chat_member: { status: 'administrator' },
  };

  await h.publish.handleMyChatMember(update);
  assert.deepEqual(h.records.developerBroadcastChats.map(row => ({
    chatId: row.chatId,
    type: row.type,
    title: row.title,
  })), [{
    chatId: -1009002002,
    type: 'supergroup',
    title: 'Announcements',
  }]);

  await h.publish.handleMyChatMember({
    ...update,
    new_chat_member: { status: 'member' },
  });
  assert.equal(h.records.developerBroadcastChats.length, 0);
});

test('developer broadcast status reports live progress privately with a refresh action', async () => {
  const h = await developerHarness({
    queryHandler: statement => statement.query.includes('MAX(audience.user_id)')
      ? [{ total: 4, max_user_id: 104, private_users: 3 }]
      : [],
  });
  const query = data => ({
    id: 'broadcast-status-' + data,
    from: { id: developerId },
    data,
    message: { chat: { id: developerId, type: 'private' }, message_id: 50 },
  });

  await h.developer.openDeveloperPanel({
    from: { id: developerId },
    chat: { id: developerId, type: 'private' },
    message_id: 50,
  });
  const panel = h.calls.find(call => call.method === 'sendRichMessage');
  const homeButtons = panel.args.reply_markup.inline_keyboard;
  assert.equal(homeButtons.length, 2);
  assert.deepEqual(homeButtons.map(row => row.map(button => button.callback_data)), [
    ['dev:stats', 'dev:broadcast:menu'],
    ['dev:backup:menu', 'dev:tools:menu'],
  ]);
  assert.ok(homeButtons.flat().every(button => button.style === 'primary'));
  assert.doesNotMatch(JSON.stringify(panel.args.rich_message), /callback_data|type":"button/);

  const broadcastMenuStart = h.calls.length;
  await h.developer.handleDeveloperCallback(query('dev:broadcast:menu'));
  const broadcastMenu = h.calls.slice(broadcastMenuStart)
    .find(call => call.method === 'editMessageText');
  const broadcastButtons = broadcastMenu.args.reply_markup.inline_keyboard;
  assert.deepEqual(broadcastButtons.map(row => row.map(button => button.callback_data)), [
    ['dev:broadcast:check', 'dev:broadcast'],
    ['dev:home'],
  ]);
  assert.equal(broadcastButtons[0][1].style, 'success');
  assert.doesNotMatch(JSON.stringify(broadcastMenu.args.rich_message), /callback_data|type":"button/);

  const backupMenuStart = h.calls.length;
  await h.developer.handleDeveloperCallback(query('dev:backup:menu'));
  const backupMenu = h.calls.slice(backupMenuStart)
    .find(call => call.method === 'editMessageText');
  const backupButtons = backupMenu.args.reply_markup.inline_keyboard;
  assert.deepEqual(backupButtons.map(row => row.map(button => button.callback_data)), [
    ['dev:import', 'dev:export'],
    ['dev:snapshot', 'dev:home'],
  ]);
  assert.equal(backupButtons[1][0].style, 'success');

  const toolsMenuStart = h.calls.length;
  await h.developer.handleDeveloperCallback(query('dev:tools:menu'));
  const toolsMenu = h.calls.slice(toolsMenuStart)
    .find(call => call.method === 'editMessageText');
  assert.deepEqual(toolsMenu.args.reply_markup.inline_keyboard
    .map(row => row.map(button => button.callback_data)), [
    ['dev:database:check', 'dev:showcase:refresh'],
    ['dev:languages:sync', 'dev:errorlog'],
    ['dev:home'],
  ]);

  const returnHomeStart = h.calls.length;
  await h.developer.handleDeveloperCallback(query('dev:home'));
  const returnedHome = h.calls.slice(returnHomeStart)
    .find(call => call.method === 'editMessageText');
  assert.deepEqual(returnedHome.args.reply_markup.inline_keyboard
    .map(row => row.map(button => button.callback_data)), [
    ['dev:stats', 'dev:broadcast:menu'],
    ['dev:backup:menu', 'dev:tools:menu'],
  ]);

  await h.developer.handleDeveloperCallback(query('dev:broadcast'));
  await h.developer.handleDeveloperPendingMessage({
    from: { id: developerId },
    chat: { id: developerId, type: 'private' },
    message_id: 60,
    text: 'Status check announcement',
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast:confirm'));

  const active = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:active');
  const jobRecord = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:job:' + active.payload.jobId);
  jobRecord.payload.sent = 1;
  jobRecord.payload.failed = 1;

  const callsBeforeCheck = h.calls.length;
  await h.developer.handleDeveloperCallback(query('dev:broadcast:check'));
  const statusMessage = h.calls.slice(callsBeforeCheck)
    .find(call => call.method === 'editMessageText');
  assert.ok(statusMessage);
  assert.equal(statusMessage.args.chat_id, developerId);
  const report = JSON.stringify(statusMessage.args.rich_message);
  assert.match(report, /المعالجة: .+ من .+ \(50%\)/);
  assert.match(report, /قبلها Telegram/);
  assert.ok(statusMessage.args.reply_markup.inline_keyboard.flat()
    .some(button => button.callback_data === 'dev:broadcast:check'));
});

test('developer broadcasts send a private completion report with failed user IDs and reasons', async () => {
  const statements = [];
  const h = await developerHarness({
    queryHandler: statement => {
      statements.push(statement.query);
      if (statement.query.includes('MAX(audience.user_id)')) {
        return [{ total: 2, max_user_id: 202, private_users: 1 }];
      }
      if (statement.query.includes('user_id > 202')) return [];
      return [{ user_id: 101 }, { user_id: 202 }];
    },
  });
  const query = data => ({
    id: 'broadcast-report-' + data,
    from: { id: developerId },
    data,
    message: { chat: { id: developerId, type: 'private' }, message_id: 50 },
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast'));
  await h.developer.handleDeveloperPendingMessage({
    from: { id: developerId },
    chat: { id: developerId, type: 'private' },
    message_id: 60,
    text: 'Broadcast with per-user results',
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast:confirm'));

  h.apiState.copyMessageErrors = {
    101: new h.BotApiError(403, 'Forbidden: bot was blocked by the user'),
    202: new h.BotApiError(400, 'Bad Request: chat not found'),
  };
  const minute = Math.floor(Date.now() / 60000) + 1;
  await h.developer.runDeveloperBroadcastTick(minute);
  await h.developer.runDeveloperBroadcastTick(minute + 1);

  const active = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:active');
  const jobRecord = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:job:' + active.payload.jobId);
  assert.equal(active.payload.status, 'done');
  assert.equal(jobRecord.payload.sent, 0);
  assert.equal(jobRecord.payload.failed, 2);
  const report = h.calls.find(call => call.method === 'sendDocument'
    && call.args.document.filename.includes('_results_'));
  assert.ok(report);
  assert.equal(report.args.chat_id, developerId);
  assert.match(report.args.caption, /تعذر الإرسال \(مستبعدون من الحملات القادمة\):\s*٢/);
  const content = new TextDecoder().decode(new Uint8Array(Object.values(report.args.document.data)));
  assert.match(content, /إعادة المحاولة \/ الإجراء/);
  assert.match(content, /101\tمستخدم\tتعذر الإرسال\tالمستخدم حظر البوت\t403\t\tلا؛ مستبعد من الإذاعات القادمة/);
  assert.match(content, /202\tمستخدم\tتعذر الإرسال\tالمحادثة غير موجودة أو غير متاحة للبوت\t400\t\tلا؛ مستبعد من الإذاعات القادمة/);
  assert.deepEqual(
    h.records.developerBroadcastExclusions.map(row => row.destinationId).sort((a, b) => a - b),
    [101, 202],
  );
  assert.ok(statements.some(queryText => queryText.includes('UNION SELECT owner_id AS user_id FROM rich_pages')));
  assert.ok(statements.some(queryText => queryText.includes('UNION SELECT user_id FROM editor_sessions')));
});

test('broadcast classifies Bot-to-Bot-disabled destinations as excluded bots', async () => {
  const h = await developerHarness({
    queryHandler: statement => {
      if (statement.query.includes('MAX(audience.user_id)')) {
        return [{ total: 1, max_user_id: 303, private_users: 1 }];
      }
      if (statement.query.includes('audience.user_id > 303')) return [];
      return [{ user_id: 303 }];
    },
  });
  const { jobNamespace } = await startBroadcast(h);
  h.apiState.copyMessageErrors = {
    303: new h.BotApiError(400, 'Bad Request: USER_BOT_TO_BOT_DISABLED'),
  };
  const minute = Math.floor(Date.now() / 60000) + 1;

  await h.developer.runDeveloperBroadcastTick(minute);
  await h.developer.runDeveloperBroadcastTick(minute + 1);

  const jobRecord = h.records.legacyStates.find(row => row.namespace === jobNamespace);
  assert.equal(jobRecord.payload.failed, 1);
  assert.deepEqual(
    h.records.developerBroadcastExclusions.map(row => ({
      destinationId: row.destinationId,
      reasonCode: row.reasonCode,
    })),
    [{ destinationId: 303, reasonCode: 'BOT_TO_BOT_DISABLED' }],
  );
  const report = h.calls.find(call => call.method === 'sendDocument');
  const content = new TextDecoder().decode(new Uint8Array(Object.values(report.args.document.data)));
  assert.match(content, /303\tبوت\tتعذر الإرسال\tTelegram عطّل المراسلة بين البوتات\t400\t\tلا؛ مستبعد من الإذاعات القادمة/);
});

test('broadcast skips users with unknown membership and reports only after the remaining audience is sent', async () => {
  const h = await developerHarness({
    queryHandler: statement => {
      const query = statement.query;
      if (query.includes('MAX(audience.user_id)')) {
        return [{ total: 3, max_user_id: 202, private_users: 3 }];
      }
      if (query.includes('audience.user_id > 202')) return [];
      if (query.includes('audience.user_id > 151')) return [{ user_id: 202 }];
      if (query.includes('audience.user_id > 101')) return [{ user_id: 151 }, { user_id: 202 }];
      return [{ user_id: 101 }, { user_id: 151 }, { user_id: 202 }];
    },
  });
  const { jobNamespace } = await startBroadcast(h);
  h.apiState.memberErrors = {
    101: new h.BotApiError(400, 'Bad Request: PARTICIPANT_ID_INVALID'),
    151: new h.BotApiError(400, 'Bad Request: PARTICIPANT_ID_INVALID'),
  };
  const minute = Math.floor(Date.now() / 60000) + 1;

  await h.developer.runDeveloperBroadcastTick(minute);

  const jobRecord = h.records.legacyStates.find(row => row.namespace === jobNamespace);
  assert.equal(jobRecord.payload.membershipCheckFailed, 2);
  assert.equal(jobRecord.payload.sent, 1);
  assert.equal(jobRecord.payload.failed, 0);
  assert.equal(h.calls.some(call => call.method === 'sendDocument'), false);
  assert.equal(h.calls.filter(call => call.method === 'copyMessage'
    && call.args.chat_id === 202).length, 1);

  await h.developer.runDeveloperBroadcastTick(minute + 1);

  const active = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:active');
  assert.equal(active.payload.status, 'done');
  const reportIndex = h.calls.findIndex(call => call.method === 'sendDocument');
  const finalDeliveryIndex = h.calls.findIndex(call => call.method === 'copyMessage'
    && call.args.chat_id === 202);
  assert.ok(reportIndex > finalDeliveryIndex);
  const report = h.calls[reportIndex];
  const content = new TextDecoder().decode(new Uint8Array(Object.values(report.args.document.data)));
  assert.match(report.args.caption, /تعذر التحقق من عضويتهم \(تجاوز هذه الحملة؛ يُعاد فحصهم لاحقاً\): ٢/);
  assert.match(content, /101\tمستخدم\tلم تُرسل\tتعذر التحقق من عضوية القناة الرسمية؛ لم تُرسل رسالة خاصة\t400\t\tلا في هذه الحملة؛ يُعاد فحص العضوية في حملة لاحقة/);
  assert.match(content, /151\tمستخدم\tلم تُرسل\tتعذر التحقق من عضوية القناة الرسمية؛ لم تُرسل رسالة خاصة\t400\t\tلا في هذه الحملة؛ يُعاد فحص العضوية في حملة لاحقة/);
  assert.equal(h.loggedErrors.length, 1);
  assert.equal(h.loggedErrors[0].scope, 'developer.broadcast.membership');
  assert.equal(h.loggedErrors[0].context.userId, 101);
});

test('broadcast error notifications classify scoped failures instead of showing an unclassified error', async () => {
  const h = await harness({ extraModules: { errorLog: 'lib/error-log' } });
  h.records.legacyStates.push({
    namespace: 'error_log',
    payload: {
      enabled: true,
      chat_id: 9001,
      title: 'Broadcast error log',
      username: null,
      last_error_key: null,
      last_error_at: 0,
    },
    updatedAt: 0,
  });

  await h.errorLog.logError(
    'developer.broadcast.delivery',
    new Error('new internal broadcast failure'),
    { userId: 101, chatId: 8997225441 },
  );

  const notification = h.calls.find(call => call.method === 'sendRichMessage'
    && call.args.chat_id === 9001);
  assert.ok(notification);
  const table = notification.args.rich_message.blocks.find(block => block.type === 'table');
  const rows = new Map(table.cells.slice(1).map(row => [row[0].text, row[1].text]));
  assert.equal(rows.get('المصدر'), 'developer.broadcast.delivery');
  assert.equal(rows.get('التصنيف'), 'BROADCAST_INTERNAL_ERROR');
  assert.equal(notification.args.rich_message.blocks[0].text, '🚨 خطأ إرسال الإذاعة');
});

test('developer broadcast retries a failed private completion report and logs the report error', async () => {
  const h = await developerHarness({
    queryHandler: statement => statement.query.includes('MAX(audience.user_id)')
      ? [{ total: 1, max_user_id: 101, private_users: 1 }]
      : statement.query.includes('user_id > 101') ? [] : [{ user_id: 101 }],
  });
  const query = data => ({
    id: 'broadcast-report-retry-' + data,
    from: { id: developerId },
    data,
    message: { chat: { id: developerId, type: 'private' }, message_id: 50 },
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast'));
  await h.developer.handleDeveloperPendingMessage({
    from: { id: developerId },
    chat: { id: developerId, type: 'private' },
    message_id: 60,
    text: 'Report retry announcement',
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast:confirm'));

  h.apiState.copyMessageErrors = {
    101: new h.BotApiError(403, 'Forbidden: bot was blocked by the user'),
  };
  h.apiState.documentSendErrors = [new Error('temporary document upload failure')];
  const minute = Math.floor(Date.now() / 60000) + 1;
  await h.developer.runDeveloperBroadcastTick(minute);
  await h.developer.runDeveloperBroadcastTick(minute + 1);

  const active = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:active');
  const jobRecord = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:job:' + active.payload.jobId);
  assert.equal(active.payload.status, 'report_pending');
  assert.equal(jobRecord.payload.reportAttempts, 1);
  assert.ok(jobRecord.payload.reportRetryAt > Math.floor(Date.now() / 1000));
  assert.equal(h.loggedErrors.at(-1).scope, 'developer.broadcast.report');

  jobRecord.payload.reportRetryAt = 0;
  await h.developer.runDeveloperBroadcastTick(minute + 2);
  assert.equal(active.payload.status, 'done');
  assert.equal(jobRecord.payload.status, 'done');
  assert.equal(h.calls.filter(call => call.method === 'sendDocument').length, 2);
});

test('cancelling a developer broadcast sends a private final summary', async () => {
  const h = await developerHarness({
    queryHandler: statement => statement.query.includes('MAX(audience.user_id)')
      ? [{ total: 1, max_user_id: 101, private_users: 0 }]
      : [{ user_id: 101 }],
  });
  const query = data => ({
    id: 'broadcast-cancel-' + data,
    from: { id: developerId },
    data,
    message: { chat: { id: developerId, type: 'private' }, message_id: 50 },
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast'));
  await h.developer.handleDeveloperPendingMessage({
    from: { id: developerId },
    chat: { id: developerId, type: 'private' },
    message_id: 60,
    text: 'Cancelled announcement',
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast:confirm'));

  const active = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:active');
  await h.developer.handleDeveloperCallback(
    query('dev:broadcast:cancel:' + active.payload.jobId),
  );

  const jobRecord = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:job:' + active.payload.jobId);
  assert.equal(active.payload.status, 'done');
  assert.equal(jobRecord.payload.finalStatus, 'cancelled');
  const report = h.calls.find(call => call.method === 'sendMessage'
    && call.args.text?.includes('حالة الإذاعة: أوقفت'));
  assert.ok(report);
  assert.equal(report.args.chat_id, developerId);
});

test('developer broadcasts accept forwarded Rich Messages from users, bots, and channels', async () => {
  const origins = [
    { type: 'user', sender_user: { id: 7001, is_bot: false } },
    { type: 'user', sender_user: { id: 7002, is_bot: true } },
    { type: 'channel', chat: { id: -1007003, type: 'channel', title: 'News' }, message_id: 8 },
  ];

  for (const [index, forward_origin] of origins.entries()) {
    const h = await developerHarness({
      queryHandler: statement => statement.query.includes('MAX(audience.user_id)')
        ? [{ total: 1, max_user_id: 101, private_users: 1 }]
        : [],
    });
    const query = data => ({
      id: 'forwarded-broadcast-' + index + '-' + data,
      from: { id: developerId },
      data,
      message: { chat: { id: developerId, type: 'private' }, message_id: 50 },
    });
    await h.developer.handleDeveloperCallback(query('dev:broadcast'));
    await h.developer.handleDeveloperPendingMessage({
      from: { id: developerId },
      chat: { id: developerId, type: 'private' },
      message_id: 60 + index,
      forward_origin,
      rich_message: { blocks: [{ type: 'paragraph', text: { type: 'bold', text: 'Formatted post' } }] },
    });

    const state = h.records.developerStates.find(row => row.userId === developerId);
    assert.equal(state.state, 'confirm_broadcast');
    assert.equal(state.summary.sourceChatId, developerId);
    assert.equal(state.summary.sourceMessageId, 60 + index);
    assert.ok(h.calls.some(call => call.method === 'copyMessage'
      && call.args.from_chat_id === developerId
      && call.args.message_id === 60 + index));
    assert.equal(h.loggedErrors.length, 0);
  }
});

test('broadcast source copy failures are sent to the configured error logger without message content', async () => {
  const h = await developerHarness();
  const query = data => ({
    id: 'source-error-' + data,
    from: { id: developerId },
    data,
    message: { chat: { id: developerId, type: 'private' }, message_id: 50 },
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast'));
  h.apiState.copyMessageErrors = {
    [String(developerId)]: new h.BotApiError(400, 'message cannot be copied'),
  };
  await h.developer.handleDeveloperPendingMessage({
    from: { id: developerId },
    chat: { id: developerId, type: 'private' },
    message_id: 71,
    text: 'PRIVATE BROADCAST CONTENT',
    forward_origin: { type: 'channel', chat: { id: -1001, type: 'channel' }, message_id: 99 },
  });

  assert.equal(h.loggedErrors.length, 1);
  assert.equal(h.loggedErrors[0].scope, 'developer.broadcast.source');
  assert.equal(h.loggedErrors[0].context.userId, developerId);
  assert.equal(JSON.stringify(h.loggedErrors).includes('PRIVATE BROADCAST CONTENT'), false);
});

test('developer broadcasts retry Telegram rate limits without advancing the audience cursor', async () => {
  const h = await developerHarness({
    queryHandler: statement => statement.query.includes('MAX(audience.user_id)')
      ? [{ total: 1, max_user_id: 101, private_users: 1 }]
      : statement.query.includes('user_id > 101') ? [] : [{ user_id: 101 }],
  });
  const query = data => ({
    id: 'broadcast-' + data,
    from: { id: developerId },
    data,
    message: { chat: { id: developerId, type: 'private' }, message_id: 50 },
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast'));
  await h.developer.handleDeveloperPendingMessage({
    from: { id: developerId },
    chat: { id: developerId, type: 'private' },
    message_id: 60,
    text: 'Rate-limited announcement',
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast:confirm'));

  const active = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:active');
  const jobRecord = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:job:' + active.payload.jobId);
  h.apiState.copyMessageErrors = {
    101: [Object.assign(new h.BotApiError(429, 'Too Many Requests'), {
      parameters: { retry_after: 30 },
    })],
  };
  const minute = Math.floor(Date.now() / 60000) + 1;
  await h.developer.runDeveloperBroadcastTick(minute);
  assert.equal(jobRecord.payload.cursor, 0);
  assert.equal(jobRecord.payload.inFlightUserId, null);
  assert.equal(jobRecord.payload.rateLimited, 1);
  assert.ok(jobRecord.payload.retryAt > Math.floor(Date.now() / 1000));

  await h.developer.runDeveloperBroadcastTick(minute + 1);
  assert.equal(h.calls.filter(call => call.method === 'copyMessage'
    && call.args.chat_id === 101).length, 1);

  jobRecord.payload.retryAt = 0;
  await h.developer.runDeveloperBroadcastTick(minute + 2);
  assert.equal(jobRecord.payload.sent, 1);
  assert.equal(jobRecord.payload.cursor, 101);
  assert.equal(h.calls.filter(call => call.method === 'copyMessage'
    && call.args.chat_id === 101).length, 2);
});

test('developer broadcasts report ambiguous delivery instead of retrying blindly', async () => {
  const h = await developerHarness({
    queryHandler: statement => statement.query.includes('MAX(audience.user_id)')
      ? [{ total: 1, max_user_id: 101, private_users: 1 }]
      : statement.query.includes('user_id > 101') ? [] : [{ user_id: 101 }],
  });
  const query = data => ({
    id: 'broadcast-' + data,
    from: { id: developerId },
    data,
    message: { chat: { id: developerId, type: 'private' }, message_id: 50 },
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast'));
  await h.developer.handleDeveloperPendingMessage({
    from: { id: developerId },
    chat: { id: developerId, type: 'private' },
    message_id: 60,
    text: 'Ambiguous announcement',
  });
  await h.developer.handleDeveloperCallback(query('dev:broadcast:confirm'));

  const active = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:active');
  const jobRecord = h.records.legacyStates.find(row =>
    row.namespace === 'developer_broadcast:v1:job:' + active.payload.jobId);
  h.apiState.copyMessageErrors = { 101: new Error('socket reset after request') };
  const minute = Math.floor(Date.now() / 60000) + 1;
  await h.developer.runDeveloperBroadcastTick(minute);
  assert.equal(jobRecord.payload.inFlightUserId, 101);

  jobRecord.payload.retryAt = 0;
  await h.developer.runDeveloperBroadcastTick(minute + 1);
  assert.equal(jobRecord.payload.status, 'done');
  assert.equal(jobRecord.payload.uncertain, 1);
  assert.equal(jobRecord.payload.sent, 0);
  assert.equal(h.calls.filter(call => call.method === 'copyMessage'
    && call.args.chat_id === 101).length, 1);
  const report = h.calls.find(call => call.method === 'sendDocument');
  const content = new TextDecoder().decode(new Uint8Array(Object.values(report.args.document.data)));
  assert.match(content, /101\tمستخدم\tنتيجة غير مؤكدة\tخطأ اتصال؛ نتيجة الإرسال غير محسومة\t0\t/);
  assert.match(content, /لا في هذه الحملة؛ قد تُعاد لاحقاً مع احتمال التكرار/);
  assert.equal(h.loggedErrors[0].scope, 'developer.broadcast.delivery');
  assert.equal(h.loggedErrors[0].context.userId, 101);
});
