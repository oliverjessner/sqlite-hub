const { randomUUID } = require("node:crypto");
const { ValidationError } = require("../../utils/errors");
const { quoteIdentifier } = require("../../utils/identifier");

const DEFAULT_ROW_COUNT = 100;
const MAX_ROW_COUNT = 10000;
const PREVIEW_ROW_COUNT = 10;
const GENERATOR_TYPES = new Set([
  "skip",
  "static",
  "randomText",
  "name",
  "firstName",
  "lastName",
  "email",
  "username",
  "title",
  "slug",
  "url",
  "randomInteger",
  "randomDecimal",
  "boolean",
  "timestamp",
  "uuid",
  "oneOf",
]);

const FIRST_NAMES = [
  "Ada",
  "Grace",
  "Linus",
  "Margaret",
  "Donald",
  "Barbara",
  "Ken",
  "Edsger",
  "Radia",
  "Tim",
];
const LAST_NAMES = [
  "Lovelace",
  "Hopper",
  "Torvalds",
  "Hamilton",
  "Knuth",
  "Liskov",
  "Thompson",
  "Dijkstra",
  "Perlman",
  "Berners-Lee",
];
const WORDS = [
  "alpha",
  "vector",
  "signal",
  "orbit",
  "matrix",
  "delta",
  "pixel",
  "ledger",
  "kernel",
  "index",
  "stream",
  "module",
];

function randomItem(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRowCount(value) {
  const rowCount = Number(value ?? DEFAULT_ROW_COUNT);

  if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > MAX_ROW_COUNT) {
    throw new ValidationError(`rowCount must be an integer between 1 and ${MAX_ROW_COUNT}.`);
  }

  return rowCount;
}

function isIntegerPrimaryKeyColumn(column) {
  return (
    Number(column.primaryKeyPosition ?? 0) > 0 &&
    (column.affinity === "INTEGER" || /\bINT\b/i.test(column.declaredType ?? ""))
  );
}

function hasDefaultValue(column) {
  return column.defaultValue !== null && column.defaultValue !== undefined;
}

function canSkipColumn(column) {
  if (!column.visible || column.generated) {
    return true;
  }

  if (isIntegerPrimaryKeyColumn(column)) {
    return true;
  }

  if (hasDefaultValue(column)) {
    return true;
  }

  return !column.notNull && Number(column.primaryKeyPosition ?? 0) === 0;
}

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function suggestGeneratorForColumn(column) {
  const name = normalizeName(column.name);
  const declaredType = String(column.declaredType ?? "").toUpperCase();
  const affinity = String(column.affinity ?? "").toUpperCase();

  if (!column.visible || column.generated || affinity === "BLOB") {
    return "skip";
  }

  if (isIntegerPrimaryKeyColumn(column)) {
    return "skip";
  }

  if ((column.allowedValues ?? []).length) {
    return "oneOf";
  }

  if (/(^|_)email$/.test(name) || name.includes("email_address")) {
    return "email";
  }

  if (/^(first_name|firstname|given_name)$/.test(name)) {
    return "firstName";
  }

  if (/^(last_name|lastname|family_name|surname)$/.test(name)) {
    return "lastName";
  }

  if (/^(name|full_name|display_name|contact_name)$/.test(name)) {
    return "name";
  }

  if (/^(username|user_name|login)$/.test(name)) {
    return "username";
  }

  if (/(^|_)(title|headline|subject)$/.test(name)) {
    return "title";
  }

  if (/(^|_)slug$/.test(name)) {
    return "slug";
  }

  if (/(^|_)(url|website|site|homepage)$/.test(name)) {
    return "url";
  }

  if (/(^|_)(uuid|guid)$/.test(name)) {
    return "uuid";
  }

  if (
    /(^is_|^has_|enabled$|active$|archived$|published$|deleted$|visible$)/.test(name) ||
    JSON.stringify(column.allowedValues ?? []) === JSON.stringify(["0", "1"])
  ) {
    return "boolean";
  }

  if (/(date|time|created_at|updated_at|timestamp)/.test(name) || /DATE|TIME/.test(declaredType)) {
    return "timestamp";
  }

  if (affinity === "INTEGER") {
    return "randomInteger";
  }

  if (affinity === "REAL" || affinity === "NUMERIC" || /DECIMAL|NUMERIC/.test(declaredType)) {
    return "randomDecimal";
  }

  if (affinity === "TEXT") {
    return "randomText";
  }

  return "skip";
}

