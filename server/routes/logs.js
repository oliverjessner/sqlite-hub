const express = require("express");
const { DatabaseRequiredError, route, successResponse } = require("../utils/errors");

const RANGE_MS = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function normalizeOption(value, allowedValues, fallback = "all") {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function parseLimit(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? Math.min(numeric, 200) : 100;
}

function parseOffset(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function normalizeTimestamp(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function resolveTimeWindow(query = {}, now = new Date()) {
  const explicitFrom = normalizeTimestamp(query.from);
  const explicitTo = normalizeTimestamp(query.to);
  const range = normalizeOption(query.range, ["1h", "24h", "7d", "30d", "all"], "all");

  if (explicitFrom || explicitTo) {
    return {
      range,
      from: explicitFrom,
      to: explicitTo,
    };
  }

  if (range === "all") {
    return {
      range,
      from: null,
      to: null,
    };
  }

  return {
    range,
    from: new Date(now.getTime() - RANGE_MS[range]).toISOString(),
    to: now.toISOString(),
  };
}

function resolveActiveDatabase(connectionManager) {
  const activeDatabase = connectionManager.getActiveConnection() ?? null;

  if (!activeDatabase?.id) {
    throw new DatabaseRequiredError();
  }

  return activeDatabase;
}

function createLogsRouter({ appStateStore, connectionManager, now = () => new Date() }) {
  const router = express.Router();

  router.get(
    "/",
    route((req, res) => {
      const timeWindow = resolveTimeWindow(req.query, now());
      const activeDatabase = resolveActiveDatabase(connectionManager);
      const kind = normalizeOption(req.query.kind, ["all", "query", "access"], "all");
      const actor = normalizeOption(req.query.actor, ["all", "user", "cli", "api", "mcp"], "all");
      const status = normalizeOption(req.query.status, ["all", "success", "error"], "all");
      const queryType = normalizeOption(
        req.query.queryType,
        ["all", "select", "insert", "update", "delete", "pragma", "create", "alter", "drop", "other"],
        "all"
      );
      const destructive = normalizeOption(req.query.destructive, ["all", "yes", "no"], "all");
      const search = String(req.query.search ?? "").trim();
      const result = appStateStore.listActivityLogs({
        kind,
        actor: actor === "all" ? null : actor,
        status: status === "all" ? null : status,
        databaseKey: activeDatabase.id,
        queryType: queryType === "all" ? null : queryType,
        destructive,
        from: timeWindow.from,
        to: timeWindow.to,
        search,
        limit: parseLimit(req.query.limit),
        offset: parseOffset(req.query.offset),
      });

      res.json(
        successResponse({
          data: result,
          metadata: {
            ...result.filters,
            range: timeWindow.range,
            activeDatabase,
          },
        })
      );
    })
  );

  return router;
}

module.exports = {
  createLogsRouter,
  resolveActiveDatabase,
  resolveTimeWindow,
};
