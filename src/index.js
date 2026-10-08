require("dotenv").config();

const { exec } = require("child_process");
const { promisify } = require("util");
const {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
} = require("discord.js");
const {
  addMonitoredChannel,
  removeMonitoredChannel,
  listMonitoredChannels,
  isMonitoredChannel,
} = require("./configStore");
const {
  incrementAndGetQueryCount,
  getQueryCount,
  setQueryCount,
  upsertWorkException,
  upsertWorkExceptionRange,
  removeWorkException,
  removeWorkExceptionRange,
  getWorkException,
  listWorkExceptionsByType,
  getWorkAnchorDate,
  setWorkAnchorDate,
  resetWorkAnchorDate,
} = require("./trabalhoStore");
const {
  parseDateInput,
  formatDateToBr,
  formatDateToYmd,
  parseYmdToDate,
  worksByPattern,
  listDatesInRange,
} = require("./workSchedule");
const {
  setBirthdayChannel,
  getBirthdayChannel,
  removeBirthdayChannel,
  upsertBirthday,
  removeBirthday,
  listBirthdays,
  listDueBirthdaysWithChannel,
  hasBirthdayAnnouncement,
  markBirthdayAnnouncement,
} = require("./birthdayStore");
const {
  setIpWatchChannel,
  getIpWatchChannel,
  removeIpWatchChannel,
  listIpWatchChannels,
  getLastIpv4State,
  updateIpv4State,
} = require("./ipWatchStore");
const {
  setEpicFreeChannel,
  getEpicFreeChannel,
  removeEpicFreeChannel,
  listEpicFreeChannels,
  hasSeenEpicGame,
  upsertSeenEpicGame,
  listSeenEpicGames,
} = require("./epicFreeStore");
const {
  setDiskSpaceChannel,
  getDiskSpaceChannel,
  removeDiskSpaceChannel,
  listDiskSpaceChannels,
  setDiskSpaceMessage,
  getDiskSpaceMessage,
  removeDiskSpaceMessage,
} = require("./diskSpaceStore");
const {
  setVoiceAbsenceChannel,
  getVoiceAbsenceChannel,
  removeVoiceAbsenceChannel,
  addTrackedUser,
  removeTrackedUser,
  isTrackedUser,
  listTrackedUsers,
  getLastCallAt,
  updateLastCallAt,
} = require("./voiceAbsenceStore");

const token = process.env.DISCORD_TOKEN;
const ownerId = process.env.ADMIN_USER_ID;
const commandPrefix = process.env.BOT_PREFIX || "!smashorpass";
const trabalhoCommandPrefix = process.env.TRABALHO_COMMAND || "!trabalho";
const aniversarioCommandPrefix = process.env.ANIVERSARIO_COMMAND || "!aniversario";
const ipv4CommandPrefix = process.env.IPV4_COMMAND || "!ipwatch";
const epicFreeCommandPrefix = process.env.EPICFREE_COMMAND || "!epicfree";
const diskSpaceCommandPrefix = process.env.DISKSPACE_COMMAND || "!diskspace";
const voiceAbsenceCommandPrefix = process.env.VOICE_ABSENCE_COMMAND || "!sumido";
const voiceAbsenceMinDays = readPositiveIntEnv("VOICE_ABSENCE_MIN_DAYS", 3);

function readPositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function readIntInRangeEnv(name, fallback, min, max) {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const value = Math.floor(parsed);
  if (value < min || value > max) {
    return fallback;
  }

  return value;
}

const ipv4CheckIntervalMs = readPositiveIntEnv("IPV4_CHECK_INTERVAL_MS", 600000);
const ipv4FetchTimeoutMs = readPositiveIntEnv("IPV4_FETCH_TIMEOUT_MS", 8000);
const epicFreeCheckIntervalMs = readPositiveIntEnv("EPICFREE_CHECK_INTERVAL_MS", 21600000);
const epicFreeFetchTimeoutMs = readPositiveIntEnv("EPICFREE_FETCH_TIMEOUT_MS", 15000);
const epicFreeLocale = process.env.EPICFREE_LOCALE || "pt-BR";
const epicFreeCountry = process.env.EPICFREE_COUNTRY || "BR";
const epicFreeAllowCountries = process.env.EPICFREE_ALLOW_COUNTRIES || epicFreeCountry;
const birthdayAnnounceHour = readIntInRangeEnv("BIRTHDAY_ANNOUNCE_HOUR", 9, 0, 23);
const birthdayAnnounceMinute = readIntInRangeEnv("BIRTHDAY_ANNOUNCE_MINUTE", 0, 0, 59);
const diskSpaceAnnounceHour = readIntInRangeEnv("DISKSPACE_ANNOUNCE_HOUR", 10, 0, 23);
const diskSpaceAnnounceMinute = readIntInRangeEnv("DISKSPACE_ANNOUNCE_MINUTE", 0, 0, 59);
const diskSpaceReserveGb = readPositiveIntEnv("DISKSPACE_RESERVE_GB", 100);
let ipv4CheckInProgress = false;
let birthdayCheckInProgress = false;
let epicFreeCheckInProgress = false;
let diskSpaceCheckInProgress = false;
let birthdayScheduleTimeout = null;
let diskSpaceScheduleTimeout = null;

const globalHelpCommand = "!help";
const ownerHelpCommand = "!helpall";

if (!token) {
  throw new Error("DISCORD_TOKEN nao foi definido no .env");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

function isImageOrVideoAttachment(attachment) {
  const contentType = attachment.contentType ? attachment.contentType.toLowerCase() : "";
  const name = attachment.name ? attachment.name.toLowerCase() : "";

  if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
    return true;
  }

  return /\.(gif|png|jpe?g|webp|bmp|mp4|mov|webm|mkv)$/i.test(name);
}

