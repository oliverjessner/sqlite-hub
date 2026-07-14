const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { NotFoundError, ValidationError } = require("../../utils/errors");

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "utf8");
const MIN_DATABASE_SIZE_BYTES = 100;
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_CUSTOM_DIRECTORIES = 8;
const SIDECAR_PATTERN = /-(?:wal|shm|journal)$/i;
const SQLITE_EXTENSIONS = new Set([".sqlite", ".sqlite3", ".db", ".db3"]);

const MACOS_SCAN_LOCATIONS = Object.freeze({
  applicationSupport: {
    label: "Application Support",
    relativePath: ["Library", "Application Support"],
    optional: false,
  },
  containers: {
    label: "Containers",
    relativePath: ["Library", "Containers"],
    optional: false,
  },
  groupContainers: {
    label: "Group Containers",
    relativePath: ["Library", "Group Containers"],
    optional: false,
  },
  caches: {
    label: "Caches",
    relativePath: ["Library", "Caches"],
    optional: true,
  },
  webKit: {
    label: "WebKit",
    relativePath: ["Library", "WebKit"],
    optional: true,
  },
  systemApplicationSupport: {
    label: "System Application Support",
    absolutePath: "/Library/Application Support",
    optional: true,
  },
});

function createWindowsScanLocations(homeDirectory, environment = process.env) {
  const platformPath = path.win32;
  return {
    roamingAppData: {
      label: "Roaming AppData",
      absolutePath: environment.APPDATA || platformPath.join(homeDirectory, "AppData", "Roaming"),
      optional: false,
    },
    localAppData: {
      label: "Local AppData",
      absolutePath: environment.LOCALAPPDATA || platformPath.join(homeDirectory, "AppData", "Local"),
      optional: false,
    },
    programData: {
      label: "ProgramData",
      absolutePath: environment.PROGRAMDATA || platformPath.join(platformPath.parse(homeDirectory).root || "C:\\", "ProgramData"),
      optional: true,
    },
  };
}

function createLinuxScanLocations(homeDirectory, environment = process.env) {
  const platformPath = path.posix;
  return {
    xdgConfig: {
      label: "User configuration",
      absolutePath: environment.XDG_CONFIG_HOME || platformPath.join(homeDirectory, ".config"),
      optional: false,
    },
    xdgData: {
      label: "User data",
      absolutePath: environment.XDG_DATA_HOME || platformPath.join(homeDirectory, ".local", "share"),
      optional: false,
    },
    flatpakData: {
      label: "Flatpak applications",
      absolutePath: platformPath.join(homeDirectory, ".var", "app"),
      optional: false,
    },
    xdgCache: {
      label: "User cache",
      absolutePath: environment.XDG_CACHE_HOME || platformPath.join(homeDirectory, ".cache"),
      optional: true,
    },
    snapData: {
      label: "Snap applications",
      absolutePath: platformPath.join(homeDirectory, "snap"),
      optional: true,
    },
    systemData: {
      label: "System application data",
      absolutePath: "/var/lib",
      optional: true,
    },
  };
}

function createPlatformScanLocations({ platform = process.platform, homeDirectory = os.homedir(), environment = process.env } = {}) {
  if (platform === "darwin") {
    return MACOS_SCAN_LOCATIONS;
  }
  if (platform === "win32") {
    return createWindowsScanLocations(homeDirectory, environment);
  }
  return createLinuxScanLocations(homeDirectory, environment);
}

const APPLICATION_NAMES = new Map([
  ["company.thebrowser.browser", "Arc"],
  ["com.tinyspeck.slackmacgap", "Slack"],
  ["org.mozilla.firefox", "Firefox"],
  ["com.google.chrome", "Google Chrome"],
  ["com.apple.safari", "Safari"],
]);

function expandHome(inputPath, homeDirectory = os.homedir()) {
  const value = String(inputPath ?? "").trim();
  if (value === "~") {
    return homeDirectory;
  }
  return value.startsWith("~/") ? path.join(homeDirectory, value.slice(2)) : value;
}

function normalizePathForComparison(inputPath, options = {}) {
  const homeDirectory = options.homeDirectory ?? os.homedir();
  const platform = options.platform ?? process.platform;
  const absolutePath = path.resolve(expandHome(inputPath, homeDirectory));
  let canonicalPath = absolutePath;

  try {
    canonicalPath = fs.realpathSync.native(absolutePath);
  } catch {
    canonicalPath = absolutePath;
  }

  const normalized = path.normalize(canonicalPath).replace(/[\\/]+$/, "") || path.parse(canonicalPath).root;
  return platform === "darwin" || platform === "win32"
    ? normalized.toLocaleLowerCase("en-US")
    : normalized;
}

