const crypto = require("node:crypto");
const { ValidationError } = require("../../utils/errors");
const { serializeRows } = require("../../utils/sqliteTypes");

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

  return statements.filter((statement) => statement.trim());
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
        const serializedRows = serializeRows(rows);
        const columns = prepared.columns().map((column) => column.name);
        const result = {
          index,
          sql: statement,
          keyword,
          kind: "resultSet",
          rowCount: serializedRows.length,
          columns,
          rows: serializedRows,
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

    const timingMs = Date.now() - startedAt;
    const payload = {
      sql,
      statementCount: statements.length,
      statements: results,
      rows: lastResultSet?.rows ?? [],
      columns: lastResultSet?.columns ?? [],
      affectedRowCount: totalChanges,
      resultKind: lastResultSet ? "resultSet" : results.at(-1)?.kind ?? "unknown",
    };

    if (options.persistHistory !== false) {
      this.appStateStore.addSqlHistory({
        id: crypto.randomUUID(),
        connectionId: connection.id,
        connectionLabel: connection.label,
        sql,
        statementCount: statements.length,
        resultKind: payload.resultKind,
        affectedRowCount: totalChanges,
        rowCount: lastResultSet?.rowCount ?? 0,
        timingMs,
        executedAt: new Date().toISOString(),
      });
    }

    return {
      ...payload,
      timingMs,
    };
  }
}

module.exports = {
  SqlExecutor,
  splitSqlStatements,
};
