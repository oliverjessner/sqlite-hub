const { quoteIdentifier } = require("../../utils/identifier");
const { getTableDetail } = require("./introspection");

/**
 * @typedef {"info" | "warning" | "critical"} TableAdvisorSeverity
 * @typedef {"schema" | "constraints" | "performance" | "data-quality" | "documentation"} TableAdvisorCategory
 * @typedef {"low" | "medium" | "high"} TableAdvisorRisk
 *
 * @typedef {Object} ColumnProfile
 * @property {string} name
 * @property {string} type
 * @property {boolean} notNull
 * @property {string | null} defaultValue
 * @property {boolean} primaryKey
 * @property {number} nullCount
 * @property {number} emptyStringCount
 * @property {number} distinctCount
 * @property {number} totalCount
 * @property {{ value: string | number | null, count: number }[]} topValues
 * @property {string | number | null} [minValue]
 * @property {string | number | null} [maxValue]
 *
 * @typedef {Object} TableAdvisorIssue
 * @property {string} id
 * @property {TableAdvisorSeverity} severity
 * @property {TableAdvisorCategory} category
 * @property {string} title
 * @property {string} explanation
 * @property {string} [evidence]
 * @property {string} recommendation
 * @property {string} [sql]
 * @property {TableAdvisorRisk} risk
 *
 * @typedef {Object} TableAdvisorResult
 * @property {string} tableName
 * @property {number} score
 * @property {TableAdvisorIssue[]} issues
 * @property {string} analyzedAt
 * @property {number} [issueCount]
 * @property {number} [rowCount]
 * @property {ColumnProfile[]} [columnProfiles]
 * @property {{ columnCount: number, indexCount: number, foreignKeyCount: number }} [table]
 */

const LIKELY_UNIQUE_COLUMNS = new Set([
  "email",
  "slug",
  "uuid",
  "username",
  "handle",
  "external_id",
  "externalid",
]);

const ENUM_LIKE_COLUMNS = new Set([
  "status",
  "state",
  "type",
  "kind",
  "category",
]);

const GENERIC_COLUMN_NAMES = new Set([
  "data",
  "value",
  "text",
  "temp",
  "misc",
  "payload",
  "json",
  "field1",
  "field2",
]);

const CREATED_AT_COLUMNS = new Set(["created_at", "createdat", "inserted_at", "created"]);
const UPDATED_AT_COLUMNS = new Set(["updated_at", "updatedat"]);
const LARGE_TABLE_DUPLICATE_CHECK_LIMIT = 100000;

function normalizeColumnName(name) {
  return String(name ?? "").trim().toLowerCase();
}

function normalizeIdentifierPart(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "column";
}

function escapeSqlString(value) {
  return String(value ?? "").replaceAll("'", "''");
}

function isSimpleSqlIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value ?? ""));
}

function formatColumnDefinitionName(columnName) {
  return isSimpleSqlIdentifier(columnName) ? columnName : quoteIdentifier(columnName);
}

function getColumnSqlType(column) {
  return column.declaredType || column.affinity || "ANY";
}

function getProfileType(column) {
  return column.declaredType || column.affinity || "ANY";
}

function isPrimaryKey(column) {
  return Number(column.primaryKeyPosition ?? 0) > 0;
}

function isTextLikeColumn(column) {
  const type = getColumnSqlType(column).toUpperCase();
  return column.affinity === "TEXT" || /CHAR|CLOB|TEXT|VARCHAR|STRING|JSON/i.test(type);
}

function isNumericLikeColumn(column) {
  return ["INTEGER", "REAL", "NUMERIC"].includes(column.affinity);
}

function isDateLikeColumn(column) {
  const name = normalizeColumnName(column.name);
  const type = getColumnSqlType(column).toUpperCase();

  return (
    /DATE|TIME/i.test(type) ||
    name.endsWith("_at") ||
    name.endsWith("at") ||
    name.includes("date") ||
    name.includes("time")
  );
}

function isLikelyUniqueColumn(column) {
  return LIKELY_UNIQUE_COLUMNS.has(normalizeColumnName(column.name));
}

function isEnumLikeColumn(column) {
  return ENUM_LIKE_COLUMNS.has(normalizeColumnName(column.name));
}

