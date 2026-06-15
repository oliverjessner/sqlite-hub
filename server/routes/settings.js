const express = require("express");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseRequiredError, route, successResponse } = require("../utils/errors");

function readAppVersion() {
  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return packageJson.version ?? "0.0.0";
}

function readSqliteVersion() {
  const db = new Database(":memory:");

  try {
    return db.prepare("SELECT sqlite_version() AS version").get().version ?? "unknown";
  } finally {
    db.close();
  }
}

function readSettingsMetadata() {
  return {
    appVersion: readAppVersion(),
    sqliteVersion: readSqliteVersion(),
  };
}

function getActiveTokenContext({ connectionManager, tokenService }) {
  const activeDatabase = connectionManager?.getActiveConnection?.() ?? null;

  return {
    activeDatabase,
    apiTokens: activeDatabase && tokenService ? tokenService.listTokens(activeDatabase.id) : [],
  };
}

function requireActiveDatabase(connectionManager) {
  const activeDatabase = connectionManager?.getActiveConnection?.() ?? null;

  if (!activeDatabase) {
    throw new DatabaseRequiredError("Select a database before managing API tokens.");
  }

  return activeDatabase;
}

function buildSettingsMetadata(context) {
  return {
    ...readSettingsMetadata(),
    ...getActiveTokenContext(context),
  };
}

function createSettingsRouter({ appStateStore, connectionManager, tokenService }) {
  const router = express.Router();
  const context = { connectionManager, tokenService };

  router.get(
    "/",
    route((req, res) => {
      res.json(
        successResponse({
          data: appStateStore.getSettings(),
          metadata: buildSettingsMetadata(context),
        })
      );
    })
  );

  router.patch(
    "/",
    route((req, res) => {
      const settings = appStateStore.patchSettings(req.body ?? {});
      res.json(
        successResponse({
          message: "Settings updated.",
          data: settings,
          metadata: buildSettingsMetadata(context),
        })
      );
    })
  );

  router.post(
    "/api-tokens",
    route((req, res) => {
      const activeDatabase = requireActiveDatabase(connectionManager);
      const token = tokenService.createToken(activeDatabase.id, req.body?.name);

      res.status(201).json(
        successResponse({
          message: "API token created. It will only be shown once.",
          data: token,
          metadata: buildSettingsMetadata(context),
        })
      );
    })
  );

  router.delete(
    "/api-tokens/:tokenId",
    route((req, res) => {
      const activeDatabase = requireActiveDatabase(connectionManager);
      const result = tokenService.deleteToken(activeDatabase.id, req.params.tokenId);

      res.json(
        successResponse({
          message: "API token deleted.",
          data: result,
          metadata: buildSettingsMetadata(context),
        })
      );
    })
  );

  return router;
}

module.exports = {
  createSettingsRouter,
  buildSettingsMetadata,
  readSettingsMetadata,
  readSqliteVersion,
};
