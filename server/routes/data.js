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
      });

      res.json(
        successResponse({
          data,
          readOnly: data.notSafelyUpdatable,
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

  return router;
}

module.exports = {
  createDataRouter,
};
