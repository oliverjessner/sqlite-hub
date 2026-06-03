const express = require("express");
const { route, successResponse } = require("../utils/errors");

function createExportRouter({ exportService }) {
  const router = express.Router();

  function sendExport(res, result) {
    res.setHeader("Content-Type", result.mimeType || "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`
    );
    res.send(result.content ?? result.csv ?? "");
  }

  function sendQueryExport(res, sql, format) {
    const result = exportService.exportQuery(sql, { format });
    sendExport(res, result);
  }

  function exportTableFromBody(body, format) {
    return exportService.exportTable(body?.tableName, {
      sortColumn: body?.sortColumn,
      sortDirection: body?.sortDirection,
      filterColumn: body?.filterColumn,
      filterOperator: body?.filterOperator,
      filterValue: body?.filterValue,
      format,
    });
  }

  function sendTableExport(res, body, format) {
    sendExport(res, exportTableFromBody(body, format));
  }

  router.post(
    "/query",
    route((req, res) => {
      const result = exportService.exportQuery(req.body?.sql, {
        format: req.body?.format || "csv",
      });

      res.json(
        successResponse({
          data: {
            filename: result.filename,
            content: result.content ?? result.csv ?? "",
            format: result.format,
            mimeType: result.mimeType,
            columns: result.columns,
            rowCount: result.rowCount,
          },
        })
      );
    })
  );

  router.post(
    "/query.csv",
    route((req, res) => {
      sendQueryExport(res, req.body?.sql, "csv");
    })
  );

  router.post(
    "/query.tsv",
    route((req, res) => {
      sendQueryExport(res, req.body?.sql, "tsv");
    })
  );

  router.post(
    "/query.md",
    route((req, res) => {
      sendQueryExport(res, req.body?.sql, "md");
    })
  );

  router.post(
    "/table",
    route((req, res) => {
      const result = exportTableFromBody(req.body, req.body?.format || "csv");

      res.json(
        successResponse({
          data: {
            filename: result.filename,
            content: result.content ?? result.csv ?? "",
            format: result.format,
            mimeType: result.mimeType,
            columns: result.columns,
            rowCount: result.rowCount,
          },
        })
      );
    })
  );

  router.post(
    "/table.csv",
    route((req, res) => {
      sendTableExport(res, req.body, "csv");
    })
  );

  router.post(
    "/table.tsv",
    route((req, res) => {
      sendTableExport(res, req.body, "tsv");
    })
  );

  router.post(
    "/table.md",
    route((req, res) => {
      sendTableExport(res, req.body, "md");
    })
  );

  router.get(
    "/table/:tableName.csv",
    route((req, res) => {
      const result = exportService.exportTable(req.params.tableName);
      sendExport(res, result);
    })
  );

  return router;
}

module.exports = {
  createExportRouter,
};
