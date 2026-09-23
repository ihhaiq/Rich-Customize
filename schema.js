import { table, integer, text, json, index, uniqueIndex, check, sql } from 'sdk/db';

// Serverless port of the existing PostgreSQL storage contract.
// No foreign keys: tgcloud deliberately runs SQLite without FK enforcement.

export const richState = table('rich_state', {
  namespace: text('namespace').primaryKey(),
  payload: json('payload').notNull().default({}),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
});

export const richFsm = table('rich_fsm', {
  storageKey: text('storage_key').primaryKey(),
  state: text('state'),
  data: json('data').notNull().default({}),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  updatedIdx: index('idx_rich_fsm_updated').on(t.updatedAt),
}));

export const richMigrations = table('rich_migrations', {
  name: text('name').primaryKey(),
  completedAt: integer('completed_at').notNull().default(sql`(unixepoch())`),
});

export const richPages = table('rich_pages', {
  pageId: text('page_id').primaryKey(),
  ownerId: integer('owner_id').notNull(),
  title: text('title').notNull(),
  blocks: json('blocks').notNull().default([]),
  buttons: json('buttons').notNull().default([]),
  buttonsPerRow: integer('buttons_per_row').notNull().default(1),
  buttonsAlign: text('buttons_align').notNull().default('center'),
  quotaSlot: integer('quota_slot'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  ownerUpdatedIdx: index('idx_rich_pages_owner_updated').on(t.ownerId, t.updatedAt),
  ownerCreatedIdx: index('idx_rich_pages_owner_created').on(t.ownerId, t.createdAt),
  ownerTitleIdx: index('idx_rich_pages_owner_title').on(t.ownerId, sql`lower(${t.title})`),
  ownerQuotaSlot: uniqueIndex('uq_rich_pages_owner_quota_slot').on(t.ownerId, t.quotaSlot),
  quotaSlotRange: check('chk_rich_pages_quota_slot', sql`${t.quotaSlot} IS NULL OR (${t.quotaSlot} >= 1 AND ${t.quotaSlot} <= 12)`),
}));

export const botSettings = table('bot_settings', {
  key: text('key').primaryKey(),
  value: json('value').notNull(),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
});

export const requestClaims = table('request_claims', {
  key: text('key').primaryKey(),
  expiresAt: integer('expires_at').notNull(),
}, (t) => ({
  expiresIdx: index('idx_request_claims_expires').on(t.expiresAt),
}));

export const rateLimitEvents = table('rate_limit_events', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),
  userId: integer('user_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  windowIdx: index('idx_rate_limit_events_window').on(t.scope, t.userId, t.createdAt),
}));
