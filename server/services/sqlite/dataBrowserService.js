const { NotFoundError, ValidationError } = require("../../utils/errors");
const { quoteIdentifier } = require("../../utils/identifier");
const {
  deserializeSqliteValue,
  serializeRow,
  serializeRows,
} = require("../../utils/sqliteTypes");
const { getRawStructureEntries, getTableDetail } = require("./introspection");
const { buildTableOrderClause, normalizeTableSort } = require("./tableSort");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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
    const selectExpression =
      tableDetail.identityStrategy?.type === "rowid" ? "rowid AS __rowid__, *" : "*";
    const orderClause = buildTableOrderClause(tableDetail, sort);
    const statement = db.prepare(
      [
        `SELECT ${selectExpression} FROM ${quoteIdentifier(tableName)}`,
        orderClause ? `ORDER BY ${orderClause}` : "",
        "LIMIT ? OFFSET ?",
      ]
        .filter(Boolean)
        .join(" ")
    );
    const rawRows = statement.all(limit, offset);
    const columns = statement
      .columns()
      .map((column) => column.name)
      .filter((columnName) => columnName !== "__rowid__");

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
      rowCount: tableDetail.rowCount ?? rows.length,
      limit,
      offset,
      page: Math.floor(offset / limit) + 1,
      pageCount: Math.max(1, Math.ceil((tableDetail.rowCount ?? rows.length) / limit)),
      columns,
      columnMeta: tableDetail.columns,
      foreignKeys: tableDetail.foreignKeys,
      rows,
      identityStrategy: tableDetail.identityStrategy,
      notSafelyUpdatable: tableDetail.notSafelyUpdatable,
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
    const tableDetail = getTableDetail(db, tableName, { includeRowCount: false });
    const values = payload.values ?? {};
    const identity = payload.identity ?? null;

    if (tableDetail.notSafelyUpdatable) {
      throw new ValidationError(
        `Table ${tableName} cannot be safely updated because it has no stable row identity.`
      );
    }

    const identityColumnSet = new Set(
      tableDetail.identityStrategy?.type === "primaryKey"
        ? tableDetail.identityStrategy.columns
        : []
    );
    const editableColumns = tableDetail.columns.filter(
      (column) => column.visible && !column.generated && !identityColumnSet.has(column.name)
    );
    const columnsToUpdate = editableColumns.filter((column) =>
      Object.prototype.hasOwnProperty.call(values, column.name)
    );

    if (!columnsToUpdate.length) {
      throw new ValidationError("No editable column values were provided.");
    }

    const where = this.buildWhereClause(tableDetail, identity);
    const setClause = columnsToUpdate
      .map((column) => `${quoteIdentifier(column.name)} = ?`)
      .join(", ");
    const setParams = columnsToUpdate.map((column) =>
      deserializeSqliteValue(values[column.name])
    );

    db.prepare(
      `UPDATE ${quoteIdentifier(tableName)} SET ${setClause} WHERE ${where.clause}`
    ).run(...setParams, ...where.params);

    const updatedRow = this.getRowByIdentity(db, tableDetail, where);

    if (!updatedRow) {
      throw new NotFoundError(`Row not found in table: ${tableName}`);
    }

    return {
      tableName,
      row: updatedRow,
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
      .prepare(`DELETE FROM ${quoteIdentifier(tableName)} WHERE ${where.clause}`)
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
  getRowByIdentity(db, tableDetail, where) {
    const selectExpression =
      tableDetail.identityStrategy?.type === "rowid" ? "rowid AS __rowid__, *" : "*";
    const row = db
      .prepare(
        `SELECT ${selectExpression} FROM ${quoteIdentifier(tableDetail.name)} WHERE ${where.clause}`
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
