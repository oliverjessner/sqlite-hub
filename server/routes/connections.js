const express = require("express");
const { route, successResponse } = require("../utils/errors");
const { recordUserAction } = require("../utils/userActionLog");

function createConnectionsRouter({ connectionManager, importService, backupService, nativeFileDialogService, databaseDiscoveryService, appStateStore = null }) {
  const router = express.Router();

  router.post(
    "/open",
    route((req, res) => {
      const connection = connectionManager.openConnection({
        filePath: req.body.path,
        label: req.body.label,
        readOnly: Boolean(req.body.readOnly),
        makeActive: true,
      });

      res.json(
        successResponse({
          message: "SQLite database opened successfully.",
          data: connection,
          readOnly: connection.readOnly,
        })
      );
    })
  );

  router.post(
    "/create",
    route((req, res) => {
      const connection = connectionManager.createConnection({
        filePath: req.body.path,
        label: req.body.label,
      });

      res.json(
        successResponse({
          message: "SQLite database created successfully.",
          data: connection,
          readOnly: connection.readOnly,
        })
      );
    })
  );

  router.post(
    "/choose-open-path",
    route(async (req, res) => {
      const selectedPath = await nativeFileDialogService.chooseOpenDatabasePath();

      res.json(
        successResponse({
          message: selectedPath ? "Database path selected." : "File selection cancelled.",
          data: {
            cancelled: !selectedPath,
            path: selectedPath,
          },
        })
      );
    })
  );

  router.post(
    "/choose-create-path",
    route(async (req, res) => {
      const selectedPath = await nativeFileDialogService.chooseCreateDatabasePath();

      res.json(
        successResponse({
          message: selectedPath ? "Database path selected." : "File selection cancelled.",
          data: {
            cancelled: !selectedPath,
            path: selectedPath,
          },
        })
      );
    })
  );

  router.post(
    "/choose-directory",
    route(async (req, res) => {
      const selectedPath = await nativeFileDialogService.chooseDirectoryPath();
      res.json(successResponse({
        message: selectedPath ? "Scan directory selected." : "Directory selection cancelled.",
        data: { cancelled: !selectedPath, path: selectedPath },
      }));
    })
  );

  router.get(
    "/discovery/locations",
    route((req, res) => {
      res.json(successResponse({ data: databaseDiscoveryService.getScanLocations(), readOnly: true }));
    })
  );

  router.post(
    "/discovery/scan",
    route((req, res) => {
      const data = databaseDiscoveryService.startScan(req.body ?? {});
      res.status(202).json(successResponse({ message: "Local database scan started.", data, readOnly: true }));
    })
  );

  router.get(
    "/discovery/scan/:sessionId",
    route((req, res) => {
      res.json(successResponse({ data: databaseDiscoveryService.getScan(req.params.sessionId), readOnly: true }));
    })
  );

  router.post(
    "/discovery/scan/:sessionId/cancel",
    route((req, res) => {
      res.json(successResponse({ message: "Database scan cancelled.", data: databaseDiscoveryService.cancelScan(req.params.sessionId), readOnly: true }));
    })
  );

  router.get(
    "/discovery/scan/:sessionId/preview/:resultId",
    route(async (req, res) => {
      const data = await databaseDiscoveryService.inspectDatabase(req.params.sessionId, req.params.resultId);
      res.json(successResponse({ message: "Database preview loaded.", data, readOnly: true }));
    })
  );

  router.post(
    "/discovery/scan/:sessionId/import",
    route((req, res) => {
      const data = databaseDiscoveryService.importDatabases(req.params.sessionId, req.body?.resultIds);
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "connections.discovery.import",
        targetType: "connection",
        targetName: `${data.added.length} discovered databases`,
        metadata: { addedCount: data.added.length, failedCount: data.failed.length },
      });
      const addedCount = data.added.length;
      const failedCount = data.failed.length;
      res.json(successResponse({
        message: failedCount
          ? `${addedCount} databases were added. ${failedCount} databases could not be imported.`
          : `${addedCount} databases were added to Connections.`,
        data,
        warnings: data.failed.map((item) => item.reason),
      }));
    })
  );

  router.post(
    "/discovery/scan/:sessionId/reveal/:resultId",
    route(async (req, res) => {
      const result = databaseDiscoveryService.resolveResult(req.params.sessionId, req.params.resultId);
      await nativeFileDialogService.revealPath(result.path);
      res.json(successResponse({ message: "Database revealed in file manager.", data: { path: result.path }, readOnly: true }));
    })
  );

  router.post(
    "/import-sql/preview",
    route((req, res) => {
      const result = importService.inspectSqlImport({
        sqlFilePath: req.body.sqlFilePath,
      });

      res.json(
        successResponse({
          message: result.requiresSafetyBackup
            ? "Import safety backup recommended."
            : "Import can continue without a safety backup.",
          data: result,
        })
      );
    })
  );

  router.post(
    "/import-sql",
    route((req, res) => {
      const result = importService.importSql({
        sqlFilePath: req.body.sqlFilePath,
        targetPath: req.body.targetPath,
        targetConnectionId: req.body.targetConnectionId,
        createNew: Boolean(req.body.createNew),
        label: req.body.label,
      });

      res.json(
        successResponse({
          message: "SQL dump imported successfully.",
          data: result,
          metadata: {
            importedInto: result.importedInto.id,
          },
          warnings: result.warnings,
          timingMs: result.timingMs,
          readOnly: result.importedInto.readOnly,
        })
      );
    })
  );

  router.post(
    "/backup-active",
    route(async (req, res) => {
      const backup = await backupService.createActiveBackup({
        name: req.body?.name,
        notes: req.body?.notes,
        type: req.body?.type,
        context: req.body?.context,
      });

      res.json(
        successResponse({
          message: "Backup created and verified.",
          data: backup,
        })
      );
    })
  );

  router.get(
    "/tags",
    route((req, res) => {
      res.json(
        successResponse({
          data: connectionManager.listConnectionTags(),
        })
      );
    })
  );

  router.get(
    "/recent",
    route((req, res) => {
      res.json(
        successResponse({
          data: connectionManager.listRecentConnections(),
        })
      );
    })
  );

  router.delete(
    "/recent/:id",
    route((req, res) => {
      const recentConnections = connectionManager.removeRecentConnection(req.params.id);
      res.json(
        successResponse({
          message: "Recent connection removed.",
          data: recentConnections,
        })
      );
    })
  );

  router.patch(
    "/recent/:id",
    route((req, res) => {
      const connection = connectionManager.updateRecentConnection(req.params.id, {
        filePath: req.body.path,
        label: req.body.label,
        readOnly: Boolean(req.body.readOnly),
        logoUpload: req.body.logoUpload ?? null,
        clearLogo: Boolean(req.body.clearLogo),
        tags: Array.isArray(req.body.tags) ? req.body.tags : null,
      });

      res.json(
        successResponse({
          message: "Recent connection updated.",
          data: connection,
          readOnly: connection.readOnly,
        })
      );
    })
  );

  router.post(
    "/select-active",
    route((req, res) => {
      const connection = connectionManager.selectActiveConnection(req.body.id);
      res.json(
        successResponse({
          message: "Active SQLite database changed.",
          data: connection,
          readOnly: connection.readOnly,
        })
      );
    })
  );

  router.get(
    "/active",
    route((req, res) => {
      const active = connectionManager.getActiveConnection();
      res.json(
        successResponse({
          data: active,
          readOnly: active?.readOnly,
        })
      );
    })
  );

  return router;
}

module.exports = {
  createConnectionsRouter,
};
