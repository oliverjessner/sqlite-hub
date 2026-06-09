const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("node:path");
const { errorMiddleware } = require("./utils/errors");
const { resolveAppStatePaths } = require("./utils/appPaths");
const { AppStateStore } = require("./services/storage/appStateStore");
const { ConnectionManager } = require("./services/sqlite/connectionManager");
const { OverviewService } = require("./services/sqlite/overviewService");
const { SqlExecutor } = require("./services/sqlite/sqlExecutor");
const { ImportService } = require("./services/sqlite/importService");
const { BackupService } = require("./services/sqlite/backupService");
const { ExportService } = require("./services/sqlite/exportService");
const { StructureService } = require("./services/sqlite/structureService");
const { DataBrowserService } = require("./services/sqlite/dataBrowserService");
const { TableDesignerService } = require("./services/sqlite/tableDesignerService");
const { MediaTaggingService } = require("./services/sqlite/mediaTaggingService");
const { createConnectionsRouter } = require("./routes/connections");
const { createOverviewRouter } = require("./routes/overview");
const { createSqlRouter } = require("./routes/sql");
const { createChartsRouter } = require("./routes/charts");
const { createStructureRouter } = require("./routes/structure");
const { createDataRouter } = require("./routes/data");
const { createTableDesignerRouter } = require("./routes/tableDesigner");
const { createMediaTaggingRouter } = require("./routes/mediaTagging");
const { createSettingsRouter } = require("./routes/settings");
const { createExportRouter } = require("./routes/export");
const { createDocumentsRouter } = require("./routes/documents");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const FRONTEND_ROOT = path.join(PACKAGE_ROOT, "frontend");
const FRONTEND_ENTRYPOINT = path.join(FRONTEND_ROOT, "index.html");
const {
  appStateDirectory: APP_STATE_DIRECTORY,
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
const backupService = new BackupService({ connectionManager });
const exportService = new ExportService({
  appStateStore,
  connectionManager,
  sqlExecutor,
});
const structureService = new StructureService({ connectionManager, appStateStore });
const dataBrowserService = new DataBrowserService({ connectionManager });
const tableDesignerService = new TableDesignerService({ connectionManager });
const mediaTaggingService = new MediaTaggingService({ connectionManager, appStateStore });

connectionManager.initialize();

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

// auth: public liveness route for local CLI and browser startup checks.
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
    backupService,
  })
);
app.use("/api/db", createOverviewRouter({ overviewService }));
app.use("/api/sql", createSqlRouter({ appStateStore, connectionManager, sqlExecutor }));
app.use("/api/charts", createChartsRouter({ appStateStore, connectionManager, sqlExecutor }));
app.use("/api/structure", createStructureRouter({ structureService }));
app.use("/api/data", createDataRouter({ dataBrowserService }));
app.use("/api/table-designer", createTableDesignerRouter({ tableDesignerService }));
app.use("/api/media-tagging", createMediaTaggingRouter({ mediaTaggingService }));
app.use("/api/settings", createSettingsRouter({ appStateStore }));
app.use("/api/export", createExportRouter({ exportService }));
app.use("/api/documents", createDocumentsRouter({ appStateStore, connectionManager }));

// auth: public favicon response; it exposes no application data.
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// auth: public SPA entrypoint for the local SQLite Hub UI.
app.get("/", (req, res) => {
  res.sendFile(FRONTEND_ENTRYPOINT);
});

// auth: public SPA entrypoint for direct browser reloads.
app.get("/index.html", (req, res) => {
  res.sendFile(FRONTEND_ENTRYPOINT);
});

app.use(
  "/vendor/cytoscape",
  express.static(path.resolve(__dirname, "..", "node_modules", "cytoscape"))
);
app.use(
  "/vendor/cytoscape-elk",
  express.static(path.resolve(__dirname, "..", "node_modules", "cytoscape-elk"))
);
app.use(
  "/vendor/elkjs",
  express.static(path.resolve(__dirname, "..", "node_modules", "elkjs"))
);
app.use(
  "/vendor/echarts",
  express.static(path.resolve(__dirname, "..", "node_modules", "echarts"))
);
app.use(
  "/vendor/material-symbols",
  express.static(path.resolve(__dirname, "..", "node_modules", "material-symbols"))
);
app.use(
  "/vendor/marked",
  express.static(path.resolve(__dirname, "..", "node_modules", "marked"))
);
app.use(express.static(FRONTEND_ROOT));
app.use("/db_logos", express.static(path.join(APP_STATE_DIRECTORY, "db_logos")));
app.use(errorMiddleware);

function parsePortArgument(argv = process.argv.slice(2)) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument.startsWith("--port:")) {
      return argument.slice("--port:".length);
    }

    if (argument.startsWith("--port=")) {
      return argument.slice("--port=".length);
    }

    if (argument === "--port") {
      return argv[index + 1];
    }
  }

  return undefined;
}

function resolvePort(value = process.env.PORT ?? parsePortArgument()) {
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
  parsePortArgument,
  resolvePort,
  startServer,
};
