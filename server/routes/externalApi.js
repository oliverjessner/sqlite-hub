const express = require("express");
const { createApiTokenAuth } = require("../middleware/apiTokenAuth");
const { readBearerToken } = require("../middleware/apiTokenAuth");
const { AuthenticationError, ValidationError, route, successResponse } = require("../utils/errors");
const { buildAppInfo } = require("../services/appInfoService");

function buildRequestBaseUrl(req) {
  const host = req.get("host") ?? `127.0.0.1:${req.socket.localPort ?? ""}`;
  return `${req.protocol}://${host}`;
}

function readDatabaseId(req) {
  return String(req.body?.databaseId ?? req.query.databaseId ?? "").trim();
}

function readSqlText(req) {
  return String(req.body?.sql ?? req.body?.query ?? req.query.sql ?? req.query.query ?? "");
}

function readStoreName(req) {
  return String(
    req.body?.store ??
      req.body?.storeName ??
      req.body?.name ??
      req.query.store ??
      req.query.storeName ??
      req.query.name ??
      ""
  ).trim();
}

function decodePathPart(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readPathParts(req) {
  return String(req.path ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(decodePathPart);
}

function buildExternalApiAccessDescriptor(req) {
  const method = String(req.method ?? "GET").toUpperCase();
  const parts = readPathParts(req);

  if (parts[0] === "info") {
    return {
      action: "api.info.get",
      targetType: "app",
      targetName: "info",
    };
  }

  if (parts[0] === "query") {
    return {
      action: "api.query.execute",
      databaseKey: readDatabaseId(req),
      targetType: "query",
      targetName: readStoreName(req) || "raw query",
    };
  }

  if (parts[0] !== "databases") {
    return {
      action: `api.${method.toLowerCase()}`,
      targetType: "request",
      targetName: req.path,
    };
  }

  const databaseKey = parts[1] ?? "";
  const collection = parts[2] ?? "";
  const itemName = parts[3] ?? "";
  const subAction = parts[4] ?? "";

  if (!collection) {
    return {
      action: "api.database.get",
      databaseKey,
      targetType: "database",
      targetName: databaseKey,
    };
  }

  if (collection === "tables") {
    if (!itemName) {
      return {
        action: "api.tables.list",
        databaseKey,
        targetType: "database",
        targetName: databaseKey,
      };
    }

    if (subAction === "row") {
      return {
        action: "api.table.row.export",
        databaseKey,
        targetType: "table",
        targetName: itemName,
      };
    }

    if (subAction === "types") {
      return {
        action: "api.table.types.generate",
        databaseKey,
        targetType: "table",
        targetName: itemName,
      };
    }

    return {
      action: "api.table.get",
      databaseKey,
      targetType: "table",
      targetName: itemName,
    };
  }

  if (collection === "queries") {
    if (!itemName) {
      return {
        action: "api.queries.list",
        databaseKey,
        targetType: "database",
        targetName: databaseKey,
      };
    }

    if (subAction === "execute") {
      return {
        action: "api.query.execute.saved",
        databaseKey,
        targetType: "query",
        targetName: itemName,
      };
    }

    if (subAction === "export") {
      return {
        action: "api.query.export",
        databaseKey,
        targetType: "query",
        targetName: itemName,
      };
    }

    if (subAction === "notes") {
      return {
        action: "api.query.notes.get",
        databaseKey,
        targetType: "query",
        targetName: itemName,
      };
    }

    return {
      action: "api.query.get",
      databaseKey,
      targetType: "query",
      targetName: itemName,
    };
  }

  if (collection === "documents") {
    if (!itemName) {
      return {
        action: "api.documents.list",
        databaseKey,
        targetType: "database",
        targetName: databaseKey,
      };
    }

    if (subAction === "export") {
      return {
        action: "api.document.export",
        databaseKey,
        targetType: "document",
        targetName: itemName,
      };
    }

    return {
      action: "api.document.get",
      databaseKey,
      targetType: "document",
      targetName: itemName,
    };
  }

  return {
    action: `api.${collection}.${method.toLowerCase()}`,
    databaseKey,
    targetType: collection,
    targetName: itemName || databaseKey,
  };
}

function createExternalApiAccessLogger(appStateStore) {
  return (req, res, next) => {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();

    res.on("finish", () => {
      if (!appStateStore?.recordAccessLog) {
        return;
      }

      const descriptor = buildExternalApiAccessDescriptor(req);
      const failed = res.statusCode >= 400;

      try {
        appStateStore.recordAccessLog({
          source: "api",
          action: descriptor.action,
          databaseKey: descriptor.databaseKey,
          targetType: descriptor.targetType,
          targetName: descriptor.targetName,
          status: failed ? "error" : "success",
          startedAt,
          durationMs: Date.now() - startedAtMs,
          errorMessage: failed ? req.accessLogError || `HTTP ${res.statusCode}` : null,
          metadata: {
            method: req.method,
            path: req.path,
            route: req.route?.path ? String(req.route.path) : null,
            statusCode: res.statusCode,
            apiTokenId: req.apiToken?.id ?? null,
            apiTokenName: req.apiToken?.name ?? null,
          },
        });
      } catch {
        // Access logging must not change API behavior.
      }
    });

    next();
  };
}

function authenticateDatabaseRequest(req, tokenService, databaseId) {
  const token = readBearerToken(req.get("authorization"));

  if (!token) {
    throw new AuthenticationError("Bearer API token is required.", {
      code: "API_TOKEN_REQUIRED",
    });
  }

  return tokenService.authenticate(databaseId, token);
}

function createExternalApiRouter({
  databaseService,
  tokenService,
  appStateStore = null,
  appInfoService = buildAppInfo,
}) {
  const router = express.Router();

  if (appStateStore?.recordAccessLog) {
    router.use(createExternalApiAccessLogger(appStateStore));
  }

  router.get(
    "/info",
    route(async (req, res) => {
      const port = Number(req.socket.localPort);
      const data = await appInfoService({
        port: Number.isInteger(port) ? port : null,
        url: buildRequestBaseUrl(req),
      });

      res.json(successResponse({ data }));
    })
  );

  router.post(
    "/query",
    route((req, res) => {
      const databaseId = readDatabaseId(req);
      const sql = readSqlText(req);
      const storeName = readStoreName(req);

      if (!databaseId) {
        throw new ValidationError("databaseId is required.");
      }

      authenticateDatabaseRequest(req, tokenService, databaseId);

      const { result } = databaseService.executeRawQuery(databaseId, sql, {
        storeName,
        executedBy: "api",
      });

      res.json(
        successResponse({
          message: "SQL executed successfully.",
          data: result,
          metadata: {
            databaseId,
            stored: Boolean(result.storedQuery),
          },
          timingMs: result.timingMs,
          readOnly: false,
        })
      );
    })
  );

  router.use(
    "/databases/:databaseId",
    createApiTokenAuth({ tokenService })
  );

  router.get(
    "/databases/:databaseId",
    route((req, res) => {
      res.json(
        successResponse({
          data: databaseService.getDatabase(req.params.databaseId),
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/tables",
    route((req, res) => {
      res.json(
        successResponse({
          data: { items: databaseService.listTables(req.params.databaseId) },
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/tables/:tableName",
    route((req, res) => {
      res.json(
        successResponse({
          data: databaseService.getTable(req.params.databaseId, req.params.tableName),
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.post(
    "/databases/:databaseId/tables/:tableName/row",
    route((req, res) => {
      const result = databaseService.getTableRow(
        req.params.databaseId,
        req.params.tableName,
        req.body?.key
      );

      res.json(
        successResponse({
          data: result.data,
          metadata: {
            databaseId: req.params.databaseId,
            filename: result.filename,
            identity: result.identity,
            tableName: result.table.name,
          },
        })
      );
    })
  );

  router.post(
    "/databases/:databaseId/tables/:tableName/types",
    route((req, res) => {
      const target = String(req.body?.target ?? "").trim();

      if (!["typescript", "rust", "kotlin", "swift"].includes(target)) {
        throw new ValidationError(
          `Unsupported type target "${req.body?.target}". Supported targets: typescript, rust, kotlin, swift.`,
          { code: "INVALID_TYPE_TARGET" }
        );
      }

      const result = databaseService.generateTableTypes(
        req.params.databaseId,
        req.params.tableName,
        target,
        req.body?.options ?? {}
      );
      const { warnings, metadata, ...data } = result;

      res.json(
        successResponse({
          message: "Types generated.",
          data,
          metadata: {
            databaseId: req.params.databaseId,
            tableName: req.params.tableName,
            ...metadata,
          },
          warnings,
          readOnly: true,
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/queries",
    route((req, res) => {
      res.json(
        successResponse({
          data: databaseService.listSavedQueries(req.params.databaseId),
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.post(
    "/databases/:databaseId/queries/:queryName/execute",
    route((req, res) => {
      const { query, result } = databaseService.executeSavedQuery(
        req.params.databaseId,
        req.params.queryName,
        { executedBy: "api" }
      );

      res.json(
        successResponse({
          message: "Saved query executed successfully.",
          data: result,
          metadata: {
            databaseId: req.params.databaseId,
            query,
          },
          timingMs: result.timingMs,
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/queries/:queryName/export",
    route((req, res) => {
      const { query, result } = databaseService.exportSavedQuery(
        req.params.databaseId,
        req.params.queryName,
        req.query.format || "csv"
      );

      res.json(
        successResponse({
          data: {
            filename: result.filename,
            content: result.content ?? result.csv ?? "",
            format: result.format,
            mimeType: result.mimeType,
            columns: result.columns,
            rowCount: result.rowCount,
          },
          metadata: {
            databaseId: req.params.databaseId,
            query,
          },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/queries/:queryName/notes",
    route((req, res) => {
      const query = databaseService.getSavedQuery(
        req.params.databaseId,
        req.params.queryName
      );

      res.json(
        successResponse({
          data: { notes: String(query.notes ?? "") },
          metadata: { databaseId: req.params.databaseId, query },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/queries/:queryName",
    route((req, res) => {
      res.json(
        successResponse({
          data: databaseService.getSavedQuery(
            req.params.databaseId,
            req.params.queryName
          ),
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/documents",
    route((req, res) => {
      res.json(
        successResponse({
          data: { items: databaseService.listDocuments(req.params.databaseId) },
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/documents/:documentName/export",
    route((req, res) => {
      const result = databaseService.exportDocument(
        req.params.databaseId,
        req.params.documentName
      );

      res.json(
        successResponse({
          data: {
            filename: result.filename,
            content: result.content,
            mimeType: result.mimeType,
          },
          metadata: {
            databaseId: req.params.databaseId,
            document: result.document,
          },
        })
      );
    })
  );

  router.get(
    "/databases/:databaseId/documents/:documentName",
    route((req, res) => {
      res.json(
        successResponse({
          data: databaseService.getDocument(
            req.params.databaseId,
            req.params.documentName
          ),
          metadata: { databaseId: req.params.databaseId },
        })
      );
    })
  );

  router.use((error, req, res, next) => {
    req.accessLogError = error?.message ?? null;
    next(error);
  });

  return router;
}

module.exports = {
  createExternalApiRouter,
};