function toFiniteNumber(value, fallback, label) {
  const number = value === "" || value === null || value === undefined ? fallback : Number(value);

  if (!Number.isFinite(number)) {
    throw new ValidationError(`${label} must be a number.`);
  }

  return number;
}

function toInteger(value, fallback, label) {
  const number = toFiniteNumber(value, fallback, label);

  if (!Number.isInteger(number)) {
    throw new ValidationError(`${label} must be an integer.`);
  }

  return number;
}

function normalizeCommaValues(value, fallback = []) {
  const source = String(value ?? "").trim();
  const values = source
    ? source
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : fallback.map((entry) => String(entry));

  if (!values.length) {
    throw new ValidationError("One Of needs at least one value.");
  }

  return values;
}

function normalizeTimestampOptions(options = {}) {
  const range = ["last30", "last365", "custom"].includes(options.range)
    ? options.range
    : "last30";

  if (range !== "custom") {
    return { range };
  }

  const from = options.from ? new Date(options.from) : null;
  const to = options.to ? new Date(options.to) : null;

  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    throw new ValidationError("Custom timestamp range must use valid date values.");
  }

  if (from && to && from.getTime() > to.getTime()) {
    throw new ValidationError("Custom timestamp range start must be before end.");
  }

  return {
    range,
    from: from ? from.toISOString() : null,
    to: to ? to.toISOString() : null,
  };
}

function normalizeGeneratorOptions(generator, column, options = {}) {
  switch (generator) {
    case "static":
      return { value: options.value ?? "" };
    case "randomInteger": {
      const min = toInteger(options.min, 1, "Integer min");
      const max = toInteger(options.max, 1000, "Integer max");

      if (min > max) {
        throw new ValidationError("Integer min must be less than or equal to max.");
      }

      return { min, max };
    }
    case "randomDecimal": {
      const min = toFiniteNumber(options.min, 0, "Decimal min");
      const max = toFiniteNumber(options.max, 1000, "Decimal max");
      const decimals = toInteger(options.decimals, 2, "Decimal places");

      if (min > max) {
        throw new ValidationError("Decimal min must be less than or equal to max.");
      }

      if (decimals < 0 || decimals > 8) {
        throw new ValidationError("Decimal places must be between 0 and 8.");
      }

      return { min, max, decimals };
    }
    case "boolean": {
      const trueProbability = toFiniteNumber(options.trueProbability, 50, "True probability");

      if (trueProbability < 0 || trueProbability > 100) {
        throw new ValidationError("True probability must be between 0 and 100.");
      }

      return { trueProbability };
    }
    case "timestamp":
      return normalizeTimestampOptions(options);
    case "oneOf":
      return { values: normalizeCommaValues(options.values, column.allowedValues ?? []) };
    default:
      return {};
  }
}

function normalizeMappings(tableDetail, mappings = []) {
  const candidateColumns = (tableDetail.columns ?? []).filter(
    (column) => column.visible && !column.generated
  );
  const columnsByName = new Map(candidateColumns.map((column) => [column.name, column]));
  const providedMappings = new Map();

  (Array.isArray(mappings) ? mappings : []).forEach((mapping) => {
    const columnName = String(mapping?.columnName ?? "");

    if (!columnsByName.has(columnName)) {
      throw new ValidationError(`Unknown generated data column: ${columnName || "(empty)"}.`);
    }

    providedMappings.set(columnName, mapping);
  });

  return candidateColumns.map((column) => {
    const provided = providedMappings.get(column.name) ?? {};
    const requestedGenerator = provided.generator ?? suggestGeneratorForColumn(column);
    const generator = GENERATOR_TYPES.has(requestedGenerator) ? requestedGenerator : null;

    if (!generator) {
      throw new ValidationError(`Unsupported generator for ${column.name}: ${requestedGenerator}.`);
    }

    if (generator === "skip" && !canSkipColumn(column)) {
      throw new ValidationError(
        `${column.name} is required and cannot be skipped without a default value.`
      );
    }

    return {
      column,
      columnName: column.name,
      generator,
      options: normalizeGeneratorOptions(generator, column, provided.options ?? {}),
    };
  });
}

function buildPerson(index) {
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
  const lastName = LAST_NAMES[(index * 3) % LAST_NAMES.length];

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
  };
}

