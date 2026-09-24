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
  blockScrollEnabled: integer('block_scroll_enabled').notNull().default(1),
  currentButtonId: text('current_button_id'),
  pendingButtonAction: text('pending_button_action'),
  pendingButtonText: text('pending_button_text'),
  pendingButtonType: text('pending_button_type'),
  pendingChildType: text('pending_child_type'),
  nestedDetailsId: text('nested_details_id'),
  nestedChildId: text('nested_child_id'),
  nestedAction: text('nested_action'),
  pagesSearchQuery: text('pages_search_query').notNull().default(''),
  pagesSortMode: text('pages_sort_mode').notNull().default('updated'),
  renamePageId: text('rename_page_id'),
  pagesPageIndex: integer('pages_page_index').notNull().default(0),
  deletedPageId: text('deleted_page_id'),
  deletedPageSnapshot: json('deleted_page_snapshot'),
  deletedPageIndex: integer('deleted_page_index'),
  deletedPageWasCurrent: integer('deleted_page_was_current'),
  undoStack: json('undo_stack').notNull().default([]),
  redoStack: json('redo_stack').notNull().default([]),
  previewMessageIds: json('preview_message_ids').notNull().default([]),
  blockPreviewMessageIds: json('block_preview_message_ids').notNull().default({}),
  pendingUserState: json('pending_user_state'),
  resumingUserButtons: integer('resuming_user_buttons').notNull().default(0),
  buttonPreviewMessageId: integer('button_preview_message_id'),
  postSelectedChatIds: json('post_selected_chat_ids').notNull().default([]),
  postSilent: integer('post_silent').notNull().default(0),
  postProtected: integer('post_protected').notNull().default(0),
  lastActivityAt: integer('last_activity_at').notNull(),
}, (t) => ({
  activityIdx: index('idx_editor_sessions_activity').on(t.lastActivityAt),
}));


export const pageNavigationSessions = table('page_navigation_sessions', {
  token: text('token').primaryKey(),
  userId: integer('user_id').notNull(),
  stack: json('stack').notNull().default([]),
  previousStack: json('previous_stack'),
  externalRoot: integer('external_root').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  userUpdatedIdx: index('idx_page_navigation_user_updated').on(t.userId, t.updatedAt),
}));

export const popupStates = table('popup_states', {
  token: text('token').primaryKey(),
  text: text('text').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  updatedIdx: index('idx_popup_states_updated').on(t.updatedAt),
}));


export const processedUpdates = table('processed_updates', {
  updateId: integer('update_id').primaryKey(),
  expiresAt: integer('expires_at').notNull(),
}, (t) => ({
  expiresIdx: index('idx_processed_updates_expires').on(t.expiresAt),
}));

export const requestWindows = table('request_windows', {
  key: text('key').primaryKey(),
  timestamps: json('timestamps').notNull().default([]),
  version: integer('version').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
}, (t) => ({
  expiresIdx: index('idx_request_windows_expires').on(t.expiresAt),
}));


export const guestMessages = table('guest_messages', {
  inlineMessageId: text('inline_message_id').primaryKey(),
  chatId: integer('chat_id').notNull(),
  chatType: text('chat_type').notNull().default(''),
  createdAt: integer('created_at').notNull(),
});


export const editorAlbumItems = table('editor_album_items', {
  key: text('key').primaryKey(),
  userId: integer('user_id').notNull(),
  mediaGroupId: text('media_group_id').notNull(),
  messageId: integer('message_id').notNull(),
  blocks: json('blocks').notNull().default([]),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  userGroupIdx: index('idx_editor_album_user_group').on(t.userId, t.mediaGroupId),
  createdIdx: index('idx_editor_album_created').on(t.createdAt),
}));


export const managedChats = table('managed_chats', {
  key: text('key').primaryKey(),
  userId: integer('user_id').notNull(),
  chatId: integer('chat_id').notNull(),
  title: text('title').notNull(),
  type: text('type').notNull().default(''),
  username: text('username'),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  userIdx: index('idx_managed_chats_user').on(t.userId),
  chatIdx: index('idx_managed_chats_chat').on(t.chatId),
}));

export const managedPublishPanels = table('managed_publish_panels', {
  userId: integer('user_id').primaryKey(),
  chatId: integer('chat_id').notNull(),
  messageId: integer('message_id').notNull(),
  selectedChatIds: json('selected_chat_ids').notNull().default([]),
  updatedAt: integer('updated_at').notNull(),
});
