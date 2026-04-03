const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { ConflictError, NotFoundError, ValidationError } = require("./errors");

const SQLITE_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3"]);
const SQL_DUMP_EXTENSIONS = new Set([".sql"]);
const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "utf8");

function expandHome(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new ValidationError("A file path is required.");
  }

  if (filePath === "~") {
    return os.homedir();
  }

  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }

  return filePath;
}

function resolveUserPath(filePath) {
  return path.resolve(expandHome(filePath));
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
  assertExtension(filePath, SQLITE_EXTENSIONS, "SQLite database");

  if (mustExist) {
    ensureFileExists(filePath, "SQLite database");

    if (!isRealSqliteDatabase(filePath)) {
      throw new ValidationError(`File is not a valid SQLite database: ${filePath}`);
    }
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

  return {
    path: filePath,
    sizeBytes: stat.size,
    lastModifiedAt: stat.mtime.toISOString(),
  };
}

module.exports = {
  SQLITE_EXTENSIONS,
  ensureFileDoesNotExist,
  ensureParentDirectory,
  getFileMetadata,
  isRealSqliteDatabase,
  isWritable,
  resolveUserPath,
  validateSqlDumpPath,
  validateSqlitePath,
};
