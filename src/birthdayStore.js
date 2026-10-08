const db = require("./db");

const upsertBirthdayChannelStmt = db.prepare(`
  INSERT INTO birthday_settings (guild_id, channel_id)
  VALUES (?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET
    channel_id = excluded.channel_id
`);

const getBirthdayChannelStmt = db.prepare(`
  SELECT channel_id FROM birthday_settings WHERE guild_id = ?
`);

const removeBirthdayChannelStmt = db.prepare(`
  DELETE FROM birthday_settings WHERE guild_id = ?
`);

const upsertBirthdayStmt = db.prepare(`
  INSERT INTO birthdays (guild_id, user_id, month, day)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id) DO UPDATE SET
    month = excluded.month,
    day = excluded.day
`);

const removeBirthdayStmt = db.prepare(`
  DELETE FROM birthdays WHERE guild_id = ? AND user_id = ?
`);

const listBirthdaysStmt = db.prepare(`
  SELECT user_id, month, day
  FROM birthdays
  WHERE guild_id = ?
  ORDER BY month ASC, day ASC, user_id ASC
`);

const listDueBirthdaysWithChannelStmt = db.prepare(`
  SELECT b.guild_id, b.user_id, s.channel_id
  FROM birthdays b
  INNER JOIN birthday_settings s ON s.guild_id = b.guild_id
  WHERE b.month = ? AND b.day = ?
  ORDER BY s.channel_id ASC, b.user_id ASC
`);

const hasAnnouncementStmt = db.prepare(`
  SELECT 1
  FROM birthday_announcements
  WHERE guild_id = ? AND user_id = ? AND announced_date = ?
`);

const markAnnouncementStmt = db.prepare(`
  INSERT OR IGNORE INTO birthday_announcements (guild_id, user_id, announced_date)
  VALUES (?, ?, ?)
`);

function setBirthdayChannel(guildId, channelId) {
  upsertBirthdayChannelStmt.run(guildId, channelId);
}

function getBirthdayChannel(guildId) {
  const row = getBirthdayChannelStmt.get(guildId);
  return row ? row.channel_id : null;
}

function removeBirthdayChannel(guildId) {
  const result = removeBirthdayChannelStmt.run(guildId);
  return result.changes > 0;
}

function upsertBirthday(guildId, userId, month, day) {
  upsertBirthdayStmt.run(guildId, userId, month, day);
}

function removeBirthday(guildId, userId) {
  const result = removeBirthdayStmt.run(guildId, userId);
  return result.changes > 0;
}

function listBirthdays(guildId) {
  return listBirthdaysStmt.all(guildId);
}

function listDueBirthdaysWithChannel(month, day) {
  return listDueBirthdaysWithChannelStmt.all(month, day);
}

function hasBirthdayAnnouncement(guildId, userId, dateYmd) {
  return !!hasAnnouncementStmt.get(guildId, userId, dateYmd);
}

function markBirthdayAnnouncement(guildId, userId, dateYmd) {
  markAnnouncementStmt.run(guildId, userId, dateYmd);
}

module.exports = {
  setBirthdayChannel,
  getBirthdayChannel,
  removeBirthdayChannel,
  upsertBirthday,
  removeBirthday,
  listBirthdays,
  listDueBirthdaysWithChannel,
  hasBirthdayAnnouncement,
  markBirthdayAnnouncement,
};
