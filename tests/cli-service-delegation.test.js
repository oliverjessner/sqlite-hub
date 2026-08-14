const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { main } = require("../bin/sqlite-hub");

const connection = {
  id: "db-one",
  label: "Database One",
  path: "/data/database-one.sqlite",
  sizeBytes: 2048,
  lastOpenedAt: "2026-08-14T10:00:00.000Z",
  readOnly: false,
};

function captureOutput() {
  const logs = [];
  const errors = [];
  const stdout = [];
  const original = {
    log: console.log,
    error: console.error,
    write: process.stdout.write,
  };

  console.log = (...values) => logs.push(values.join(" "));
  console.error = (...values) => errors.push(values.join(" "));
  process.stdout.write = value => {
    stdout.push(String(value));
    return true;
  };

  return {
    logs,
    errors,
    stdout,
    restore() {
      console.log = original.log;
      console.error = original.error;
      process.stdout.write = original.write;
    },
  };
}

test("CLI starts the server implicitly and through serve", async () => {
  const calls = [];
  const opened = [];
  const dependencies = {
    disableAccessLog: true,
    async startServer(options) {
      calls.push(options);
      return { url: `http://127.0.0.1:${options.port}` };
    },
    openBrowser(url) {
      opened.push(url);
    },
  };

  await main([], dependencies);
  await main(["serve", "--port", "4174", "--open"], dependencies);

  assert.deepEqual(calls, [{ port: 4173 }, { port: 4174 }]);
  assert.deepEqual(opened, ["http://127.0.0.1:4174"]);
});

test("CLI prints app info", async () => {
  const output = captureOutput();

  try {
    await main(["info", "--port", "4178"], {
      disableAccessLog: true,
      async appInfoService({ port, url }) {
        return {
          port,
          url,
          packageName: "sqlite-hub",
          appVersion: "2.5.0",
          sqliteVersion: "3.50.0",
          versionCheck: { status: "current", currentVersion: "2.5.0" },
        };
      },
    });
  } finally {
    output.restore();
  }

  assert.match(output.logs.join("\n"), /Port: 4178/);
  assert.match(output.logs.join("\n"), /SQLite version: 3\.50\.0/);
});

test("CLI delegates database, table, and row commands", async () => {
  const calls = [];
  const accessLogs = [];
  const databaseService = {
    listDatabases() {
      calls.push(["listDatabases"]);
      return [connection];
    },
    getDatabase(reference) {
      calls.push(["getDatabase", reference]);
      return connection;
    },
    listTables(reference) {
      calls.push(["listTables", reference]);
      return [{ name: "companies" }];
    },
    getTable(reference, tableName) {
      calls.push(["getTable", reference, tableName]);
      return {
        name: tableName,
        rowCount: 1,
        identityStrategy: { type: "primaryKey" },
        columns: [{ name: "id", visible: true, primaryKeyPosition: 1, declaredType: "TEXT" }],
        foreignKeys: [],
        indexes: [],
      };
    },
    getTableRow(reference, tableName, key) {
      calls.push(["getTableRow", reference, tableName, key]);
      return { data: { id: key, name: "Acme" } };
    },
  };
  const appStateStore = {
    recordAccessLog(entry) {
      accessLogs.push(entry);
    },
  };
  const output = captureOutput();

  try {
    await main(["db", "list"], { databaseService, appStateStore });
    await main(["db", "info", "Database One", "--json"], { databaseService, appStateStore });
    await main(["table", "list", "--db", "Database One"], { databaseService, appStateStore });
    await main(["table", "info", "companies", "--db", "Database One"], { databaseService, appStateStore });
    await main(["row", "get", "companies", "row-one", "--db", "Database One"], {
      databaseService,
      appStateStore,
    });
  } finally {
    output.restore();
  }

  assert.deepEqual(calls, [
    ["listDatabases"],
    ["getDatabase", "Database One"],
    ["getDatabase", "Database One"],
    ["listTables", "db-one"],
    ["getDatabase", "Database One"],
    ["getTable", "db-one", "companies"],
    ["getDatabase", "Database One"],
    ["getTableRow", "db-one", "companies", "row-one"],
  ]);
  assert.deepEqual(
    accessLogs.map(entry => entry.action),
    ["cli.databases.list", "cli.database.get", "cli.tables.list", "cli.table.get", "cli.table.row.export"]
  );
  assert.match(output.logs.join("\n"), /companies/);
  assert.match(output.logs.join("\n"), /"name": "Acme"/);
});

