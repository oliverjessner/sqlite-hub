const { ValidationError } = require("../../utils/errors");
const { quoteIdentifier } = require("../../utils/identifier");

function normalizeSortDirection(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "desc" ? "desc" : "asc";
}

function buildDefaultOrderClause(tableDetail) {
  if (tableDetail.identityStrategy?.type === "rowid") {
    return "rowid ASC";
  }

  if (tableDetail.identityStrategy?.type === "primaryKey") {
    return tableDetail.identityStrategy.columns
      .map((columnName) => `${quoteIdentifier(columnName)} ASC`)
      .join(", ");
  }

  return "";
}

function normalizeTableSort(tableDetail, options = {}) {
  const sortColumn = typeof options.sortColumn === "string" ? options.sortColumn.trim() : "";

  if (!sortColumn) {
    return {
      column: null,
      direction: null,
    };
  }

  const availableColumns = (tableDetail.columns ?? [])
    .filter((column) => column.visible !== false)
    .map((column) => column.name);

  if (!availableColumns.includes(sortColumn)) {
    throw new ValidationError(`sortColumn must reference a visible column on ${tableDetail.name}.`);
  }

  return {
    column: sortColumn,
    direction: normalizeSortDirection(options.sortDirection),
  };
}

function buildTableOrderClause(tableDetail, sort = {}) {
  const defaultOrderClause = buildDefaultOrderClause(tableDetail);

  if (!sort.column) {
    return defaultOrderClause;
  }

  const primarySort = `${quoteIdentifier(sort.column)} ${sort.direction.toUpperCase()}`;

  return [primarySort, defaultOrderClause].filter(Boolean).join(", ");
}

module.exports = {
  buildTableOrderClause,
  normalizeSortDirection,
  normalizeTableSort,
};