function parseChannelId(input) {
  if (!input) return null;
  const mentionMatch = input.match(/^<#(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  if (/^\d+$/.test(input)) return input;
  return null;
}

function parseUserId(input) {
  if (!input) return null;
  const mentionMatch = input.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  if (/^\d+$/.test(input)) return input;
  return null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseBirthdayDate(input) {
  if (!input) return null;
  const normalized = input.trim();
  const match = /^(\d{1,2})[\/-](\d{1,2})$/.exec(normalized);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  const validationDate = new Date(2000, month - 1, day);
  if (validationDate.getMonth() !== month - 1 || validationDate.getDate() !== day) {
    return null;
  }

  return { day, month };
}

function formatBirthday(day, month) {
  return `${pad2(day)}/${pad2(month)}`;
}

function formatDateYmd(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Formata a duração de ausência em texto legível.
 * Ex: "5 dias, 3 horas e 12 minutos"
 * @param {number} ms
 * @returns {string}
 */
function formatAbsenceDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "dia" : "dias"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hora" : "horas"}`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} ${minutes === 1 ? "minuto" : "minutos"}`);

  if (parts.length === 1) return parts[0];
  const last = parts.pop();
  return `${parts.join(", ")} e ${last}`;
}

/**
 * Interpreta tokens de entrada do usuário como uma duração de ausência em ms.
 *
 * Formatos aceitos:
 *  - Duração relativa: "15d", "5d 3h 30m", "2h 45m", "90m"
 *    (d = dias, h = horas, m = minutos — qualquer combinação)
 *  - Data absoluta: "2026-01-15" (YYYY-MM-DD) ou "15/01/2026" (DD/MM/YYYY)
 *    → calcula ms desde meia-noite dessa data até agora
 *
 * Retorna o número de ms de ausência, ou null se inválido.
 * @param {string[]} tokens
 * @returns {number|null}
 */
function parseAbsenceInput(tokens) {
  const combined = tokens.join(" ").trim();

  // Tenta parsear como data absoluta: YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(combined);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    if (isNaN(d.getTime())) return null;
    const ms = Date.now() - d.getTime();
    return ms > 0 ? ms : null;
  }

  // Tenta parsear como data absoluta: DD/MM/YYYY
  const brMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(combined);
  if (brMatch) {
    const d = new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
    if (isNaN(d.getTime())) return null;
    const ms = Date.now() - d.getTime();
    return ms > 0 ? ms : null;
  }

  // Tenta parsear como duração relativa: combinação de Nd Nh Nm
  // Exemplo: "5d", "3h 30m", "15d 2h", "90m"
  const durationRegex = /^(?:(\d+)\s*d\b)?\s*(?:(\d+)\s*h\b)?\s*(?:(\d+)\s*m\b)?$/i;
  const dMatch = durationRegex.exec(combined);
  if (dMatch && (dMatch[1] || dMatch[2] || dMatch[3])) {
    const days = Number(dMatch[1] || 0);
    const hours = Number(dMatch[2] || 0);
    const minutes = Number(dMatch[3] || 0);
    const ms = (days * 86400 + hours * 3600 + minutes * 60) * 1000;
    return ms > 0 ? ms : null;
  }

  return null;
}

/**
 * Handler de comandos !sumido (rastreamento de ausência em calls de voz).
 */
async function handleVoiceAbsenceCommand(message) {
  const raw = message.content.trim();
  const lower = raw.toLowerCase();

  const startsWithCommand =
    lower === voiceAbsenceCommandPrefix.toLowerCase() ||
    lower.startsWith(`${voiceAbsenceCommandPrefix.toLowerCase()} `);

  if (!startsWithCommand) return false;

  const args = raw
    .slice(voiceAbsenceCommandPrefix.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const firstArg = (args[0] || "").toLowerCase();

  // ── help ───────────────────────────────────────────
  if (!firstArg || firstArg === "help") {
    await message.reply(
      [
        `**Comandos de rastreamento de sumidos (${voiceAbsenceCommandPrefix}):**`,
        `\`${voiceAbsenceCommandPrefix} canal set #canal\` — define o canal de anúncio (admin)`,
        `\`${voiceAbsenceCommandPrefix} canal remove\` — remove o canal de anúncio (admin)`,
        `\`${voiceAbsenceCommandPrefix} canal show\` — mostra o canal configurado (admin)`,
        `\`${voiceAbsenceCommandPrefix} add @user\` — começa a rastrear o usuário (admin)`,
        `\`${voiceAbsenceCommandPrefix} remove @user\` — para de rastrear o usuário (admin)`,
        `\`${voiceAbsenceCommandPrefix} list\` — lista os usuários rastreados e status`,
        `\`${voiceAbsenceCommandPrefix} status @user\` — mostra há quanto tempo está sumido`,
        `\`${voiceAbsenceCommandPrefix} set @user 15d\` — define manualmente o tempo sumido (admin)`,
        `\`${voiceAbsenceCommandPrefix} set @user 5d 3h 30m\` — dias + horas + minutos (admin)`,
        `\`${voiceAbsenceCommandPrefix} set @user 2026-01-15\` — a partir de uma data (admin)`,
        `O bot anuncia quando um rastreado entra em call após ${voiceAbsenceMinDays}+ dias sumido.`,
      ].join("\n")
    );
    return true;
  }

  // ── canal ──────────────────────────────────────────
  if (firstArg === "canal") {
    const action = (args[1] || "").toLowerCase();

    if (action === "set") {
      if (!isAdminUser(message)) {
        await message.reply("Você não tem permissão para configurar o canal de anúncio.");
        return true;
      }
      const channelId = parseChannelId(args[2]);
      if (!channelId) {
        await message.reply("Informe o canal. Ex: `!sumido canal set #geral`");
        return true;
      }
      setVoiceAbsenceChannel(message.guild.id, channelId);
      await message.reply(`Canal de anúncio de sumidos definido como <#${channelId}>.`);
      return true;
    }

    if (action === "remove") {
      if (!isAdminUser(message)) {
        await message.reply("Você não tem permissão para remover o canal de anúncio.");
        return true;
      }
      removeVoiceAbsenceChannel(message.guild.id);
      await message.reply("Canal de anúncio de sumidos removido.");
      return true;
    }

    if (action === "show") {
      const config = getVoiceAbsenceChannel(message.guild.id);
      if (!config) {
        await message.reply("Nenhum canal de anúncio configurado. Use `!sumido canal set #canal`.");
      } else {
        await message.reply(`Canal de anúncio atual: <#${config.channel_id}>.`);
      }
      return true;
    }

    await message.reply("Ação inválida. Use: `set`, `remove` ou `show`.");
    return true;
  }

  // ── add ────────────────────────────────────────────
  if (firstArg === "add") {
    if (!isAdminUser(message)) {
      await message.reply("Você não tem permissão para adicionar usuários rastreados.");
      return true;
    }
    const userId = parseUserId(args[1]);
    if (!userId) {
      await message.reply("Mencione o usuário. Ex: `!sumido add @user`");
      return true;
    }

    let displayName = null;
    try {
      const member = await message.guild.members.fetch(userId);
      displayName = member.displayName;
    } catch (_) {
      // Usuário pode não estar mais no servidor, tudo bem
    }

    addTrackedUser(message.guild.id, userId, displayName);
    await message.reply(
      `Usuário <@${userId}> adicionado ao rastreamento de sumidos. O contador começa a partir de agora.`
    );
    return true;
  }

  // ── remove ─────────────────────────────────────────
  if (firstArg === "remove") {
    if (!isAdminUser(message)) {
      await message.reply("Você não tem permissão para remover usuários rastreados.");
      return true;
    }
    const userId = parseUserId(args[1]);
    if (!userId) {
      await message.reply("Mencione o usuário. Ex: `!sumido remove @user`");
      return true;
    }
    if (!isTrackedUser(message.guild.id, userId)) {
      await message.reply("Esse usuário não está sendo rastreado.");
      return true;
    }
    removeTrackedUser(message.guild.id, userId);
    await message.reply(`Usuário <@${userId}> removido do rastreamento de sumidos.`);
    return true;
  }

  // ── list ───────────────────────────────────────────
  if (firstArg === "list") {
    const users = listTrackedUsers(message.guild.id);
    if (users.length === 0) {
      await message.reply(
        "Nenhum usuário rastreado ainda. Use `!sumido add @user` para começar."
      );
      return true;
    }

    const nowMs = Date.now();
    const lines = users.map((u) => {
      const absenceMs = nowMs - u.last_call_at_ms;
      const absenceDays = Math.floor(absenceMs / 86400000);
      const duration = formatAbsenceDuration(absenceMs);
      const name = u.display_name ? `${u.display_name} (<@${u.user_id}>)` : `<@${u.user_id}>`;
      const isSumido = absenceDays >= voiceAbsenceMinDays;
      const flag = isSumido ? "🔴" : "🟢";
      return `${flag} ${name} — sumido há ${duration}`;
    });

    await message.reply(`**Usuários rastreados:**\n${lines.join("\n")}`);
    return true;
  }

  // ── status ─────────────────────────────────────────
  if (firstArg === "status") {
    const userId = parseUserId(args[1]);
    if (!userId) {
      await message.reply("Mencione o usuário. Ex: `!sumido status @user`");
      return true;
    }
    if (!isTrackedUser(message.guild.id, userId)) {
      await message.reply("Esse usuário não está sendo rastreado.");
      return true;
    }
    const lastCallAt = getLastCallAt(message.guild.id, userId);
    const nowMs = Date.now();
    const absenceMs = nowMs - (lastCallAt ?? nowMs);
    const absenceDays = Math.floor(absenceMs / 86400000);
    const duration = formatAbsenceDuration(absenceMs);
    const isSumido = absenceDays >= voiceAbsenceMinDays;
    const status = isSumido ? "🔴 **SUMIDO**" : "🟢 Visto recentemente";

    await message.reply(
      `${status} — <@${userId}> está há ${duration} sem entrar em call.`
    );
    return true;
  }

  // ── set ───────────────────────────────────────────
  if (firstArg === "set") {
    if (!isAdminUser(message)) {
      await message.reply("Você não tem permissão para ajustar o tempo sumido.");
      return true;
    }
    const userId = parseUserId(args[1]);
    if (!userId) {
      await message.reply(
        `Mencione o usuário. Ex: \`${voiceAbsenceCommandPrefix} set @user 15d\``
      );
      return true;
    }
    if (!isTrackedUser(message.guild.id, userId)) {
      await message.reply("Esse usuário não está sendo rastreado. Adicione-o primeiro com `!sumido add`.");
      return true;
    }

    // Interpreta os tokens restantes como duração ou data
    const tokens = args.slice(2);
    if (tokens.length === 0) {
      await message.reply(
        `Informe o tempo. Ex: \`${voiceAbsenceCommandPrefix} set @user 15d\`, \`5d 3h 30m\` ou \`2026-01-15\`.`
      );
      return true;
    }

    const parsedMs = parseAbsenceInput(tokens);
    if (parsedMs === null) {
      await message.reply(
        "Formato inválido. Use duração (`15d`, `5d 3h 30m`, `2h 45m`) ou data (`2026-01-15`, `15/01/2026`)."
      );
      return true;
    }

    const nowMs = Date.now();
    const newLastCallAt = nowMs - parsedMs;
    updateLastCallAt(message.guild.id, userId, newLastCallAt);

    const duration = formatAbsenceDuration(parsedMs);
    await message.reply(
      `✅ Tempo sumido de <@${userId}> definido para **${duration}**. O contador está correndo a partir de agora.`
    );
    return true;
  }

  await message.reply(`Comando inválido. Use \`${voiceAbsenceCommandPrefix} help\` para ajuda.`);
  return true;
}

function getNextBirthdayRunDate(now = new Date()) {
  const next = new Date(now);
  next.setHours(birthdayAnnounceHour, birthdayAnnounceMinute, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function scheduleNextBirthdayAnnouncement() {
  if (birthdayScheduleTimeout) {
    clearTimeout(birthdayScheduleTimeout);
  }

  const now = new Date();
  const nextRun = getNextBirthdayRunDate(now);
  const delayMs = Math.max(1000, nextRun.getTime() - now.getTime());

  console.log(
    `Proximo anuncio de aniversarios agendado para ${nextRun.toLocaleString()} (hora local da maquina).`
  );

  birthdayScheduleTimeout = setTimeout(async () => {
    try {
      await sendBirthdayAnnouncements();
    } catch (error) {
      console.error("Falha no anuncio diario de aniversarios:", error);
    } finally {
      scheduleNextBirthdayAnnouncement();
    }
  }, delayMs);
}

function isValidIpv4(value) {
  if (!value) return false;
  const trimmed = value.trim();
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(trimmed)) return false;

  return trimmed.split(".").every((part) => {
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

async function fetchPublicIpv4() {
  const urls = ["https://api.ipify.org?format=json", "https://ipv4.icanhazip.com"];

  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ipv4FetchTimeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        continue;
      }

      let candidate = "";
      if (url.includes("format=json")) {
        const data = await response.json();
        candidate = String(data.ip || "").trim();
      } else {
        candidate = (await response.text()).trim();
      }

      if (isValidIpv4(candidate)) {
        return candidate;
      }
    } catch (error) {
      // Tenta o proximo endpoint em caso de falha.
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

async function checkPublicIpv4AndNotify(options = {}) {
  const { manual = false, sourceMessage = null } = options;

  const currentIpv4 = await fetchPublicIpv4();
  if (!currentIpv4) {
    if (manual && sourceMessage) {
      await sourceMessage.reply("Não foi possível consultar o IPv4 público agora.");
    }
    return;
  }

  const state = getLastIpv4State();
  const previousIpv4 = state ? state.last_ipv4 : null;

  if (!previousIpv4) {
    updateIpv4State(currentIpv4);
    if (manual && sourceMessage) {
      await sourceMessage.reply(`IPv4 atual registrado: ${currentIpv4}`);
    }
    return;
  }

  if (previousIpv4 === currentIpv4) {
    if (manual && sourceMessage) {
      await sourceMessage.reply(`Sem alteracao. IPv4 atual continua ${currentIpv4}.`);
    }
    return;
  }

  updateIpv4State(currentIpv4);

  const channels = listIpWatchChannels();
  let sentCount = 0;

  for (const item of channels) {
    try {
      const channel = await client.channels.fetch(item.channel_id);
      if (!channel || !channel.isTextBased()) continue;
      await channel.send(
        `⚠️ Alteracao detectada no IPv4 publico desta maquina:\nDe: ${previousIpv4}\nPara: ${currentIpv4}`
      );
      sentCount += 1;
    } catch (error) {
      console.error(`Falha ao avisar mudanca de IPv4 na guild ${item.guild_id}:`, error.message);
    }
  }

  if (manual && sourceMessage) {
    await sourceMessage.reply(
      `IPv4 alterado de ${previousIpv4} para ${currentIpv4}. Avisos enviados em ${sentCount} canal(is).`
    );
  }
}

function getEpicFreeGamesEndpoint() {
  const params = new URLSearchParams({
    locale: epicFreeLocale,
    country: epicFreeCountry,
    allowCountries: epicFreeAllowCountries,
  });
  return `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?${params.toString()}`;
}

function normalizeEpicGame(game) {
  const pageSlug =
    game.offerMappings?.[0]?.pageSlug ||
    game.catalogNs?.mappings?.[0]?.pageSlug ||
    game.productSlug ||
    game.urlSlug ||
    null;

  const normalizedSlug = pageSlug ? pageSlug.replace(/^\//, "") : null;
  const gameUrl = normalizedSlug ? `https://store.epicgames.com/pt-BR/p/${normalizedSlug}` : null;

  const thumbnailTypes = ["DieselStoreFrontWide", "OfferImageWide", "VaultClosed", "Thumbnail"];
  let imageUrl = null;
  for (const imageType of thumbnailTypes) {
    const image = game.keyImages?.find((item) => item.type === imageType && item.url);
    if (image) {
      imageUrl = image.url;
      break;
    }
  }

  const gameId = String(game.id || game.offerId || game.namespace || game.title || "").trim();
  const title = String(game.title || "Jogo sem título").trim();

  return {
    id: gameId,
    title,
    gameUrl,
    imageUrl,
  };
}

function extractCurrentEpicFreeGames(elements) {
  const now = Date.now();
  const results = [];

  for (const game of elements) {
    const offerPeriods = game.promotions?.promotionalOffers || [];
    if (!Array.isArray(offerPeriods) || offerPeriods.length === 0) {
      continue;
    }

    let hasActiveFreeOffer = false;
    for (const period of offerPeriods) {
      const offers = period.promotionalOffers || [];
      for (const offer of offers) {
        const startAt = offer.startDate ? new Date(offer.startDate).getTime() : NaN;
        const endAt = offer.endDate ? new Date(offer.endDate).getTime() : NaN;
        const discountPercentage = Number(offer.discountSetting?.discountPercentage);
        const discountPrice = game.price?.totalPrice?.discountPrice;

        const isFree = discountPercentage === 100 || discountPrice === 0;
        const isActive = Number.isFinite(startAt) && Number.isFinite(endAt) && now >= startAt && now <= endAt;

        if (isFree && isActive) {
          hasActiveFreeOffer = true;
          break;
        }
      }

      if (hasActiveFreeOffer) {
        break;
      }
    }

    if (!hasActiveFreeOffer) {
      continue;
    }

    const normalized = normalizeEpicGame(game);
    if (!normalized.id) {
      continue;
    }

    results.push(normalized);
  }

  return results;
}

async function fetchCurrentEpicFreeGames() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), epicFreeFetchTimeoutMs);

  try {
    const response = await fetch(getEpicFreeGamesEndpoint(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NewPontoZeroBot/1.0)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Falha HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const elements = data?.data?.Catalog?.searchStore?.elements;
    if (!Array.isArray(elements)) {
      throw new Error("Resposta da Epic Games em formato inesperado.");
    }

    return extractCurrentEpicFreeGames(elements);
  } finally {
    clearTimeout(timeout);
  }
}

async function announceEpicFreeGame(channel, game) {
  if (!channel || !channel.isTextBased()) {
    return;
  }

  const description = game.gameUrl
    ? `🔥 Novo jogo gratuito disponível: [${game.title}](${game.gameUrl})`
    : `🔥 Novo jogo gratuito disponível: ${game.title}`;

  const embed = new EmbedBuilder()
    .setTitle(game.title)
    .setDescription(description)
    .setColor(0x2ecc71)
    .setTimestamp();

  if (game.gameUrl) {
    embed.setURL(game.gameUrl);
  }

  if (game.imageUrl) {
    embed.setImage(game.imageUrl);
  }

  await channel.send({ embeds: [embed] });
}

async function checkEpicFreeGamesAndNotify(options = {}) {
  const { manual = false, sourceMessage = null } = options;

  if (epicFreeCheckInProgress) {
    if (manual && sourceMessage) {
      await sourceMessage.reply("Uma checagem da Epic já está em andamento. Tente novamente em instantes.");
    }
    return;
  }

  epicFreeCheckInProgress = true;

  try {
    const freeGames = await fetchCurrentEpicFreeGames();

    const newGames = [];
    for (const game of freeGames) {
      if (!hasSeenEpicGame(game.id)) {
        newGames.push(game);
      }
      upsertSeenEpicGame(game.id, game.title, game.gameUrl);
    }

    let announcedChannels = 0;
    if (newGames.length > 0) {
      const channels = listEpicFreeChannels();
      for (const config of channels) {
        try {
          const channel = await client.channels.fetch(config.channel_id);
          if (!channel || !channel.isTextBased()) {
            continue;
          }

          for (const game of newGames) {
            await announceEpicFreeGame(channel, game);
          }

          announcedChannels += 1;
        } catch (error) {
          console.error(
            `Falha ao enviar anuncio da Epic no servidor ${config.guild_id}:`,
            error.message
          );
        }
      }
    }

    if (manual && sourceMessage) {
      if (newGames.length === 0) {
        await sourceMessage.reply(
          `Checagem concluída. Nenhum novo jogo grátis da Epic no momento. (${freeGames.length} jogo(s) grátis ativo(s))`
        );
      } else {
        const titles = newGames.map((game) => game.title).join(", ");
        await sourceMessage.reply(
          `Checagem concluída. ${newGames.length} novo(s) jogo(s): ${titles}. Avisos enviados em ${announcedChannels} canal(is).`
        );
      }
    }
  } catch (error) {
    console.error("Falha na checagem de jogos grátis da Epic:", error.message);
    if (manual && sourceMessage) {
      await sourceMessage.reply(`Falha ao consultar a Epic agora: ${error.message}`);
    }
  } finally {
    epicFreeCheckInProgress = false;
  }
}

async function runIpv4Check(options = {}) {
  if (ipv4CheckInProgress) {
    return;
  }

  ipv4CheckInProgress = true;
  try {
    await checkPublicIpv4AndNotify(options);
  } finally {
    ipv4CheckInProgress = false;
  }
}

function isAdminUser(message) {
  if (!message.guild || !message.member) return false;
  if (ownerId && message.author.id === ownerId) return true;
  return message.member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function isOwnerUser(message) {
  return !!ownerId && message.author.id === ownerId;
}

async function handleGlobalHelpCommand(message) {
  const raw = message.content.trim().toLowerCase();

  if (raw === globalHelpCommand) {
    await message.reply(
      [
        "Comandos gerais:",
        `${globalHelpCommand}`,
        `${commandPrefix} help`,
        `${trabalhoCommandPrefix} help`,
        `${aniversarioCommandPrefix} help`,
        `${ipv4CommandPrefix} help`,
        `${epicFreeCommandPrefix} help`,
        `${voiceAbsenceCommandPrefix} help`,
        "Use !helpall para a lista completa (somente dono).",
      ].join("\n")
    );
    return true;
  }

  if (raw === ownerHelpCommand) {
    if (!isOwnerUser(message)) {
      await message.reply("Este comando é exclusivo do dono do bot.");
      return true;
    }

    await message.reply(
      [
        "Lista completa de comandos:",
        `${globalHelpCommand}`,
        `${ownerHelpCommand}`,
        `${commandPrefix} canal add #canal`,
        `${commandPrefix} canal remove #canal`,
        `${commandPrefix} canal list`,
        `${trabalhoCommandPrefix}`,
        `${trabalhoCommandPrefix} [hoje|amanha|YYYY-MM-DD|DD/MM/YYYY]`,
        `${trabalhoCommandPrefix} folga add/remove/list ... (admin)`,
        `${trabalhoCommandPrefix} ferias add/remove/list ... (admin)`,
        `${trabalhoCommandPrefix} contador show (admin)`,
        `${trabalhoCommandPrefix} contador set <numero> (admin)`,
        `${aniversarioCommandPrefix} canal set/remove/show`,
        `${aniversarioCommandPrefix} add/edit/remove/list`,
        `${ipv4CommandPrefix} canal set/remove/show`,
        `${ipv4CommandPrefix} status`,
        `${ipv4CommandPrefix} check (admin)`,
        `${epicFreeCommandPrefix} canal set/remove/show`,
        `${epicFreeCommandPrefix} status`,
        `${epicFreeCommandPrefix} check (admin)`,
        `${voiceAbsenceCommandPrefix} canal set/remove/show (admin)`,
        `${voiceAbsenceCommandPrefix} add/remove @user (admin)`,
        `${voiceAbsenceCommandPrefix} list`,
        `${voiceAbsenceCommandPrefix} status @user`,
      ].join("\n")
    );
    return true;
  }

  return false;
}

function pickRandomMessage(messages) {
  return messages[Math.floor(Math.random() * messages.length)];
}

function getTrabalhoCounterMessage(totalQueries) {
  if (totalQueries <= 10) {
    return pickRandomMessage([
      `Perguntaram ${totalQueries} vezes. Estamos só aquecendo.`,
      `Contador atual: ${totalQueries}. Ainda dá para decorar o padrão sem sofrimento.`,
      `${totalQueries} perguntas até agora. O clássico dia sim, dia não segue intacto.`,
    ]);
  }

  if (totalQueries <= 50) {
    return pickRandomMessage([
      `Já bateu ${totalQueries} perguntas. O padrão continua o mesmo!`,
      `${totalQueries} vezes. A resposta ainda vem do mesmo ciclo dia sim, dia não.`,
      `Nível teimosia: ${totalQueries}. A escala de trabalho não mudou.`,
    ]);
  }

  if (totalQueries <= 150) {
    return pickRandomMessage([
      `Incrível... ${totalQueries} vezes. Já podiam ter decorado o padrão! 🤦`,
      `${totalQueries} consultas. O bot começa a achar que isso é esporte.`,
      `Estamos em ${totalQueries}. Isso ja virou ritual coletivo.`,
    ]);
  }

  if (totalQueries <= 300) {
    return pickRandomMessage([
      `Atualização: ${totalQueries} perguntas acumuladas. Vocês realmente não desistem.`,
      `${totalQueries} vezes depois, e o calendário segue o mesmo.`,
      `Chegamos em ${totalQueries}. O padrão está estável ainda.`,
    ]);
  }

  if (totalQueries <= 700) {
    return pickRandomMessage([
      `${totalQueries} perguntas. Isso já virou tradição local.`,
      `Relatório oficial: ${totalQueries} consultas e nenhum sinal de cansaço.`,
      `${totalQueries} vezes. Esse comando já paga aluguel no servidor.`,
    ]);
  }

  if (totalQueries <= 1500) {
    return pickRandomMessage([
      `Maratona desbloqueada: ${totalQueries} perguntas sobre o mesmo padrão.`,
      `${totalQueries} consultas no placar. O bot respeita essa persistência.`,
      `Já são ${totalQueries}. A pergunta é recorrente, a resposta também.`,
    ]);
  }

  if (totalQueries <= 3000) {
    return pickRandomMessage([
      `LENDA URBANA: ${totalQueries} perguntas contabilizadas.`,
      `${totalQueries} vezes. Esse contador já merece férias.`,
      `Passamos de mil faz tempo: ${totalQueries} consultas e contando.`,
    ]);
  }

  if (totalQueries < 5000) {
    return pickRandomMessage([
      `${totalQueries} perguntas. Estamos oficialmente no arco final dessa saga.`,
      `Contagem absurda: ${totalQueries}. O padrão continua invicto.`,
      `${totalQueries} consultas. Isso já virou item histórico do servidor.`,
    ]);
  }

  return pickRandomMessage([
    `MÍTICO: ${totalQueries} perguntas. Esse comando agora é patrimônio cultural.`,
    `MARCO 5000+: ${totalQueries} consultas. O ciclo dia sim, dia não virou lenda.`,
    `${totalQueries} vezes. Parabéns, vocês desbloquearam o fim secreto do contador.`,
  ]);
}

function getWorkStatusMessage(targetDate, works, exception) {
  const todayYmd = parseDateInput("hoje");
  const isToday = targetDate === todayYmd;

  if (works) {
    return isToday
      ? "Sim, ele trabalha hoje."
      : `Sim, ele trabalha em ${formatDateToBr(targetDate)}.`;
  }

  if (exception) {
    const kindText = exception.type === "ferias" ? "férias" : "folga";
    if (exception.reason) {
      return isToday
        ? `Não, ele não trabalha hoje (${kindText}: ${exception.reason}).`
        : `Não, ele não trabalha em ${formatDateToBr(targetDate)} (${kindText}: ${exception.reason}).`;
    }

    return isToday
      ? `Não, ele não trabalha hoje (${kindText}).`
      : `Não, ele não trabalha em ${formatDateToBr(targetDate)} (${kindText}).`;
  }

  return isToday
    ? "Não, ele não trabalha hoje."
    : `Não, ele não trabalha em ${formatDateToBr(targetDate)}.`;
}

async function handleTrabalhoCommand(message) {
  const raw = message.content.trim();
  const startsWithCommand =
    raw.toLowerCase() === trabalhoCommandPrefix.toLowerCase() ||
    raw.toLowerCase().startsWith(`${trabalhoCommandPrefix.toLowerCase()} `);

  if (!startsWithCommand) {
    return false;
  }

  const args = raw
    .slice(trabalhoCommandPrefix.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstArg = (args[0] || "").toLowerCase();

  if (firstArg === "help") {
    await message.reply(
      [
        "Comandos de trabalho:",
        `${trabalhoCommandPrefix}`,
        `${trabalhoCommandPrefix} hoje`,
        `${trabalhoCommandPrefix} amanhã`,
        `${trabalhoCommandPrefix} 2026-04-20`,
        `${trabalhoCommandPrefix} 20/04/2026`,
        `${trabalhoCommandPrefix} folga add 2026-04-20 consulta medica (admin)`,
        `${trabalhoCommandPrefix} ferias add 2026-05-15 2026-05-30 viagem (admin)`,
        `${trabalhoCommandPrefix} folga remove 2026-04-20 (admin)`,
        `${trabalhoCommandPrefix} ferias remove 2026-05-15 2026-05-30 (admin)`,
        `${trabalhoCommandPrefix} folga list (admin)`,
        `${trabalhoCommandPrefix} ferias list (admin)`,
        `${trabalhoCommandPrefix} padrao show (admin)`,
        `${trabalhoCommandPrefix} padrao inverter (admin)`,
        `${trabalhoCommandPrefix} padrao set 2026-09-27 (admin)`,
        `${trabalhoCommandPrefix} padrao reset (admin)`,
        `${trabalhoCommandPrefix} contador show (admin)`,
        `${trabalhoCommandPrefix} contador set 123 (admin)`,
      ].join("\n")
    );
    return true;
  }

  if (firstArg === "contador") {
    if (!isAdminUser(message)) {
      await message.reply("Você não tem permissão para gerenciar o contador de perguntas.");
      return true;
    }

    const action = (args[1] || "show").toLowerCase();

    if (action === "show") {
      const count = getQueryCount();
      await message.reply(`Contador atual de perguntas do trabalho: ${count}.`);
      return true;
    }

    if (action === "set") {
      const value = Number(args[2]);
      if (!Number.isInteger(value) || value < 0) {
        await message.reply("Informe um número inteiro válido maior ou igual a 0.");
        return true;
      }

      setQueryCount(value);
      await message.reply(`Contador de perguntas atualizado para ${value}.`);
      return true;
    }

    await message.reply("Subcomando inválido. Use show ou set.");
    return true;
  }

  if (firstArg === "folga" || firstArg === "ferias") {
    if (!isAdminUser(message)) {
      await message.reply("Você não tem permissão para gerenciar folgas/férias.");
      return true;
    }

    const type = firstArg;
    const action = (args[1] || "").toLowerCase();

    if (action === "list") {
      const rows = listWorkExceptionsByType(type, 100);
      if (rows.length === 0) {
        await message.reply(`Nenhuma data cadastrada para ${type}.`);
        return true;
      }

      const lines = rows.map((item) => {
        const reason = item.reason ? ` - ${item.reason}` : "";
        return `- ${formatDateToBr(item.date)}${reason}`;
      });

      await message.reply([`Datas de ${type}:`, ...lines].join("\n"));
      return true;
    }

    if (action === "add") {
      const startDate = parseDateInput(args[2]);
      if (!startDate) {
        await message.reply(
          `Data inválida. Use YYYY-MM-DD ou DD/MM/YYYY. Exemplo: ${trabalhoCommandPrefix} ${type} add 2026-04-20`
        );
        return true;
      }

      if (type === "ferias") {
        const maybeEndDate = parseDateInput(args[3]);
        if (maybeEndDate) {
          const rangeDates = listDatesInRange(startDate, maybeEndDate);
          if (!rangeDates) {
            await message.reply("Intervalo inválido. A data final precisa ser igual ou maior que a inicial.");
            return true;
          }

          const reason = args.slice(4).join(" ").trim();
          upsertWorkExceptionRange(rangeDates, type, reason || null);
          await message.reply(
            `Férias registradas de ${formatDateToBr(startDate)} até ${formatDateToBr(maybeEndDate)}${reason ? ` (${reason})` : ""}.`
          );
          return true;
        }
      }

      const reason = args.slice(3).join(" ").trim();
      upsertWorkException(startDate, type, reason || null);
      await message.reply(
        `${type === "ferias" ? "Férias registradas" : "Folga registrada"} para ${formatDateToBr(startDate)}${reason ? ` (${reason})` : ""}.`
      );
      return true;
    }

    if (action === "remove") {
      const startDate = parseDateInput(args[2]);
      if (!startDate) {
        await message.reply(
          `Data inválida. Use YYYY-MM-DD ou DD/MM/YYYY. Exemplo: ${trabalhoCommandPrefix} ${type} remove 2026-04-20`
        );
        return true;
      }

      if (type === "ferias") {
        const maybeEndDate = parseDateInput(args[3]);
        if (maybeEndDate) {
          const rangeDates = listDatesInRange(startDate, maybeEndDate);
          if (!rangeDates) {
            await message.reply("Intervalo inválido. A data final precisa ser igual ou maior que a inicial.");
            return true;
          }

          const removedCount = removeWorkExceptionRange(rangeDates);
          if (removedCount === 0) {
            await message.reply(
              `Não havia exceções cadastradas entre ${formatDateToBr(startDate)} e ${formatDateToBr(maybeEndDate)}.`
            );
            return true;
          }

          await message.reply(
            `${removedCount} ${removedCount === 1 ? "exceção removida" : "exceções removidas"} entre ${formatDateToBr(startDate)} e ${formatDateToBr(maybeEndDate)}.`
          );
          return true;
        }
      }

      const removed = removeWorkException(startDate);
      if (!removed) {
        await message.reply(`Não havia exceção cadastrada para ${formatDateToBr(startDate)}.`);
        return true;
      }

      await message.reply(`Exceção removida de ${formatDateToBr(startDate)}.`);
      return true;
    }

    await message.reply("Subcomando inválido. Use add, remove ou list.");
    return true;
  }

  if (firstArg === "padrao" || firstArg === "escala") {
    if (!isAdminUser(message)) {
      await message.reply("Você não tem permissão para gerenciar a escala padrão de trabalho.");
      return true;
    }

    const action = (args[1] || "show").toLowerCase();

    if (action === "show") {
      const currentAnchor = getWorkAnchorDate();
      const todayYmd = parseDateInput("hoje");
      const tomorrowYmd = parseDateInput("amanha");
      const worksToday = worksByPattern(todayYmd, currentAnchor);
      const worksTomorrow = worksByPattern(tomorrowYmd, currentAnchor);

      await message.reply(
        [
          `Data base (âncora) da escala atual: ${formatDateToBr(currentAnchor)} (${currentAnchor})`,
          `- Hoje (${formatDateToBr(todayYmd)}): ${worksToday ? "Trabalha" : "Folga"}`,
          `- Amanhã (${formatDateToBr(tomorrowYmd)}): ${worksTomorrow ? "Trabalha" : "Folga"}`,
        ].join("\n")
      );
      return true;
    }

    if (action === "inverter" || action === "shift") {
      const currentAnchor = getWorkAnchorDate();
      const currentDate = parseYmdToDate(currentAnchor) || new Date();
      currentDate.setDate(currentDate.getDate() + 1);
      const newAnchor = formatDateToYmd(currentDate);

      setWorkAnchorDate(newAnchor);

      const todayYmd = parseDateInput("hoje");
      const tomorrowYmd = parseDateInput("amanha");
      const worksToday = worksByPattern(todayYmd, newAnchor);
      const worksTomorrow = worksByPattern(tomorrowYmd, newAnchor);

      await message.reply(
        [
          `Padrão invertido em 1 dia com sucesso! Nova data base de trabalho: ${formatDateToBr(newAnchor)}.`,
          `- Hoje (${formatDateToBr(todayYmd)}): ${worksToday ? "Trabalha" : "Folga"}`,
          `- Amanhã (${formatDateToBr(tomorrowYmd)}): ${worksTomorrow ? "Trabalha" : "Folga"}`,
        ].join("\n")
      );
      return true;
    }

    if (action === "set") {
      const newAnchor = parseDateInput(args[2]);
      if (!newAnchor) {
        await message.reply(
          `Data inválida. Use YYYY-MM-DD ou DD/MM/YYYY. Exemplo: ${trabalhoCommandPrefix} padrao set 2026-09-27`
        );
        return true;
      }

      setWorkAnchorDate(newAnchor);

      const todayYmd = parseDateInput("hoje");
      const tomorrowYmd = parseDateInput("amanha");
      const worksToday = worksByPattern(todayYmd, newAnchor);
      const worksTomorrow = worksByPattern(tomorrowYmd, newAnchor);

      await message.reply(
        [
          `Data base atualizada para ${formatDateToBr(newAnchor)} (dia de trabalho).`,
          `- Hoje (${formatDateToBr(todayYmd)}): ${worksToday ? "Trabalha" : "Folga"}`,
          `- Amanhã (${formatDateToBr(tomorrowYmd)}): ${worksTomorrow ? "Trabalha" : "Folga"}`,
        ].join("\n")
      );
      return true;
    }

    if (action === "reset") {
      resetWorkAnchorDate();
      const currentAnchor = getWorkAnchorDate();
      const todayYmd = parseDateInput("hoje");
      const tomorrowYmd = parseDateInput("amanha");
      const worksToday = worksByPattern(todayYmd, currentAnchor);
      const worksTomorrow = worksByPattern(tomorrowYmd, currentAnchor);

      await message.reply(
        [
          `Configuração personalizada removida. A escala voltou para o padrão do .env (${formatDateToBr(currentAnchor)}).`,
          `- Hoje (${formatDateToBr(todayYmd)}): ${worksToday ? "Trabalha" : "Folga"}`,
          `- Amanhã (${formatDateToBr(tomorrowYmd)}): ${worksTomorrow ? "Trabalha" : "Folga"}`,
        ].join("\n")
      );
      return true;
    }

    await message.reply("Subcomando inválido. Use show, inverter, set <data> ou reset.");
    return true;
  }

  const targetDate = parseDateInput(args[0]);
  if (!targetDate) {
    await message.reply("Data inválida. Use hoje, amanhã, YYYY-MM-DD ou DD/MM/YYYY.");
    return true;
  }

  const anchor = getWorkAnchorDate();
  const exception = getWorkException(targetDate);
  const works = !exception && worksByPattern(targetDate, anchor);
  const totalQueries = incrementAndGetQueryCount();

  const statusMessage = getWorkStatusMessage(targetDate, works, exception);
  const counterMessage = getTrabalhoCounterMessage(totalQueries);

  await message.reply([statusMessage, counterMessage].join("\n\n"));
  return true;
}

async function sendBirthdayAnnouncements() {
  if (birthdayCheckInProgress) {
    return;
  }

  birthdayCheckInProgress = true;
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const dateYmd = formatDateYmd(now);

  try {
    const dueBirthdays = listDueBirthdaysWithChannel(month, day);
    const announcementsByChannel = new Map();

    for (const item of dueBirthdays) {
      if (hasBirthdayAnnouncement(item.guild_id, item.user_id, dateYmd)) continue;

      const bucket = announcementsByChannel.get(item.channel_id) || [];
      bucket.push(item);
      announcementsByChannel.set(item.channel_id, bucket);
    }

    for (const [channelId, items] of announcementsByChannel.entries()) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) continue;

        const mentions = items.map((item) => `<@${item.user_id}>`).join(", ");
        await channel.send(`🎉 Hoje é aniversário de ${mentions}! Parabéns!`);

        for (const item of items) {
          markBirthdayAnnouncement(item.guild_id, item.user_id, dateYmd);
        }
      } catch (error) {
        console.error(`Falha ao anunciar aniversários no canal ${channelId}:`, error.message);
      }
    }
  } finally {
    birthdayCheckInProgress = false;
  }
}

function parseDiskSpaceFromDf(dfOutput) {
  const lines = dfOutput.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return null;

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(/\s+/).filter(Boolean);

  let availableIdx = -1;
  let mountpointIdx = -1;

  for (let i = 0; i < headers.length; i++) {
    if (headers[i].includes("avail")) {
      availableIdx = i;
    }
    if (headers[i].includes("mounted")) {
      mountpointIdx = i;
    }
  }

  if (availableIdx === -1 || mountpointIdx === -1) {
    return null;
  }

  const mounts = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/).filter(Boolean);

    if (availableIdx >= parts.length || mountpointIdx >= parts.length) {
      continue;
    }

    const availableStr = parts[availableIdx];
    const mountPath = parts[mountpointIdx];
    const availableGb = Math.round(Number(availableStr));

    if (Number.isFinite(availableGb) && availableGb >= 0) {
      // Filtrar mounts relevantes: root, /mnt/*, /storage/*, /data/* e não considerar overlay do Docker
      const isRelevant = 
        mountPath === "/" ||
        (mountPath.startsWith("/mnt") && !mountPath.includes("overlay")) ||
        (mountPath.startsWith("/storage") && !mountPath.includes("overlay")) ||
        (mountPath.startsWith("/data") && !mountPath.includes("overlay"));

      if (isRelevant) {
        mounts.push({ path: mountPath, availableGb });
      }
    }
  }

  if (mounts.length === 0) {
    return null;
  }

  const totalFreeGb = mounts.reduce((sum, m) => sum + m.availableGb, 0);

  return { mounts, totalFreeGb };
}

async function fetchDiskSpace() {
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync("df -B1G", { timeout: 5000 });
    const parsed = parseDiskSpaceFromDf(stdout);
    if (!parsed) return null;

    const reserveGb = diskSpaceReserveGb;
    const totalEffectiveGb = Math.max(0, parsed.totalFreeGb - reserveGb);

    return {
      mounts: parsed.mounts,
      totalFreeGb: parsed.totalFreeGb,
      totalEffectiveGb,
      reserveGb,
    };
  } catch (error) {
    console.error("Falha ao obter espaço em disco:", error.message);
    return null;
  }
}

function formatDiskSpaceEmbed(diskData) {
  if (!diskData) return null;

  const { mounts, totalFreeGb, totalEffectiveGb, reserveGb } = diskData;

  const embed = new EmbedBuilder()
    .setTitle("💾 Espaço em Disco do Servidor")
    .setColor("#4CAF50")
    .addFields(
      {
        name: "📊 TOTAL",
        value: `Livre: **${totalFreeGb} GB** | Disponível: **${totalEffectiveGb} GB**`,
        inline: false,
      }
    );

  for (const mount of mounts) {
    const reservePerMount = Math.round(reserveGb / mounts.length);
    const effectiveGb = Math.max(0, mount.availableGb - reservePerMount);

    embed.addFields({
      name: `💾 ${mount.path}`,
      value: `Livre: ${mount.availableGb} GB | Disponível: ${effectiveGb} GB (reserva: -${reservePerMount} GB)`,
      inline: false,
    });
  }

  embed.setTimestamp().setFooter({ text: "Última atualização" });

  return embed;
}

async function updateDiskSpaceMessage(channel, guildId) {
  try {
    const diskData = await fetchDiskSpace();
    if (diskData === null) {
      await channel.send("Falha ao obter espaço em disco do servidor.");
      return;
    }

    const embed = formatDiskSpaceEmbed(diskData);

    const messageId = getDiskSpaceMessage(guildId);

    if (messageId) {
      try {
        const message = await channel.messages.fetch(messageId);
        await message.edit({ embeds: [embed] });
      } catch (error) {
        const newMessage = await channel.send({ embeds: [embed] });
        setDiskSpaceMessage(guildId, newMessage.id);
      }
    } else {
      const newMessage = await channel.send({ embeds: [embed] });
      setDiskSpaceMessage(guildId, newMessage.id);
    }
  } catch (error) {
    console.error(`Falha ao atualizar espaço em disco no canal ${channel.id}:`, error.message);
  }
}

async function sendDiskSpaceUpdates() {
  if (diskSpaceCheckInProgress) {
    return;
  }

  diskSpaceCheckInProgress = true;

  try {
    const channels = listDiskSpaceChannels();

    for (const config of channels) {
      try {
        const channel = await client.channels.fetch(config.channel_id);
        if (!channel || !channel.isTextBased()) continue;

        await updateDiskSpaceMessage(channel, config.guild_id);
      } catch (error) {
        console.error(`Falha ao atualizar espaço em disco no servidor ${config.guild_id}:`, error.message);
      }
    }
  } finally {
    diskSpaceCheckInProgress = false;
  }
}

function getNextDiskSpaceRunDate(now = new Date()) {
  const next = new Date(now);
  next.setHours(diskSpaceAnnounceHour, diskSpaceAnnounceMinute, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function scheduleNextDiskSpaceUpdate() {
  if (diskSpaceScheduleTimeout) {
    clearTimeout(diskSpaceScheduleTimeout);
  }

  const now = new Date();
  const nextRun = getNextDiskSpaceRunDate(now);
  const delayMs = Math.max(1000, nextRun.getTime() - now.getTime());

  console.log(
    `Proxima atualizacao de espaço em disco agendada para ${nextRun.toLocaleString()} (hora local da maquina).`
  );

  diskSpaceScheduleTimeout = setTimeout(async () => {
    try {
      await sendDiskSpaceUpdates();
    } catch (error) {
      console.error("Falha na atualizacao diaria de espaço em disco:", error);
    } finally {
      scheduleNextDiskSpaceUpdate();
    }
  }, delayMs);
}

async function handleDiskspaceCommand(message) {
  const raw = message.content.trim();
  const startsWithCommand =
    raw.toLowerCase() === diskSpaceCommandPrefix.toLowerCase() ||
    raw.toLowerCase().startsWith(`${diskSpaceCommandPrefix.toLowerCase()} `);

  if (!startsWithCommand) {
    return false;
  }

  if (!message.guild) {
    await message.reply("Este comando funciona apenas em servidor.");
    return true;
  }

  const args = raw
    .slice(diskSpaceCommandPrefix.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const action = (args[0] || "help").toLowerCase();

  if (action === "help") {
    await message.reply(
      [
        "Comandos de espaço em disco:",
        `${diskSpaceCommandPrefix} canal set #canal (admin)`,
        `${diskSpaceCommandPrefix} canal remove (admin)`,
        `${diskSpaceCommandPrefix} canal show`,
        `${diskSpaceCommandPrefix} status`,
      ].join("\n")
    );
    return true;
  }

  if (action === "canal") {
    const subAction = (args[1] || "show").toLowerCase();

    if (subAction === "show") {
      const channelId = getDiskSpaceChannel(message.guild.id);
      if (channelId) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        const channelName = channel ? channel.toString() : `<#${channelId}>`;
        await message.reply(`Canal de espaço em disco configurado: ${channelName}`);
      } else {
        await message.reply("Canal de espaço em disco não configurado.");
      }
      return true;
    }

    if (subAction === "set") {
      if (!isAdminUser(message)) {
        await message.reply("Apenas administradores podem configurar isso.");
        return true;
      }

      const channel = message.mentions.channels.first();
      if (!channel) {
        await message.reply("Mention um canal válido com #.");
        return true;
      }

      setDiskSpaceChannel(message.guild.id, channel.id);
      await message.reply(`Canal de espaço em disco configurado para ${channel.toString()}`);
      return true;
    }

    if (subAction === "remove") {
      if (!isAdminUser(message)) {
        await message.reply("Apenas administradores podem fazer isso.");
        return true;
      }

      const removed = removeDiskSpaceChannel(message.guild.id);
      if (removed) {
        removeDiskSpaceMessage(message.guild.id);
        await message.reply("Monitoramento de espaço em disco removido.");
      } else {
        await message.reply("Monitoramento de espaço em disco não estava configurado.");
      }
      return true;
    }
  }

  if (action === "status") {
    try {
      const diskData = await fetchDiskSpace();
      if (diskData === null) {
        await message.reply("Falha ao obter espaço em disco.");
        return true;
      }

      const embed = formatDiskSpaceEmbed(diskData);

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await message.reply(`Erro ao obter espaço em disco: ${error.message}`);
    }
    return true;
  }

  return true;
}

async function handleAniversarioCommand(message) {
  const raw = message.content.trim();
  const startsWithCommand =
    raw.toLowerCase() === aniversarioCommandPrefix.toLowerCase() ||
    raw.toLowerCase().startsWith(`${aniversarioCommandPrefix.toLowerCase()} `);

  if (!startsWithCommand) {
    return false;
  }

  if (!message.guild) {
    await message.reply("Este comando funciona apenas em servidor.");
    return true;
  }

  const args = raw
    .slice(aniversarioCommandPrefix.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const action = (args[0] || "help").toLowerCase();

  if (action === "help") {
    await message.reply(
      [
        "Comandos de aniversário:",
        `${aniversarioCommandPrefix} canal set #canal (admin)`,
        `${aniversarioCommandPrefix} canal remove (admin)`,
        `${aniversarioCommandPrefix} canal show`,
        `${aniversarioCommandPrefix} add @usuario DD/MM (admin)`,
        `${aniversarioCommandPrefix} edit @usuario DD/MM (admin)`,
        `${aniversarioCommandPrefix} remove @usuario (admin)`,
        `${aniversarioCommandPrefix} list`,
      ].join("\n")
    );
    return true;
  }

  if (action === "canal") {
    const subAction = (args[1] || "show").toLowerCase();

    if (subAction === "show") {
      const channelId = getBirthdayChannel(message.guild.id);
      if (!channelId) {
        await message.reply("Nenhum canal de aniversário configurado.");
        return true;
      }

      await message.reply(`Canal de aniversário atual: <#${channelId}>.`);
      return true;
    }

    if (!isAdminUser(message)) {
      await message.reply("Você não tem permissão para gerenciar o canal de aniversário.");
      return true;
    }

    if (subAction === "set") {
      const channelId = parseChannelId(args[2]);
      if (!channelId) {
        await message.reply(`Informe um canal válido. Exemplo: ${aniversarioCommandPrefix} canal set #geral`);
        return true;
      }

      setBirthdayChannel(message.guild.id, channelId);
      await message.reply(`Canal de aniversário definido para <#${channelId}>.`);
      return true;
    }

    if (subAction === "remove") {
      const removed = removeBirthdayChannel(message.guild.id);
      if (!removed) {
        await message.reply("Não havia canal de aniversário configurado.");
        return true;
      }

      await message.reply("Canal de aniversário removido.");
      return true;
    }

    await message.reply("Subcomando inválido de canal. Use set, remove ou show.");
    return true;
  }

  if (action === "list") {
    const items = listBirthdays(message.guild.id);
    if (items.length === 0) {
      await message.reply("Nenhum aniversário cadastrado neste servidor.");
      return true;
    }

    const lines = items.map((item) => `- <@${item.user_id}>: ${formatBirthday(item.day, item.month)}`);
    await message.reply(["Aniversários cadastrados:", ...lines].join("\n"));
    return true;
  }

  if (action === "add" || action === "edit" || action === "remove") {
    if (!isAdminUser(message)) {
      await message.reply("Você não tem permissão para gerenciar aniversários.");
      return true;
    }

    const userId = parseUserId(args[1]);
    if (!userId) {
      await message.reply(
        `Informe um usuário válido. Exemplo: ${aniversarioCommandPrefix} add @usuario 15/04.`
      );
      return true;
    }

    if (action === "remove") {
      const removed = removeBirthday(message.guild.id, userId);
      if (!removed) {
        await message.reply("Esse usuário não tinha aniversário cadastrado.");
        return true;
      }

      await message.reply(`Aniversário de <@${userId}> removido.`);
      return true;
    }

    const parsed = parseBirthdayDate(args[2]);
    if (!parsed) {
      await message.reply("Data inválida. Use o formato DD/MM. Exemplo: 15/04.");
      return true;
    }

    upsertBirthday(message.guild.id, userId, parsed.month, parsed.day);
    await message.reply(
      `Aniversário de <@${userId}> salvo para ${formatBirthday(parsed.day, parsed.month)}.`
    );
    return true;
  }

  await message.reply(`Comando desconhecido. Use '${aniversarioCommandPrefix} help'.`);
  return true;
}

async function handleIpv4WatchCommand(message) {
  const raw = message.content.trim();
  const startsWithCommand =
    raw.toLowerCase() === ipv4CommandPrefix.toLowerCase() ||
    raw.toLowerCase().startsWith(`${ipv4CommandPrefix.toLowerCase()} `);

  if (!startsWithCommand) {
    return false;
  }

  if (!message.guild) {
    await message.reply("Este comando funciona apenas em servidor.");
    return true;
  }

  const args = raw
    .slice(ipv4CommandPrefix.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const action = (args[0] || "help").toLowerCase();

  if (action === "help") {
    await message.reply(
      [
        "Comandos de monitoramento de IPv4:",
        `${ipv4CommandPrefix} canal set #canal (admin)`,
        `${ipv4CommandPrefix} canal remove (admin)`,
        `${ipv4CommandPrefix} canal show`,
        `${ipv4CommandPrefix} status`,
        `${ipv4CommandPrefix} check (admin)`,
      ].join("\n")
    );
    return true;
  }

  if (action === "canal") {
    const subAction = (args[1] || "show").toLowerCase();

    if (subAction === "show") {
      const channelId = getIpWatchChannel(message.guild.id);
      if (!channelId) {
        await message.reply("Nenhum canal de aviso de IPv4 configurado neste servidor.");
        return true;
      }

      await message.reply(`Canal de aviso de IPv4: <#${channelId}>`);
      return true;
    }

    if (!isAdminUser(message)) {
      await message.reply("Você não tem permissão para configurar o monitoramento de IPv4.");
      return true;
    }

    if (subAction === "set") {
      const channelId = parseChannelId(args[2]);
      if (!channelId) {
        await message.reply(`Informe um canal válido. Exemplo: ${ipv4CommandPrefix} canal set #alerts`);
        return true;
      }

      setIpWatchChannel(message.guild.id, channelId);
      await message.reply(`Canal de aviso de IPv4 definido para <#${channelId}>.`);
      return true;
    }

    if (subAction === "remove") {
      const removed = removeIpWatchChannel(message.guild.id);
      if (!removed) {
        await message.reply("Não havia canal de aviso de IPv4 configurado.");
        return true;
      }

      await message.reply("Canal de aviso de IPv4 removido.");
      return true;
    }

    await message.reply("Subcomando inválido de canal. Use set, remove ou show.");
    return true;
  }

  if (action === "status") {
    const state = getLastIpv4State();
    if (!state || !state.last_ipv4) {
      await message.reply("Ainda não existe IPv4 registrado. Use o comando de check para inicializar.");
      return true;
    }

    await message.reply(`IPv4 atual registrado: ${state.last_ipv4}.`);
    return true;
  }

  if (action === "check") {
    if (!isAdminUser(message)) {
      await message.reply("Você não tem permissão para forçar uma checagem de IPv4.");
      return true;
    }

    await runIpv4Check({ manual: true, sourceMessage: message });
    return true;
  }

  await message.reply(`Comando desconhecido. Use '${ipv4CommandPrefix} help'.`);
  return true;
}

async function handleEpicFreeCommand(message) {
  const raw = message.content.trim();
  const startsWithCommand =
    raw.toLowerCase() === epicFreeCommandPrefix.toLowerCase() ||
    raw.toLowerCase().startsWith(`${epicFreeCommandPrefix.toLowerCase()} `);

  if (!startsWithCommand) {
    return false;
  }

  if (!message.guild) {
    await message.reply("Este comando funciona apenas em servidor.");
    return true;
  }

  const args = raw
    .slice(epicFreeCommandPrefix.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const action = (args[0] || "help").toLowerCase();

  if (action === "help") {
    await message.reply(
      [
        "Comandos de jogos grátis da Epic:",
        `${epicFreeCommandPrefix} canal set #canal (admin)`,
        `${epicFreeCommandPrefix} canal remove (admin)`,
        `${epicFreeCommandPrefix} canal show`,
        `${epicFreeCommandPrefix} status`,
        `${epicFreeCommandPrefix} check (admin)`,
      ].join("\n")
    );
    return true;
  }

  if (action === "canal") {
    const subAction = (args[1] || "show").toLowerCase();

    if (subAction === "show") {
      const channelId = getEpicFreeChannel(message.guild.id);
      if (!channelId) {
        await message.reply("Nenhum canal de avisos da Epic configurado neste servidor.");
        return true;
      }

      await message.reply(`Canal de avisos da Epic: <#${channelId}>`);
      return true;
    }

    if (!isAdminUser(message)) {
      await message.reply("Você não tem permissão para configurar os avisos da Epic.");
      return true;
    }

    if (subAction === "set") {
      const channelId = parseChannelId(args[2]);
      if (!channelId) {
        await message.reply(`Informe um canal válido. Exemplo: ${epicFreeCommandPrefix} canal set #games`);
        return true;
      }

      setEpicFreeChannel(message.guild.id, channelId);
      await message.reply(`Canal de avisos da Epic definido para <#${channelId}>.`);
      return true;
    }

    if (subAction === "remove") {
      const removed = removeEpicFreeChannel(message.guild.id);
      if (!removed) {
        await message.reply("Não havia canal de avisos da Epic configurado.");
        return true;
      }

      await message.reply("Canal de avisos da Epic removido.");
      return true;
    }

    await message.reply("Subcomando inválido de canal. Use set, remove ou show.");
    return true;
  }

  if (action === "status") {
    const seen = listSeenEpicGames(5);
    if (seen.length === 0) {
      await message.reply("Ainda não há histórico de jogos da Epic. Use o comando de check para inicializar.");
      return true;
    }

    const lines = seen.map((item) => `- ${item.title}${item.game_url ? ` (${item.game_url})` : ""}`);
    await message.reply(["Últimos jogos grátis vistos pela Epic:", ...lines].join("\n"));
    return true;
  }

  if (action === "check") {
    if (!isAdminUser(message)) {
      await message.reply("Você não tem permissão para forçar uma checagem da Epic.");
      return true;
    }

    await checkEpicFreeGamesAndNotify({ manual: true, sourceMessage: message });
    return true;
  }

  await message.reply(`Comando desconhecido. Use '${epicFreeCommandPrefix} help'.`);
  return true;
}

async function handleAdminCommand(message) {
  const raw = message.content.trim();
  if (!raw.toLowerCase().startsWith(commandPrefix.toLowerCase())) {
    return;
  }

  if (!isAdminUser(message)) {
    await message.reply("Você não tem permissão para usar este comando.");
    return;
  }

  const args = raw.slice(commandPrefix.length).trim().split(/\s+/).filter(Boolean);
  const action = (args[0] || "help").toLowerCase();

  if (action === "help") {
    await message.reply(
      [
        "Comandos disponíveis:",
        `${commandPrefix} canal add #canal`,
        `${commandPrefix} canal remove #canal`,
        `${commandPrefix} canal list`,
        `${commandPrefix} help`,
      ].join("\n")
    );
    return;
  }

  if (action !== "canal") {
    await message.reply(`Comando desconhecido. Use '${commandPrefix} help'.`);
    return;
  }

  const subAction = (args[1] || "").toLowerCase();

  if (subAction === "list") {
    const channels = listMonitoredChannels(message.guild.id);
    if (channels.length === 0) {
      await message.reply("Nenhum canal monitorado configurado neste servidor.");
      return;
    }

    const channelMentions = channels.map((id) => `<#${id}>`).join(", ");
    await message.reply(`Canais monitorados: ${channelMentions}`);
    return;
  }

  const channelId = parseChannelId(args[2]);
  if (!channelId) {
    await message.reply(`Informe um canal válido. Exemplo: ${commandPrefix} canal add #midia`);
    return;
  }

  if (subAction === "add") {
    const inserted = addMonitoredChannel(message.guild.id, channelId);
    if (!inserted) {
      await message.reply("Este canal já estava configurado.");
      return;
    }

    await message.reply(`Canal <#${channelId}> adicionado ao monitoramento.`);
    return;
  }

  if (subAction === "remove") {
    const removed = removeMonitoredChannel(message.guild.id, channelId);
    if (!removed) {
      await message.reply("Este canal não estava configurado.");
      return;
    }

    await message.reply(`Canal <#${channelId}> removido do monitoramento.`);
    return;
  }

  await message.reply("Subcomando inválido. Use add, remove ou list.");
}

async function handleMediaReaction(message) {
  if (!message.guild || message.author.bot) return;
  if (!isMonitoredChannel(message.guild.id, message.channel.id)) return;

  const hasOnlyOneAttachment = message.attachments.size === 1;
  const noText = message.content.trim().length === 0;
  if (!hasOnlyOneAttachment || !noText) return;

  const attachment = message.attachments.first();
  if (!attachment || !isImageOrVideoAttachment(attachment)) return;

  try {
    await message.react("✅");
    await message.react("❌");
  } catch (error) {
    console.error("Falha ao adicionar reacoes:", error.message);
  }
}

client.once("ready", () => {
  console.log(`Bot conectado como ${client.user.tag}`);
  console.log(`Prefixo de comando: ${commandPrefix}`);
  console.log(`Comando de trabalho: ${trabalhoCommandPrefix}`);
  console.log(`Comando de aniversário: ${aniversarioCommandPrefix}`);
  console.log(`Comando de monitoramento de IPv4: ${ipv4CommandPrefix}`);
  console.log(`Comando de jogos grátis da Epic: ${epicFreeCommandPrefix}`);
  console.log(`Comando de espaço em disco: ${diskSpaceCommandPrefix}`);
  console.log(`Comando de sumidos: ${voiceAbsenceCommandPrefix}`);
  console.log(`Mínimo de dias sumido para anuncio: ${voiceAbsenceMinDays}`);
  console.log(`Horário de aniversário: ${pad2(birthdayAnnounceHour)}:${pad2(birthdayAnnounceMinute)}`);
  console.log(`Horário de atualização de espaço em disco: ${pad2(diskSpaceAnnounceHour)}:${pad2(diskSpaceAnnounceMinute)}`);
  console.log(`Intervalo IPv4 (ms): ${ipv4CheckIntervalMs}`);
  console.log(`Intervalo Epic Free (ms): ${epicFreeCheckIntervalMs}`);
  console.log(`Margem de reserva de disco (GB): ${diskSpaceReserveGb}`);

  scheduleNextBirthdayAnnouncement();

  scheduleNextDiskSpaceUpdate();

  runIpv4Check().catch((error) => {
    console.error("Falha na verificação inicial de IPv4:", error);
  });

  checkEpicFreeGamesAndNotify().catch((error) => {
    console.error("Falha na verificação inicial de jogos grátis da Epic:", error);
  });

  sendDiskSpaceUpdates().catch((error) => {
    console.error("Falha na verificação inicial de espaço em disco:", error);
  });

  setInterval(() => {
    runIpv4Check().catch((error) => {
      console.error("Falha na verificação de IPv4:", error);
    });
  }, ipv4CheckIntervalMs);

  setInterval(() => {
    checkEpicFreeGamesAndNotify().catch((error) => {
      console.error("Falha na verificação de jogos grátis da Epic:", error);
    });
  }, epicFreeCheckIntervalMs);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) {
      return;
    }

    if (await handleGlobalHelpCommand(message)) {
      return;
    }

    if (await handleAniversarioCommand(message)) {
      return;
    }

    if (await handleIpv4WatchCommand(message)) {
      return;
    }

    if (await handleEpicFreeCommand(message)) {
      return;
    }

    if (await handleDiskspaceCommand(message)) {
      return;
    }

    if (await handleVoiceAbsenceCommand(message)) {
      return;
    }

    if (await handleTrabalhoCommand(message)) {
      return;
    }

    await handleAdminCommand(message);
    await handleMediaReaction(message);
  } catch (error) {
    console.error("Erro ao processar mensagem:", error);
  }
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    // Só nos interessa quando o usuário ENTRA em um canal de voz (não estava em nenhum antes)
    const joinedChannel = !oldState.channelId && newState.channelId;
    if (!joinedChannel) return;

    const guildId = newState.guild.id;
    const userId = newState.member?.user?.id;
    if (!userId) return;

    // Verifica se esse usuário está sendo rastreado nessa guild
    if (!isTrackedUser(guildId, userId)) return;

    const nowMs = Date.now();
    const lastCallAt = getLastCallAt(guildId, userId);
    const absenceMs = nowMs - (lastCallAt ?? nowMs);
    const absenceDays = Math.floor(absenceMs / 86400000);

    // Atualiza o timestamp imediatamente (independente de anunciar)
    updateLastCallAt(guildId, userId, nowMs);

    // Só anuncia se passou do mínimo de dias configurado
    if (absenceDays < voiceAbsenceMinDays) return;

    const config = getVoiceAbsenceChannel(guildId);
    if (!config) return;

    try {
      const channel = await client.channels.fetch(config.channel_id);
      if (!channel || !channel.isTextBased()) return;

      const duration = formatAbsenceDuration(absenceMs);
      const member = newState.member;
      const displayName = member?.displayName ?? `<@${userId}>`;
      const mention = `<@${userId}>`;

      const embed = new EmbedBuilder()
        .setTitle("👻 O sumido voltou!")
        .setDescription(
          `${mention} entrou em call depois de **${duration}** de ausência!`
        )
        .setColor(0x9b59b6)
        .setTimestamp();

      if (member?.displayAvatarURL) {
        embed.setThumbnail(member.displayAvatarURL());
      }

      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(`Falha ao anunciar retorno de sumido (guild ${guildId}, user ${userId}):`, error.message);
    }
  } catch (error) {
    console.error("Erro no listener voiceStateUpdate:", error);
  }
});

client.login(token);
