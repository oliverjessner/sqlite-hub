const { ValidationError, mapSqliteError } = require("../../utils/errors");
const { serializeRows } = require("../../utils/sqliteTypes");
const { getTableDetail } = require("./introspection");

function getFirstKeyword(statement) {
  const trimmed = statement.trim().replace(/^--.*$/gm, "").trim();
  const match = trimmed.match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : "";
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;
  let token = "";
  let recentTokens = [];
  let inTrigger = false;
  let blockDepth = 0;

  function pushToken() {
    if (!token) {
      return;
    }

    const upperToken = token.toUpperCase();
    recentTokens.push(upperToken);
    recentTokens = recentTokens.slice(-4);

    const looksLikeCreateTrigger =
      upperToken === "TRIGGER" &&
      recentTokens.includes("CREATE");

    if (looksLikeCreateTrigger) {
      inTrigger = true;
    }

    if (inTrigger) {
      if (upperToken === "BEGIN" || upperToken === "CASE") {
        blockDepth += 1;
      } else if (upperToken === "END" && blockDepth > 0) {
        blockDepth -= 1;
      }
    }

    token = "";
  }

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const nextChar = sql[index + 1];

    current += char;

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        current += nextChar;
        index += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktick && !inBracket) {
      if (char === "-" && nextChar === "-") {
        inLineComment = true;
        continue;
      }

      if (char === "/" && nextChar === "*") {
        inBlockComment = true;
        continue;
      }
    }

    if (char === "'" && !inDoubleQuote && !inBacktick && !inBracket) {
      inSingleQuote = !inSingleQuote;
      pushToken();
      continue;
    }

    if (char === '"' && !inSingleQuote && !inBacktick && !inBracket) {
      inDoubleQuote = !inDoubleQuote;
      pushToken();
      continue;
    }

    if (char === "`" && !inSingleQuote && !inDoubleQuote && !inBracket) {
      inBacktick = !inBacktick;
      pushToken();
      continue;
    }

    if (char === "[" && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      inBracket = true;
      pushToken();
      continue;
    }

    if (char === "]" && inBracket) {
      inBracket = false;
      pushToken();
      continue;
    }

    if (inSingleQuote || inDoubleQuote || inBacktick || inBracket) {
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      token += char;
      continue;
    }

    if (token) {
      pushToken();
    }

    if (char === ";") {
      if (!inTrigger || blockDepth === 0) {
        const statement = current.trim();
        if (statement) {
          statements.push(statement);
        }
        current = "";
        token = "";
        recentTokens = [];
        inTrigger = false;
        blockDepth = 0;
      }
    }
  }

  if (token) {
    pushToken();
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements.filter((statement) => statement.trim() && getFirstKeyword(statement));
}

function buildRowIdentity(tableDetail, row) {
  if (tableDetail.identityStrategy?.type === "rowid") {
    return {
      kind: "rowid",
      values: {
        rowid: row.rowid,
      },
    };
  }

  if (tableDetail.identityStrategy?.type === "primaryKey") {
    return {
      kind: "primaryKey",
      columns: tableDetail.identityStrategy.columns,
      values: Object.fromEntries(
        tableDetail.identityStrategy.columns.map((columnName) => [columnName, row[columnName]])
      ),
    };
  }

  return null;
}

function getEditableResultReason(tableDetail) {
  if (tableDetail.notSafelyUpdatable) {
    return "This result table has no stable identity column, so rows cannot be edited safely.";
  }

  if (tableDetail.identityStrategy?.type === "primaryKey") {
    return "Include all primary key columns in the query result to edit rows here.";
  }

  if (tableDetail.identityStrategy?.type === "rowid") {
    return "Include rowid in the query result to edit rows for tables without a primary key.";
  }

  return "Only direct single-table SELECT results can be edited here.";
}

function mapEditableColumns(tableDetail, columnDefinitions) {
  const tableColumnsByName = new Map(
    tableDetail.columns.map((column) => [column.name, column])
  );
  const identityColumns = new Set(
    tableDetail.identityStrategy?.type === "primaryKey"
      ? tableDetail.identityStrategy.columns ?? []
      : tableDetail.identityStrategy?.type === "rowid"
        ? ["rowid"]
        : []
  );

  return columnDefinitions.map((definition) => {
    const isRowId = definition.column === "rowid";
    const columnMeta = isRowId ? null : tableColumnsByName.get(definition.column) ?? null;

    return {
      resultName: definition.name,
      sourceColumn: definition.column,
      sourceTable: definition.table,
      visible: isRowId ? true : Boolean(columnMeta?.visible),
      generated: Boolean(columnMeta?.generated),
      identity: identityColumns.has(definition.column),
    };
  });
}

function hasRequiredIdentityColumns(tableDetail, editableColumns) {
  const availableSourceColumns = new Set(editableColumns.map((column) => column.sourceColumn));

  if (tableDetail.identityStrategy?.type === "primaryKey") {
    return (tableDetail.identityStrategy.columns ?? []).every((columnName) =>
      availableSourceColumns.has(columnName)
    );
  }

  if (tableDetail.identityStrategy?.type === "rowid") {
    return availableSourceColumns.has("rowid");
  }

  return false;
}

function buildIdentityRowFromResult(editableColumns, row) {
  return Object.fromEntries(
    editableColumns.map((column) => [column.sourceColumn, row[column.resultName]])
  );
}

