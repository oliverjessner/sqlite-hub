const express = require("express");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const { AppError, DatabaseRequiredError, route, successResponse } = require("../utils/errors");

const VERSION_CHECK_TIMEOUT_MS = 5000;

function readPackageMetadata() {
  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
}

function readAppVersion() {
  const packageJson = readPackageMetadata();
  return packageJson.version ?? "0.0.0";
}

function readPackageName() {
  const packageJson = readPackageMetadata();
  return packageJson.name ?? "sqlite-hub";
}

function parseSemver(value) {
  const match = String(value ?? "")
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);

  if (!match) {
    return null;
  }

  return {
    major: Number(match[1] ?? 0),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
    prerelease: match[4] ?? "",
  };
}

function compareSemver(left, right) {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);

  if (!leftVersion || !rightVersion) {
    return 0;
  }

  for (const key of ["major", "minor", "patch"]) {
    if (leftVersion[key] > rightVersion[key]) {
      return 1;
    }

    if (leftVersion[key] < rightVersion[key]) {
      return -1;
    }
  }

  if (leftVersion.prerelease && !rightVersion.prerelease) {
    return -1;
  }

  if (!leftVersion.prerelease && rightVersion.prerelease) {
    return 1;
  }

  return leftVersion.prerelease.localeCompare(rightVersion.prerelease);
}

function isNewerVersion(candidateVersion, currentVersion) {
  return compareSemver(candidateVersion, currentVersion) > 0;
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

async function fetchJsonWithTimeout(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is not available in this runtime.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? VERSION_CHECK_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "SQLite Hub version check",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Registry responded with HTTP ${response.status}.`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function checkLatestAppVersion(options = {}) {
  const packageName = options.packageName ?? readPackageName();
  const currentVersion = options.currentVersion ?? readAppVersion();
  const registryUrl =
    options.registryUrl ??
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
  const payload = await fetchJsonWithTimeout(registryUrl, options);
  const latestVersion = String(payload?.version ?? "").trim();

  if (!latestVersion) {
    throw new Error("Registry response did not include a version.");
  }

  return {
    packageName,
    currentVersion,
    latestVersion,
    updateAvailable: isNewerVersion(latestVersion, currentVersion),
    checkedAt: new Date().toISOString(),
    source: "npm",
    releaseUrl: `https://www.npmjs.com/package/${packageName}/v/${latestVersion}`,
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
