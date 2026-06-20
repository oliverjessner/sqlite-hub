const express = require("express");
const { createApiTokenAuth } = require("../middleware/apiTokenAuth");
const { readBearerToken } = require("../middleware/apiTokenAuth");
const { AuthenticationError, ValidationError, route, successResponse } = require("../utils/errors");
const { buildAppInfo } = require("../services/appInfoService");

function buildRequestBaseUrl(req) {
  const host = req.get("host") ?? `127.0.0.1:${req.socket.localPort ?? ""}`;
  return `${req.protocol}://${host}`;
}

function readDatabaseId(req) {
  return String(req.body?.databaseId ?? req.query.databaseId ?? "").trim();
}

function readSqlText(req) {
  return String(req.body?.sql ?? req.body?.query ?? req.query.sql ?? req.query.query ?? "");
}

function authenticateDatabaseRequest(req, tokenService, databaseId) {
  const token = readBearerToken(req.get("authorization"));

  if (!token) {
    throw new AuthenticationError("Bearer API token is required.", {
      code: "API_TOKEN_REQUIRED",
    });
  }

  return tokenService.authenticate(databaseId, token);
}

function createExternalApiRouter({ databaseService, tokenService, appInfoService = buildAppInfo }) {
  const router = express.Router();

  router.get(
    "/info",
    route(async (req, res) => {
      const port = Number(req.socket.localPort);
      const data = await appInfoService({
        port: Number.isInteger(port) ? port : null,
        url: buildRequestBaseUrl(req),
      });

      res.json(successResponse({ data }));
    })
  );

  router.post(
    "/query",
    route((req, res) => {
      const databaseId = readDatabaseId(req);
      const sql = readSqlText(req);

      if (!databaseId) {
        throw new ValidationError("databaseId is required.");
      }

      authenticateDatabaseRequest(req, tokenService, databaseId);

      const { result } = databaseService.executeRawQuery(databaseId, sql);

      res.json(
        successResponse({
          message: "SQL executed successfully.",
          data: result,
          metadata: {
            databaseId,
          },
          timingMs: result.timingMs,
          readOnly: false,
        })
      );
    })
  );

  router.use(
    "/databases/:databaseId",
    createApiTokenAuth({ tokenService })
  );

  router.get(
    "/databases/:databaseId",
    route((req, res) => {
      res.json(
        successResponse({
          data: databaseService.getDatabase(req.params.databaseId),
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/tables",
    route((req, res) => {
      res.json(
        successResponse({
          data: { items: databaseService.listTables(req.params.databaseId) },
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/tables/:tableName",
    route((req, res) => {
      res.json(
        successResponse({
          data: databaseService.getTable(req.params.databaseId, req.params.tableName),
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.post(
    "/databases/:databaseId/tables/:tableName/row",
    route((req, res) => {
      const result = databaseService.getTableRow(
        req.params.databaseId,
        req.params.tableName,
        req.body?.key
      );

      res.json(
        successResponse({
          data: result.data,
          metadata: {
            databaseId: req.params.databaseId,
            filename: result.filename,
            identity: result.identity,
            tableName: result.table.name,
          },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/queries",
    route((req, res) => {
      res.json(
        successResponse({
          data: databaseService.listSavedQueries(req.params.databaseId),
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.post(
    "/databases/:databaseId/queries/:queryName/execute",
    route((req, res) => {
      const { query, result } = databaseService.executeSavedQuery(
        req.params.databaseId,
        req.params.queryName
      );

      res.json(
        successResponse({
          message: "Saved query executed successfully.",
          data: result,
          metadata: {
            databaseId: req.params.databaseId,
            query,
          },
          timingMs: result.timingMs,
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/queries/:queryName/export",
    route((req, res) => {
      const { query, result } = databaseService.exportSavedQuery(
        req.params.databaseId,
        req.params.queryName,
        req.query.format || "csv"
      );

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
          metadata: {
            databaseId: req.params.databaseId,
            query,
          },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/queries/:queryName/notes",
    route((req, res) => {
      const query = databaseService.getSavedQuery(
        req.params.databaseId,
        req.params.queryName
      );

      res.json(
        successResponse({
          data: { notes: String(query.notes ?? "") },
          metadata: { databaseId: req.params.databaseId, query },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/queries/:queryName",
    route((req, res) => {
      res.json(
        successResponse({
          data: databaseService.getSavedQuery(
            req.params.databaseId,
            req.params.queryName
          ),
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/documents",
    route((req, res) => {
      res.json(
        successResponse({
          data: { items: databaseService.listDocuments(req.params.databaseId) },
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/documents/:documentName/export",
    route((req, res) => {
      const result = databaseService.exportDocument(
        req.params.databaseId,
        req.params.documentName
      );

      res.json(
        successResponse({
          data: {
            filename: result.filename,
            content: result.content,
            mimeType: result.mimeType,
          },
          metadata: {
            databaseId: req.params.databaseId,
            document: result.document,
          },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/documents/:documentName",
    route((req, res) => {
      res.json(
        successResponse({
          data: databaseService.getDocument(
            req.params.databaseId,
            req.params.documentName
          ),
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  return router;
}

module.exports = {
  createExternalApiRouter,
};
