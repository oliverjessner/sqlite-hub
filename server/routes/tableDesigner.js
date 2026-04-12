const express = require("express");
const { route, successResponse } = require("../utils/errors");

function createTableDesignerRouter({ tableDesignerService }) {
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

      res.json(
        successResponse({
          message: isCreate
            ? fillsImportedRows
              ? "Table created and filled from CSV."
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
