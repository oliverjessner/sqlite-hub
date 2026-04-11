const express = require("express");
const { route, successResponse } = require("../utils/errors");

function parseBooleanFlag(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return ["1", "true", "yes", "on"].includes(normalized);
}

function parseListLimit(value, fallback = 30, max = 100) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 1) {
    return fallback;
  }

  return Math.min(max, Math.round(numericValue));
}

function parseOffset(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.round(numericValue);
}

function getActiveDatabaseKey(connectionManager) {
  return connectionManager.getActiveConnection()?.id ?? null;
}

function createSqlRouter({ appStateStore, connectionManager, sqlExecutor }) {
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
      const databaseKey = getActiveDatabaseKey(connectionManager);
      const tab = String(req.query.tab ?? "recent").trim().toLowerCase();
      const options = {
        databaseKey,
        limit: parseListLimit(req.query.limit, 30, 100),
        offset: parseOffset(req.query.offset),
        search: String(req.query.search ?? ""),
        queryType: String(req.query.queryType ?? "").trim() || null,
        onlySaved: parseBooleanFlag(req.query.onlySaved),
        onlyFavorites: parseBooleanFlag(req.query.onlyFavorites),
      };
      const result =
        tab === "failed"
          ? appStateStore.getFailedQueries(options)
          : appStateStore.getRecentQueries({
              ...options,
              onlySaved: tab === "saved" ? true : options.onlySaved,
            });

      res.json(
        successResponse({
          data: result,
          metadata: {
            databaseKey,
            tab,
          },
        })
      );
    })
  );

  router.delete(
    "/history",
    route((req, res) => {
      const databaseKey = getActiveDatabaseKey(connectionManager);
      const deletedCount = appStateStore.clearQueryHistoryForDatabase(databaseKey);

      res.json(
        successResponse({
          message: deletedCount
            ? "Query history cleared for the active database."
            : "No query history was found for the active database.",
          data: {
            deletedCount,
          },
          metadata: {
            databaseKey,
          },
        })
      );
    })
  );

  router.get(
    "/history/:historyId/runs",
    route((req, res) => {
      res.json(
        successResponse({
          data: appStateStore.getQueryRunsByHistoryId(
            req.params.historyId,
            parseListLimit(req.query.limit, 8, 50)
          ),
        })
      );
    })
  );

  router.patch(
    "/history/:historyId/favorite",
    route((req, res) => {
      const nextValue = parseBooleanFlag(req.body?.value);
      res.json(
        successResponse({
          message: nextValue ? "Query favorited." : "Query removed from favorites.",
          data: appStateStore.toggleFavorite(req.params.historyId, nextValue),
        })
      );
    })
  );

  router.patch(
    "/history/:historyId/saved",
    route((req, res) => {
      const nextValue = parseBooleanFlag(req.body?.value);
      res.json(
        successResponse({
          message: nextValue ? "Query saved." : "Query removed from saved queries.",
          data: appStateStore.toggleSaved(req.params.historyId, nextValue),
        })
      );
    })
  );

  router.patch(
    "/history/:historyId/title",
    route((req, res) => {
      res.json(
        successResponse({
          message: "Query title updated.",
          data: appStateStore.renameQuery(req.params.historyId, req.body?.title),
        })
      );
    })
  );

  router.patch(
    "/history/:historyId/notes",
    route((req, res) => {
      res.json(
        successResponse({
          message: "Query notes updated.",
          data: appStateStore.updateQueryNotes(req.params.historyId, req.body?.notes),
        })
      );
    })
  );

  router.delete(
    "/history/:historyId",
    route((req, res) => {
      appStateStore.deleteQueryHistoryItem(req.params.historyId);
      res.json(
        successResponse({
          message: "Query history item deleted.",
          data: {
            id: Number(req.params.historyId),
          },
        })
      );
    })
  );

  router.get(
    "/history/:historyId",
    route((req, res) => {
      res.json(
        successResponse({
          data: appStateStore.getQueryHistoryItemById(req.params.historyId),
        })
      );
    })
  );

  return router;
}

module.exports = {
  createSqlRouter,
};
