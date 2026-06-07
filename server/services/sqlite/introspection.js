const {
  NotFoundError,
  ValidationError,
  mapSqliteError,
} = require("../../utils/errors");
const { quoteIdentifier } = require("../../utils/identifier");
const { normalizeDeclaredType } = require("../../utils/sqliteTypes");

function getTableListMap(db) {
  try {
    const rows = db.prepare("PRAGMA table_list").all();
    return new Map(
      rows
        .filter((row) => row.schema === "main")
        .map((row) => [row.name, row])
    );
  } catch (error) {
    return new Map();
  }
}

function getMasterEntry(db, type, name) {
  const entry = db
    .prepare(
      "SELECT type, name, tbl_name AS tableName, sql FROM sqlite_master WHERE type = ? AND name = ?"
    )
    .get(type, name);

  if (!entry) {
    throw new NotFoundError(`${type} not found: ${name}`);
  }

  return entry;
}

function getRawStructureEntries(db) {
  return db
    .prepare(
      [
        "SELECT type, name, tbl_name AS tableName, sql",
        "FROM sqlite_master",
        "WHERE name NOT LIKE 'sqlite_%'",
        "ORDER BY type ASC, name ASC",
      ].join(" ")
    )
    .all();
}

function normalizeColumn(column, visibleSet) {
  const typeMeta = normalizeDeclaredType(column.type);
  const hiddenValue = Number(column.hidden ?? 0);

  return {
    cid: column.cid,
    name: column.name,
    declaredType: typeMeta.declaredType,
    affinity: typeMeta.affinity,
    notNull: Boolean(column.notnull),
    defaultValue: column.dflt_value,
    primaryKeyPosition: Number(column.pk ?? 0),
    hidden: hiddenValue,
    visible: visibleSet.has(column.name),
    generated: hiddenValue === 2 || hiddenValue === 3,
  };
}

function isIdentifierCharacter(character) {
  return /[A-Za-z0-9_$]/.test(character);
}

function skipQuotedSql(text, index) {
  const quote = text[index];
  let cursor = index + 1;

  while (cursor < text.length) {
    if (text[cursor] === quote) {
      if (text[cursor + 1] === quote) {
        cursor += 2;
        continue;
      }

      return cursor + 1;
    }

    cursor += 1;
  }

  return text.length;
}

function findMatchingParenthesis(text, openIndex) {
  let depth = 0;

  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];

    if (character === "'" || character === '"' || character === "`") {
      index = skipQuotedSql(text, index) - 1;
      continue;
    }

    if (character === "[") {
      const closeIndex = text.indexOf("]", index + 1);
      index = closeIndex === -1 ? text.length : closeIndex;
      continue;
    }

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character === ")") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractCheckExpressions(ddl = "") {
  const expressions = [];
  const checkPattern = /\bCHECK\s*\(/gi;
  let match;

  while ((match = checkPattern.exec(ddl))) {
    const openIndex = ddl.indexOf("(", match.index);
    const closeIndex = findMatchingParenthesis(ddl, openIndex);

    if (closeIndex === -1) {
      continue;
    }

    expressions.push(ddl.slice(openIndex + 1, closeIndex));
    checkPattern.lastIndex = closeIndex + 1;
  }

  return expressions;
}

function normalizeIdentifier(value) {
  const text = String(value ?? "").trim();

  if (text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/""/g, '"').toLowerCase();
  }

  if (text.startsWith("`") && text.endsWith("`")) {
    return text.slice(1, -1).replace(/``/g, "`").toLowerCase();
  }

  if (text.startsWith("[") && text.endsWith("]")) {
    return text.slice(1, -1).replace(/\]\]/g, "]").toLowerCase();
  }

  return text.toLowerCase();
}

function parseSqlStringList(text = "") {
  const values = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] !== "'") {
      index += 1;
      continue;
    }

    let value = "";
    index += 1;

    while (index < text.length) {
      if (text[index] === "'") {
        if (text[index + 1] === "'") {
          value += "'";
          index += 2;
          continue;
        }

        index += 1;
        values.push(value);
        break;
      }

      value += text[index];
      index += 1;
    }
  }

  return values;
}

