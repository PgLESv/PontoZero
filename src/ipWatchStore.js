const db = require("./db");

const upsertIpWatchChannelStmt = db.prepare(`
  INSERT INTO ip_watch_settings (guild_id, channel_id)
  VALUES (?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET
    channel_id = excluded.channel_id
`);

const getIpWatchChannelStmt = db.prepare(`
  SELECT channel_id FROM ip_watch_settings WHERE guild_id = ?
`);

const removeIpWatchChannelStmt = db.prepare(`
  DELETE FROM ip_watch_settings WHERE guild_id = ?
`);

const listIpWatchChannelsStmt = db.prepare(`
  SELECT guild_id, channel_id FROM ip_watch_settings
`);

const getLastIpv4StateStmt = db.prepare(`
  SELECT last_ipv4, last_checked_at FROM ip_watch_state WHERE id = 1
`);

const updateIpv4StateStmt = db.prepare(`
  UPDATE ip_watch_state
  SET last_ipv4 = ?, last_checked_at = CURRENT_TIMESTAMP
  WHERE id = 1
`);

const touchIpv4StateStmt = db.prepare(`
  UPDATE ip_watch_state
  SET last_checked_at = CURRENT_TIMESTAMP
  WHERE id = 1
`);

function setIpWatchChannel(guildId, channelId) {
  upsertIpWatchChannelStmt.run(guildId, channelId);
}

function getIpWatchChannel(guildId) {
  const row = getIpWatchChannelStmt.get(guildId);
  return row ? row.channel_id : null;
}

function removeIpWatchChannel(guildId) {
  const result = removeIpWatchChannelStmt.run(guildId);
  return result.changes > 0;
}

function listIpWatchChannels() {
  return listIpWatchChannelsStmt.all();
}

function getLastIpv4State() {
  return getLastIpv4StateStmt.get();
}

function updateIpv4State(ipv4) {
  updateIpv4StateStmt.run(ipv4);
}

function touchIpv4State() {
  touchIpv4StateStmt.run();
}

module.exports = {
  setIpWatchChannel,
  getIpWatchChannel,
  removeIpWatchChannel,
  listIpWatchChannels,
  getLastIpv4State,
  updateIpv4State,
  touchIpv4State,
};
