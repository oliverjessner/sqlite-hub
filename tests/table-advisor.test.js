const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");

const {
  TableAdvisorService,
  analyzeTable,
  calculateScore,
  quoteIdentifier,
} = require("../server/services/sqlite/tableAdvisor");

function withDatabase(callback) {
  const db = new Database(":memory:");

  try {
    return callback(db);
  } finally {
    db.close();
  }
}

function getIssue(result, id) {
  return (result.issues ?? []).find((issue) => issue.id === id);
}

test("table advisor reports a missing primary key", () => {
  withDatabase((db) => {
    db.exec("CREATE TABLE events (name TEXT)");

    const result = analyzeTable(db, "events");
    const issue = getIssue(result, "schema:missing-primary-key");

    assert.equal(issue?.severity, "critical");
    assert.equal(issue?.category, "schema");
    assert.equal(issue?.risk, "high");
  });
});

test("table advisor suggests a unique index for unique email values", () => {
  withDatabase((db) => {
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL);
      INSERT INTO users (email) VALUES ('a@example.com'), ('b@example.com');
    `);

    const result = analyzeTable(db, "users");
    const issue = getIssue(result, "constraints:email:missing-unique-index");

    assert.equal(issue?.severity, "warning");
    assert.match(issue?.sql ?? "", /CREATE UNIQUE INDEX/);
    assert.match(issue?.sql ?? "", /"email"/);
  });
});

test("table advisor reports duplicate emails without suggesting a unique index", () => {
  withDatabase((db) => {
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL);
      INSERT INTO users (email) VALUES ('a@example.com'), ('a@example.com'), ('b@example.com');
    `);

    const result = analyzeTable(db, "users");

    assert.ok(getIssue(result, "data-quality:email:duplicate-values"));
    assert.equal(getIssue(result, "constraints:email:missing-unique-index"), undefined);
  });
});

test("table advisor suggests a CHECK snippet for enum-like status columns", () => {
  withDatabase((db) => {
    db.exec(`
      CREATE TABLE tasks (id INTEGER PRIMARY KEY, status TEXT NOT NULL);
      INSERT INTO tasks (status) VALUES ('open'), ('closed'), ('open');
    `);

    const result = analyzeTable(db, "tasks");
    const issue = getIssue(result, "constraints:status:check-constraint");

    assert.equal(issue?.severity, "info");
    assert.equal(issue?.risk, "high");
    assert.match(issue?.sql ?? "", /CHECK/);
    assert.match(issue?.sql ?? "", /open/);
  });
});

test("table advisor suggests an index for foreign-key-like columns", () => {
  withDatabase((db) => {
    db.exec(`
      CREATE TABLE comments (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, body TEXT);
      INSERT INTO comments (user_id, body) VALUES (1, 'one'), (2, 'two');
    `);

    const result = analyzeTable(db, "comments");
    const issue = getIssue(result, "performance:user_id:missing-index");

    assert.equal(issue?.severity, "warning");
    assert.equal(issue?.risk, "low");
    assert.match(issue?.sql ?? "", /CREATE INDEX/);
  });
});

test("table advisor detects created_at without a default", () => {
  withDatabase((db) => {
    db.exec(`
      CREATE TABLE notes (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);
      INSERT INTO notes (created_at) VALUES ('2026-06-28T10:00:00Z');
    `);

    const result = analyzeTable(db, "notes");
    const issue = getIssue(result, "schema:created_at:missing-created-default");

    assert.equal(issue?.severity, "warning");
    assert.match(issue?.sql ?? "", /DEFAULT CURRENT_TIMESTAMP/);
  });
});

test("table advisor detects empty text strings", () => {
  withDatabase((db) => {
    db.exec(`
      CREATE TABLE contacts (id INTEGER PRIMARY KEY, email TEXT);
      INSERT INTO contacts (email) VALUES (''), ('a@example.com');
    `);

    const result = analyzeTable(db, "contacts");
    const issue = getIssue(result, "data-quality:email:empty-strings");

    assert.equal(issue?.severity, "warning");
    assert.match(issue?.sql ?? "", /UPDATE/);
    assert.match(issue?.sql ?? "", /NULL/);
  });
});

test("table advisor score uses deterministic penalties", () => {
  const score = calculateScore([
    { severity: "critical" },
    { severity: "warning" },
    { severity: "info" },
  ]);

  assert.equal(score, 70);
});

test("table advisor exposes safe SQLite identifier quoting", () => {
  assert.equal(quoteIdentifier('we"ird'), '"we""ird"');
});

test("table advisor does not recommend a unique index that already exists", () => {
  withDatabase((db) => {
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL);
      CREATE UNIQUE INDEX idx_users_email_unique ON users (email);
      INSERT INTO users (email) VALUES ('a@example.com'), ('b@example.com');
    `);

    const result = new TableAdvisorService().analyzeTable(db, "users");

    assert.equal(getIssue(result, "constraints:email:missing-unique-index"), undefined);
  });
});
