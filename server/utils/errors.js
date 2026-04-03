class AppError extends Error {
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = options.code ?? "APP_ERROR";
    this.details = options.details ?? null;
    this.sqliteCode = options.sqliteCode ?? null;
    this.warnings = options.warnings ?? [];
    this.expose = options.expose ?? true;
  }
}

class ValidationError extends AppError {
  constructor(message, options = {}) {
    super(message, 400, { code: "VALIDATION_ERROR", ...options });
  }
}

class NotFoundError extends AppError {
  constructor(message, options = {}) {
    super(message, 404, { code: "NOT_FOUND", ...options });
  }
}

class ConflictError extends AppError {
  constructor(message, options = {}) {
    super(message, 409, { code: "CONFLICT", ...options });
  }
}

class BusyError extends AppError {
  constructor(message, options = {}) {
    super(message, 423, { code: "SQLITE_BUSY", ...options });
  }
}

class ReadOnlyError extends AppError {
  constructor(message, options = {}) {
    super(message, 403, { code: "SQLITE_READONLY", ...options });
  }
}

class DatabaseRequiredError extends AppError {
  constructor(message = "No active SQLite database selected.", options = {}) {
    super(message, 400, { code: "ACTIVE_DATABASE_REQUIRED", ...options });
  }
}

function mapSqliteError(error) {
  if (!error) {
    return new AppError("Unknown error");
  }

  if (error instanceof AppError) {
    return error;
  }

  const code = error.code ?? "";
  const message = error.message ?? "Unexpected error";

  if (code.includes("SQLITE_BUSY") || code.includes("SQLITE_LOCKED")) {
    return new BusyError(message, {
      details: error,
      sqliteCode: code,
    });
  }

  if (code.includes("SQLITE_READONLY")) {
    return new ReadOnlyError(message, {
      details: error,
      sqliteCode: code,
    });
  }

  if (
    code.includes("SQLITE_ERROR") ||
    code.includes("SQLITE_CONSTRAINT") ||
    code.includes("SQLITE_MISMATCH") ||
    code.includes("SQLITE_RANGE")
  ) {
    return new ValidationError(message, {
      code: code || "SQLITE_ERROR",
      details: error,
      sqliteCode: code || null,
    });
  }

  if (message.includes("file is not a database")) {
    return new ValidationError(message, {
      code: "SQLITE_INVALID_DATABASE",
      details: error,
      sqliteCode: code || null,
    });
  }

  return new AppError(message, 500, {
    code: code || "INTERNAL_ERROR",
    details: error,
    sqliteCode: code || null,
  });
}

function successResponse({
  data = null,
  metadata = {},
  message = "",
  warnings = [],
  timingMs = null,
  readOnly = undefined,
} = {}) {
  const response = {
    success: true,
    message,
    data,
    metadata,
    warnings,
  };

  if (typeof timingMs === "number") {
    response.timingMs = timingMs;
  }

  if (typeof readOnly === "boolean") {
    response.readOnly = readOnly;
  }

  return response;
}

function errorResponse(error) {
  const normalized = mapSqliteError(error);

  return {
    success: false,
    message: normalized.message,
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
      sqliteCode: normalized.sqliteCode,
    },
    warnings: normalized.warnings ?? [],
  };
}

function route(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function errorMiddleware(error, req, res, next) {
  const normalized = mapSqliteError(error);
  res.status(normalized.statusCode).json(errorResponse(normalized));
}

module.exports = {
  AppError,
  BusyError,
  ConflictError,
  DatabaseRequiredError,
  NotFoundError,
  ReadOnlyError,
  ValidationError,
  errorMiddleware,
  errorResponse,
  mapSqliteError,
  route,
  successResponse,
};
