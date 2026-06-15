const crypto = require("node:crypto");
const { AuthenticationError, NotFoundError, ValidationError } = require("../utils/errors");

const TOKEN_PREFIX = "shub_";

function hashApiToken(token) {
  return crypto.createHash("sha256").update(String(token ?? ""), "utf8").digest("hex");
}

function normalizeDatabaseKey(databaseKey) {
  const normalized = String(databaseKey ?? "").trim();

  if (!normalized) {
    throw new ValidationError("Database key is required.");
  }

  return normalized;
}

function normalizeTokenName(name) {
  const normalized = String(name ?? "").trim() || "API token";

  if (normalized.length > 80) {
    throw new ValidationError("Token name must not exceed 80 characters.");
  }

  return normalized;
}

class ApiTokenService {
  constructor({ appStateStore }) {
    this.appStateStore = appStateStore;
  }

  assertDatabaseExists(databaseKey) {
    const normalizedDatabaseKey = normalizeDatabaseKey(databaseKey);
    const connection = this.appStateStore
      .getRecentConnections()
      .find((candidate) => candidate.id === normalizedDatabaseKey);

    if (!connection) {
      throw new NotFoundError(`Database not found: ${normalizedDatabaseKey}`);
    }

    return connection;
  }

  listTokens(databaseKey) {
    const connection = this.assertDatabaseExists(databaseKey);
    return this.appStateStore.listApiTokens(connection.id);
  }

  createToken(databaseKey, name) {
    const connection = this.assertDatabaseExists(databaseKey);
    const token = `${TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
    const record = this.appStateStore.createApiToken({
      databaseKey: connection.id,
      name: normalizeTokenName(name),
      tokenHash: hashApiToken(token),
      tokenPrefix: token.slice(0, 13),
    });

    return {
      ...record,
      token,
    };
  }

  deleteToken(databaseKey, tokenId) {
    const connection = this.assertDatabaseExists(databaseKey);
    return this.appStateStore.deleteApiToken(connection.id, tokenId);
  }

  authenticate(databaseKey, token) {
    const normalizedDatabaseKey = normalizeDatabaseKey(databaseKey);
    const normalizedToken = String(token ?? "").trim();

    if (!normalizedToken) {
      throw new AuthenticationError("API token is required.", {
        code: "API_TOKEN_REQUIRED",
      });
    }

    const record = this.appStateStore.findApiTokenByHash(hashApiToken(normalizedToken));

    if (!record || record.databaseKey !== normalizedDatabaseKey) {
      throw new AuthenticationError("API token is invalid for this database.", {
        code: "API_TOKEN_INVALID",
      });
    }

    this.appStateStore.touchApiToken(record.id);
    return record;
  }
}

module.exports = {
  ApiTokenService,
  TOKEN_PREFIX,
  hashApiToken,
};
