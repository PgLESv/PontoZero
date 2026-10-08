const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, "..", "data", "bot.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS monitored_channels (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS work_query_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_queries INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS work_exceptions (
    date TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('folga', 'ferias')),
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS work_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    anchor_date TEXT
  );

  CREATE TABLE IF NOT EXISTS birthday_settings (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS birthdays (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS birthday_announcements (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    announced_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, user_id, announced_date)
  );

  CREATE TABLE IF NOT EXISTS ip_watch_settings (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ip_watch_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_ipv4 TEXT,
    last_checked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS epic_free_settings (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS epic_free_seen_games (
    game_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    game_url TEXT,
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS disk_space_settings (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS disk_space_messages (
    guild_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    last_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS voice_absence_settings (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS voice_absence_tracked_users (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS voice_absence_state (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    last_call_at_ms INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
`);

db.exec(`
  INSERT OR IGNORE INTO work_query_stats (id, total_queries)
  VALUES (1, 0);

  INSERT OR IGNORE INTO work_settings (id, anchor_date)
  VALUES (1, NULL);

  INSERT OR IGNORE INTO ip_watch_state (id, last_ipv4, last_checked_at)
  VALUES (1, NULL, NULL);
`);

module.exports = db;
