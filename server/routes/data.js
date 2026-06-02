const express = require("express");
const { route, successResponse } = require("../utils/errors");

function createDataRouter({ dataBrowserService }) {
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
    "/:tableName",
    route((req, res) => {
      const data = dataBrowserService.getTableData(req.params.tableName, {
        limit: req.query.limit,
        offset: req.query.offset,
        sortColumn: req.query.sortColumn,
        sortDirection: req.query.sortDirection,
      });

      res.json(
        successResponse({
          data,
          readOnly: data.notSafelyUpdatable,
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

  router.patch(
    "/:tableName/rows",
    route((req, res) => {
      const data = dataBrowserService.updateTableRow(req.params.tableName, req.body ?? {});

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
