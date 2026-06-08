const express = require("express");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const { route, successResponse } = require("../utils/errors");

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

function createSettingsRouter({ appStateStore }) {
  const router = express.Router();

  router.get(
    "/",
    route((req, res) => {
      res.json(
        successResponse({
          data: appStateStore.getSettings(),
          metadata: readSettingsMetadata(),
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
          metadata: readSettingsMetadata(),
        })
      );
    })
  );

  return router;
}

module.exports = {
  createSettingsRouter,
  readSettingsMetadata,
  readSqliteVersion,
};
