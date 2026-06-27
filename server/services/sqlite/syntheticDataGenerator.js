const { randomUUID } = require("node:crypto");
const { ValidationError } = require("../../utils/errors");
const { quoteIdentifier } = require("../../utils/identifier");

const DEFAULT_ROW_COUNT = 100;
const MAX_ROW_COUNT = 10000;
const PREVIEW_ROW_COUNT = 3;
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
  "existingForeignKey",
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

function hasBooleanAllowedValues(column) {
  const values = (column.allowedValues ?? []).map((value) => String(value));
  const uniqueValues = new Set(values);

  return uniqueValues.size === 2 && uniqueValues.has("0") && uniqueValues.has("1");
}

function hasBooleanIntegerRange(column) {
  return Number(column.integerRange?.min) === 0 && Number(column.integerRange?.max) === 1;
}

function isBooleanLikeColumn(column, normalizedName) {
  return (
    /(^is_|^has_|enabled$|active$|archived$|published$|deleted$|visible$|boolean|bool)/.test(
      normalizedName
    ) ||
    hasBooleanAllowedValues(column) ||
    hasBooleanIntegerRange(column)
  );
}

function getForeignKeyInfo(tableDetail, columnName) {
  const foreignKeys = tableDetail?.foreignKeys ?? [];
  const singleColumnForeignKey = foreignKeys.find(
    (foreignKey) =>
      (foreignKey.mappings?.length ?? 0) === 1 && foreignKey.mappings?.[0]?.from === columnName
  );

  if (singleColumnForeignKey) {
    return {
      kind: "single",
      foreignKey: singleColumnForeignKey,
      mapping: singleColumnForeignKey.mappings[0],
    };
  }

  const compositeForeignKey = foreignKeys.find((foreignKey) =>
    (foreignKey.mappings ?? []).some((mapping) => mapping.from === columnName)
  );

  if (compositeForeignKey) {
    return {
      kind: "composite",
      foreignKey: compositeForeignKey,
      mapping: compositeForeignKey.mappings.find((mapping) => mapping.from === columnName) ?? null,
    };
  }

  return null;
}

