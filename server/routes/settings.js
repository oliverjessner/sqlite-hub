const express = require("express");
const { AppError, DatabaseRequiredError, route, successResponse } = require("../utils/errors");
const {
  checkLatestAppVersion,
  compareSemver,
  isNewerVersion,
  readSettingsMetadata,
  readSqliteVersion,
} = require("../services/appInfoService");

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

function createSettingsRouter({ appStateStore, connectionManager, tokenService, versionCheckService }) {
  const router = express.Router();
  const context = { connectionManager, tokenService };
  const checkVersion = versionCheckService ?? checkLatestAppVersion;

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

  router.get(
    "/version-check",
    route(async (req, res) => {
      try {
        const result = await checkVersion();

        res.json(
          successResponse({
            data: result,
            metadata: readSettingsMetadata(),
          })
        );
      } catch (error) {
        throw new AppError("Version check failed. Check your internet connection and try again.", 502, {
          code: "VERSION_CHECK_FAILED",
          details: {
            source: "npm",
            message: error.message,
          },
        });
      }
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
  checkLatestAppVersion,
  compareSemver,
  isNewerVersion,
  readSettingsMetadata,
  readSqliteVersion,
};