test("CLI delegates all query commands and writes exports", async () => {
  const calls = [];
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-cli-query-"));
  const outputPath = path.join(tempDirectory, "query.json");
  const query = {
    id: "query-one",
    title: "One",
    rawSql: "SELECT 1",
    queryType: "select",
    lastUsedAt: null,
    notes: "Smoke",
  };
  const result = { statementCount: 1, timingMs: 1, statements: [], historyId: 7 };
  const databaseService = {
    getDatabase(reference) {
      calls.push(["getDatabase", reference]);
      return connection;
    },
    listSavedQueries(reference) {
      calls.push(["listSavedQueries", reference]);
      return { items: [query], total: 1 };
    },
    getSavedQuery(reference, queryName) {
      calls.push(["getSavedQuery", reference, queryName]);
      return query;
    },
    executeRawQuery(reference, sql, options) {
      calls.push(["executeRawQuery", reference, sql, options]);
      return { result, storedQuery: { ...query, title: options.storeName } };
    },
    createStoredQuery(reference, options) {
      calls.push(["createStoredQuery", reference, options]);
      return { created: true, query: { ...query, title: options.title, rawSql: options.sql, notes: options.notes } };
    },
    executeSavedQuery(reference, queryName, options) {
      calls.push(["executeSavedQuery", reference, queryName, options]);
      return { query, result };
    },
    exportSavedQuery(reference, queryName, format) {
      calls.push(["exportSavedQuery", reference, queryName, format]);
      return {
        query,
        result: { filename: "one.json", content: "[{\"value\":1}]\n", format, rowCount: 1 },
      };
    },
  };
  const output = captureOutput();

  try {
    await main(["query", "list", "--db", "Database One"], { databaseService });
    await main(["query", "show", "One", "--db", "Database One"], { databaseService });
    await main(["query", "run", "SELECT 1", "--db", "Database One", "--save", "One"], {
      databaseService,
    });
    await main([
      "query", "save", "SELECT 1", "--db", "Database One", "--name", "One", "--notes", "Smoke",
    ], { databaseService });
    await main(["query", "exec", "One", "--db", "Database One"], { databaseService });
    await main([
      "query", "export", "One", "--db", "Database One", "--format", "json", "--output", outputPath,
    ], { databaseService });
  } finally {
    output.restore();
  }

  assert.deepEqual(calls, [
    ["getDatabase", "Database One"],
    ["listSavedQueries", "db-one"],
    ["getDatabase", "Database One"],
    ["getSavedQuery", "db-one", "One"],
    ["getDatabase", "Database One"],
    ["executeRawQuery", "db-one", "SELECT 1", { storeName: "One", executedBy: "cli" }],
    ["getDatabase", "Database One"],
    ["createStoredQuery", "db-one", { sql: "SELECT 1", title: "One", notes: "Smoke" }],
    ["getDatabase", "Database One"],
    ["executeSavedQuery", "db-one", "One", { executedBy: "cli" }],
    ["getDatabase", "Database One"],
    ["exportSavedQuery", "db-one", "One", "json"],
  ]);
  assert.equal(fs.readFileSync(outputPath, "utf8"), "[{\"value\":1}]\n");
  assert.match(output.logs.join("\n"), /Created stored query: One/);
  assert.match(output.logs.join("\n"), /Exported query: One/);

  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test("CLI delegates document and backup commands", async () => {
  const calls = [];
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-cli-doc-"));
  const outputPath = path.join(tempDirectory, "research.md");
  const databaseService = {
    getDatabase(reference) {
      calls.push(["getDatabase", reference]);
      return connection;
    },
    listDocuments(reference) {
      calls.push(["listDocuments", reference]);
      return [{ filename: "Research.md", updatedAt: "2026-08-14", contentLength: 10 }];
    },
    getDocument(reference, documentName) {
      calls.push(["getDocument", reference, documentName]);
      return { filename: "Research.md", content: "# Research" };
    },
    exportDocument(reference, documentName) {
      calls.push(["exportDocument", reference, documentName]);
      return {
        filename: "Research.md",
        content: "# Research\n",
        document: { filename: "Research.md", contentLength: 11 },
      };
    },
    listBackups(reference) {
      calls.push(["listBackups", reference]);
      return [{
        id: "backup-one",
        name: "Nightly",
        status: "verified",
        fileExists: true,
        sizeBytes: 1024,
        createdAt: "2026-08-14",
        path: "/backups/nightly.sqlite",
      }];
    },
    async createBackup(reference, options) {
      calls.push(["createBackup", reference, options]);
      return {
        id: "backup-two",
        name: options.name,
        status: "verified",
        sizeBytes: 2048,
        path: "/backups/before.sqlite",
      };
    },
  };
  const output = captureOutput();

  try {
    await main(["doc", "list", "--db", "Database One"], { databaseService });
    await main(["doc", "show", "Research", "--db", "Database One"], { databaseService });
    await main([
      "doc", "export", "Research", "--db", "Database One", "--output", outputPath,
    ], { databaseService });
    await main(["backup", "list", "--db", "Database One"], { databaseService });
    await main([
      "backup", "create", "--db", "Database One", "--name", "Before", "--notes", "Safe point",
    ], { databaseService });
  } finally {
    output.restore();
  }

  assert.equal(fs.readFileSync(outputPath, "utf8"), "# Research\n");
  assert.deepEqual(calls.slice(-3), [
    ["listBackups", "db-one"],
    ["getDatabase", "Database One"],
    ["createBackup", "db-one", { name: "Before", notes: "Safe point", context: "cli" }],
  ]);
  assert.match(output.logs.join("\n"), /Backup created: Before/);
  assert.match(output.logs.join("\n"), /# Research/);

  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test("CLI generates types with clean stdout and warnings on stderr", async () => {
  const calls = [];
  const databaseService = {
    getDatabase(reference) {
      calls.push(["getDatabase", reference]);
      return connection;
    },
    generateTableTypes(reference, tableName, target, options) {
      calls.push(["generateTableTypes", reference, tableName, target, options]);
      return {
        target: "typescript",
        fileName: "User.ts",
        code: "export interface User {}",
        warnings: ["Column payload uses unknown."],
      };
    },
  };
  const output = captureOutput();

  try {
    await main([
      "types", "generate", "users", "--db", "Database One", "--lang", "ts", "--name", "User",
    ], { databaseService });
  } finally {
    output.restore();
  }

  assert.deepEqual(calls, [
    ["getDatabase", "Database One"],
    ["generateTableTypes", "db-one", "users", "ts", { typeName: "User" }],
  ]);
  assert.equal(output.stdout.join(""), "export interface User {}\n");
  assert.deepEqual(output.errors, ["Warning: Column payload uses unknown."]);
});
