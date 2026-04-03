const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { route, successResponse } = require("../utils/errors");

function readAppVersion() {
  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return packageJson.version ?? "0.0.0";
}

function createSettingsRouter({ appStateStore }) {
  const router = express.Router();

  router.get(
    "/",
    route((req, res) => {
      res.json(
        successResponse({
          data: appStateStore.getSettings(),
          metadata: {
            appVersion: readAppVersion(),
          },
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
          metadata: {
            appVersion: readAppVersion(),
          },
        })
      );
    })
  );

  return router;
}

module.exports = {
  createSettingsRouter,
};
