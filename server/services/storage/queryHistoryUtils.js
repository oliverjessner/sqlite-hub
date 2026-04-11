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

function resolveEffectiveKeyword(sql = "") {
  const [firstKeyword, secondKeyword, thirdKeyword] = getLeadingKeywords(sql, 3);

  if (firstKeyword === "with") {
    return secondKeyword === "recursive" ? thirdKeyword ?? "with" : secondKeyword ?? "with";
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
