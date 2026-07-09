const express = require("express");
const { route, successResponse } = require("../utils/errors");
const { recordUserAction } = require("../utils/userActionLog");

function createBackupsRouter({ backupService, appStateStore = null, connectionManager = null }) {
  const router = express.Router();

  router.get(
    "/",
    route((req, res) => {
      const includeAll = String(req.query.all ?? "").toLowerCase() === "true";
      res.json(
        successResponse({
          data: backupService.listBackups({ includeAll }),
        })
      );
    })
  );

  router.get(
    "/:backupId",
    route((req, res) => {
      res.json(
        successResponse({
          data: backupService.getBackup(req.params.backupId),
        })
      );
    })
  );

  router.get(
    "/:backupId/diff",
    route((req, res) => {
      res.json(
        successResponse({
          data: backupService.diffBackupWithCurrent(req.params.backupId, {
            sampleLimit: req.query.sampleLimit,
          }),
        })
      );
    })
  );

  router.post(
    "/",
    route(async (req, res) => {
      const backup = await backupService.createActiveBackup({
        name: req.body?.name,
        notes: req.body?.notes,
        type: req.body?.type,
        context: req.body?.context,
      });
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "backup.create",
        targetType: "backup",
        targetName: backup.name ?? backup.id,
        metadata: {
          backupId: backup.id,
          status: backup.status ?? null,
          type: backup.type ?? req.body?.type ?? null,
          sizeBytes: backup.sizeBytes ?? null,
        },
      });

      res.json(
        successResponse({
          message: "Backup created and verified.",
          data: backup,
        })
      );
    })
  );

  router.patch(
    "/:backupId",
    route((req, res) => {
      const backup = backupService.updateBackupDetails(req.params.backupId, {
        name: req.body?.name,
        notes: req.body?.notes,
      });

      res.json(
        successResponse({
          message: "Backup updated.",
          data: backup,
        })
      );
    })
  );

  router.post(
    "/:backupId/verify",
    route((req, res) => {
      const backup = backupService.verifyBackupRecord(req.params.backupId);
      backupService.updateManifestForBackup(backup);
      res.json(
        successResponse({
          message:
            backup.status === "verified"
              ? "Backup verified."
              : "Backup verification failed.",
          data: backupService.getBackup(backup.id),
        })
      );
    })
  );

  router.post(
    "/:backupId/restore",
    route(async (req, res) => {
      const backup = await backupService.restoreBackup(req.params.backupId);
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "backup.restore",
        targetType: "backup",
        targetName: backup.name ?? req.params.backupId,
        metadata: {
          backupId: backup.id ?? req.params.backupId,
          status: backup.status ?? null,
          lastRestoredAt: backup.lastRestoredAt ?? null,
        },
      });
      res.json(
        successResponse({
          message: "Backup restored.",
          data: backup,
        })
      );
    })
  );

  router.delete(
    "/:backupId",
    route((req, res) => {
      const backup = backupService.deleteBackup(req.params.backupId);
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "backup.delete",
        targetType: "backup",
        targetName: backup.name ?? req.params.backupId,
        metadata: {
          backupId: backup.id ?? req.params.backupId,
        },
      });
      res.json(
        successResponse({
          message: "Backup deleted.",
          data: backup,
        })
      );
    })
  );

  router.get(
    "/:backupId/download",
    route((req, res) => {
      const download = backupService.getDownloadInfo(req.params.backupId);
      res.setHeader("Content-Disposition", `attachment; filename="${download.filename}"`);
      res.sendFile(download.path);
    })
  );

  return router;
}

module.exports = {
  createBackupsRouter,
};
