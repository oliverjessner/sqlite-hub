const express = require("express");
const { route, successResponse } = require("../utils/errors");

function createSqlRouter({ appStateStore, sqlExecutor }) {
  const router = express.Router();

  router.post(
    "/execute",
    route((req, res) => {
      const result = sqlExecutor.execute(req.body.sql);
      res.json(
        successResponse({
          message: "SQL executed successfully.",
          data: result,
          timingMs: result.timingMs,
        })
      );
    })
  );

  router.get(
    "/history",
    route((req, res) => {
      res.json(
        successResponse({
          data: appStateStore.getSqlHistory(),
        })
      );
    })
  );

  router.delete(
    "/history",
    route((req, res) => {
      appStateStore.clearSqlHistory();
      res.json(
        successResponse({
          message: "SQL history cleared.",
          data: [],
        })
      );
    })
  );

  return router;
}

module.exports = {
  createSqlRouter,
};
