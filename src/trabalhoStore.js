const db = require("./db");

const incrementQueryStmt = db.prepare(`
  UPDATE work_query_stats
  SET total_queries = total_queries + 1
  WHERE id = 1
`);

const readQueryCountStmt = db.prepare(`
  SELECT total_queries FROM work_query_stats WHERE id = 1
`);

const updateQueryCountStmt = db.prepare(`
  UPDATE work_query_stats
  SET total_queries = ?
  WHERE id = 1
`);

const upsertExceptionStmt = db.prepare(`
  INSERT INTO work_exceptions (date, type, reason)
  VALUES (?, ?, ?)
  ON CONFLICT(date) DO UPDATE SET
    type = excluded.type,
    reason = excluded.reason
`);

const removeExceptionStmt = db.prepare(`
  DELETE FROM work_exceptions WHERE date = ?
`);

const getExceptionStmt = db.prepare(`
  SELECT date, type, reason FROM work_exceptions WHERE date = ?
`);

const listExceptionsStmt = db.prepare(`
  SELECT date, type, reason
  FROM work_exceptions
  ORDER BY date ASC
  LIMIT ?
`);

const listExceptionsByTypeStmt = db.prepare(`
  SELECT date, type, reason
  FROM work_exceptions
  WHERE type = ?
  ORDER BY date ASC
  LIMIT ?
`);

const getAnchorStmt = db.prepare(`
  SELECT anchor_date FROM work_settings WHERE id = 1
`);

const setAnchorStmt = db.prepare(`
  UPDATE work_settings
  SET anchor_date = ?
  WHERE id = 1
`);

function incrementAndGetQueryCount() {
  incrementQueryStmt.run();
  const row = readQueryCountStmt.get();
  return row ? row.total_queries : 0;
}

function getQueryCount() {
  const row = readQueryCountStmt.get();
  return row ? row.total_queries : 0;
}

function setQueryCount(value) {
  updateQueryCountStmt.run(value);
}

function upsertWorkException(date, type, reason) {
  upsertExceptionStmt.run(date, type, reason || null);
}

const upsertWorkExceptionRangeTx = db.transaction((dates, type, reason) => {
  for (const date of dates) {
    upsertExceptionStmt.run(date, type, reason || null);
  }
});

function upsertWorkExceptionRange(dates, type, reason) {
  if (!Array.isArray(dates) || dates.length === 0) return 0;
  upsertWorkExceptionRangeTx(dates, type, reason || null);
  return dates.length;
}

function removeWorkException(date) {
  const result = removeExceptionStmt.run(date);
  return result.changes > 0;
}

const removeWorkExceptionRangeTx = db.transaction((dates) => {
  let removed = 0;
  for (const date of dates) {
    const result = removeExceptionStmt.run(date);
    removed += result.changes;
  }
  return removed;
});

function removeWorkExceptionRange(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return 0;
  return removeWorkExceptionRangeTx(dates);
}

function getWorkException(date) {
  return getExceptionStmt.get(date) || null;
}

function listWorkExceptions(limit = 20) {
  return listExceptionsStmt.all(limit);
}

function listWorkExceptionsByType(type, limit = 20) {
  return listExceptionsByTypeStmt.all(type, limit);
}

function getWorkAnchorDate() {
  const row = getAnchorStmt.get();
  return (row && row.anchor_date) || process.env.WORK_PATTERN_ANCHOR || "2026-01-02";
}

function setWorkAnchorDate(date) {
  setAnchorStmt.run(date);
}

function resetWorkAnchorDate() {
  setAnchorStmt.run(null);
}

module.exports = {
  incrementAndGetQueryCount,
  getQueryCount,
  setQueryCount,
  upsertWorkException,
  upsertWorkExceptionRange,
  removeWorkException,
  removeWorkExceptionRange,
  getWorkException,
  listWorkExceptions,
  listWorkExceptionsByType,
  getWorkAnchorDate,
  setWorkAnchorDate,
  resetWorkAnchorDate,
};