function isGenericColumnName(column) {
  return GENERIC_COLUMN_NAMES.has(normalizeColumnName(column.name));
}

function isCreatedAtColumn(column) {
  return CREATED_AT_COLUMNS.has(normalizeColumnName(column.name));
}

function isUpdatedAtColumn(column) {
  return UPDATED_AT_COLUMNS.has(normalizeColumnName(column.name));
}

function isForeignKeyLikeColumn(column) {
  const name = String(column.name ?? "");

  return !isPrimaryKey(column) && (name.endsWith("_id") || /Id$/.test(name));
}

function hasCurrentTimestampDefault(defaultValue) {
  return /\bCURRENT_TIMESTAMP\b|\bCURRENT_DATE\b|\bdatetime\s*\(/i.test(String(defaultValue ?? ""));
}

function hasExactUniqueIndex(tableDetail, columnName) {
  return (tableDetail.indexes ?? []).some((index) => {
    if (!index.unique || index.partial) {
      return false;
    }

    const columns = (index.columns ?? [])
      .filter((column) => column.name)
      .map((column) => column.name);

    return columns.length === 1 && columns[0] === columnName;
  });
}

function hasIndexOnColumn(tableDetail, columnName) {
  return (tableDetail.indexes ?? []).some((index) => {
    const columns = (index.columns ?? [])
      .filter((column) => column.name)
      .map((column) => column.name);

    return columns[0] === columnName;
  });
}

function hasForeignKeyOnColumn(tableDetail, columnName) {
  return (tableDetail.foreignKeys ?? []).some((foreignKey) =>
    (foreignKey.mappings ?? []).some((mapping) => mapping.from === columnName)
  );
}

function countRows(db, tableName, whereClause = "", params = []) {
  const sql = [
    "SELECT COUNT(*) AS count FROM",
    quoteIdentifier(tableName),
    whereClause ? `WHERE ${whereClause}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return Number(db.prepare(sql).get(...params)?.count ?? 0);
}

function getDistinctCount(db, tableName, columnName) {
  const sql = [
    "SELECT COUNT(DISTINCT",
    quoteIdentifier(columnName),
    ") AS count FROM",
    quoteIdentifier(tableName),
  ].join(" ");

  return Number(db.prepare(sql).get()?.count ?? 0);
}

function normalizeProfileValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return `BLOB ${value.length} bytes`;
  }

  return String(value);
}

function getTopValues(db, tableName, columnName) {
  const columnSql = quoteIdentifier(columnName);
  const sql = [
    "SELECT",
    columnSql,
    "AS value, COUNT(*) AS count FROM",
    quoteIdentifier(tableName),
    "GROUP BY",
    columnSql,
    "ORDER BY count DESC LIMIT 10",
  ].join(" ");

  return db.prepare(sql).all().map((row) => ({
    value: normalizeProfileValue(row.value),
    count: Number(row.count ?? 0),
  }));
}

function getMinMax(db, tableName, columnName) {
  const columnSql = quoteIdentifier(columnName);
  const row = db
    .prepare(
      [
        "SELECT MIN(",
        columnSql,
        ") AS minValue, MAX(",
        columnSql,
        ") AS maxValue FROM",
        quoteIdentifier(tableName),
      ].join(" ")
    )
    .get();

  return {
    minValue: normalizeProfileValue(row?.minValue),
    maxValue: normalizeProfileValue(row?.maxValue),
  };
}

function getDuplicateValues(db, tableName, columnName) {
  const columnSql = quoteIdentifier(columnName);
  const sql = [
    "SELECT",
    columnSql,
    "AS value, COUNT(*) AS count FROM",
    quoteIdentifier(tableName),
    "WHERE",
    columnSql,
    "IS NOT NULL",
    "GROUP BY",
    columnSql,
    "HAVING COUNT(*) > 1",
    "ORDER BY count DESC LIMIT 10",
  ].join(" ");

  return db.prepare(sql).all().map((row) => ({
    value: normalizeProfileValue(row.value),
    count: Number(row.count ?? 0),
  }));
}

function profileColumn(db, tableDetail, column) {
  const tableName = tableDetail.name;
  const columnSql = quoteIdentifier(column.name);
  const profile = {
    name: column.name,
    type: getProfileType(column),
    affinity: column.affinity,
    notNull: Boolean(column.notNull),
    defaultValue: column.defaultValue ?? null,
    primaryKey: isPrimaryKey(column),
    nullCount: countRows(db, tableName, `${columnSql} IS NULL`),
    emptyStringCount: 0,
    distinctCount: getDistinctCount(db, tableName, column.name),
    totalCount: Number(tableDetail.rowCount ?? 0),
    topValues: getTopValues(db, tableName, column.name),
    duplicateValues: [],
  };

  if (isTextLikeColumn(column)) {
    profile.emptyStringCount = countRows(
      db,
      tableName,
      `${columnSql} IS NOT NULL AND TRIM(CAST(${columnSql} AS TEXT)) = ''`
    );
  }

  if (isNumericLikeColumn(column) || isDateLikeColumn(column)) {
    const range = getMinMax(db, tableName, column.name);
    profile.minValue = range.minValue;
    profile.maxValue = range.maxValue;
  }

  if (
    isLikelyUniqueColumn(column) &&
    Number(tableDetail.rowCount ?? 0) <= LARGE_TABLE_DUPLICATE_CHECK_LIMIT
  ) {
    profile.duplicateValues = getDuplicateValues(db, tableName, column.name);
  }

  return profile;
}

function profileTable(db, tableDetail) {
  return (tableDetail.columns ?? [])
    .filter((column) => column.visible && !column.generated)
    .map((column) => profileColumn(db, tableDetail, column));
}

function formatEvidenceValue(value) {
  if (value === null) {
    return "NULL";
  }

  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatTopValueList(values = []) {
  return values
    .slice(0, 5)
    .map((item) => `${formatEvidenceValue(item.value)} (${item.count})`)
    .join(", ");
}

function buildIndexName(tableName, columnName, suffix = "") {
  return normalizeIdentifierPart(["idx", tableName, columnName, suffix].filter(Boolean).join("_"));
}

function buildCreateIndexSql({ tableName, columnName, unique = false }) {
  const indexName = buildIndexName(tableName, columnName, unique ? "unique" : "");
  const createKeyword = unique ? "CREATE UNIQUE INDEX" : "CREATE INDEX";

  return `${createKeyword} IF NOT EXISTS ${quoteIdentifier(indexName)} ON ${quoteIdentifier(tableName)}(${quoteIdentifier(columnName)});`;
}

function buildCreatedAtColumnSql(column) {
  return `${formatColumnDefinitionName(column.name)} TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`;
}

function formatSqlLiteral(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return `'${escapeSqlString(value)}'`;
}

function buildCheckColumnSql(column, values = []) {
  const name = formatColumnDefinitionName(column.name);
  const valueList = values.map((value) => formatSqlLiteral(value)).join(", ");

  return `${name} ${getColumnSqlType(column)} CHECK(${name} IN (${valueList}))`;
}

function buildEmptyStringCleanupSql(tableName, columnName) {
  const columnSql = quoteIdentifier(columnName);

  return `UPDATE ${quoteIdentifier(tableName)} SET ${columnSql} = NULL WHERE TRIM(CAST(${columnSql} AS TEXT)) = '';`;
}

function buildUpdatedAtTriggerSql(tableDetail, columnName) {
  const triggerName = normalizeIdentifierPart(["trg", tableDetail.name, columnName].join("_"));
  const columnSql = quoteIdentifier(columnName);
  let whereClause = "";

  if (tableDetail.identityStrategy?.type === "primaryKey") {
    whereClause = tableDetail.identityStrategy.columns
      .map((primaryKeyColumn) => {
        const quoted = quoteIdentifier(primaryKeyColumn);
        return `${quoted} IS NEW.${quoted}`;
      })
      .join(" AND ");
  } else if (tableDetail.identityStrategy?.type === "rowid") {
    whereClause = "rowid = NEW.rowid";
  }

  if (!whereClause) {
    return null;
  }

  return [
    `CREATE TRIGGER IF NOT EXISTS ${quoteIdentifier(triggerName)}`,
    `AFTER UPDATE ON ${quoteIdentifier(tableDetail.name)}`,
    "FOR EACH ROW",
    `WHEN OLD.${columnSql} IS NEW.${columnSql}`,
    "BEGIN",
    `  UPDATE ${quoteIdentifier(tableDetail.name)}`,
    `  SET ${columnSql} = CURRENT_TIMESTAMP`,
    `  WHERE ${whereClause};`,
    "END;",
  ].join("\n");
}

function makeIssue(issue) {
  return { ...issue };
}

function getProfile(columnProfiles, columnName) {
  return columnProfiles.find((profile) => profile.name === columnName);
}

function generateMissingPrimaryKeyIssue(tableDetail) {
  const hasPrimaryKey = (tableDetail.columns ?? []).some((column) => isPrimaryKey(column));

  if (hasPrimaryKey) {
    return null;
  }

  return makeIssue({
    id: "schema:missing-primary-key",
    severity: "critical",
    category: "schema",
    title: "Table has no primary key",
    explanation:
      "Rows in this table are not uniquely identifiable. This can make updates, relations, exports and synchronization harder.",
    evidence: `Table ${tableDetail.name} has 0 primary key columns.`,
    recommendation: "Add an INTEGER PRIMARY KEY column if this table stores entities.",
    risk: "high",
  });
}

function generateColumnIssues(tableDetail, columnProfiles) {
  const issues = [];
  const rowCount = Number(tableDetail.rowCount ?? 0);

  (tableDetail.columns ?? [])
    .filter((column) => column.visible && !column.generated)
    .forEach((column) => {
      const profile = getProfile(columnProfiles, column.name);

      if (!profile) {
        return;
      }

      const nonNullCount = Math.max(0, rowCount - profile.nullCount);
      const nullRatio = rowCount > 0 ? profile.nullCount / rowCount : 0;
      const duplicateValues = profile.duplicateValues ?? [];

      if (isCreatedAtColumn(column) && !hasCurrentTimestampDefault(column.defaultValue)) {
        issues.push(
          makeIssue({
            id: `schema:${column.name}:missing-created-default`,
            severity: "warning",
            category: "schema",
            title: `${column.name} has no timestamp default`,
            explanation:
              "Creation timestamp columns are more reliable when SQLite assigns the value consistently at insert time.",
            evidence: `${column.name} default is ${column.defaultValue ?? "NULL"}.`,
            recommendation: "Use DEFAULT CURRENT_TIMESTAMP when rebuilding or adding this column.",
            sql: buildCreatedAtColumnSql(column),
            risk: "medium",
          })
        );
      }

      if (isUpdatedAtColumn(column)) {
        const triggerSql = buildUpdatedAtTriggerSql(tableDetail, column.name);

        issues.push(
          makeIssue({
            id: `schema:${column.name}:updated-at-maintenance`,
            severity: "info",
            category: "schema",
            title: `${column.name} needs maintenance logic`,
            explanation:
              "SQLite does not update timestamp columns automatically. Use application logic or a trigger if this column should track changes.",
            evidence: `${column.name} exists on ${tableDetail.name}.`,
            recommendation: "Verify writes always refresh this column before relying on it for recency.",
            ...(triggerSql ? { sql: triggerSql } : {}),
            risk: "medium",
          })
        );
      }

      if (isLikelyUniqueColumn(column) && duplicateValues.length) {
        const duplicateRows = duplicateValues.reduce((total, item) => total + Number(item.count ?? 0), 0);
        issues.push(
          makeIssue({
            id: `data-quality:${column.name}:duplicate-values`,
            severity: duplicateRows > Math.max(10, rowCount * 0.05) ? "critical" : "warning",
            category: "data-quality",
            title: `${column.name} contains duplicates`,
            explanation:
              "This column looks like a natural identifier, but duplicate values would make a UNIQUE constraint fail.",
            evidence: `Duplicate examples: ${formatTopValueList(duplicateValues)}.`,
            recommendation: "Resolve duplicate values before adding a UNIQUE index.",
            risk: "medium",
          })
        );
      } else if (
        isLikelyUniqueColumn(column) &&
        rowCount > 0 &&
        nonNullCount > 0 &&
        nullRatio <= 0.02 &&
        profile.distinctCount === nonNullCount &&
        !hasExactUniqueIndex(tableDetail, column.name)
      ) {
        issues.push(
          makeIssue({
            id: `constraints:${column.name}:missing-unique-index`,
            severity: "warning",
            category: "constraints",
            title: `${column.name} looks unique but is not enforced`,
            explanation:
              "The sampled profile shows unique non-null values, but no single-column UNIQUE index enforces that expectation.",
            evidence: `${formatTopValueList(profile.topValues)}. Distinct non-null values: ${profile.distinctCount}/${nonNullCount}.`,
            recommendation: "Add a UNIQUE index after verifying the column is meant to be unique.",
            sql: buildCreateIndexSql({
              tableName: tableDetail.name,
              columnName: column.name,
              unique: true,
            }),
            risk: "medium",
          })
        );
      }

      if (
        isEnumLikeColumn(column) &&
        rowCount > 0 &&
        profile.distinctCount >= 2 &&
        profile.distinctCount <= 10 &&
        !(column.allowedValues ?? []).length
      ) {
        const values = (profile.topValues ?? [])
          .map((item) => item.value)
          .filter((value) => value !== null && value !== undefined)
          .slice(0, 10);

        if (values.length >= 2) {
          issues.push(
            makeIssue({
              id: `constraints:${column.name}:check-constraint`,
              severity: "info",
              category: "constraints",
              title: `${column.name} has enum-like values`,
              explanation:
                "The column uses a small set of values. A CHECK constraint can document and enforce the allowed set, but SQLite cannot add it to an existing column without a rebuild.",
              evidence: `Observed values: ${formatTopValueList(profile.topValues)}.`,
              recommendation: "Consider a CHECK constraint in the next schema rebuild.",
              sql: buildCheckColumnSql(column, values),
              risk: "high",
            })
          );
        }
      }

      if (rowCount > 0 && nullRatio > 0.5) {
        issues.push(
          makeIssue({
            id: `data-quality:${column.name}:mostly-null`,
            severity: "info",
            category: "data-quality",
            title: `${column.name} is mostly NULL`,
            explanation: "Mostly-empty columns can be valid, but they often indicate optional data that should be reviewed.",
            evidence: `${profile.nullCount}/${rowCount} rows are NULL.`,
            recommendation: "Confirm this column is still useful or split optional data into a related table.",
            risk: "low",
          })
        );
      }

      if (!column.notNull && !isPrimaryKey(column) && rowCount >= 10 && profile.nullCount === 0) {
        issues.push(
          makeIssue({
            id: `constraints:${column.name}:nullable-required`,
            severity: "info",
            category: "constraints",
            title: `${column.name} is nullable but currently always filled`,
            explanation:
              "The data profile suggests the column may be required even though the schema allows NULL.",
            evidence: `0/${rowCount} rows are NULL.`,
            recommendation: "Consider NOT NULL in a future table rebuild if this is a real requirement.",
            risk: "high",
          })
        );
      }

      if (profile.emptyStringCount > 0) {
        issues.push(
          makeIssue({
            id: `data-quality:${column.name}:empty-strings`,
            severity: "warning",
            category: "data-quality",
            title: `${column.name} contains empty strings`,
            explanation:
              "Empty strings and NULL values can represent different states. Mixing both often makes filtering and validation harder.",
            evidence: `${profile.emptyStringCount}/${rowCount} rows are empty strings.`,
            recommendation:
              "Normalize empty strings to NULL or enforce a NOT NULL plus CHECK(length(trim(column)) > 0) rule.",
            sql: buildEmptyStringCleanupSql(tableDetail.name, column.name),
            risk: "medium",
          })
        );
      }

      if (isForeignKeyLikeColumn(column) && !hasForeignKeyOnColumn(tableDetail, column.name)) {
        issues.push(
          makeIssue({
            id: `schema:${column.name}:missing-foreign-key`,
            severity: "warning",
            category: "schema",
            title: `${column.name} looks like a foreign key`,
            explanation:
              "The column name follows an id-reference pattern, but the schema has no FOREIGN KEY constraint for it.",
            evidence: `${column.name} has no foreign_key_list entry.`,
            recommendation: "Add a FOREIGN KEY in a table rebuild if this column references another table.",
            risk: "high",
          })
        );
      }

      if (isForeignKeyLikeColumn(column) && !hasIndexOnColumn(tableDetail, column.name)) {
        issues.push(
          makeIssue({
            id: `performance:${column.name}:missing-index`,
            severity: "warning",
            category: "performance",
            title: `${column.name} is not indexed`,
            explanation:
              "Foreign-key-like columns are commonly used in joins and filters. An index usually improves those lookups.",
            evidence: `No index starts with ${column.name}.`,
            recommendation: "Add an index if queries join or filter by this column.",
            sql: buildCreateIndexSql({
              tableName: tableDetail.name,
              columnName: column.name,
            }),
            risk: "low",
          })
        );
      }

      if (isGenericColumnName(column)) {
        issues.push(
          makeIssue({
            id: `documentation:${column.name}:generic-name`,
            severity: "info",
            category: "documentation",
            title: `${column.name} is a generic column name`,
            explanation:
              "Generic column names hide intent and make downstream queries harder to understand.",
            evidence: `${column.name} is in the generic-name list.`,
            recommendation: "Rename or document the column purpose in the next schema cleanup.",
            risk: "medium",
          })
        );
      }
    });

  return issues;
}

function generateLargeTableIndexIssue(tableDetail) {
  const rowCount = Number(tableDetail.rowCount ?? 0);
  const secondaryIndexes = (tableDetail.indexes ?? []).filter((index) => index.origin !== "pk");

  if (rowCount <= 1000 || secondaryIndexes.length > 0) {
    return null;
  }

  return makeIssue({
    id: "performance:large-table-without-indexes",
    severity: "warning",
    category: "performance",
    title: "Large table has no secondary indexes",
    explanation:
      "Tables with more than 1,000 rows often need indexes on frequent filter and join columns.",
    evidence: `${tableDetail.name} has ${rowCount} rows and no secondary indexes.`,
    recommendation: "Review common queries and add indexes for WHERE, JOIN, and ORDER BY columns.",
    risk: "low",
  });
}

function generateTableAdvisorIssues(tableDetail, columnProfiles) {
  return [
    generateMissingPrimaryKeyIssue(tableDetail),
    ...generateColumnIssues(tableDetail, columnProfiles),
    generateLargeTableIndexIssue(tableDetail),
  ].filter(Boolean);
}

function calculateScore(issues = []) {
  const penalties = {
    critical: 20,
    warning: 8,
    info: 2,
  };
  const score = issues.reduce((currentScore, issue) => {
    return currentScore - (penalties[issue.severity] ?? 0);
  }, 100);

  return Math.max(0, Math.min(100, score));
}

function sortIssues(issues = []) {
  const severityOrder = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return [...issues].sort((left, right) => {
    const severityDelta = severityOrder[left.severity] - severityOrder[right.severity];

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return String(left.id).localeCompare(String(right.id));
  });
}

function analyzeTable(db, tableName) {
  const tableDetail = getTableDetail(db, tableName);
  const columnProfiles = profileTable(db, tableDetail);
  const issues = sortIssues(generateTableAdvisorIssues(tableDetail, columnProfiles));

  return {
    tableName: tableDetail.name,
    score: calculateScore(issues),
    issueCount: issues.length,
    rowCount: Number(tableDetail.rowCount ?? 0),
    tableKind: tableDetail.tableKind,
    isVirtual: Boolean(tableDetail.isVirtual),
    isShadow: Boolean(tableDetail.isShadow),
    issues,
    columnProfiles,
    table: {
      columnCount: (tableDetail.columns ?? []).filter((column) => column.visible && !column.generated).length,
      indexCount: (tableDetail.indexes ?? []).length,
      foreignKeyCount: (tableDetail.foreignKeys ?? []).length,
      tableKind: tableDetail.tableKind,
      isVirtual: Boolean(tableDetail.isVirtual),
      isShadow: Boolean(tableDetail.isShadow),
    },
    analyzedAt: new Date().toISOString(),
  };
}

class TableAdvisorService {
  analyzeTable(db, tableName) {
    return analyzeTable(db, tableName);
  }
}

module.exports = {
  TableAdvisorService,
  analyzeTable,
  calculateScore,
  generateTableAdvisorIssues,
  profileTable,
  quoteIdentifier,
};
