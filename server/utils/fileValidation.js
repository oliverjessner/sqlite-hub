const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { ConflictError, NotFoundError, ValidationError } = require("./errors");

const SQLITE_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3"]);
const SQL_DUMP_EXTENSIONS = new Set([".sql"]);
const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "utf8");
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f]/;

function splitPathSegments(filePath) {
  return String(filePath)
    .split(/[\\/]+/)
    .filter((segment) => segment && segment !== ".");
}

function hasParentTraversal(filePath) {
  return splitPathSegments(filePath).includes("..");
}

function isAbsolutePathInput(filePath) {
  return path.isAbsolute(filePath) || path.win32.isAbsolute(filePath);
}

function toAbsolutePath(filePath, baseDirectory = process.cwd()) {
  const normalizedPath = String(filePath);

  if (isAbsolutePathInput(normalizedPath)) {
    return path.normalize(normalizedPath);
  }

  return path.normalize(`${baseDirectory}${path.sep}${normalizedPath}`);
}

function assertSafePathInput(filePath, label = "File path") {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new ValidationError(`${label} is required.`);
  }

  if (CONTROL_CHARACTER_PATTERN.test(filePath)) {
    throw new ValidationError(`${label} contains unsupported control characters.`);
  }

  if (hasParentTraversal(filePath)) {
    throw new ValidationError(`${label} must not contain parent directory segments.`);
  }

  return filePath.trim();
}

function expandHome(filePath, label = "File path") {
  const normalizedPath = assertSafePathInput(filePath, label);

  if (normalizedPath === "~") {
    return os.homedir();
  }

  if (normalizedPath.startsWith("~/")) {
    return toAbsolutePath(normalizedPath.slice(2), os.homedir());
  }

  return normalizedPath;
}

function resolveBaseDirectory(baseDirectory, label = "Base directory") {
  return toAbsolutePath(assertSafePathInput(baseDirectory, label));
}

function isInsideDirectory(filePath, baseDirectory) {
  const relativePath = path.relative(baseDirectory, filePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function assertPathInsideDirectory(filePath, baseDirectory, label = "File path") {
  const resolvedBaseDirectory = resolveBaseDirectory(baseDirectory);
  const resolvedPath = toAbsolutePath(filePath);

  if (!isInsideDirectory(resolvedPath, resolvedBaseDirectory)) {
    throw new ValidationError(`${label} must stay inside ${resolvedBaseDirectory}.`);
  }

  return resolvedPath;
}

function resolveUserPath(filePath, options = {}) {
  const label = options.label ?? "File path";
  const expandedPath = expandHome(filePath, label);
  const baseDirectory = options.baseDirectory
    ? resolveBaseDirectory(options.baseDirectory)
    : null;
  const resolvedPath =
    baseDirectory && !isAbsolutePathInput(expandedPath)
      ? toAbsolutePath(expandedPath, baseDirectory)
      : toAbsolutePath(expandedPath);

  if (baseDirectory) {
    return assertPathInsideDirectory(resolvedPath, baseDirectory, label);
  }

  return resolvedPath;
}

function resolvePathInsideDirectory(baseDirectory, inputPath, label = "File path") {
  return resolveUserPath(inputPath, {
    baseDirectory,
    label,
  });
}

function assertExtension(filePath, allowedExtensions, label) {
  const extension = path.extname(filePath).toLowerCase();

  if (!allowedExtensions.has(extension)) {
    throw new ValidationError(
      `${label} must use one of: ${Array.from(allowedExtensions).join(", ")}`
    );
  }
}

function ensureFileExists(filePath, label = "File") {
  if (!fs.existsSync(filePath)) {
    throw new NotFoundError(`${label} does not exist: ${filePath}`);
  }
}

function ensureFileDoesNotExist(filePath, label = "File") {
  if (fs.existsSync(filePath)) {
    throw new ConflictError(`${label} already exists: ${filePath}`);
  }
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readSqliteHeader(filePath) {
  const handle = fs.openSync(filePath, "r");

  try {
    const header = Buffer.alloc(SQLITE_HEADER.length);
    const bytesRead = fs.readSync(handle, header, 0, SQLITE_HEADER.length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    fs.closeSync(handle);
  }
}

function isRealSqliteDatabase(filePath) {
  ensureFileExists(filePath, "SQLite database");

  const stat = fs.statSync(filePath);

  if (!stat.isFile()) {
    throw new ValidationError(`SQLite database path is not a file: ${filePath}`);
  }

  if (stat.size < SQLITE_HEADER.length) {
    return false;
  }

  return readSqliteHeader(filePath).equals(SQLITE_HEADER);
}

function validateSqlitePath(inputPath, { mustExist = true } = {}) {
  const filePath = resolveUserPath(inputPath);

  if (mustExist) {
    ensureFileExists(filePath, "SQLite database");

    if (!isRealSqliteDatabase(filePath)) {
      throw new ValidationError(`File is not a valid SQLite database: ${filePath}`);
    }
  } else {
    assertExtension(filePath, SQLITE_EXTENSIONS, "SQLite database");
  }

  return filePath;
}

function validateSqlDumpPath(inputPath) {
  const filePath = resolveUserPath(inputPath);
  assertExtension(filePath, SQL_DUMP_EXTENSIONS, "SQL dump");
  ensureFileExists(filePath, "SQL dump");
  return filePath;
}

function isWritable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.W_OK);
    return true;
  } catch (error) {
    return false;
  }
}

function getFileMetadata(filePath) {
  const stat = fs.statSync(filePath);
  const createdAt =
    Number.isFinite(stat.birthtimeMs) && stat.birthtimeMs > 0
      ? stat.birthtime
      : stat.ctime;

  return {
    path: filePath,
    sizeBytes: stat.size,
    createdAt: createdAt.toISOString(),
    lastModifiedAt: stat.mtime.toISOString(),
  };
}

module.exports = {
  SQLITE_EXTENSIONS,
  assertPathInsideDirectory,
  assertSafePathInput,
  ensureFileDoesNotExist,
  ensureParentDirectory,
  getFileMetadata,
  isRealSqliteDatabase,
  isWritable,
  resolvePathInsideDirectory,
  resolveUserPath,
  validateSqlDumpPath,
  validateSqlitePath,
};
