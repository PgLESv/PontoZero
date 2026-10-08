const db = require("./db");

const upsertEpicFreeChannelStmt = db.prepare(`
  INSERT INTO epic_free_settings (guild_id, channel_id)
  VALUES (?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET
    channel_id = excluded.channel_id
`);

const getEpicFreeChannelStmt = db.prepare(`
  SELECT channel_id FROM epic_free_settings WHERE guild_id = ?
`);

const removeEpicFreeChannelStmt = db.prepare(`
  DELETE FROM epic_free_settings WHERE guild_id = ?
`);

const listEpicFreeChannelsStmt = db.prepare(`
  SELECT guild_id, channel_id FROM epic_free_settings
`);

const hasSeenEpicGameStmt = db.prepare(`
  SELECT 1 FROM epic_free_seen_games WHERE game_id = ?
`);

const upsertSeenEpicGameStmt = db.prepare(`
  INSERT INTO epic_free_seen_games (game_id, title, game_url)
  VALUES (?, ?, ?)
  ON CONFLICT(game_id) DO UPDATE SET
    title = excluded.title,
    game_url = excluded.game_url,
    last_seen_at = CURRENT_TIMESTAMP
`);

const listSeenEpicGamesStmt = db.prepare(`
  SELECT game_id, title, game_url, first_seen_at, last_seen_at
  FROM epic_free_seen_games
  ORDER BY last_seen_at DESC
  LIMIT ?
`);

function setEpicFreeChannel(guildId, channelId) {
  upsertEpicFreeChannelStmt.run(guildId, channelId);
}

function getEpicFreeChannel(guildId) {
  const row = getEpicFreeChannelStmt.get(guildId);
  return row ? row.channel_id : null;
}

function removeEpicFreeChannel(guildId) {
  const result = removeEpicFreeChannelStmt.run(guildId);
  return result.changes > 0;
}

function listEpicFreeChannels() {
  return listEpicFreeChannelsStmt.all();
}

function hasSeenEpicGame(gameId) {
  return !!hasSeenEpicGameStmt.get(gameId);
}

function upsertSeenEpicGame(gameId, title, gameUrl) {
  upsertSeenEpicGameStmt.run(gameId, title, gameUrl || null);
}

function listSeenEpicGames(limit = 5) {
  return listSeenEpicGamesStmt.all(limit);
}

module.exports = {
  setEpicFreeChannel,
  getEpicFreeChannel,
  removeEpicFreeChannel,
  listEpicFreeChannels,
  hasSeenEpicGame,
  upsertSeenEpicGame,
  listSeenEpicGames,
};
