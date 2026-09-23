import { index, integer, json, real, table, text } from 'sdk/db';

export const richPages = table('rich_pages', {
  pageId: text('page_id').primaryKey(),
  ownerId: integer('owner_id').notNull(),
  title: text('title').notNull(),
  blocks: json('blocks').notNull().default([]),
  buttons: json('buttons').notNull().default([]),
  buttonsPerRow: integer('buttons_per_row').notNull().default(1),
  buttonsAlign: text('buttons_align').notNull().default('center'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  ownerUpdatedIdx: index('idx_rich_pages_owner_updated').on(t.ownerId, t.updatedAt),
}));

export const developerStates = table('developer_states', {
  userId: integer('user_id').primaryKey(),
  state: text('state').notNull(),
  fileId: text('file_id'),
  fileName: text('file_name'),
  createdAt: integer('created_at').notNull(),
  summary: json('summary'),
});

export const legacyStates = table('legacy_states', {
  namespace: text('namespace').primaryKey(),
  payload: json('payload').notNull().default({}),
  updatedAt: integer('updated_at').notNull(),
});

export const usageUsers = table('usage_users', {
  userId: integer('user_id').primaryKey(),
  username: text('username'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  languageCode: text('language_code'),
  firstSeen: integer('first_seen').notNull(),
  lastSeen: integer('last_seen').notNull(),
  events: integer('events').notNull().default(0),
}, (t) => ({
  recentIdx: index('idx_usage_users_recent').on(t.lastSeen),
}));

export const usageMinutes = table('usage_minutes', {
  minute: integer('minute').primaryKey(),
  updates: integer('updates').notNull().default(0),
  failures: integer('failures').notNull().default(0),
  durationMs: real('duration_ms').notNull().default(0),
});

export const usageRuntime = table('usage_runtime', {
  id: integer('id').primaryKey(),
  startedAt: integer('started_at').notNull(),
  totalUpdates: integer('total_updates').notNull().default(0),
  failedUpdates: integer('failed_updates').notNull().default(0),
  handlerMsTotal: real('handler_ms_total').notNull().default(0),
  handlerMsMax: real('handler_ms_max').notNull().default(0),
  previewSuccess: integer('preview_success').notNull().default(0),
  previewFailed: integer('preview_failed').notNull().default(0),
  publishSuccess: integer('publish_success').notNull().default(0),
  publishFailed: integer('publish_failed').notNull().default(0),
  rateLimited: integer('rate_limited').notNull().default(0),
});

export const pageSnapshots = table('page_snapshots', {
  snapshotId: text('snapshot_id').primaryKey(),
  payload: json('payload').notNull().default({}),
  createdAt: integer('created_at').notNull(),
  pageCount: integer('page_count').notNull().default(0),
});

export const maintenanceLocks = table('maintenance_locks', {
  name: text('name').primaryKey(),
  expiresAt: integer('expires_at').notNull(),
});


export const editorSessions = table('editor_sessions', {
  userId: integer('user_id').primaryKey(),
  chatId: integer('chat_id').notNull(),
  state: text('state').notNull().default('managing'),
  blocks: json('blocks').notNull().default([]),
  messageButtons: json('message_buttons').notNull().default([]),
  buttonsPerRow: integer('buttons_per_row').notNull().default(1),
  buttonsAlign: text('buttons_align').notNull().default('center'),
  currentPageId: text('current_page_id'),
  currentPageTitle: text('current_page_title'),
  currentBlockId: text('current_block_id'),
  pendingAddType: text('pending_add_type'),
  addStep: text('add_step'),
  addPayload: json('add_payload').notNull().default({}),
  expectedType: text('expected_type'),
  editField: text('edit_field'),
  headingSize: integer('heading_size'),
  addPromptChatId: integer('add_prompt_chat_id'),
  addPromptMessageId: integer('add_prompt_message_id'),
  managementChatId: integer('management_chat_id'),
  managementMessageId: integer('management_message_id'),
  blockScrollOffset: integer('block_scroll_offset').notNull().default(0),
  undoStack: json('undo_stack').notNull().default([]),
  redoStack: json('redo_stack').notNull().default([]),
  lastActivityAt: integer('last_activity_at').notNull(),
}, (t) => ({
  activityIdx: index('idx_editor_sessions_activity').on(t.lastActivityAt),
}));
