const SQL_KEYWORDS = new Set([
  "ADD",
  "ALTER",
  "AND",
  "AS",
  "ASC",
  "BEGIN",
  "BETWEEN",
  "BLOB",
  "BOOLEAN",
  "BY",
  "CASE",
  "CAST",
  "CHECK",
  "COLLATE",
  "COLUMN",
  "COMMIT",
  "CONFLICT",
  "CONSTRAINT",
  "CREATE",
  "CROSS",
  "DEFAULT",
  "DELETE",
  "DESC",
  "DISTINCT",
  "DROP",
  "ELSE",
  "END",
  "ESCAPE",
  "EXCEPT",
  "EXISTS",
  "FOREIGN",
  "FROM",
  "FULL",
  "GLOB",
  "GROUP",
  "HAVING",
  "IF",
  "IN",
  "INDEX",
  "INNER",
  "INSERT",
  "INTERSECT",
  "INTO",
  "IS",
  "ISNULL",
  "JOIN",
  "KEY",
  "LEFT",
  "LIKE",
  "LIMIT",
  "MATCH",
  "NATURAL",
  "NOT",
  "NOTNULL",
  "NULL",
  "ON",
  "OR",
  "ORDER",
  "OUTER",
  "OVER",
  "PARTITION",
  "PRAGMA",
  "PRIMARY",
  "RANK",
  "REFERENCES",
  "REINDEX",
  "RELEASE",
  "RENAME",
  "REPLACE",
  "RETURNING",
  "RIGHT",
  "ROLLBACK",
  "ROW",
  "ROW_NUMBER",
  "SAVEPOINT",
  "SELECT",
  "SET",
  "TABLE",
  "TEMP",
  "TEMPORARY",
  "THEN",
  "TEXT",
  "TO",
  "TRANSACTION",
  "TRIGGER",
  "UNION",
  "UNIQUE",
  "UPDATE",
  "USING",
  "VALUES",
  "VIEW",
  "WHEN",
  "WHERE",
  "WITH",
  "WITHOUT",
  "DENSE_RANK",
  "INTEGER",
  "LAG",
  "LEAD",
  "NUMERIC",
  "REAL",
]);

const LINE_START_KEYWORDS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP",
  "HAVING",
  "ORDER",
  "LIMIT",
  "OFFSET",
  "VALUES",
  "SET",
  "RETURNING",
  "UNION",
  "EXCEPT",
  "INTERSECT",
]);

const JOIN_PREFIX_KEYWORDS = new Set(["JOIN", "LEFT", "RIGHT", "FULL", "INNER", "OUTER", "CROSS"]);
const CONDITION_KEYWORDS = new Set(["AND", "OR"]);
const OPERATOR_TOKENS = new Set(["=", ">", "<", ">=", "<=", "<>", "!=", "==", "+", "-", "*", "/", "%"]);

function readQuoted(text, startIndex, quote) {
  let index = startIndex + 1;

  while (index < text.length) {
    if (text[index] === quote) {
      if (text[index + 1] === quote) {
        index += 2;
        continue;
      }

      return index + 1;
    }

    index += 1;
  }

  return text.length;
}

function readBracketIdentifier(text, startIndex) {
  const endIndex = text.indexOf("]", startIndex + 1);
  return endIndex === -1 ? text.length : endIndex + 1;
}

function tokenizeSql(sql = "") {
  const text = String(sql);
  const tokens = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1] ?? "";

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "-" && next === "-") {
      const endIndex = text.indexOf("\n", index + 2);
      const stopIndex = endIndex === -1 ? text.length : endIndex;
      tokens.push({ type: "comment", value: text.slice(index, stopIndex) });
      index = stopIndex;
      continue;
    }

    if (char === "/" && next === "*") {
      const endIndex = text.indexOf("*/", index + 2);
      const stopIndex = endIndex === -1 ? text.length : endIndex + 2;
      tokens.push({ type: "comment", value: text.slice(index, stopIndex) });
      index = stopIndex;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      const stopIndex = readQuoted(text, index, char);
      tokens.push({ type: "literal", value: text.slice(index, stopIndex) });
      index = stopIndex;
      continue;
    }

    if (char === "[") {
      const stopIndex = readBracketIdentifier(text, index);
      tokens.push({ type: "literal", value: text.slice(index, stopIndex) });
      index = stopIndex;
      continue;
    }

    const wordMatch = text.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/);

    if (wordMatch) {
      const rawValue = wordMatch[0];
      const upperValue = rawValue.toUpperCase();
      tokens.push({
        type: "word",
        value: SQL_KEYWORDS.has(upperValue) ? upperValue : rawValue,
        keyword: SQL_KEYWORDS.has(upperValue) ? upperValue : "",
      });
      index += rawValue.length;
      continue;
    }

    const numberMatch = text.slice(index).match(/^\d+(?:\.\d+)?/);

    if (numberMatch) {
      tokens.push({ type: "number", value: numberMatch[0] });
      index += numberMatch[0].length;
      continue;
    }

    const twoChar = `${char}${next}`;

    if (OPERATOR_TOKENS.has(twoChar) || twoChar === "||") {
      tokens.push({ type: "operator", value: twoChar });
      index += 2;
      continue;
    }

    tokens.push({
      type: OPERATOR_TOKENS.has(char) ? "operator" : "punctuation",
      value: char,
    });
    index += 1;
  }

  return tokens;
}

