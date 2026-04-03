const express = require("express");
const { route, successResponse } = require("../utils/errors");

function createOverviewRouter({ overviewService }) {
  const router = express.Router();

  router.get(
    "/overview",
    route((req, res) => {
      const data = overviewService.getOverview();
      res.json(
        successResponse({
          data,
          readOnly: data.connection.readOnly,
          warnings: data.warnings,
        })
      );
    })
  );

  router.get(
    "/status",
    route((req, res) => {
      const data = overviewService.getStatus();
      res.json(
        successResponse({
          data,
          readOnly: data.readOnly,
        })
      );
    })
  );

  return router;
}

module.exports = {
  createOverviewRouter,
};
