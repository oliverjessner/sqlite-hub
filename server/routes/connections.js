const express = require("express");
const { route, successResponse } = require("../utils/errors");

function createConnectionsRouter({ connectionManager, importService, backupService }) {
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
    route((req, res) => {
      const backup = backupService.createActiveBackup();

      res.json(
        successResponse({
          message: `Backup created: ${backup.fileName}`,
          data: backup,
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
