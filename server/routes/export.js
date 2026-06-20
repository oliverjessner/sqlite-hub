const express = require("express");
const { route, successResponse, ValidationError } = require("../utils/errors");

function createExportRouter({ exportService }) {
  const router = express.Router();

  function normalizeRequestFormat(format = "csv") {
    return String(format ?? "csv").toLowerCase();
  }

  function assertJsonExportFormat(format) {
    if (normalizeRequestFormat(format) === "parquet") {
      throw new ValidationError("Parquet exports are binary and must use the download endpoint.");
    }
  }

  function sendExport(res, result) {
    res.setHeader("Content-Type", result.mimeType || "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`
    );
    res.send(result.content ?? result.csv ?? "");
  }

  async function sendQueryExport(res, sql, format) {
    const result = await exportService.exportQueryDownload(sql, { format });
    sendExport(res, result);
  }

  async function exportTableFromBody(body, format) {
    return exportService.exportTableDownload(body?.tableName, {
      sortColumn: body?.sortColumn,
      sortDirection: body?.sortDirection,
      filterColumn: body?.filterColumn,
      filterOperator: body?.filterOperator,
      filterValue: body?.filterValue,
      format,
    });
  }

  async function sendTableExport(res, body, format) {
    sendExport(res, await exportTableFromBody(body, format));
  }

  router.post(
    "/query",
    route((req, res) => {
      assertJsonExportFormat(req.body?.format);
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
    route(async (req, res) => {
      await sendQueryExport(res, req.body?.sql, "csv");
    })
  );

  router.post(
    "/query.tsv",
    route(async (req, res) => {
      await sendQueryExport(res, req.body?.sql, "tsv");
    })
  );

  router.post(
    "/query.md",
    route(async (req, res) => {
      await sendQueryExport(res, req.body?.sql, "md");
    })
  );

  router.post(
    "/query.json",
    route(async (req, res) => {
      await sendQueryExport(res, req.body?.sql, "json");
    })
  );

  router.post(
    "/query.parquet",
    route(async (req, res) => {
      await sendQueryExport(res, req.body?.sql, "parquet");
    })
  );

  router.post(
    "/table",
    route((req, res) => {
      assertJsonExportFormat(req.body?.format);
      const result = exportService.exportTable(req.body?.tableName, {
        sortColumn: req.body?.sortColumn,
        sortDirection: req.body?.sortDirection,
        filterColumn: req.body?.filterColumn,
        filterOperator: req.body?.filterOperator,
        filterValue: req.body?.filterValue,
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
    "/table.csv",
    route(async (req, res) => {
      await sendTableExport(res, req.body, "csv");
    })
  );

  router.post(
    "/table.tsv",
    route(async (req, res) => {
      await sendTableExport(res, req.body, "tsv");
    })
  );

  router.post(
    "/table.md",
    route(async (req, res) => {
      await sendTableExport(res, req.body, "md");
    })
  );

  router.post(
    "/table.json",
    route(async (req, res) => {
      await sendTableExport(res, req.body, "json");
    })
  );

  router.post(
    "/table.parquet",
    route(async (req, res) => {
      await sendTableExport(res, req.body, "parquet");
    })
  );

  router.get(
    "/table/:tableName.csv",
    route(async (req, res) => {
      const result = await exportService.exportTableDownload(req.params.tableName);
      sendExport(res, result);
    })
  );

  router.get(
    "/table/:tableName.json",
    route(async (req, res) => {
      const result = await exportService.exportTableDownload(req.params.tableName, {
        format: "json",
      });
      sendExport(res, result);
    })
  );

  router.get(
    "/table/:tableName.parquet",
    route(async (req, res) => {
      const result = await exportService.exportTableDownload(req.params.tableName, {
        format: "parquet",
      });
      sendExport(res, result);
    })
  );

  return router;
}

module.exports = {
  createExportRouter,
};
