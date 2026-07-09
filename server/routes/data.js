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