function hasPermissionBit(stat, mask) {
  return Boolean(Number(stat.mode ?? 0) & mask);
}

async function canAccess(filePath, mode, permissionMask) {
  if (!permissionMask) {
    return false;
  }

  try {
    await fs.promises.access(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

async function hasSqliteHeader(filePath) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, "r");
    const header = Buffer.alloc(SQLITE_HEADER.length);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === SQLITE_HEADER.length && header.equals(SQLITE_HEADER);
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function hasSqliteHeaderSync(filePath) {
  const handle = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(SQLITE_HEADER.length);
    const bytesRead = fs.readSync(handle, header, 0, header.length, 0);
    return bytesRead === SQLITE_HEADER.length && header.equals(SQLITE_HEADER);
  } finally {
    fs.closeSync(handle);
  }
}

function databaseNameFromPath(filePath) {
  const filename = path.basename(filePath);
  const extension = path.extname(filename).toLowerCase();
  return SQLITE_EXTENSIONS.has(extension) ? filename.slice(0, -extension.length) || filename : filename;
}

function friendlyBundleName(bundleIdentifier) {
  const normalized = String(bundleIdentifier ?? "").toLowerCase();
  if (APPLICATION_NAMES.has(normalized)) {
    return APPLICATION_NAMES.get(normalized);
  }

  return null;
}

function inferApplication(filePath, root) {
  if (root.custom) {
    return { applicationName: null, bundleIdentifier: null };
  }

  const relative = path.relative(root.path, filePath);
  const segments = relative.split(path.sep).filter(Boolean);
  const first = segments[0] ?? "";

  if (root.key === "containers" || root.key === "groupContainers") {
    const bundleIdentifier = first.replace(/^group\./i, "");
    return {
      applicationName: friendlyBundleName(bundleIdentifier),
      bundleIdentifier: bundleIdentifier || null,
    };
  }

  if (root.key === "applicationSupport" || root.key === "systemApplicationSupport") {
    const specialName = first === "Google" && segments[1] === "Chrome" ? "Google Chrome" : null;
    return {
      applicationName: specialName || friendlyBundleName(first) || first || null,
      bundleIdentifier: first.includes(".") ? first : null,
    };
  }

  return {
    applicationName: friendlyBundleName(first) || (first && !first.includes(".") ? first : null),
    bundleIdentifier: first.includes(".") ? first : null,
  };
}

function nextUniqueLabel(baseLabel, usedLabels) {
  const normalizedBase = String(baseLabel ?? "").trim() || "SQLite database";
  let candidate = normalizedBase;
  let suffix = 2;

  while (usedLabels.has(candidate.toLocaleLowerCase("en-US"))) {
    candidate = `${normalizedBase} (${suffix})`;
    suffix += 1;
  }

  usedLabels.add(candidate.toLocaleLowerCase("en-US"));
  return candidate;
}

function publicSession(session) {
  return {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    showAlreadyConnected: session.showAlreadyConnected,
    roots: session.roots.map((root) => ({ key: root.key, label: root.label, path: root.path, custom: root.custom })),
    progress: { ...session.progress },
    results: session.results.map((result) => ({ ...result })),
  };
}

class DatabaseDiscoveryService {
  constructor(options = {}) {
    this.connectionManager = options.connectionManager;
    this.homeDirectory = options.homeDirectory ?? os.homedir();
    this.platform = options.platform ?? process.platform;
    this.environment = options.environment ?? process.env;
    this.previewTimeoutMs = options.previewTimeoutMs ?? 750;
    this.sessions = new Map();
    this.scanLocations = options.scanLocations ?? createPlatformScanLocations({
      platform: this.platform,
      homeDirectory: this.homeDirectory,
      environment: this.environment,
    });
  }

  getScanLocations() {
    return Object.entries(this.scanLocations).map(([key, location]) => ({
      key,
      label: location.label,
      optional: Boolean(location.optional),
      path: location.absolutePath ?? path.join(this.homeDirectory, ...(location.relativePath ?? [])),
    }));
  }

  pruneSessions() {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, session] of this.sessions.entries()) {
      if (new Date(session.startedAt).getTime() < cutoff) {
        session.cancelled = true;
        this.sessions.delete(id);
      }
    }
  }

  resolveRoots({ locationKeys, customDirectories } = {}) {
    const requestedKeys = new Set(
      Array.isArray(locationKeys)
        ? locationKeys
        : Object.entries(this.scanLocations).filter(([, item]) => !item.optional).map(([key]) => key)
    );
    const roots = [];

    for (const [key, location] of Object.entries(this.scanLocations)) {
      if (!requestedKeys.has(key)) {
        continue;
      }
      roots.push({
        key,
        label: location.label,
        path: path.resolve(location.absolutePath ?? path.join(this.homeDirectory, ...(location.relativePath ?? []))),
        custom: false,
      });
    }

    const custom = Array.isArray(customDirectories) ? customDirectories.slice(0, MAX_CUSTOM_DIRECTORIES) : [];
    for (const directory of custom) {
      const resolved = path.resolve(expandHome(directory, this.homeDirectory));
      if (!roots.some((root) => normalizePathForComparison(root.path, this) === normalizePathForComparison(resolved, this))) {
        roots.push({ key: `custom:${roots.length}`, label: path.basename(resolved) || resolved, path: resolved, custom: true });
      }
    }

    if (!roots.length) {
      throw new ValidationError("Select at least one directory to scan.");
    }

    return roots;
  }

  getExistingConnectionMap() {
    return new Map(
      this.connectionManager.listRecentConnections().map((connection) => [
        normalizePathForComparison(connection.path, this),
        connection,
      ])
    );
  }

  startScan(options = {}) {
    this.pruneSessions();
    const session = {
      id: crypto.randomUUID(),
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      cancelled: false,
      showAlreadyConnected: Boolean(options.showAlreadyConnected),
      roots: this.resolveRoots(options),
      results: [],
      seenPaths: new Set(),
      existingConnections: this.getExistingConnectionMap(),
      progress: {
        scannedDirectories: 0,
        scannedFiles: 0,
        discoveredCount: 0,
        alreadyConnectedCount: 0,
        inaccessibleCount: 0,
        currentPath: "",
      },
    };

    this.sessions.set(session.id, session);
    this.runScan(session).catch(() => {
      if (session.status === "running") {
        session.status = "failed";
        session.completedAt = new Date().toISOString();
      }
    });
    return publicSession(session);
  }

  getSession(sessionId) {
    this.pruneSessions();
    const session = this.sessions.get(String(sessionId ?? ""));
    if (!session) {
      throw new NotFoundError("Database discovery session was not found or has expired.");
    }
    return session;
  }

  getScan(sessionId) {
    return publicSession(this.getSession(sessionId));
  }

  cancelScan(sessionId) {
    const session = this.getSession(sessionId);
    session.cancelled = true;
    if (session.status === "running") {
      session.status = "cancelled";
      session.completedAt = new Date().toISOString();
    }
    return publicSession(session);
  }

  async runScan(session) {
    for (const root of session.roots) {
      if (session.cancelled) {
        break;
      }
      await this.scanRoot(session, root);
    }

    if (!session.cancelled) {
      session.status = "completed";
      session.completedAt = new Date().toISOString();
      session.progress.currentPath = "";
    }
  }

  async scanRoot(session, root) {
    const queue = [root.path];

    while (queue.length && !session.cancelled) {
      const directoryPath = queue.shift();
      session.progress.currentPath = directoryPath;
      let directory;

      try {
        directory = await fs.promises.opendir(directoryPath);
        session.progress.scannedDirectories += 1;
      } catch {
        session.progress.inaccessibleCount += 1;
        continue;
      }

      try {
        for await (const entry of directory) {
          if (session.cancelled) {
            break;
          }
          const entryPath = path.join(directoryPath, entry.name);

          if (entry.isSymbolicLink()) {
            continue;
          }
          if (entry.isDirectory()) {
            queue.push(entryPath);
            continue;
          }
          if (!entry.isFile()) {
            continue;
          }

          session.progress.scannedFiles += 1;
          session.progress.currentPath = entryPath;
          await this.inspectCandidate(session, root, entryPath);

          if (session.progress.scannedFiles % 40 === 0) {
            await new Promise((resolve) => setImmediate(resolve));
          }
        }
      } catch {
        session.progress.inaccessibleCount += 1;
      }
    }
  }

  async inspectCandidate(session, root, filePath) {
    if (SIDECAR_PATTERN.test(filePath)) {
      return;
    }

    let stat;
    try {
      stat = await fs.promises.lstat(filePath);
    } catch {
      session.progress.inaccessibleCount += 1;
      return;
    }

    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < MIN_DATABASE_SIZE_BYTES) {
      return;
    }

    const isReadable = await canAccess(filePath, fs.constants.R_OK, hasPermissionBit(stat, 0o444));
    if (!isReadable) {
      session.progress.inaccessibleCount += 1;
      return;
    }
    if (!(await hasSqliteHeader(filePath))) {
      return;
    }

    const normalizedPath = normalizePathForComparison(filePath, this);
    if (session.seenPaths.has(normalizedPath)) {
      return;
    }
    session.seenPaths.add(normalizedPath);

    const existing = session.existingConnections.get(normalizedPath) ?? null;
    if (existing) {
      session.progress.alreadyConnectedCount += 1;
      if (!session.showAlreadyConnected) {
        return;
      }
    }

    const isWritable = await canAccess(filePath, fs.constants.W_OK, hasPermissionBit(stat, 0o222));
    const application = inferApplication(filePath, root);
    const extension = path.extname(filePath).toLowerCase();
    const hasWal = fs.existsSync(`${filePath}-wal`);
    const hasShm = fs.existsSync(`${filePath}-shm`);
    const result = {
      id: crypto.createHash("sha1").update(normalizedPath).digest("hex").slice(0, 20),
      name: databaseNameFromPath(filePath),
      path: path.resolve(filePath),
      normalizedPath,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      extension: extension || null,
      isReadable,
      isWritable,
      hasWal,
      hasShm,
      likelyInUse: hasWal || hasShm,
      applicationName: application.applicationName,
      bundleIdentifier: application.bundleIdentifier,
      sourceDirectory: root.label,
      tableCount: null,
      tableNames: [],
      sqliteVersion: null,
      previewStatus: "idle",
      previewError: null,
      isAlreadyConnected: Boolean(existing),
      existingConnectionId: existing?.id ?? null,
    };

    session.results.push(result);
    session.progress.discoveredCount += 1;
  }

  async inspectDatabase(sessionId, resultId) {
    const session = this.getSession(sessionId);
    const result = session.results.find((item) => item.id === resultId);
    if (!result) {
      throw new NotFoundError("Discovered database was not found in this scan.");
    }

    result.previewStatus = "loading";
    let db;
    try {
      db = new Database(result.path, {
        readonly: true,
        fileMustExist: true,
        timeout: this.previewTimeoutMs,
      });
      db.pragma("query_only = ON");
      db.pragma(`busy_timeout = ${this.previewTimeoutMs}`);
      const tableCount = Number(
        db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get()?.count ?? 0
      );
      const tables = db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 12")
        .all()
        .map((row) => row.name);
      result.tableCount = tableCount;
      result.tableNames = tables;
      result.sqliteVersion = db.prepare("SELECT sqlite_version() AS version").get()?.version ?? null;
      result.previewStatus = "loaded";
      result.previewError = null;
    } catch {
      result.previewStatus = "failed";
      result.previewError = "The database was detected, but its schema could not be inspected.";
    } finally {
      db?.close();
    }

    return { ...result };
  }

  resolveResult(sessionId, resultId) {
    const session = this.getSession(sessionId);
    const result = session.results.find((item) => item.id === resultId);
    if (!result) {
      throw new NotFoundError("Discovered database was not found in this scan.");
    }
    return result;
  }

  importDatabases(sessionId, resultIds = []) {
    const session = this.getSession(sessionId);
    const requestedIds = [...new Set(Array.isArray(resultIds) ? resultIds.map(String) : [])];
    if (!requestedIds.length) {
      throw new ValidationError("Select at least one database to import.");
    }

    const usedLabels = new Set(
      this.connectionManager.listRecentConnections().map((connection) => connection.label.toLocaleLowerCase("en-US"))
    );
    const existingPaths = this.getExistingConnectionMap();
    const added = [];
    const failed = [];

    for (const resultId of requestedIds) {
      const result = session.results.find((item) => item.id === resultId);
      if (!result || result.isAlreadyConnected) {
        failed.push({ id: resultId, reason: "Database is no longer importable." });
        continue;
      }

      try {
        const stat = fs.lstatSync(result.path);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.size < MIN_DATABASE_SIZE_BYTES || !hasSqliteHeaderSync(result.path)) {
          throw new Error("File is no longer a readable SQLite database.");
        }
        const normalizedPath = normalizePathForComparison(result.path, this);
        if (existingPaths.has(normalizedPath)) {
          throw new Error("Database is already connected.");
        }

        const baseLabel = result.applicationName
          ? `${result.applicationName} – ${result.name}`
          : result.name || path.basename(result.path) || path.basename(path.dirname(result.path));
        const connection = this.connectionManager.rememberConnection({
          filePath: result.path,
          label: nextUniqueLabel(baseLabel, usedLabels),
          readOnly: true,
          makeActive: false,
        });
        added.push(connection);
        existingPaths.set(normalizedPath, connection);
      } catch (error) {
        failed.push({ id: resultId, path: result.path, reason: error.message });
      }
    }

    return { added, failed, requestedCount: requestedIds.length };
  }
}

module.exports = {
  DatabaseDiscoveryService,
  MACOS_SCAN_LOCATIONS,
  MIN_DATABASE_SIZE_BYTES,
  SCAN_LOCATIONS: MACOS_SCAN_LOCATIONS,
  SIDECAR_PATTERN,
  createLinuxScanLocations,
  createPlatformScanLocations,
  createWindowsScanLocations,
  databaseNameFromPath,
  inferApplication,
  nextUniqueLabel,
  normalizePathForComparison,
};
