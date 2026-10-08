const db = require("./db");

// ─────────────────────────────────────────────
// Canal de anúncio por guild
// ─────────────────────────────────────────────

/**
 * Define o canal de anúncio de ausência em call para uma guild.
 * @param {string} guildId
 * @param {string} channelId
 */
function setVoiceAbsenceChannel(guildId, channelId) {
  db.prepare(`
    INSERT INTO voice_absence_settings (guild_id, channel_id)
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id
  `).run(guildId, channelId);
}

/**
 * Retorna a configuração de canal de uma guild, ou null se não existir.
 * @param {string} guildId
 * @returns {{ guild_id: string, channel_id: string } | null}
 */
function getVoiceAbsenceChannel(guildId) {
  return (
    db
      .prepare("SELECT * FROM voice_absence_settings WHERE guild_id = ?")
      .get(guildId) ?? null
  );
}

/**
 * Remove a configuração de canal de anúncio de uma guild.
 * @param {string} guildId
 */
function removeVoiceAbsenceChannel(guildId) {
  db.prepare("DELETE FROM voice_absence_settings WHERE guild_id = ?").run(guildId);
}

// ─────────────────────────────────────────────
// Usuários rastreados
// ─────────────────────────────────────────────

/**
 * Adiciona um usuário ao rastreamento de ausência em call.
 * Inicializa o estado com last_call_at = agora (início do rastreamento).
 * @param {string} guildId
 * @param {string} userId
 * @param {string} [displayName] - Nome de exibição para logs
 */
function addTrackedUser(guildId, userId, displayName = null) {
  const nowMs = Date.now();

  db.prepare(`
    INSERT INTO voice_absence_tracked_users (guild_id, user_id, display_name)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      display_name = COALESCE(excluded.display_name, display_name)
  `).run(guildId, userId, displayName);

  // Só inicializa o estado se ainda não existir (preserva contador se re-adicionado)
  db.prepare(`
    INSERT OR IGNORE INTO voice_absence_state (guild_id, user_id, last_call_at_ms)
    VALUES (?, ?, ?)
  `).run(guildId, userId, nowMs);
}

/**
 * Remove um usuário do rastreamento de ausência em call.
 * @param {string} guildId
 * @param {string} userId
 */
function removeTrackedUser(guildId, userId) {
  db.prepare(
    "DELETE FROM voice_absence_tracked_users WHERE guild_id = ? AND user_id = ?"
  ).run(guildId, userId);
  db.prepare(
    "DELETE FROM voice_absence_state WHERE guild_id = ? AND user_id = ?"
  ).run(guildId, userId);
}

/**
 * Retorna true se o usuário está rastreado nessa guild.
 * @param {string} guildId
 * @param {string} userId
 * @returns {boolean}
 */
function isTrackedUser(guildId, userId) {
  const row = db
    .prepare(
      "SELECT 1 FROM voice_absence_tracked_users WHERE guild_id = ? AND user_id = ?"
    )
    .get(guildId, userId);
  return row != null;
}

/**
 * Lista todos os usuários rastreados de uma guild, com o estado atual.
 * @param {string} guildId
 * @returns {Array<{ user_id: string, display_name: string|null, last_call_at_ms: number }>}
 */
function listTrackedUsers(guildId) {
  return db
    .prepare(`
      SELECT t.user_id, t.display_name, COALESCE(s.last_call_at_ms, 0) AS last_call_at_ms
      FROM voice_absence_tracked_users t
      LEFT JOIN voice_absence_state s ON s.guild_id = t.guild_id AND s.user_id = t.user_id
      WHERE t.guild_id = ?
      ORDER BY s.last_call_at_ms ASC
    `)
    .all(guildId);
}

// ─────────────────────────────────────────────
// Estado: último momento em call
// ─────────────────────────────────────────────

/**
 * Retorna o timestamp (ms) da última vez que o usuário esteve em call.
 * @param {string} guildId
 * @param {string} userId
 * @returns {number|null}
 */
function getLastCallAt(guildId, userId) {
  const row = db
    .prepare(
      "SELECT last_call_at_ms FROM voice_absence_state WHERE guild_id = ? AND user_id = ?"
    )
    .get(guildId, userId);
  return row ? row.last_call_at_ms : null;
}

/**
 * Atualiza o timestamp do último momento em call para agora.
 * @param {string} guildId
 * @param {string} userId
 * @param {number} [nowMs]
 */
function updateLastCallAt(guildId, userId, nowMs = Date.now()) {
  db.prepare(`
    INSERT INTO voice_absence_state (guild_id, user_id, last_call_at_ms)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET last_call_at_ms = excluded.last_call_at_ms
  `).run(guildId, userId, nowMs);
}

module.exports = {
  setVoiceAbsenceChannel,
  getVoiceAbsenceChannel,
  removeVoiceAbsenceChannel,
  addTrackedUser,
  removeTrackedUser,
  isTrackedUser,
  listTrackedUsers,
  getLastCallAt,
  updateLastCallAt,
};