function resolveEditableResult(db, columnDefinitions, serializedRows) {
  if (!columnDefinitions.length) {
    return null;
  }

  const directColumns = columnDefinitions.filter(
    (definition) => definition.table && definition.column && definition.database === "main"
  );

  if (directColumns.length !== columnDefinitions.length) {
    return {
      enabled: false,
      reason: "Only direct single-table SELECT results can be edited here.",
    };
  }

  const [firstColumn] = directColumns;
  const sameSourceTable = directColumns.every(
    (definition) =>
      definition.table === firstColumn.table && definition.database === firstColumn.database
  );

  if (!sameSourceTable) {
    return {
      enabled: false,
      reason: "Only direct single-table SELECT results can be edited here.",
    };
  }

  const tableDetail = getTableDetail(db, firstColumn.table, {
    includeRowCount: false,
  });

  if (tableDetail.type !== "table") {
    return {
      enabled: false,
      tableName: firstColumn.table,
      reason: "Only table results can be edited here.",
    };
  }

  const editableColumns = mapEditableColumns(tableDetail, columnDefinitions);

  if (!hasRequiredIdentityColumns(tableDetail, editableColumns)) {
    return {
      enabled: false,
      tableName: tableDetail.name,
      reason: getEditableResultReason(tableDetail),
      columns: editableColumns,
      identityStrategy: tableDetail.identityStrategy,
    };
  }

  const rows = serializedRows.map((row) => {
    const identityRow = buildIdentityRowFromResult(editableColumns, row);

    return {
      ...row,
      __identity: buildRowIdentity(tableDetail, identityRow),
    };
  });

  return {
    enabled: true,
    tableName: tableDetail.name,
    reason: "",
    columns: editableColumns,
    identityStrategy: tableDetail.identityStrategy,
    rows,
  };
}

class SqlExecutor {
  constructor({ connectionManager, appStateStore }) {
    this.connectionManager = connectionManager;
    this.appStateStore = appStateStore;
  }

  execute(sql, options = {}) {
    if (typeof sql !== "string" || !sql.trim()) {
      throw new ValidationError("SQL text is required.");
    }

    const db = this.connectionManager.getActiveDatabase();
    const connection = this.connectionManager.getActiveConnection();
    const statements = splitSqlStatements(sql);

    if (statements.length === 0) {
      throw new ValidationError("No executable SQL statements were found.");
    }

    const startedAt = Date.now();
    const results = [];
    let lastResultSet = null;
    let totalChanges = 0;
    try {
      statements.forEach((statement, index) => {
        const prepared = db.prepare(statement);
        const keyword = getFirstKeyword(statement);

        if (options.requireReader && !prepared.reader) {
          throw new ValidationError(
            `Statement ${index + 1} is not a result-set statement and cannot be exported.`
          );
        }

        if (prepared.reader) {
          const rows = prepared.all();
          const columnDefinitions = prepared.columns();
          const serializedRows = serializeRows(rows);
          const editableResult = resolveEditableResult(db, columnDefinitions, serializedRows);
          const columns = columnDefinitions.map((column) => column.name);
          const result = {
            index,
            sql: statement,
            keyword,
            kind: "resultSet",
            rowCount: serializedRows.length,
            columns,
            rows: editableResult?.rows ?? serializedRows,
            editing: editableResult
              ? {
                  enabled: editableResult.enabled,
                  tableName: editableResult.tableName ?? null,
                  reason: editableResult.reason ?? "",
                  columns: editableResult.columns ?? [],
                  identityStrategy: editableResult.identityStrategy ?? null,
                }
              : null,
          };
          results.push(result);
          lastResultSet = result;
          return;
        }

        const info = prepared.run();
        totalChanges += info.changes;
        results.push({
          index,
          sql: statement,
          keyword,
          kind: "mutation",
          changes: info.changes,
          lastInsertRowid:
            keyword === "INSERT" || keyword === "REPLACE"
              ? typeof info.lastInsertRowid === "bigint"
                ? Number(info.lastInsertRowid)
                : info.lastInsertRowid
              : null,
        });
      });
    } catch (error) {
      const normalizedError = mapSqliteError(error);

      if (options.persistHistory !== false) {
        try {
          this.appStateStore.recordQueryExecution({
            databaseKey: connection.id,
            rawSql: sql,
            status: "error",
            durationMs: Date.now() - startedAt,
            rowCount: lastResultSet?.rowCount ?? null,
            affectedRows: totalChanges,
            errorMessage: normalizedError.message,
          });
        } catch (recordingError) {
          console.warn(
            `Failed to record SQL query history error for ${connection.id}: ${recordingError.message}`
          );
        }
      }

      throw normalizedError;
    }

    const timingMs = Date.now() - startedAt;
    const payload = {
      sql,
      statementCount: statements.length,
      statements: results,
      rows: lastResultSet?.rows ?? [],
      columns: lastResultSet?.columns ?? [],
      editing: lastResultSet?.editing ?? null,
      affectedRowCount: totalChanges,
      resultKind: lastResultSet ? "resultSet" : results.at(-1)?.kind ?? "unknown",
    };
    let historyId = null;

    if (options.persistHistory !== false) {
      historyId = this.appStateStore.recordQueryExecution({
        databaseKey: connection.id,
        rawSql: sql,
        status: "success",
        durationMs: timingMs,
        rowCount: lastResultSet?.rowCount ?? null,
        affectedRows: totalChanges,
      });
    }

    return {
      ...payload,
      timingMs,
      historyId,
    };
  }
}

module.exports = {
  SqlExecutor,
  splitSqlStatements,
};
