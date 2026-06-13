const { NotFoundError, ValidationError } = require("../../utils/errors");
const { quoteIdentifier } = require("../../utils/identifier");
const {
  deserializeSqliteValue,
  serializeRow,
  serializeRows,
} = require("../../utils/sqliteTypes");
const { getRawStructureEntries, getTableDetail } = require("./introspection");
const { normalizeTableFilter } = require("./tableFilter");
const { buildTableOrderClause, normalizeTableSort } = require("./tableSort");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

function buildRowIdentity(tableDetail, row) {
  if (tableDetail.identityStrategy?.type === "rowid") {
    return {
      kind: "rowid",
      values: {
        rowid: row.__rowid__,
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

function normalizePaginationOptions(options = {}) {
  const limit = Number(options.limit ?? DEFAULT_LIMIT);
  const offset = Number(options.offset ?? 0);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new ValidationError("offset must be a non-negative integer.");
  }

  return {
    limit,
    offset,
  };
}

function formatPreviewValue(value) {
  if (value && typeof value === "object" && value.__type === "blob") {
    return `BLOB ${value.sizeBytes ?? 0} bytes`;
  }

  if (value === null) {
    return "NULL";
  }

  if (value === undefined) {
    return "UNDEFINED";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function isUnchangedSubmittedValue(currentValue, submittedValue) {
  return formatPreviewValue(currentValue) === formatPreviewValue(submittedValue);
}

class DataBrowserService {
  constructor({ connectionManager }) {
    this.connectionManager = connectionManager;
  }

  listTables() {
    const db = this.connectionManager.getActiveDatabase();

    return getRawStructureEntries(db)
      .filter((entry) => entry.type === "table")
      .map((entry) => ({
        name: entry.name,
      }));
  }

  getTableData(tableName, options = {}) {
    const db = this.connectionManager.getActiveDatabase();
    const tableDetail = getTableDetail(db, tableName);
    const { limit, offset } = normalizePaginationOptions(options);
    const sort = normalizeTableSort(tableDetail, options);
    const filter = normalizeTableFilter(tableDetail, options);
    const selectExpression =
      tableDetail.identityStrategy?.type === "rowid" ? "rowid AS __rowid__, *" : "*";
    const orderClause = buildTableOrderClause(tableDetail, sort);
    const whereClause = filter ? `WHERE ${filter.clause}` : "";
    const statement = db.prepare(
      [
        "SELECT",
        selectExpression,
        "FROM",
        quoteIdentifier(tableName),
        whereClause,
        orderClause ? "ORDER BY" : "",
        orderClause,
        "LIMIT ? OFFSET ?",
      ]
        .filter(Boolean)
        .join(" ")
    );
    const rawRows = statement.all(...(filter?.params ?? []), limit, offset);
    const columns = statement
      .columns()
      .map((column) => column.name)
      .filter((columnName) => columnName !== "__rowid__");
    const rowCount = filter
      ? db
          .prepare(
            ["SELECT COUNT(*) AS count FROM", quoteIdentifier(tableName), whereClause]
              .filter(Boolean)
              .join(" ")
          )
          .get(...filter.params).count
      : tableDetail.rowCount ?? rawRows.length;

    const rows = serializeRows(rawRows).map((row) => {
      const identity = buildRowIdentity(tableDetail, row);

      if (Object.prototype.hasOwnProperty.call(row, "__rowid__")) {
        delete row.__rowid__;
      }

      return {
        ...row,
        __identity: identity,
      };
    });

    return {
      name: tableDetail.name,
      type: tableDetail.type,
      rowCount,
      limit,
      offset,
      page: Math.floor(offset / limit) + 1,
      pageCount: Math.max(1, Math.ceil(rowCount / limit)),
      columns,
      columnMeta: tableDetail.columns,
      foreignKeys: tableDetail.foreignKeys,
      rows,
      identityStrategy: tableDetail.identityStrategy,
      notSafelyUpdatable: tableDetail.notSafelyUpdatable,
      filter: filter
        ? {
            column: filter.column,
            operator: filter.operator,
            value: filter.value,
            matchMode: filter.matchMode,
          }
        : null,
      sort,
    };
  }

  getTableRow(tableName, payload = {}) {
    const db = this.connectionManager.getActiveDatabase();
    const tableDetail = getTableDetail(db, tableName, { includeRowCount: false });
    const identity = payload.identity ?? null;

    if (tableDetail.notSafelyUpdatable) {
      throw new ValidationError(
        `Table ${tableName} has no stable row identity, so a specific row cannot be targeted.`
      );
    }

    const where = this.buildWhereClause(tableDetail, identity);
    const row = this.getRowByIdentity(db, tableDetail, where);

    if (!row) {
      throw new NotFoundError(`Row not found in table: ${tableName}`);
    }

    return {
      tableName,
      row,
    };
  }

  updateTableRow(tableName, payload = {}) {
    this.connectionManager.assertWritable();

    const db = this.connectionManager.getActiveDatabase();
    const updatePlan = this.buildUpdatePlan(db, tableName, payload);

    db.prepare(updatePlan.sql).run(...updatePlan.params);

    const updatedRow = this.getRowByIdentity(db, updatePlan.tableDetail, updatePlan.where);

    if (!updatedRow) {
      throw new NotFoundError(`Row not found in table: ${tableName}`);
    }

    return {
      tableName,
      row: updatedRow,
    };
  }

  previewTableRowUpdate(tableName, payload = {}) {
    this.connectionManager.assertWritable();

    const db = this.connectionManager.getActiveDatabase();
    const updatePlan = this.buildUpdatePlan(db, tableName, payload);

    return {
      tableName: updatePlan.tableDetail.name,
      sql: updatePlan.sql,
      params: updatePlan.params.map((value, index) => ({
        index: index + 1,
        value: formatPreviewValue(value),
      })),
      changes: updatePlan.changes,
      warnings: updatePlan.warnings,
    };
  }

  deleteTableRow(tableName, payload = {}) {
    this.connectionManager.assertWritable();

    const db = this.connectionManager.getActiveDatabase();
    const tableDetail = getTableDetail(db, tableName, { includeRowCount: false });
    const identity = payload.identity ?? null;

    if (tableDetail.notSafelyUpdatable) {
      throw new ValidationError(
        `Table ${tableName} cannot be safely updated because it has no stable row identity.`
      );
    }

    const where = this.buildWhereClause(tableDetail, identity);
    const result = db
      .prepare(
        ["DELETE FROM", quoteIdentifier(tableName), "WHERE", where.clause].join(" ")
      )
      .run(...where.params);

    if (!result.changes) {
      throw new NotFoundError(`Row not found in table: ${tableName}`);
    }

    return {
      tableName,
      deleted: true,
      identity,
      affectedRowCount: result.changes,
    };
  }

  buildWhereClause(tableDetail, identity) {
    if (tableDetail.identityStrategy?.type === "rowid") {
      const rowid = identity?.values?.rowid;

      if (rowid === undefined) {
        throw new ValidationError("rowid is required to update this row.");
      }

      return {
        clause: "rowid IS ?",
        params: [deserializeSqliteValue(rowid)],
      };
    }

    if (tableDetail.identityStrategy?.type === "primaryKey") {
      const columns = tableDetail.identityStrategy.columns ?? [];

      if (!columns.length) {
        throw new ValidationError("Primary key columns are required to update this row.");
      }

      return {
        clause: columns.map((columnName) => `${quoteIdentifier(columnName)} IS ?`).join(" AND "),
        params: columns.map((columnName) => {
          if (!Object.prototype.hasOwnProperty.call(identity?.values ?? {}, columnName)) {
            throw new ValidationError(`Missing primary key value for ${columnName}.`);
          }

          return deserializeSqliteValue(identity.values[columnName]);
        }),
      };
    }

    throw new ValidationError(
      `Table ${tableDetail.name} cannot be updated because it has no stable row identity.`
    );
  }

  buildUpdatePlan(db, tableName, payload = {}) {
    const tableDetail = getTableDetail(db, tableName, { includeRowCount: false });
    const values = payload.values ?? {};
    const identity = payload.identity ?? null;

    if (tableDetail.notSafelyUpdatable) {
      throw new ValidationError(
        `Table ${tableName} cannot be safely updated because it has no stable row identity.`
      );
    }

    const where = this.buildWhereClause(tableDetail, identity);
    const currentRow = this.getRowByIdentity(db, tableDetail, where);

    if (!currentRow) {
      throw new NotFoundError(`Row not found in table: ${tableName}`);
    }

    const identityColumnSet = new Set(
      tableDetail.identityStrategy?.type === "primaryKey"
        ? tableDetail.identityStrategy.columns
        : []
    );
    const editableColumns = tableDetail.columns.filter(
      (column) => column.visible && !column.generated && !identityColumnSet.has(column.name)
    );
    const providedColumns = editableColumns.filter((column) =>
      Object.prototype.hasOwnProperty.call(values, column.name)
    );
    const columnsToUpdate = providedColumns.filter(
      (column) => !isUnchangedSubmittedValue(currentRow[column.name], values[column.name])
    );

    if (!columnsToUpdate.length) {
      throw new ValidationError(
        providedColumns.length
          ? "No row values changed."
          : "No editable column values were provided."
      );
    }

    const setClause = columnsToUpdate
      .map((column) => `${quoteIdentifier(column.name)} = ?`)
      .join(", ");
    const setParams = columnsToUpdate.map((column) =>
      deserializeSqliteValue(values[column.name])
    );
    const sql = [
      "UPDATE",
      quoteIdentifier(tableDetail.name),
      "SET",
      setClause,
      "WHERE",
      where.clause,
    ].join(" ");

    return {
      tableDetail,
      where,
      sql,
      params: [...setParams, ...where.params],
      changes: columnsToUpdate.map((column) => ({
        column: column.name,
        oldValue: formatPreviewValue(currentRow[column.name]),
        newValue: formatPreviewValue(values[column.name]),
      })),
      warnings:
        tableDetail.identityStrategy?.type === "primaryKey" &&
        (tableDetail.identityStrategy.columns?.length ?? 0) > 1
          ? ["This update targets a row through a composite primary key."]
          : [],
    };
  }

  getRowByIdentity(db, tableDetail, where) {
    const selectExpression =
      tableDetail.identityStrategy?.type === "rowid" ? "rowid AS __rowid__, *" : "*";
    const row = db
      .prepare(
        [
          "SELECT",
          selectExpression,
          "FROM",
          quoteIdentifier(tableDetail.name),
          "WHERE",
          where.clause,
        ].join(" ")
      )
      .get(...where.params);

    if (!row) {
      return null;
    }

    const serialized = serializeRow(row);
    const identity = buildRowIdentity(tableDetail, serialized);

    if (Object.prototype.hasOwnProperty.call(serialized, "__rowid__")) {
      delete serialized.__rowid__;
    }

    return {
      ...serialized,
      __identity: identity,
    };
  }
}

module.exports = {
  DataBrowserService,
};
