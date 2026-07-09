const express = require("express");
const path = require("node:path");
const { DatabaseRequiredError, route, successResponse } = require("../utils/errors");
const { recordUserAction } = require("../utils/userActionLog");

function getActiveDatabaseKey(connectionManager) {
  return connectionManager.getActiveConnection()?.id ?? null;
}

function requireActiveDatabaseKey(connectionManager) {
  const databaseKey = getActiveDatabaseKey(connectionManager);

  if (!databaseKey) {
    throw new DatabaseRequiredError();
  }

  return databaseKey;
}

function resolveActiveDatabaseDocumentName(connection) {
  const label = String(connection?.label ?? "").trim();

  if (label) {
    return label;
  }

  const basename = path.basename(String(connection?.path ?? "").trim());
  return basename || "Database";
}

function buildInitialDocumentPayload(connection, options = {}) {
  const databaseName = resolveActiveDatabaseDocumentName(connection);
  const timestamp = new Date().toISOString();
  const createdAt = String(options.createdAt ?? connection?.createdAt ?? "").trim() || timestamp;
  const lastModifiedAt = String(options.lastModifiedAt ?? "").trim() || timestamp;

  return {
    title: databaseName,
    filename: databaseName,
    content: `# ${databaseName}\n\n- created at:    ${createdAt}\n- last modified: ${lastModifiedAt}\n\n## Purpose\n`,
  };
}

function pickDocumentPatch(body = {}) {
  const patch = {};

  for (const field of ["title", "filename", "content", "folderId"]) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      patch[field] = body[field];
    }
  }

  return patch;
}

function ensureDatabaseDocuments({ appStateStore, connectionManager, databaseKey }) {
  let items = appStateStore.listDatabaseDocuments(databaseKey);

  if (items.length > 0) {
    return items;
  }

  appStateStore.createDatabaseDocument(
    databaseKey,
    buildInitialDocumentPayload(connectionManager.getActiveConnection(), {
      lastModifiedAt: appStateStore.getLatestActivityLogTimestamp?.(databaseKey),
    })
  );

  return appStateStore.listDatabaseDocuments(databaseKey);
}

function createDocumentsRouter({ appStateStore, connectionManager }) {
  const router = express.Router();

  router.get(
    "/",
    route((req, res) => {
      const databaseKey = requireActiveDatabaseKey(connectionManager);

      res.json(
        successResponse({
          data: {
            items: ensureDatabaseDocuments({ appStateStore, connectionManager, databaseKey }),
            folders: appStateStore.listDatabaseDocumentFolders(databaseKey),
          },
          metadata: { databaseKey },
        })
      );
    })
  );

  router.post(
    "/folders",
    route((req, res) => {
      const databaseKey = requireActiveDatabaseKey(connectionManager);
      const folder = appStateStore.createDatabaseDocumentFolder(databaseKey, {
        name: req.body?.name,
      });

      res.status(201).json(
        successResponse({
          message: "Document folder created.",
          data: folder,
          metadata: {
            databaseKey,
            folders: appStateStore.listDatabaseDocumentFolders(databaseKey),
          },
        })
      );
    })
  );

  router.post(
    "/",
    route((req, res) => {
      const databaseKey = requireActiveDatabaseKey(connectionManager);
      const document = appStateStore.createDatabaseDocument(databaseKey, {
        title: req.body?.title,
        filename: req.body?.filename,
        content: req.body?.content,
        folderId: req.body?.folderId,
      });
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "document.create",
        databaseKey,
        targetType: "document",
        targetName: document.filename ?? document.id,
        metadata: {
          documentId: document.id,
          title: document.title ?? null,
        },
      });

      res.status(201).json(
        successResponse({
          message: "Document created.",
          data: document,
          metadata: { databaseKey },
        })
      );
    })
  );

  router.get(
    "/:documentId",
    route((req, res) => {
      const databaseKey = requireActiveDatabaseKey(connectionManager);

      res.json(
        successResponse({
          data: appStateStore.getDatabaseDocument(databaseKey, req.params.documentId),
          metadata: { databaseKey },
        })
      );
    })
  );

  router.patch(
    "/:documentId",
    route((req, res) => {
      const databaseKey = requireActiveDatabaseKey(connectionManager);

      res.json(
        successResponse({
          message: "Document saved.",
          data: appStateStore.updateDatabaseDocument(
            databaseKey,
            req.params.documentId,
            pickDocumentPatch(req.body)
          ),
          metadata: { databaseKey },
        })
      );
    })
  );

  router.delete(
    "/:documentId",
    route((req, res) => {
      const databaseKey = requireActiveDatabaseKey(connectionManager);
      const document = appStateStore.getDatabaseDocument(databaseKey, req.params.documentId);
      const deleted = appStateStore.deleteDatabaseDocument(databaseKey, req.params.documentId);

      recordUserAction({
        appStateStore,
        connectionManager,
        action: "document.delete",
        databaseKey,
        targetType: "document",
        targetName: document.filename ?? req.params.documentId,
        metadata: {
          documentId: req.params.documentId,
          title: document.title ?? null,
        },
      });

      res.json(
        successResponse({
          message: "Document deleted.",
          data: deleted,
          metadata: { databaseKey },
        })
      );
    })
  );

  return router;
}

module.exports = {
  buildInitialDocumentPayload,
  createDocumentsRouter,
  ensureDatabaseDocuments,
  pickDocumentPatch,
  resolveActiveDatabaseDocumentName,
};
