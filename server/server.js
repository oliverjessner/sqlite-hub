const express = require("express");
const path = require("node:path");
const { errorMiddleware } = require("./utils/errors");
const { resolveAppStatePaths } = require("./utils/appPaths");
const { AppStateStore } = require("./services/storage/appStateStore");
const { ConnectionManager } = require("./services/sqlite/connectionManager");
const { OverviewService } = require("./services/sqlite/overviewService");
const { SqlExecutor } = require("./services/sqlite/sqlExecutor");
const { ImportService } = require("./services/sqlite/importService");
const { ExportService } = require("./services/sqlite/exportService");
const { StructureService } = require("./services/sqlite/structureService");
const { DataBrowserService } = require("./services/sqlite/dataBrowserService");
const { createConnectionsRouter } = require("./routes/connections");
const { createOverviewRouter } = require("./routes/overview");
const { createSqlRouter } = require("./routes/sql");
const { createStructureRouter } = require("./routes/structure");
const { createDataRouter } = require("./routes/data");
const { createSettingsRouter } = require("./routes/settings");
const { createExportRouter } = require("./routes/export");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const {
  appStateDbPath: APP_STATE_DB_PATH,
  legacyStatePath: LEGACY_STATE_PATH,
  legacyDatabasePaths: LEGACY_DATABASE_PATHS,
} = resolveAppStatePaths(PACKAGE_ROOT);
const DEFAULT_PORT = 4173;

const appStateStore = new AppStateStore(APP_STATE_DB_PATH, {
  legacyFilePath: LEGACY_STATE_PATH,
  legacyDatabasePaths: LEGACY_DATABASE_PATHS,
});
const connectionManager = new ConnectionManager({ appStateStore });
const overviewService = new OverviewService({ connectionManager });
const sqlExecutor = new SqlExecutor({ connectionManager, appStateStore });
const importService = new ImportService({ connectionManager });
const exportService = new ExportService({
  appStateStore,
  sqlExecutor,
});
const structureService = new StructureService({ connectionManager, appStateStore });
const dataBrowserService = new DataBrowserService({ connectionManager });

connectionManager.initialize();

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "SQLite Hub backend is running.",
    data: {
      connected: Boolean(connectionManager.getActiveConnection()),
    },
    metadata: {},
    warnings: [],
  });
});

app.use(
  "/api/connections",
  createConnectionsRouter({
    connectionManager,
    importService,
  })
);
app.use("/api/db", createOverviewRouter({ overviewService }));
app.use("/api/sql", createSqlRouter({ appStateStore, sqlExecutor }));
app.use("/api/structure", createStructureRouter({ structureService }));
app.use("/api/data", createDataRouter({ dataBrowserService }));
app.use("/api/settings", createSettingsRouter({ appStateStore }));
app.use("/api/export", createExportRouter({ exportService }));

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "..", "index.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.resolve(__dirname, "..", "index.html"));
});

app.use("/js", express.static(path.resolve(__dirname, "..", "js")));
app.use("/styles", express.static(path.resolve(__dirname, "..", "styles")));
app.use("/assets", express.static(path.resolve(__dirname, "..", "assets")));
app.use(errorMiddleware);

function resolvePort(value = process.env.PORT) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return port;
}

function startServer({ port } = {}) {
  const resolvedPort = resolvePort(port);

  return new Promise((resolve, reject) => {
    const server = app.listen(resolvedPort);

    server.once("error", reject);
    server.once("listening", () => {
      const url = `http://127.0.0.1:${resolvedPort}`;

      console.log(`SQLite Hub server listening on ${url}`);
      resolve({
        port: resolvedPort,
        server,
        url,
      });
    });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  app,
  appStateStore,
  connectionManager,
  DEFAULT_PORT,
  resolvePort,
  startServer,
};
