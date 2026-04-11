const express = require("express");
const { route } = require("../utils/errors");

function createExportRouter({ exportService }) {
  const router = express.Router();

  function sendCsv(res, result) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`
    );
    res.send(result.csv);
  }

  router.post(
    "/query.csv",
    route((req, res) => {
      const result = exportService.exportQuery(req.body.sql);
      sendCsv(res, result);
    })
  );

  router.post(
    "/table.csv",
    route((req, res) => {
      const result = exportService.exportTable(req.body?.tableName, {
        sortColumn: req.body?.sortColumn,
        sortDirection: req.body?.sortDirection,
      });
      sendCsv(res, result);
    })
  );

  router.get(
    "/table/:tableName.csv",
    route((req, res) => {
      const result = exportService.exportTable(req.params.tableName);
      sendCsv(res, result);
    })
  );

  return router;
}

module.exports = {
  createExportRouter,
};
