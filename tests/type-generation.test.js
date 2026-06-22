const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");

const { TypeGenerationService } = require("../server/services/typeGenerationService");

function createDb(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-types-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const db = new Database(path.join(directory, "types.db"));
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE accounts (id INTEGER PRIMARY KEY);
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('trial', 'active', 'cancelled')),
      is_admin BOOLEAN NOT NULL DEFAULT 0,
      metadata JSON,
      avatar BLOB,
      account_id INTEGER REFERENCES accounts(id),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE feature_flags (
      id INTEGER PRIMARY KEY,
      is_active INTEGER NOT NULL CHECK (is_active IN (0, 1))
    );
    CREATE TABLE audit_events (
      event_id TEXT PRIMARY KEY,
      type TEXT,
      payload,
      severity INTEGER CHECK (severity IN (1, 2, 3)),
      generated_label TEXT GENERATED ALWAYS AS (event_id || ':' || type) STORED
    );
  `);
  return db;
}

test("type generation maps SQLite schema to TypeScript with enums, booleans, FKs, JSON, and DATETIME", (t) => {
  const db = createDb(t);
  const result = new TypeGenerationService().generateTypesFromDatabase(db, "users", "typescript", {});

  assert.equal(result.fileName, "User.ts");
  assert.equal(result.metadata.columnCount, 8);
  assert.match(result.code, /export interface User/);
  assert.match(result.code, /id: number;/);
  assert.match(result.code, /status: "trial" \| "active" \| "cancelled";/);
  assert.match(result.code, /isAdmin: boolean;/);
  assert.match(result.code, /metadata: unknown \| null;/);
  assert.match(result.code, /avatar: Uint8Array \| null;/);
  assert.match(result.code, /accountId: number \| null;/);
  assert.match(result.code, /createdAt: string;/);
});

test("type generation safely derives boolean from integer CHECK IN 0 and 1", (t) => {
  const db = createDb(t);
  const result = new TypeGenerationService().generateTypesFromDatabase(db, "feature_flags", "ts", {});

  assert.match(result.code, /export interface FeatureFlag/);
  assert.match(result.code, /isActive: boolean;/);
});

test("type generation handles unknown types, generated columns, numeric unions, and target generators", (t) => {
  const db = createDb(t);
  const service = new TypeGenerationService();
  const ts = service.generateTypesFromDatabase(db, "audit_events", "typescript", {});
  const rust = service.generateTypesFromDatabase(db, "users", "rust", { propertyNaming: "camel" });
  const kotlin = service.generateTypesFromDatabase(db, "users", "kotlin", {});
  const swift = service.generateTypesFromDatabase(db, "users", "swift", {});

  assert.match(ts.code, /payload: unknown \| null;/);
  assert.match(ts.code, /severity: 1 \| 2 \| 3 \| null;/);
  assert.match(ts.code, /generatedLabel: string \| null;/);
  assert.match(ts.warnings.join("\n"), /payload/);
  assert.match(rust.code, /pub enum UserStatus/);
  assert.match(rust.code, /#\[serde\(rename = "created_at"\)\]/);
  assert.match(kotlin.code, /enum class UserStatus/);
  assert.match(swift.code, /enum UserStatus: String, Codable/);
  assert.match(swift.code, /case createdAt = "created_at"/);
});