function findColumnInListExpression(expression, columnName) {
  const normalizedColumnName = normalizeIdentifier(columnName);
  const identifierPattern = /(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_$]*)\s+IN\s*\(/gi;
  let match;

  while ((match = identifierPattern.exec(expression))) {
    const matchedIdentifier = match[0].replace(/\s+IN\s*\($/i, "").trim();

    if (normalizeIdentifier(matchedIdentifier) !== normalizedColumnName) {
      continue;
    }

    const before = expression[match.index - 1] ?? "";

    if (before && isIdentifierCharacter(before)) {
      continue;
    }

    const openIndex = expression.indexOf("(", match.index + matchedIdentifier.length);
    const closeIndex = findMatchingParenthesis(expression, openIndex);

    if (closeIndex === -1) {
      continue;
    }

    const values = parseSqlStringList(expression.slice(openIndex + 1, closeIndex));

    if (values.length) {
      return values;
    }
  }

  return [];
}

function parseCheckAllowedValues(ddl = "", columns = []) {
  const allowedValuesByColumn = new Map();
  const expressions = extractCheckExpressions(ddl);

  columns.forEach((column) => {
    const values = [];
    const seen = new Set();

    expressions.forEach((expression) => {
      findColumnInListExpression(expression, column.name).forEach((value) => {
        if (seen.has(value)) {
          return;
        }

        seen.add(value);
        values.push(value);
      });
    });

    if (values.length) {
      allowedValuesByColumn.set(column.name, values);
    }
  });

  return allowedValuesByColumn;
}

function groupForeignKeys(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    if (!grouped.has(row.id)) {
      grouped.set(row.id, {
        id: row.id,
        referencedTable: row.table,
        onUpdate: row.on_update,
        onDelete: row.on_delete,
        match: row.match,
        mappings: [],
      });
    }

    grouped.get(row.id).mappings.push({
      sequence: row.seq,
      from: row.from,
      to: row.to,
    });
  });

  return Array.from(grouped.values());
}

function safeCountRows(db, tableName) {
  try {
    const row = db
      .prepare(["SELECT COUNT(*) AS count FROM", quoteIdentifier(tableName)].join(" "))
      .get();
    return row?.count ?? 0;
  } catch (error) {
    return null;
  }
}

function resolveIdentityStrategy(tableDetail) {
  const primaryKeyColumns = tableDetail.columns
    .filter((column) => column.primaryKeyPosition > 0)
    .sort((left, right) => left.primaryKeyPosition - right.primaryKeyPosition);

  if (primaryKeyColumns.length > 0) {
    return {
      type: "primaryKey",
      columns: primaryKeyColumns.map((column) => column.name),
      composite: primaryKeyColumns.length > 1,
    };
  }

  if (!tableDetail.withoutRowId) {
    return {
      type: "rowid",
      columns: ["rowid"],
      composite: false,
    };
  }

  return {
    type: "none",
    columns: [],
    composite: false,
  };
}

