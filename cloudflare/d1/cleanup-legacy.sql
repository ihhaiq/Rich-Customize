-- Optional one-time cleanup for a D1 database that previously used the
-- deprecated external Mini App storage model.
--
-- Run this only after Telegram Serverless rich_pages / managed_chats have been
-- verified as the authoritative data and the B2B cutover is active.
--
-- The active Cloudflare schema is cloudflare/d1/schema.sql.

DROP TABLE IF EXISTS rich_pages;
DROP TABLE IF EXISTS managed_chats;
DROP TABLE IF EXISTS popup_states;
DROP TABLE IF EXISTS miniapp_user_pickers;
DROP TABLE IF EXISTS miniapp_meta;
