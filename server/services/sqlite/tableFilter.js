const { ValidationError } = require("../../utils/errors");
const { quoteIdentifier } = require("../../utils/identifier");

const FILTER_OPERATORS = new Set(["=", "!=", "<", ">", "<=", ">=", "equals"]);

function escapeLikePattern(value) {
  return String(value).replace(/[\\%_]/g, (character) => `\\${character}`);
}

function isTextColumn(column) {
  return String(column?.affinity ?? "").toUpperCase() === "TEXT";
}

function normalizeTableFilter(tableDetail, options = {}) {
  const columnName = String(options.filterColumn ?? "").trim();
  const operator = String(options.filterOperator ?? "=").trim();
  const value = options.filterValue;

  if (!columnName || value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  if (!FILTER_OPERATORS.has(operator)) {
    throw new ValidationError(
      `filterOperator must be one of: ${Array.from(FILTER_OPERATORS).join(", ")}.`
    );
  }

  const filterColumn = tableDetail.columns.find(
    (column) => column.visible && column.name === columnName
  );

  if (!filterColumn) {
    throw new ValidationError(`Unknown filter column: ${columnName}.`);
  }

  const normalizedValue = String(value);
  const quotedColumn = quoteIdentifier(filterColumn.name);

  if (operator === "equals") {
    return {
      column: filterColumn.name,
      operator,
      value: normalizedValue,
      matchMode: "equals",
      clause: `${quotedColumn}${isTextColumn(filterColumn) ? " COLLATE NOCASE" : ""} = ?`,
      params: [normalizedValue],
    };
  }

  if (isTextColumn(filterColumn) && (operator === "=" || operator === "!=")) {
    return {
      column: filterColumn.name,
      operator,
      value: normalizedValue,
      matchMode: operator === "=" ? "contains" : "notContains",
      clause: `${quotedColumn} COLLATE NOCASE ${operator === "=" ? "LIKE" : "NOT LIKE"} ? ESCAPE '\\'`,
      params: [`%${escapeLikePattern(normalizedValue)}%`],
    };
  }

  return {
    column: filterColumn.name,
    operator,
    value: normalizedValue,
    matchMode: "comparison",
    clause: `${quotedColumn} ${operator} ?`,
    params: [normalizedValue],
  };
}

module.exports = {
  FILTER_OPERATORS,
  normalizeTableFilter,
};
