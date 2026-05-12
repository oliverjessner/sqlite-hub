const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  assertSafePathInput,
  resolvePathInsideDirectory,
} = require("./fileValidation");

const APP_NAME = "sqlite-hub";
const APP_STATE_DB_FILENAME = "sqlite-hub-state.db";
const LEGACY_STATE_FILENAME = "app-state.json";
const SAFE_HOMEBREW_SEGMENT_PATTERN = /^[a-zA-Z0-9._+-]+$/;

function isSafeHomebrewSegment(segment) {
  return (
    typeof segment === "string" &&
    SAFE_HOMEBREW_SEGMENT_PATTERN.test(segment) &&
    segment !== "." &&
    segment !== ".."
  );
}

function resolvePackagedDataDirectories(packageRoot) {
  return [
    path.resolve(packageRoot, "server", "data"),
    path.resolve(packageRoot, "data"),
  ].filter((candidatePath, index, candidates) => candidates.indexOf(candidatePath) === index);
}

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
  return resolvePackagedDataDirectories(packageRoot)[0];
}

function resolvePackagedAppStateDbPath(packageRoot) {
  return path.join(resolvePackagedDataDirectory(packageRoot), APP_STATE_DB_FILENAME);
}

function resolvePackagedLegacyStatePath(packageRoot) {
  const candidates = resolvePackagedDataDirectories(packageRoot).map((directoryPath) =>
    path.join(directoryPath, LEGACY_STATE_FILENAME)
  );

  return candidates.find((candidatePath) => fs.existsSync(candidatePath)) ?? candidates[0];
}

function resolveHomebrewCellarInfo(packageRoot) {
  const resolvedPackageRoot = path.resolve(assertSafePathInput(packageRoot, "Package root"));
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

  if (
    formulaName !== APP_NAME ||
    !isSafeHomebrewSegment(currentVersion) ||
    !isSafeHomebrewSegment(formulaName)
  ) {
    return null;
  }

  return {
    cellarRoot: path.resolve(root, ...relativeSegments.slice(0, cellarIndex + 2)),
    currentVersion,
  };
}

function resolveLegacyStateDbPath(cellarRoot, versionName, dataSegments) {
  const versionRoot = resolvePathInsideDirectory(
    cellarRoot,
    versionName,
    "Homebrew version directory"
  );
  const packagedDataSegments = Array.isArray(dataSegments)
    ? dataSegments
    : [dataSegments];

  return resolvePathInsideDirectory(
    versionRoot,
    path.join(
      "libexec",
      "lib",
      "node_modules",
      APP_NAME,
      ...packagedDataSegments,
      APP_STATE_DB_FILENAME
    ),
    "Legacy app state database path"
  );
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
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== cellarInfo.currentVersion &&
        isSafeHomebrewSegment(entry.name)
    )
    .flatMap((entry) =>
      [
        resolveLegacyStateDbPath(
          cellarInfo.cellarRoot,
          entry.name,
          ["server", "data"]
        ),
        resolveLegacyStateDbPath(
          cellarInfo.cellarRoot,
          entry.name,
          ["data"]
        ),
      ].map((candidatePath) => ({
        path: candidatePath,
        mtimeMs: safeStatMtimeMs(candidatePath),
      }))
    )
    .filter((candidate) => candidate.mtimeMs >= 0)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .map((candidate) => candidate.path);
}

function collectLegacyDatabasePaths(packageRoot) {
  return [
    ...resolvePackagedDataDirectories(packageRoot).map((directoryPath) =>
      path.join(directoryPath, APP_STATE_DB_FILENAME)
    ),
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
