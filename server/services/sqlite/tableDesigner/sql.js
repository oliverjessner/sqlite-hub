const { quoteIdentifier, quoteIdentifierList } = require("../../../utils/identifier");
const { normalizeSqlFragment } = require("./validation");

function buildColumnDefinition(column) {
  const parts = [quoteIdentifier(column.name)];
  const type = normalizeSqlFragment(column.type);
  const defaultValue = normalizeSqlFragment(column.defaultValue);

  if (type) {
    parts.push(type);
  }

  if (column.primaryKey) {
    parts.push("PRIMARY KEY");
  }

  if (column.notNull) {
    parts.push("NOT NULL");
  }

  if (column.unique) {
    parts.push("UNIQUE");
  }

  if (defaultValue) {
    parts.push(`DEFAULT ${defaultValue}`);
  }

  if (column.referencesTable && column.referencesColumn) {
    parts.push(
      `REFERENCES ${quoteIdentifier(column.referencesTable)}(${quoteIdentifier(column.referencesColumn)})`
    );
  }

  return parts.join(" ");
}

function normalizeCheckExpressionSql(expression) {
  const normalized = normalizeSqlFragment(expression);

  if (!normalized) {
    return "";
  }

  if (/^CHECK\s*\(/i.test(normalized)) {
    return normalized;
  }

  return `CHECK (${normalized})`;
}

function buildCheckConstraintSql(constraint) {
  if (constraint.deleted) {
    return "";
  }

  return normalizeCheckExpressionSql(constraint.expression);
}

function buildCreateTableSql(draft) {
  const columnSql = draft.columns
    .filter((column) => !column.deleted)
    .map((column) => `  ${buildColumnDefinition(column)}`);
  const checkSql = (draft.checkConstraints ?? [])
    .map(buildCheckConstraintSql)
    .filter(Boolean)
    .map((constraintSql) => `  ${constraintSql}`);
  const definitionSql = [...columnSql, ...checkSql].join(",\n");

  return `CREATE TABLE ${quoteIdentifier(draft.tableName)} (\n${definitionSql}\n);`;
}

function buildAlterTableRenameSql(fromName, toName) {
  return [
    "ALTER TABLE",
    quoteIdentifier(fromName),
    "RENAME TO",
    quoteIdentifier(toName),
  ].join(" ") + ";";
}

function buildAlterTableAddColumnSql(tableName, column) {
  return [
    "ALTER TABLE",
    quoteIdentifier(tableName),
    "ADD COLUMN",
    buildColumnDefinition(column),
  ].join(" ") + ";";
}

function buildInsertRowsSql(tableName, columns) {
  const placeholders = columns.map(() => "?").join(", ");
  return [
    "INSERT INTO",
    quoteIdentifier(tableName),
    "(" + quoteIdentifierList(columns) + ")",
    "VALUES",
    "(" + placeholders + ");",
  ].join(" ");
}

module.exports = {
  buildAlterTableAddColumnSql,
  buildAlterTableRenameSql,
  buildColumnDefinition,
  buildCreateTableSql,
  buildInsertRowsSql,
};