function buildTitle() {
  const words = [randomItem(WORDS), randomItem(WORDS), randomItem(WORDS)];

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function buildTimestamp(options) {
  const now = Date.now();
  let from = now - 30 * 24 * 60 * 60 * 1000;
  let to = now;

  if (options.range === "last365") {
    from = now - 365 * 24 * 60 * 60 * 1000;
  } else if (options.range === "custom") {
    from = options.from ? new Date(options.from).getTime() : from;
    to = options.to ? new Date(options.to).getTime() : to;
  }

  const value = new Date(randomInteger(Math.floor(from), Math.floor(to)));

  return value.toISOString().slice(0, 19).replace("T", " ");
}

function generateValue(mapping, index) {
  const person = buildPerson(index);
  const serial = index + 1;

  switch (mapping.generator) {
    case "static":
      return mapping.options.value;
    case "randomText":
      return `${buildTitle()} ${randomItem(WORDS)} ${randomItem(WORDS)}.`;
    case "name":
      return person.fullName;
    case "firstName":
      return person.firstName;
    case "lastName":
      return person.lastName;
    case "email":
      return `${slugify(`${person.firstName}.${person.lastName}.${serial}`)}@example.test`;
    case "username":
      return slugify(`${person.firstName}${person.lastName}${serial}`).replace(/-/g, "");
    case "title":
      return buildTitle();
    case "slug":
      return `${slugify(buildTitle())}-${serial}`;
    case "url":
      return `https://example.com/${slugify(buildTitle())}-${serial}`;
    case "randomInteger":
      return randomInteger(mapping.options.min, mapping.options.max);
    case "randomDecimal": {
      const value = mapping.options.min + Math.random() * (mapping.options.max - mapping.options.min);

      return Number(value.toFixed(mapping.options.decimals));
    }
    case "boolean":
      return Math.random() * 100 < mapping.options.trueProbability ? 1 : 0;
    case "timestamp":
      return buildTimestamp(mapping.options);
    case "uuid":
      return randomUUID();
    case "oneOf":
      return randomItem(mapping.options.values);
    case "skip":
    default:
      return null;
  }
}

function buildSyntheticRows(tableDetail, payload = {}, options = {}) {
  const rowCount = normalizeRowCount(payload.rowCount);
  const limit = Number.isInteger(options.limit) ? Math.min(options.limit, rowCount) : rowCount;
  const mappings = normalizeMappings(tableDetail, payload.mappings);
  const columns = mappings.map((mapping) => mapping.columnName);
  const rows = Array.from({ length: limit }, (_value, index) =>
    Object.fromEntries(
      mappings.map((mapping) => [
        mapping.columnName,
        mapping.generator === "skip" ? null : generateValue(mapping, index),
      ])
    )
  );

  return {
    rowCount,
    previewRowCount: limit,
    columns,
    rows,
    mappings: mappings.map((mapping) => ({
      columnName: mapping.columnName,
      generator: mapping.generator,
      options: mapping.options,
    })),
  };
}

function insertSyntheticRows(db, tableDetail, payload = {}) {
  const rowCount = normalizeRowCount(payload.rowCount);
  const mappings = normalizeMappings(tableDetail, payload.mappings);
  const insertMappings = mappings.filter((mapping) => mapping.generator !== "skip");

  if (!insertMappings.length) {
    const insertDefault = db.prepare(
      ["INSERT INTO", quoteIdentifier(tableDetail.name), "DEFAULT VALUES"].join(" ")
    );
    const insertManyDefaults = db.transaction(() => {
      for (let index = 0; index < rowCount; index += 1) {
        insertDefault.run();
      }
    });

    insertManyDefaults();

    return {
      tableName: tableDetail.name,
      insertedRowCount: rowCount,
      columns: [],
    };
  }

  const columnNames = insertMappings.map((mapping) => mapping.columnName);
  const placeholders = columnNames.map(() => "?").join(", ");
  const statement = db.prepare(
    [
      "INSERT INTO",
      quoteIdentifier(tableDetail.name),
      `(${columnNames.map((columnName) => quoteIdentifier(columnName)).join(", ")})`,
      "VALUES",
      `(${placeholders})`,
    ].join(" ")
  );
  const insertMany = db.transaction(() => {
    for (let index = 0; index < rowCount; index += 1) {
      statement.run(insertMappings.map((mapping) => generateValue(mapping, index)));
    }
  });

  insertMany();

  return {
    tableName: tableDetail.name,
    insertedRowCount: rowCount,
    columns: columnNames,
  };
}

module.exports = {
  DEFAULT_ROW_COUNT,
  MAX_ROW_COUNT,
  PREVIEW_ROW_COUNT,
  buildSyntheticRows,
  insertSyntheticRows,
  isIntegerPrimaryKeyColumn,
  suggestGeneratorForColumn,
};
