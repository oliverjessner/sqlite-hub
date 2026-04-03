const express = require("express");
const { route } = require("../utils/errors");

function createExportRouter({ exportService }) {
  const router = express.Router();

  router.post(
    "/query.csv",
    route((req, res) => {
      const result = exportService.exportQuery(req.body.sql);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.filename}"`
      );
      res.send(result.csv);
    })
  );

  return router;
}

module.exports = {
  createExportRouter,
};
