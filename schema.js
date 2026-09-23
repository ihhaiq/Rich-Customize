import { index, integer, json, table, text } from 'sdk/db';

// Saved pages keep the same logical shape as the old PostgreSQL/JSON storage so
// existing page IDs and exported backups can be imported without rewriting data.
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
