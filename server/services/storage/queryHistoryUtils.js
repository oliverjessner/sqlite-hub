function stripLineComments(sql = "") {
  return String(sql)
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/g, ""))
    .join("\n");
}

function stripBlockComments(sql = "") {
  return String(sql).replace(/\/\*[\s\S]*?\*\//g, " ");
}

function compactWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function truncateText(value = "", maxLength = 80) {
  const text = String(value ?? "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeSql(sql = "") {
  const withoutComments = stripBlockComments(stripLineComments(sql));
  const compact = compactWhitespace(withoutComments).replace(/;+\s*$/g, "").trim();

  return compact.toLowerCase();
}

function getLeadingKeywords(sql = "", limit = 3) {
  const stripped = stripBlockComments(stripLineComments(sql));
  const matches = stripped.match(/[A-Za-z]+/g) ?? [];

  return matches.slice(0, limit).map((token) => token.toLowerCase());
}

function readWordAt(value = "", index = 0) {
  const match = String(value).slice(index).match(/^[A-Za-z]+/);
  return match ? match[0].toLowerCase() : "";
}

function skipWhitespace(value = "", index = 0) {
  let cursor = index;

  while (cursor < value.length && /\s/.test(value[cursor])) {
    cursor += 1;
  }

  return cursor;
}

function advanceQuotedSql(value = "", index = 0) {
  const quote = value[index];
  const closingQuote = quote === "[" ? "]" : quote;
  let cursor = index + 1;

  while (cursor < value.length) {
    if (value[cursor] === closingQuote) {
      if ((quote === "'" || quote === '"') && value[cursor + 1] === closingQuote) {
        cursor += 2;
        continue;
      }

      return cursor + 1;
    }

    cursor += 1;
  }

  return value.length;
}

function isSqlWordBoundary(value = "", index = 0) {
  return index < 0 || index >= value.length || !/[A-Za-z0-9_]/.test(value[index]);
}

function findTopLevelWord(value = "", word = "", startIndex = 0) {
  const normalizedWord = String(word).toLowerCase();
  let cursor = startIndex;
  let depth = 0;

  while (cursor < value.length) {
    const char = value[cursor];

    if (char === "'" || char === '"' || char === "`" || char === "[") {
      cursor = advanceQuotedSql(value, cursor);
      continue;
    }

    if (char === "(") {
      depth += 1;
      cursor += 1;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      cursor += 1;
      continue;
    }

    if (
      depth === 0 &&
      value.slice(cursor, cursor + normalizedWord.length).toLowerCase() === normalizedWord &&
      isSqlWordBoundary(value, cursor - 1) &&
      isSqlWordBoundary(value, cursor + normalizedWord.length)
    ) {
      return cursor;
    }

    cursor += 1;
  }

  return -1;
}

function findMatchingParen(value = "", openIndex = 0) {
  let cursor = openIndex;
  let depth = 0;

  while (cursor < value.length) {
    const char = value[cursor];

    if (char === "'" || char === '"' || char === "`" || char === "[") {
      cursor = advanceQuotedSql(value, cursor);
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;

      if (depth === 0) {
        return cursor;
      }
    }

    cursor += 1;
  }

  return -1;
}

function resolveCteStatementKeyword(sql = "") {
  const stripped = stripBlockComments(stripLineComments(sql)).trim();
  let cursor = skipWhitespace(stripped, 0);

  if (readWordAt(stripped, cursor) !== "with") {
    return "";
  }

  cursor += 4;
  cursor = skipWhitespace(stripped, cursor);

  if (readWordAt(stripped, cursor) === "recursive") {
    cursor += "recursive".length;
  }

  while (cursor < stripped.length) {
    const asIndex = findTopLevelWord(stripped, "as", cursor);

    if (asIndex < 0) {
      return "with";
    }

    cursor = skipWhitespace(stripped, asIndex + 2);

    if (readWordAt(stripped, cursor) === "not") {
      cursor = skipWhitespace(stripped, cursor + 3);
    }

    if (readWordAt(stripped, cursor) === "materialized") {
      cursor = skipWhitespace(stripped, cursor + "materialized".length);
    }

    if (stripped[cursor] !== "(") {
      return "with";
    }

    const closeIndex = findMatchingParen(stripped, cursor);

    if (closeIndex < 0) {
      return "with";
    }

    cursor = skipWhitespace(stripped, closeIndex + 1);

    if (stripped[cursor] === ",") {
      cursor = skipWhitespace(stripped, cursor + 1);
      continue;
    }

    return readWordAt(stripped, cursor) || "with";
  }

  return "with";
}

function resolveEffectiveKeyword(sql = "") {
  const [firstKeyword, secondKeyword] = getLeadingKeywords(sql, 3);

  if (firstKeyword === "with") {
    return resolveCteStatementKeyword(sql);
  }

  if (firstKeyword === "explain") {
    return secondKeyword ?? "explain";
  }

  return firstKeyword ?? "";
}

function detectQueryType(sql = "") {
  const keyword = resolveEffectiveKeyword(sql);

  if (keyword === "select") {
    return "select";
  }

  if (keyword === "insert") {
    return "insert";
  }

  if (keyword === "update") {
    return "update";
  }

  if (keyword === "delete") {
    return "delete";
  }

  if (keyword === "pragma") {
    return "pragma";
  }

  if (["create", "alter", "drop", "rename", "truncate"].includes(keyword)) {
    return "ddl";
  }

  return "other";
}

function isDestructiveQuery(sql = "") {
  const keyword = resolveEffectiveKeyword(sql);
  return ["insert", "update", "delete", "alter", "drop", "replace"].includes(keyword);
}

function normalizeTableName(candidate = "") {
  const trimmed = String(candidate ?? "")
    .trim()
    .replace(/[;,)]*$/g, "");

  if (!trimmed || trimmed.startsWith("(")) {
    return null;
  }

  const segments = trimmed.split(".").filter(Boolean);
  const finalSegment = segments.at(-1) ?? trimmed;
  const normalized = finalSegment.replace(/^["`[]|["`\]]$/g, "");

  if (!normalized || ["select", "with", "pragma"].includes(normalized.toLowerCase())) {
    return null;
  }

  return normalized;
}

function collectTableMatches(sql = "", patterns = []) {
  const text = stripBlockComments(stripLineComments(sql));
  const tableNames = [];

  patterns.forEach((pattern) => {
    let match;

    while ((match = pattern.exec(text))) {
      const tableName = normalizeTableName(match[1]);

      if (tableName) {
        tableNames.push(tableName);
      }
    }
  });

  return Array.from(new Set(tableNames));
}

function detectTables(sql = "") {
  return collectTableMatches(sql, [
    /\bfrom\s+([^\s,;()]+)/gi,
    /\bjoin\s+([^\s,;()]+)/gi,
    /\bupdate(?:\s+or\s+\w+)?\s+([^\s,;()]+)/gi,
    /\binto\s+([^\s,;()]+)/gi,
    /\btable\s+(?:if\s+(?:not\s+)?exists\s+)?([^\s,;()]+)/gi,
  ]);
}

function buildAutoTitle(rawSql = "", { queryType = "other", tablesDetected = [] } = {}) {
  const firstMeaningfulLine = String(rawSql)
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/g, "").trim())
    .find(Boolean);

  if (firstMeaningfulLine) {
    return truncateText(firstMeaningfulLine.replace(/;+\s*$/g, ""), 80);
  }

  const primaryTable = tablesDetected[0] ? ` on ${tablesDetected[0]}` : "";

  if (queryType && queryType !== "other") {
    return `${queryType.toUpperCase()}${primaryTable}`;
  }

  return primaryTable ? `Query${primaryTable}` : "SQL query";
}

function buildSqlPreview(rawSql = "", maxLength = 140) {
  const compact = compactWhitespace(stripLineComments(rawSql));
  return truncateText(compact, maxLength) || "SQL query";
}

module.exports = {
  buildAutoTitle,
  buildSqlPreview,
  detectQueryType,
  detectTables,
  isDestructiveQuery,
  normalizeSql,
};
