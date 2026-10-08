const db = require("./db");

const upsertDiskSpaceChannelStmt = db.prepare(`
  INSERT INTO disk_space_settings (guild_id, channel_id)
  VALUES (?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET
    channel_id = excluded.channel_id
`);

const getDiskSpaceChannelStmt = db.prepare(`
  SELECT channel_id FROM disk_space_settings WHERE guild_id = ?
`);

const removeDiskSpaceChannelStmt = db.prepare(`
  DELETE FROM disk_space_settings WHERE guild_id = ?
`);

const listDiskSpaceChannelsStmt = db.prepare(`
  SELECT guild_id, channel_id FROM disk_space_settings
`);

const upsertDiskSpaceMessageStmt = db.prepare(`
  INSERT INTO disk_space_messages (guild_id, message_id)
  VALUES (?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET
    message_id = excluded.message_id,
    last_updated_at = CURRENT_TIMESTAMP
`);

const getDiskSpaceMessageStmt = db.prepare(`
  SELECT message_id FROM disk_space_messages WHERE guild_id = ?
`);

const removeDiskSpaceMessageStmt = db.prepare(`
  DELETE FROM disk_space_messages WHERE guild_id = ?
`);

function setDiskSpaceChannel(guildId, channelId) {
  upsertDiskSpaceChannelStmt.run(guildId, channelId);
}

function getDiskSpaceChannel(guildId) {
  const row = getDiskSpaceChannelStmt.get(guildId);
  return row ? row.channel_id : null;
}

function removeDiskSpaceChannel(guildId) {
  const result = removeDiskSpaceChannelStmt.run(guildId);
  return result.changes > 0;
}

function listDiskSpaceChannels() {
  return listDiskSpaceChannelsStmt.all();
}

function setDiskSpaceMessage(guildId, messageId) {
  upsertDiskSpaceMessageStmt.run(guildId, messageId);
}

function getDiskSpaceMessage(guildId) {
  const row = getDiskSpaceMessageStmt.get(guildId);
  return row ? row.message_id : null;
}

function removeDiskSpaceMessage(guildId) {
  const result = removeDiskSpaceMessageStmt.run(guildId);
  return result.changes > 0;
}

module.exports = {
  setDiskSpaceChannel,
  getDiskSpaceChannel,
  removeDiskSpaceChannel,
  listDiskSpaceChannels,
  setDiskSpaceMessage,
  getDiskSpaceMessage,
  removeDiskSpaceMessage,
};
