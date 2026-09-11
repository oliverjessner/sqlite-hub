const express = require("express");
const { route, successResponse } = require("../utils/errors");
const { recordUserAction } = require("../utils/userActionLog");

function createDataRouter({ dataBrowserService, appStateStore = null, connectionManager = null }) {
  const router = express.Router();

  router.get(
    "/",
    route((req, res) => {
      const tables = dataBrowserService.listTables();

      res.json(
        successResponse({
          data: {
            tables,
          },
          readOnly: false,
        })
      );
    })
  );

  router.get(
    "/:tableName/advisor",
    route((req, res) => {
      const data = dataBrowserService.analyzeTable(req.params.tableName);

      res.json(
        successResponse({
          message: "Table analysis complete.",
          data,
          readOnly: true,
        })
      );
    })
  );

  router.get(
    "/:tableName",
    route((req, res) => {
      const data = dataBrowserService.getTableData(req.params.tableName, {
        limit: req.query.limit,
        offset: req.query.offset,
        sortColumn: req.query.sortColumn,
        sortDirection: req.query.sortDirection,
        filterColumn: req.query.filterColumn,
        filterOperator: req.query.filterOperator,
        filterValue: req.query.filterValue,
      });

      res.json(
        successResponse({
          data,
          readOnly: data.notSafelyUpdatable || data.isShadow,
        })
      );
    })
  );

  router.post(
    "/:tableName/row",
    route((req, res) => {
      const data = dataBrowserService.getTableRow(req.params.tableName, req.body ?? {});

      res.json(
        successResponse({
          data,
          readOnly: false,
        })
      );
    })
  );

  router.post(
    "/:tableName/generate/preview",
    route((req, res) => {
      const data = dataBrowserService.previewSyntheticRows(req.params.tableName, req.body ?? {});

      res.json(
        successResponse({
          message: "Synthetic data preview generated.",
          data,
          readOnly: false,
        })
      );
    })
  );

  router.post(
    "/:tableName/generate/insert",
    route((req, res) => {
      const data = dataBrowserService.insertSyntheticRows(req.params.tableName, req.body ?? {});
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "data.generate.insert",
        targetType: "table",
        targetName: data.tableName ?? req.params.tableName,
        metadata: {
          insertedRowCount: data.insertedRowCount ?? null,
        },
      });

      res.json(
        successResponse({
          message: `Generated ${data.insertedRowCount} rows for ${data.tableName}.`,
          data,
          readOnly: false,
        })
      );
    })
  );

  router.patch(
    "/:tableName/rows",
    route((req, res) => {
      const data = dataBrowserService.updateTableRow(req.params.tableName, req.body ?? {});
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "data.row.update",
        targetType: "table",
        targetName: data.tableName ?? req.params.tableName,
      });

      res.json(
        successResponse({
          message: "Table row updated.",
          data,
        })
      );
    })
  );

  router.post(
    "/:tableName/rows",
    route((req, res) => {
      const data = dataBrowserService.insertTableRow(req.params.tableName, req.body ?? {});
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "data.row.insert",
        targetType: "table",
        targetName: data.tableName ?? req.params.tableName,
      });

      res.json(
        successResponse({
          message: "Table row added.",
          data,
        })
      );
    })
  );

  router.post(
    "/:tableName/columns",
    route((req, res) => {
      const data = dataBrowserService.addTableColumn(req.params.tableName, req.body ?? {});
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "data.column.add",
        targetType: "table",
        targetName: data.tableName ?? req.params.tableName,
        metadata: { columnName: data.columnName },
      });

      res.json(successResponse({ message: "Table column added.", data }));
    })
  );

  router.patch(
    "/:tableName/columns/:columnName",
    route((req, res) => {
      const data = dataBrowserService.renameTableColumn(
        req.params.tableName,
        req.params.columnName,
        req.body ?? {}
      );
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "data.column.rename",
        targetType: "table",
        targetName: data.tableName ?? req.params.tableName,
        metadata: {
          previousColumnName: data.previousColumnName,
          columnName: data.columnName,
        },
      });

      res.json(successResponse({ message: "Table column renamed.", data }));
    })
  );

  router.delete(
    "/:tableName/columns/:columnName",
    route((req, res) => {
      const data = dataBrowserService.deleteTableColumn(
        req.params.tableName,
        req.params.columnName
      );
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "data.column.delete",
        targetType: "table",
        targetName: data.tableName ?? req.params.tableName,
        metadata: { columnName: data.columnName },
      });

      res.json(successResponse({ message: "Table column deleted.", data }));
    })
  );

  router.post(
    "/:tableName/rows/preview-update",
    route((req, res) => {
      const data = dataBrowserService.previewTableRowUpdate(req.params.tableName, req.body ?? {});

      res.json(
        successResponse({
          message: "Table row update preview generated.",
          data,
        })
      );
    })
  );

  router.delete(
    "/:tableName/rows",
    route((req, res) => {
      const data = dataBrowserService.deleteTableRow(req.params.tableName, req.body ?? {});
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "data.row.delete",
        targetType: "table",
        targetName: data.tableName ?? req.params.tableName,
        metadata: {
          affectedRowCount: data.affectedRowCount ?? null,
        },
      });

      res.json(
        successResponse({
          message: "Table row deleted.",
          data,
        })
      );
    })
  );

  return router;
}

module.exports = {
  createDataRouter,
};
