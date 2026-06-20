const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

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

function normalizeVersionCheckStatus(versionCheck) {
  if (!versionCheck || versionCheck.status === "unknown") {
    return versionCheck ?? null;
  }

  if (
    versionCheck.currentVersion &&
    versionCheck.latestVersion &&
    compareSemver(versionCheck.currentVersion, versionCheck.latestVersion) > 0
  ) {
    return {
      ...versionCheck,
      status: "ahead",
    };
  }

  return {
    ...versionCheck,
    status: versionCheck.updateAvailable ? "update_available" : "current",
  };
}

async function buildAppInfo(options = {}) {
  const packageName = options.packageName ?? readPackageName();
  const appVersion = options.currentVersion ?? readAppVersion();
  const sqliteVersion = options.sqliteVersion ?? readSqliteVersion();
  let versionCheck = null;

  try {
    versionCheck = await (options.versionCheckService ?? checkLatestAppVersion)({
      ...options,
      packageName,
      currentVersion: appVersion,
    });
    versionCheck = normalizeVersionCheckStatus(versionCheck);
  } catch (error) {
    versionCheck = {
      packageName,
      currentVersion: appVersion,
      latestVersion: null,
      updateAvailable: null,
      checkedAt: new Date().toISOString(),
      source: "npm",
      releaseUrl: null,
      status: "unknown",
      error: {
        message: error.message,
      },
    };
  }

  return {
    packageName,
    appVersion,
    sqliteVersion,
    port: options.port ?? null,
    url: options.url ?? null,
    versionCheck,
  };
}

module.exports = {
  VERSION_CHECK_TIMEOUT_MS,
  buildAppInfo,
  checkLatestAppVersion,
  compareSemver,
  isNewerVersion,
  readAppVersion,
  readPackageMetadata,
  readPackageName,
  readSettingsMetadata,
  readSqliteVersion,
};
