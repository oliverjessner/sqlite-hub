const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const APP_NAME = "sqlite-hub";
const APP_STATE_DB_FILENAME = "sqlite-hub-state.db";
const LEGACY_STATE_FILENAME = "app-state.json";

function resolveAppStateDirectory() {
  const homeDirectory = os.homedir();

  if (process.platform === "darwin") {
    return path.join(homeDirectory, "Library", "Application Support", APP_NAME);
  }

  if (process.platform === "win32") {
    const appDataDirectory =
      process.env.APPDATA || path.join(homeDirectory, "AppData", "Roaming");

    return path.join(appDataDirectory, APP_NAME);
  }

  if (process.env.XDG_STATE_HOME) {
    return path.join(process.env.XDG_STATE_HOME, APP_NAME);
  }

  return path.join(homeDirectory, ".local", "state", APP_NAME);
}

function resolvePackagedDataDirectory(packageRoot) {
  return path.resolve(packageRoot, "data");
}

function resolvePackagedAppStateDbPath(packageRoot) {
  return path.join(resolvePackagedDataDirectory(packageRoot), APP_STATE_DB_FILENAME);
}

function resolvePackagedLegacyStatePath(packageRoot) {
  return path.join(resolvePackagedDataDirectory(packageRoot), LEGACY_STATE_FILENAME);
}

function resolveHomebrewCellarInfo(packageRoot) {
  const resolvedPackageRoot = path.resolve(packageRoot);
  const { root } = path.parse(resolvedPackageRoot);
  const relativeSegments = resolvedPackageRoot
    .slice(root.length)
    .split(path.sep)
    .filter(Boolean);
  const cellarIndex = relativeSegments.indexOf("Cellar");

  if (cellarIndex === -1) {
    return null;
  }

  const formulaName = relativeSegments[cellarIndex + 1];
  const currentVersion = relativeSegments[cellarIndex + 2];

  if (formulaName !== APP_NAME || !currentVersion) {
    return null;
  }

  return {
    cellarRoot: path.join(root, ...relativeSegments.slice(0, cellarIndex + 2)),
    currentVersion,
  };
}

function safeStatMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return -1;
  }
}

function collectHomebrewLegacyStateDbPaths(packageRoot) {
  const cellarInfo = resolveHomebrewCellarInfo(packageRoot);

  if (!cellarInfo || !fs.existsSync(cellarInfo.cellarRoot)) {
    return [];
  }

  return fs
    .readdirSync(cellarInfo.cellarRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== cellarInfo.currentVersion)
    .map((entry) => {
      const candidatePath = path.join(
        cellarInfo.cellarRoot,
        entry.name,
        "libexec",
        "lib",
        "node_modules",
        APP_NAME,
        "data",
        APP_STATE_DB_FILENAME
      );

      return {
        path: candidatePath,
        mtimeMs: safeStatMtimeMs(candidatePath),
      };
    })
    .filter((candidate) => candidate.mtimeMs >= 0)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .map((candidate) => candidate.path);
}

function collectLegacyDatabasePaths(packageRoot) {
  return [
    resolvePackagedAppStateDbPath(packageRoot),
    ...collectHomebrewLegacyStateDbPaths(packageRoot),
  ].filter((candidatePath, index, candidates) => candidates.indexOf(candidatePath) === index);
}

function resolveAppStatePaths(packageRoot) {
  const appStateDirectory = resolveAppStateDirectory();

  return {
    appStateDirectory,
    appStateDbPath: path.join(appStateDirectory, APP_STATE_DB_FILENAME),
    legacyStatePath: resolvePackagedLegacyStatePath(packageRoot),
    legacyDatabasePaths: collectLegacyDatabasePaths(packageRoot),
  };
}

module.exports = {
  APP_NAME,
  APP_STATE_DB_FILENAME,
  resolveAppStateDirectory,
  resolveAppStatePaths,
};