function suggestGeneratorForColumn(column, tableDetail = null) {
  const name = normalizeName(column.name);
  const declaredType = String(column.declaredType ?? "").toUpperCase();
  const affinity = String(column.affinity ?? "").toUpperCase();

  if (!column.visible || column.generated || affinity === "BLOB") {
    return "skip";
  }

  if (isIntegerPrimaryKeyColumn(column)) {
    return "skip";
  }

  const foreignKeyInfo = getForeignKeyInfo(tableDetail, column.name);

  if (foreignKeyInfo?.kind === "single") {
    return "existingForeignKey";
  }

  if (foreignKeyInfo?.kind === "composite") {
    return "skip";
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

  if (isBooleanLikeColumn(column, name)) {
    return "boolean";
  }

  if ((column.allowedValues ?? []).length) {
    return "oneOf";
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

function normalizeIntegerRange(column = {}) {
  const min = Number(column.integerRange?.min);
  const max = Number(column.integerRange?.max);

  return {
    min: Number.isSafeInteger(min) ? min : null,
    max: Number.isSafeInteger(max) ? max : null,
  };
}

function getDefaultIntegerOptions(column = {}) {
  const range = normalizeIntegerRange(column);
  const min =
    range.min ??
    (range.max !== null && range.max < 1
      ? range.max - 999
      : 1);
  const max =
    range.max ??
    (range.min !== null && range.min > 1000
      ? range.min + 999
      : 1000);

  return {
    min,
    max,
    rangeMin: range.min,
    rangeMax: range.max,
  };
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

function normalizeExistingForeignKeyOptions(tableDetail, column) {
  const foreignKeyInfo = getForeignKeyInfo(tableDetail, column.name);

  if (foreignKeyInfo?.kind === "composite") {
    throw new ValidationError(
      `${column.name} is part of a composite foreign key. Synthetic FK generation supports single-column foreign keys only.`
    );
  }

  if (foreignKeyInfo?.kind !== "single") {
    throw new ValidationError(`${column.name} does not have a single-column foreign key.`);
  }

  return {
    referencedTable: foreignKeyInfo.foreignKey.referencedTable,
    referencedColumn: foreignKeyInfo.mapping.to,
  };
}

function normalizeGeneratorOptions(generator, column, options = {}, tableDetail = null) {
  switch (generator) {
    case "static":
      return { value: options.value ?? "" };
    case "randomInteger": {
      const defaults = getDefaultIntegerOptions(column);
      const min = toInteger(options.min, defaults.min, "Integer min");
      const max = toInteger(options.max, defaults.max, "Integer max");

      if (min > max) {
        throw new ValidationError("Integer min must be less than or equal to max.");
      }

      if (defaults.rangeMin !== null && min < defaults.rangeMin) {
        throw new ValidationError(`Integer min must be greater than or equal to ${defaults.rangeMin}.`);
      }

      if (defaults.rangeMax !== null && max > defaults.rangeMax) {
        throw new ValidationError(`Integer max must be less than or equal to ${defaults.rangeMax}.`);
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
    case "existingForeignKey":
      return normalizeExistingForeignKeyOptions(tableDetail, column);
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
    const requestedGenerator = provided.generator ?? suggestGeneratorForColumn(column, tableDetail);
    const generator = GENERATOR_TYPES.has(requestedGenerator) ? requestedGenerator : null;

    if (!generator) {
      throw new ValidationError(`Unsupported generator for ${column.name}: ${requestedGenerator}.`);
    }

    if (generator === "skip" && !canSkipColumn(column)) {
      if (getForeignKeyInfo(tableDetail, column.name)?.kind === "composite") {
        throw new ValidationError(
          `${column.name} is part of a composite foreign key. Synthetic FK generation supports single-column foreign keys only.`
        );
      }

      throw new ValidationError(
        `${column.name} is required and cannot be skipped without a default value.`
      );
    }

    return {
      column,
      columnName: column.name,
      generator,
      options: normalizeGeneratorOptions(generator, column, provided.options ?? {}, tableDetail),
    };
  });
}

function buildForeignKeyPoolKey(options) {
  return `${options.referencedTable}\u0000${options.referencedColumn}`;
}

function resolveForeignKeyPools(db, mappings) {
  const pools = new Map();
  const foreignKeyMappings = mappings.filter((mapping) => mapping.generator === "existingForeignKey");

  foreignKeyMappings.forEach((mapping) => {
    const poolKey = buildForeignKeyPoolKey(mapping.options);

    mapping.options.poolKey = poolKey;

    if (pools.has(poolKey)) {
      return;
    }

    const rows = db
      .prepare(
        [
          "SELECT DISTINCT",
          `${quoteIdentifier(mapping.options.referencedColumn)} AS value`,
          "FROM",
          quoteIdentifier(mapping.options.referencedTable),
          "WHERE",
          `${quoteIdentifier(mapping.options.referencedColumn)} IS NOT NULL`,
          "LIMIT 1000",
        ].join(" ")
      )
      .all();

    pools.set(poolKey, {
      values: rows.map((row) => row.value),
    });
  });

  foreignKeyMappings.forEach((mapping) => {
    const pool = pools.get(mapping.options.poolKey);

    if (!pool?.values?.length && mapping.column.notNull && !hasDefaultValue(mapping.column)) {
      throw new ValidationError(
        `${mapping.columnName} references ${mapping.options.referencedTable}.${mapping.options.referencedColumn}, but no parent values exist.`
      );
    }
  });

  return pools;
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

function generateValue(mapping, index, context = {}) {
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
    case "existingForeignKey": {
      const pool = context.foreignKeyPools?.get(mapping.options.poolKey);

      if (pool?.values?.length) {
        return randomItem(pool.values);
      }

      return null;
    }
    case "skip":
    default:
      return null;
  }
}

function serializeMappingOptions(options = {}) {
  const { poolKey, ...publicOptions } = options;

  return publicOptions;
}

function shouldInsertMapping(mapping, context = {}) {
  if (mapping.generator === "skip") {
    return false;
  }

  if (mapping.generator !== "existingForeignKey") {
    return true;
  }

  const pool = context.foreignKeyPools?.get(mapping.options.poolKey);

  return Boolean(pool?.values?.length) || !hasDefaultValue(mapping.column);
}

function buildSyntheticRows(db, tableDetail, payload = {}, options = {}) {
  const rowCount = normalizeRowCount(payload.rowCount);
  const limit = Number.isInteger(options.limit) ? Math.min(options.limit, rowCount) : rowCount;
  const mappings = normalizeMappings(tableDetail, payload.mappings);
  const foreignKeyPools = resolveForeignKeyPools(db, mappings);
  const context = { foreignKeyPools };
  const columns = mappings.map((mapping) => mapping.columnName);
  const rows = Array.from({ length: limit }, (_value, index) =>
    Object.fromEntries(
      mappings.map((mapping) => [
        mapping.columnName,
        shouldInsertMapping(mapping, context) ? generateValue(mapping, index, context) : null,
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
      options: serializeMappingOptions(mapping.options),
    })),
  };
}

function insertSyntheticRows(db, tableDetail, payload = {}) {
  const rowCount = normalizeRowCount(payload.rowCount);
  const mappings = normalizeMappings(tableDetail, payload.mappings);
  const foreignKeyPools = resolveForeignKeyPools(db, mappings);
  const context = { foreignKeyPools };
  const insertMappings = mappings.filter((mapping) => shouldInsertMapping(mapping, context));

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
      statement.run(insertMappings.map((mapping) => generateValue(mapping, index, context)));
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
