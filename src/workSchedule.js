const defaultAnchorDateRaw = process.env.WORK_PATTERN_ANCHOR || "2026-01-02";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateToYmd(date) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

function parseYmdToDate(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseDateInput(input) {
  if (!input) {
    return formatDateToYmd(new Date());
  }

  const normalized = input.trim().toLowerCase();

  if (normalized === "hoje") {
    return formatDateToYmd(new Date());
  }

  if (normalized === "amanha" || normalized === "amanhã") {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return formatDateToYmd(date);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return parseYmdToDate(normalized) ? normalized : null;
  }

  const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);
  if (brMatch) {
    const converted = `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    return parseYmdToDate(converted) ? converted : null;
  }

  return null;
}

function formatDateToBr(ymd) {
  const date = parseYmdToDate(ymd);
  if (!date) return ymd;
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function dayDiff(anchorYmd, targetYmd) {
  const anchor = parseYmdToDate(anchorYmd);
  const target = parseYmdToDate(targetYmd);
  if (!anchor || !target) return 0;

  const msPerDay = 24 * 60 * 60 * 1000;
  const anchorUtc = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((targetUtc - anchorUtc) / msPerDay);
}

function worksByPattern(targetYmd, anchorDate = null) {
  const anchor = anchorDate || process.env.WORK_PATTERN_ANCHOR || defaultAnchorDateRaw;
  const diff = dayDiff(anchor, targetYmd);
  return ((diff % 2) + 2) % 2 === 0;
}

function listDatesInRange(startYmd, endYmd) {
  const start = parseYmdToDate(startYmd);
  const end = parseYmdToDate(endYmd);
  if (!start || !end) return null;
  if (start.getTime() > end.getTime()) return null;

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const dates = [];

  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatDateToYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

module.exports = {
  parseDateInput,
  formatDateToBr,
  formatDateToYmd,
  parseYmdToDate,
  dayDiff,
  worksByPattern,
  listDatesInRange,
};