function getTableDetail(db, tableName, options = {}) {
  const entry = getMasterEntry(db, "table", tableName);
  const tableList = getTableListMap(db);
  const tableListEntry = tableList.get(tableName);
  const tableInfo = db
    .prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .all();
  const extendedInfo = db
    .prepare(`PRAGMA table_xinfo(${quoteIdentifier(tableName)})`)
    .all();
  const visibleSet = new Set(tableInfo.map((column) => column.name));

  let columns = extendedInfo
    .map((column) => normalizeColumn(column, visibleSet))
    .sort((left, right) => left.cid - right.cid);
  const allowedValuesByColumn = parseCheckAllowedValues(entry.sql, columns);

  columns = columns.map((column) => ({
    ...column,
    allowedValues: allowedValuesByColumn.get(column.name) ?? [],
  }));

  const foreignKeys = groupForeignKeys(
    db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`).all()
  );
  const checkConstraints = extractCheckExpressions(entry.sql).map((expression, index) => ({
    id: index,
    expression: expression.trim(),
  }));

  const indexList = db
    .prepare(`PRAGMA index_list(${quoteIdentifier(tableName)})`)
    .all()
    .map((indexEntry) => {
      let indexColumns = [];
      const indexSql =
        db
          .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?")
          .get(indexEntry.name)?.sql ?? null;

      try {
        indexColumns = db
          .prepare(`PRAGMA index_xinfo(${quoteIdentifier(indexEntry.name)})`)
          .all()
          .filter((row) => row.key === 1)
          .map((row) => ({
            sequence: row.seqno,
            cid: row.cid,
            name: row.name,
            descending: Boolean(row.desc),
            collation: row.coll,
          }));
      } catch (error) {
        indexColumns = db
          .prepare(`PRAGMA index_info(${quoteIdentifier(indexEntry.name)})`)
          .all()
          .map((row) => ({
            sequence: row.seqno,
            cid: row.cid,
            name: row.name,
          }));
      }

      return {
        name: indexEntry.name,
        unique: Boolean(indexEntry.unique),
        origin: indexEntry.origin,
        partial: Boolean(indexEntry.partial),
        sql: indexSql,
        columns: indexColumns,
      };
    });

  const triggers = db
    .prepare(
      "SELECT name, tbl_name AS tableName, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? ORDER BY name ASC"
    )
    .all(tableName);

  const withoutRowId =
    typeof tableListEntry?.wr === "number"
      ? Boolean(tableListEntry.wr)
      : /WITHOUT\s+ROWID/i.test(entry.sql || "");

  const tableDetail = {
    type: entry.type,
    name: entry.name,
    ddl: entry.sql,
    withoutRowId,
    strict: Boolean(tableListEntry?.strict),
    columns,
    checkConstraints,
    foreignKeys,
    indexes: indexList,
    indexCount: indexList.length,
    triggers,
    rowCount: options.includeRowCount === false ? null : safeCountRows(db, tableName),
  };

  tableDetail.identityStrategy = resolveIdentityStrategy(tableDetail);
  tableDetail.notSafelyUpdatable = tableDetail.identityStrategy.type === "none";

  return tableDetail;
}

function getViewDetail(db, viewName) {
  const entry = getMasterEntry(db, "view", viewName);
  let columns = [];

  try {
    columns = db
      .prepare(["SELECT * FROM", quoteIdentifier(viewName), "LIMIT 0"].join(" "))
      .columns()
      .map((column) => ({
        name: column.name,
      }));
  } catch (error) {
    columns = [];
  }

  return {
    type: entry.type,
    name: entry.name,
    ddl: entry.sql,
    columns,
  };
}

function getIndexDetail(db, indexName) {
  const entry = getMasterEntry(db, "index", indexName);
  const indexInfo = db
    .prepare(`PRAGMA index_xinfo(${quoteIdentifier(indexName)})`)
    .all()
    .map((row) => ({
      sequence: row.seqno,
      cid: row.cid,
      name: row.name,
      descending: Boolean(row.desc),
      collation: row.coll,
      key: Boolean(row.key),
    }));

  return {
    type: entry.type,
    name: entry.name,
    tableName: entry.tableName,
    ddl: entry.sql,
    columns: indexInfo,
  };
}

function listSchema(db) {
  const entries = getRawStructureEntries(db);
  const tables = entries
    .filter((entry) => entry.type === "table")
    .map((entry) => getTableDetail(db, entry.name));
  const views = entries
    .filter((entry) => entry.type === "view")
    .map((entry) => getViewDetail(db, entry.name));
  const indexes = entries
    .filter((entry) => entry.type === "index")
    .map((entry) => getIndexDetail(db, entry.name));
  const triggers = entries
    .filter((entry) => entry.type === "trigger")
    .map((entry) => ({
      type: entry.type,
      name: entry.name,
      tableName: entry.tableName,
      ddl: entry.sql,
    }));

  return {
    tables,
    views,
    indexes,
    triggers,
    masterEntries: entries,
  };
}

module.exports = {
  getIndexDetail,
  getRawStructureEntries,
  getTableDetail,
  getViewDetail,
  listSchema,
  resolveIdentityStrategy,
};