function nextWordKeyword(tokens, startIndex) {
  for (let index = startIndex + 1; index < tokens.length; index += 1) {
    if (tokens[index].type === "comment") {
      continue;
    }

    return tokens[index].keyword || "";
  }

  return "";
}

function normalizeLine(line) {
  const leadingWhitespace = line.match(/^ */)?.[0] ?? "";
  const body = line
    .slice(leadingWhitespace.length)
    .replace(/\s+([,.;)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/\s+([.])\s+/g, "$1")
    .replace(/([.])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trimEnd();

  return body ? `${leadingWhitespace}${body}` : "";
}

function getLastWord(line) {
  return line
    .trim()
    .split(/\s+/)
    .at(-1)
    ?.toUpperCase() ?? "";
}

function shouldStartNewLine(token, tokens, index, currentLine) {
  if (token.type !== "word" || !token.keyword) {
    return false;
  }

  if (!currentLine.trim()) {
    return false;
  }

  if (CONDITION_KEYWORDS.has(token.keyword)) {
    return true;
  }

  if (LINE_START_KEYWORDS.has(token.keyword)) {
    return true;
  }

  if (JOIN_PREFIX_KEYWORDS.has(token.keyword)) {
    if (token.keyword === "JOIN") {
      return !JOIN_PREFIX_KEYWORDS.has(getLastWord(currentLine));
    }

    return nextWordKeyword(tokens, index) === "JOIN";
  }

  return false;
}

function appendToken(line, token) {
  const value = token.value;

  if (!line || !line.trim()) {
    return `${line}${value}`;
  }

  if (value === "." || value === "," || value === ";" || value === ")" || value === "(") {
    return `${line.trimEnd()}${value}`;
  }

  if (line.endsWith("(") || line.endsWith(".")) {
    return `${line}${value}`;
  }

  if (token.type === "operator") {
    return `${line.trimEnd()} ${value}`;
  }

  if (OPERATOR_TOKENS.has(line.trimEnd().split(/\s+/).at(-1))) {
    return `${line} ${value}`;
  }

  return `${line} ${value}`;
}

function appendAsBlockOpen(line) {
  if (!line || !line.trim()) {
    return `${line}(`;
  }

  return `${line.trimEnd()} (`;
}

function getLineIndent(line = "") {
  return line.match(/^ */)?.[0] ?? "";
}

const SPACED_MAJOR_CLAUSE_PATTERN =
  /^(FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|RETURNING|UNION|EXCEPT|INTERSECT)\b/;
const JOIN_LINE_PATTERN = /^(JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|INNER JOIN|OUTER JOIN|CROSS JOIN)\b/;

function isJoinLine(line) {
  return JOIN_LINE_PATTERN.test(line.trim());
}

function isOrderByInsideOverBlock(line, previousLine) {
  if (!line.trim().startsWith("ORDER BY")) {
    return false;
  }

  const previous = previousLine.trim();
  return previous.startsWith("PARTITION BY") || previous.endsWith("OVER (");
}

function shouldInsertBlankBefore(line, previousLine) {
  const trimmed = line.trim();
  const previous = previousLine.trim();

  if (!trimmed || !previous) {
    return false;
  }

  if (trimmed.startsWith("ON ")) {
    return false;
  }

  if (trimmed.startsWith("SELECT ")) {
    return previous === ")" || previous.endsWith("),");
  }

  if (isJoinLine(line)) {
    return true;
  }

  if (SPACED_MAJOR_CLAUSE_PATTERN.test(trimmed)) {
    return !isOrderByInsideOverBlock(line, previousLine);
  }

  return false;
}

function shouldInsertBlankAfter(line, nextLine) {
  const trimmed = line.trim();
  const next = nextLine.trim();

  if (!trimmed || !next) {
    return false;
  }

  if (/^END\b/.test(trimmed)) {
    return true;
  }

  if (/^\) AS\b/.test(trimmed)) {
    return true;
  }

  if (trimmed === ")" && next.startsWith("SELECT ")) {
    return true;
  }

  return false;
}

function ensureBlankLine(lines) {
  if (lines.length && lines.at(-1) !== "") {
    lines.push("");
  }
}

function addReadableBlockSpacing(lines) {
  const spacedLines = [];

  lines.forEach((line, index) => {
    const previousLine = spacedLines.filter(Boolean).at(-1) ?? "";

    if (shouldInsertBlankBefore(line, previousLine)) {
      ensureBlankLine(spacedLines);
    }

    spacedLines.push(line);

    const nextLine = lines.slice(index + 1).find(Boolean) ?? "";

    if (shouldInsertBlankAfter(line, nextLine)) {
      ensureBlankLine(spacedLines);
    }
  });

  while (spacedLines[0] === "") {
    spacedLines.shift();
  }

  while (spacedLines.at(-1) === "") {
    spacedLines.pop();
  }

  return spacedLines;
}

export function formatSqlQuery(sql = "") {
  const tokens = tokenizeSql(sql);

  if (!tokens.length) {
    return "";
  }

  const lines = [];
  let currentLine = "";
  let currentClause = "";
  let parenDepth = 0;
  const asBlockDepths = [];
  const overBlockStack = [];
  const caseStack = [];
  let previousMeaningfulToken = null;

  function pushLine() {
    const normalized = normalizeLine(currentLine);

    if (normalized) {
      lines.push(normalized);
    }

    currentLine = "";
  }

  function getBaseIndent() {
    return "  ".repeat(asBlockDepths.length);
  }

  function getActiveCaseBlock() {
    return caseStack.at(-1) ?? null;
  }

  function getActiveOverBlock() {
    return overBlockStack.at(-1) ?? null;
  }

  function getCaseStartIndent() {
    const leadingWhitespace = currentLine.match(/^ */)?.[0] ?? "";

    if (leadingWhitespace) {
      return leadingWhitespace;
    }

    return currentClause === "SELECT" ? `${getBaseIndent()}  ` : getBaseIndent();
  }

  function getCaseExpressionIndent() {
    const activeCase = getActiveCaseBlock();
    return activeCase ? `${activeCase.indent}    ` : `${getBaseIndent()}  `;
  }

  function getContinuationIndent(token) {
    const activeCase = getActiveCaseBlock();

    if (activeCase) {
      if (activeCase.mode === "elseExpression" || CONDITION_KEYWORDS.has(token.keyword)) {
        return getCaseExpressionIndent();
      }
    }

    const activeOver = getActiveOverBlock();

    if (activeOver) {
      return `${activeOver.indent}  `;
    }

    return `${getBaseIndent()}  `;
  }

  function getDefaultLineIndent() {
    if (currentLine) {
      return currentLine;
    }

    const activeCase = getActiveCaseBlock();

    if (activeCase?.mode === "elseExpression") {
      return getCaseExpressionIndent();
    }

    const activeOver = getActiveOverBlock();

    if (activeOver) {
      return `${activeOver.indent}  `;
    }

    return getBaseIndent();
  }

  function shouldBreakAfterCaseConcat(token, index) {
    if (token.value !== "||" || !getActiveCaseBlock()) {
      return false;
    }

    const nextToken = tokens[index + 1];
    return Boolean(nextToken && nextToken.type !== "literal");
  }

  tokens.forEach((token, index) => {
    if (token.type === "comment") {
      pushLine();
      lines.push(`${getBaseIndent()}${token.value}`);
      return;
    }

    if (token.keyword === "CASE") {
      if (currentLine.trim()) {
        pushLine();
      }

      const indent = getCaseStartIndent();
      currentLine = `${indent}CASE`;
      pushLine();
      caseStack.push({ indent, mode: "case" });
      currentLine = `${indent}  `;
      previousMeaningfulToken = token;
      return;
    }

    if (token.keyword === "WHEN" && getActiveCaseBlock()) {
      pushLine();
      const activeCase = getActiveCaseBlock();
      activeCase.mode = "when";
      currentLine = `${activeCase.indent}  WHEN`;
      previousMeaningfulToken = token;
      return;
    }

    if (token.keyword === "ELSE" && getActiveCaseBlock()) {
      pushLine();
      const activeCase = getActiveCaseBlock();
      currentLine = `${activeCase.indent}  ELSE`;
      pushLine();
      activeCase.mode = "elseExpression";
      currentLine = getCaseExpressionIndent();
      previousMeaningfulToken = token;
      return;
    }

    if (token.keyword === "END" && getActiveCaseBlock()) {
      pushLine();
      const activeCase = caseStack.pop();
      currentLine = `${activeCase.indent}END`;
      previousMeaningfulToken = token;
      return;
    }

    const opensOverBlock = token.value === "(" && previousMeaningfulToken?.keyword === "OVER";

    if (opensOverBlock) {
      const indent = getLineIndent(currentLine);
      currentLine = appendAsBlockOpen(currentLine);
      pushLine();
      parenDepth += 1;
      overBlockStack.push({ depth: parenDepth, indent, restoreClause: currentClause });
      currentLine = `${indent}  `;
      previousMeaningfulToken = token;
      return;
    }

    const closesOverBlock = token.value === ")" && overBlockStack.at(-1)?.depth === parenDepth;

    if (closesOverBlock) {
      pushLine();
      const block = overBlockStack.pop();
      parenDepth = Math.max(0, parenDepth - 1);
      currentClause = block.restoreClause;
      currentLine = `${block.indent})`;
      previousMeaningfulToken = token;
      return;
    }

    const opensAsBlock = token.value === "(" && previousMeaningfulToken?.keyword === "AS";

    if (opensAsBlock) {
      currentLine = appendAsBlockOpen(currentLine);
      pushLine();
      parenDepth += 1;
      asBlockDepths.push(parenDepth);
      currentClause = "";
      currentLine = getBaseIndent();
      previousMeaningfulToken = token;
      return;
    }

    const closesAsBlock = token.value === ")" && asBlockDepths.at(-1) === parenDepth;

    if (closesAsBlock) {
      pushLine();
      asBlockDepths.pop();
      parenDepth = Math.max(0, parenDepth - 1);
      currentClause = "";
      currentLine = `${getBaseIndent()})`;
      previousMeaningfulToken = token;
      return;
    }

    if (token.keyword === "ON" && currentClause === "JOIN" && currentLine.trim()) {
      pushLine();
    } else if (shouldStartNewLine(token, tokens, index, currentLine)) {
      pushLine();
    }

    const baseIndent = getDefaultLineIndent();
    const isSelectContinuation =
      currentClause === "SELECT" &&
      token.keyword !== "SELECT" &&
      !LINE_START_KEYWORDS.has(token.keyword) &&
      !JOIN_PREFIX_KEYWORDS.has(token.keyword);
    const isJoinCondition = currentLine === "" && token.keyword === "ON" && currentClause === "JOIN";
    const isContinuation =
      currentLine === "" && (CONDITION_KEYWORDS.has(token.keyword) || isSelectContinuation || isJoinCondition);

    currentLine = appendToken(isContinuation ? getContinuationIndent(token) : baseIndent, token);

    if (token.keyword) {
      if (LINE_START_KEYWORDS.has(token.keyword) || token.keyword === "JOIN") {
        currentClause = token.keyword;
      }

      if (token.keyword === "THEN" && getActiveCaseBlock()) {
        getActiveCaseBlock().mode = "then";
      }
    }

    if (shouldBreakAfterCaseConcat(token, index)) {
      pushLine();
      currentLine = getCaseExpressionIndent();
    }

    if (token.value === "," && currentClause === "SELECT" && parenDepth === asBlockDepths.length) {
      pushLine();
      currentLine = `${getBaseIndent()}  `;
    }

    if (token.value === ";") {
      pushLine();
      currentClause = "";
    }

    if (token.value === "(") {
      parenDepth += 1;
    } else if (token.value === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    }

    previousMeaningfulToken = token;
  });

  pushLine();

  return addReadableBlockSpacing(lines).join("\n").trim();
}
