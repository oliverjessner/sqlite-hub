const MIN_TIMESTAMP_YEAR = 1990;
const MAX_TIMESTAMP_YEAR = 2100;
const MIN_TIMESTAMP_MS = Date.UTC(MIN_TIMESTAMP_YEAR, 0, 1, 0, 0, 0);
const MAX_TIMESTAMP_MS = Date.UTC(MAX_TIMESTAMP_YEAR, 11, 31, 23, 59, 59, 999);
const MIN_UNIX_SECONDS = Math.floor(MIN_TIMESTAMP_MS / 1000);
const MAX_UNIX_SECONDS = Math.floor(MAX_TIMESTAMP_MS / 1000);
const MIN_UNIX_MILLISECONDS = MIN_TIMESTAMP_MS;
const MAX_UNIX_MILLISECONDS = MAX_TIMESTAMP_MS;
const MIN_UNIX_MICROSECONDS = MIN_TIMESTAMP_MS * 1000;
const MAX_UNIX_MICROSECONDS = MAX_TIMESTAMP_MS * 1000;

function normalizeColumnName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getColumnMeta(columnName, tableMeta = {}) {
  const normalizedColumnName = normalizeColumnName(columnName);

  return (tableMeta.columns ?? tableMeta.columnMeta ?? []).find(
    (column) => normalizeColumnName(column?.name) === normalizedColumnName
  );
}

function getForeignKeyColumnNames(tableMeta = {}) {
  const names = new Set();

  for (const foreignKey of tableMeta.foreignKeys ?? []) {
    for (const mapping of foreignKey?.mappings ?? []) {
      const from = normalizeColumnName(mapping?.from);

      if (from) {
        names.add(from);
      }
    }
  }

  return names;
}

export function isProtectedKeyColumn(columnName, tableMeta = {}) {
  const normalizedColumnName = normalizeColumnName(columnName);

  if (!normalizedColumnName) {
    return false;
  }

  const column = getColumnMeta(columnName, tableMeta);

  if (Number(column?.primaryKeyPosition ?? 0) > 0 || column?.primaryKey === true) {
    return true;
  }

  if (column?.foreignKey === true) {
    return true;
  }

  return getForeignKeyColumnNames(tableMeta).has(normalizedColumnName);
}

export function isIdLikeColumnName(columnName) {
  const normalizedColumnName = normalizeColumnName(columnName);

  if (!normalizedColumnName) {
    return false;
  }

  return (
    normalizedColumnName === "id" ||
    normalizedColumnName === "rowid" ||
    normalizedColumnName === "_id" ||
    normalizedColumnName.endsWith("_id") ||
    normalizedColumnName.endsWith(" id") ||
    normalizedColumnName.includes("uuid") ||
    normalizedColumnName.endsWith("_uuid") ||
    normalizedColumnName.endsWith("_key")
  );
}

function isPlausibleTimestampDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return false;
  }

  const time = date.getTime();
  const year = date.getFullYear();

  return (
    time >= MIN_TIMESTAMP_MS &&
    time <= MAX_TIMESTAMP_MS &&
    year >= MIN_TIMESTAMP_YEAR &&
    year <= MAX_TIMESTAMP_YEAR
  );
}

function normalizeNumericTimestamp(value) {
  const text = String(value ?? "").trim();

  if (!/^\d+$/.test(text)) {
    return null;
  }

  const numericValue = Number(text);

  if (!Number.isSafeInteger(numericValue)) {
    return null;
  }

  if (numericValue >= MIN_UNIX_MICROSECONDS && numericValue <= MAX_UNIX_MICROSECONDS) {
    return {
      date: new Date(Math.floor(numericValue / 1000)),
      sourceFormat: "unix-microseconds",
    };
  }

  if (numericValue >= MIN_UNIX_MILLISECONDS && numericValue <= MAX_UNIX_MILLISECONDS) {
    return {
      date: new Date(numericValue),
      sourceFormat: "unix-milliseconds",
    };
  }

  if (numericValue >= MIN_UNIX_SECONDS && numericValue <= MAX_UNIX_SECONDS) {
    return {
      date: new Date(numericValue * 1000),
      sourceFormat: "unix-seconds",
    };
  }

  return null;
}

function normalizeSqliteDateTimeString(value) {
  const text = String(value ?? "").trim();
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
  );

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second = "0", millisecond = "0"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond.padEnd(3, "0"))
  );

  return {
    date,
    sourceFormat: "sqlite-datetime",
  };
}

function normalizeIsoDateTimeString(value) {
  const text = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return null;
  }

  const date = new Date(text);

  return {
    date,
    sourceFormat: "iso-datetime",
  };
}

export function parseTimestampValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericTimestamp = normalizeNumericTimestamp(value);

  if (numericTimestamp && isPlausibleTimestampDate(numericTimestamp.date)) {
    return numericTimestamp;
  }

  const isoTimestamp = normalizeIsoDateTimeString(value);

  if (isoTimestamp && isPlausibleTimestampDate(isoTimestamp.date)) {
    return isoTimestamp;
  }

  const sqliteTimestamp = normalizeSqliteDateTimeString(value);

  if (sqliteTimestamp && isPlausibleTimestampDate(sqliteTimestamp.date)) {
    return sqliteTimestamp;
  }

  return null;
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

export function formatTimestampPreview(date) {
  if (!isPlausibleTimestampDate(date)) {
    return "";
  }

  return [
    padDatePart(date.getDate()),
    ".",
    padDatePart(date.getMonth() + 1),
    ".",
    date.getFullYear(),
    ", ",
    padDatePart(date.getHours()),
    ":",
    padDatePart(date.getMinutes()),
    ":",
    padDatePart(date.getSeconds()),
  ].join("");
}

export function getTimestampPreviewForField({ columnName, value, tableMeta = {} } = {}) {
  if (isProtectedKeyColumn(columnName, tableMeta)) {
    return {
      kind: "protected-key",
      protected: true,
      date: null,
      formatted: "",
      sourceFormat: "",
    };
  }

  if (isIdLikeColumnName(columnName)) {
    return {
      kind: "none",
      protected: false,
      date: null,
      formatted: "",
      sourceFormat: "",
    };
  }

  const parsed = parseTimestampValue(value);

  if (!parsed) {
    return {
      kind: "none",
      protected: false,
      date: null,
      formatted: "",
      sourceFormat: "",
    };
  }

  return {
    kind: "timestamp",
    protected: false,
    date: parsed.date,
    formatted: formatTimestampPreview(parsed.date),
    sourceFormat: parsed.sourceFormat,
  };
}
