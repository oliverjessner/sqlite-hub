const express = require("express");
const { route, successResponse } = require("../utils/errors");
const { recordUserAction } = require("../utils/userActionLog");

function createTableDesignerRouter({ tableDesignerService, appStateStore = null, connectionManager = null }) {
  const router = express.Router();

  router.get(
    "/",
    route((req, res) => {
      const data = tableDesignerService.getOverview();

      res.json(
        successResponse({
          data,
          readOnly: false,
        })
      );
    })
  );

  router.post(
    "/validate-check",
    route((req, res) => {
      const data = tableDesignerService.validateCheckExpression(req.body ?? {});

      res.json(
        successResponse({
          data,
          message: "CHECK expression validated.",
        })
      );
    })
  );

  router.get(
    "/:tableName",
    route((req, res) => {
      const data = tableDesignerService.getTableDraft(req.params.tableName);

      res.json(
        successResponse({
          data,
          readOnly: false,
        })
      );
    })
  );

  router.post(
    "/save",
    route((req, res) => {
      const data = tableDesignerService.saveDraft(req.body ?? {});
      const isCreate = String(req.body?.draft?.mode ?? req.body?.mode ?? "").trim() !== "edit";
      const fillsImportedRows = Boolean(req.body?.draft?.fillImportedRows ?? req.body?.fillImportedRows);
      const importedRows = req.body?.draft?.importRows ?? req.body?.draft?.importedCsvRows ?? [];
      const executedSqlCount = Array.isArray(data.executedSql) ? data.executedSql.length : 0;

      if (isCreate || executedSqlCount > 0) {
        recordUserAction({
          appStateStore,
          connectionManager,
          action: isCreate ? "table-designer.table.create" : "table-designer.table.update",
          targetType: "table",
          targetName: data.savedTableName ?? req.body?.draft?.tableName ?? req.body?.tableName,
          metadata: {
            mode: isCreate ? "create" : "edit",
            executedSqlCount,
            fillsImportedRows,
            importedRowCount: fillsImportedRows && Array.isArray(importedRows) ? importedRows.length : 0,
          },
        });
      }

      res.json(
        successResponse({
          message: isCreate
            ? fillsImportedRows
              ? "Table created and data imported."
              : "Table created."
            : "Table schema updated.",
          data,
        })
      );
    })
  );

  return router;
}

module.exports = {
  createTableDesignerRouter,
};
