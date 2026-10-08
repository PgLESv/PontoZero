const db = require("./db");

const addChannelStmt = db.prepare(`
  INSERT OR IGNORE INTO monitored_channels (guild_id, channel_id)
  VALUES (?, ?)
`);

const removeChannelStmt = db.prepare(`
  DELETE FROM monitored_channels
  WHERE guild_id = ? AND channel_id = ?
`);

const listChannelsStmt = db.prepare(`
  SELECT channel_id FROM monitored_channels
  WHERE guild_id = ?
  ORDER BY created_at ASC
`);

const hasChannelStmt = db.prepare(`
  SELECT 1 FROM monitored_channels
  WHERE guild_id = ? AND channel_id = ?
`);

function addMonitoredChannel(guildId, channelId) {
  const result = addChannelStmt.run(guildId, channelId);
  return result.changes > 0;
}

function removeMonitoredChannel(guildId, channelId) {
  const result = removeChannelStmt.run(guildId, channelId);
  return result.changes > 0;
}

function listMonitoredChannels(guildId) {
  return listChannelsStmt.all(guildId).map((row) => row.channel_id);
}

function isMonitoredChannel(guildId, channelId) {
  return !!hasChannelStmt.get(guildId, channelId);
}

module.exports = {
  addMonitoredChannel,
  removeMonitoredChannel,
  listMonitoredChannels,
  isMonitoredChannel,
};
