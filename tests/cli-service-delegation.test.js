const assert = require("node:assert/strict");
const test = require("node:test");

const { main } = require("../bin/sqlite-hub");

test("CLI delegates database operations to the shared command service", async () => {
  const calls = [];
  const accessLogs = [];
  const connection = {
    id: "db-one",
    label: "Database One",
  };
  const databaseService = {
    getDatabase(reference) {
      calls.push(["getDatabase", reference]);
      return connection;
    },
    listDatabases() {
      calls.push(["listDatabases"]);
      return [connection];
    },
    listTables(reference) {
      calls.push(["listTables", reference]);
      return [{ name: "companies" }];
    },
  };
  const appStateStore = {
    recordAccessLog(entry) {
      accessLogs.push(entry);
    },
  };
  const output = [];
  const originalLog = console.log;

  console.log = (...values) => output.push(values.join(" "));

  try {
    await main(["--database:Database One", "--tables"], { databaseService, appStateStore });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    ["listDatabases"],
    ["getDatabase", "Database One"],
    ["listTables", "db-one"],
  ]);
  assert.equal(accessLogs.length, 1);
  assert.equal(accessLogs[0].source, "cli");
  assert.equal(accessLogs[0].action, "cli.tables.list");
  assert.equal(accessLogs[0].databaseKey, "db-one");
  assert.equal(accessLogs[0].status, "success");
  assert.equal(accessLogs[0].metadata.databaseLabel, "Database One");
  assert.match(output.join("\n"), /companies/);
});

test("CLI marks raw query executions as cli", async () => {
  const calls = [];
  const accessLogs = [];
  const connection = {
    id: "db-one",
    label: "Database One",
  };
  const databaseService = {
    getDatabase(reference) {
      calls.push(["getDatabase", reference]);
      return connection;
    },
    listDatabases() {
      calls.push(["listDatabases"]);
      return [connection];
    },
    executeRawQuery(reference, sql, options = {}) {
      calls.push(["executeRawQuery", reference, sql, options]);
      return {
        result: {
          statementCount: 1,
          timingMs: 1,
          statements: [],
          historyId: 7,
        },
        storedQuery: null,
      };
    },
  };
  const appStateStore = {
    recordAccessLog(entry) {
      accessLogs.push(entry);
    },
  };
  const output = [];
  const originalLog = console.log;

  console.log = (...values) => output.push(values.join(" "));

  try {
    await main(["--database", "Database One", "--query", "SELECT 1"], {
      databaseService,
      appStateStore,
    });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    ["listDatabases"],
    ["getDatabase", "Database One"],
    ["executeRawQuery", "db-one", "SELECT 1", { storeName: null, executedBy: "cli" }],
  ]);
  assert.equal(accessLogs[0].action, "cli.query.execute");
  assert.deepEqual(accessLogs[0].metadata.flags, ["--database", "--query"]);
  assert.match(output.join("\n"), /History ID: 7/);
});

test("CLI marks saved query executions as cli", async () => {
  const calls = [];
  const connection = {
    id: "db-one",
    label: "Database One",
  };
  const databaseService = {
    getDatabase(reference) {
      calls.push(["getDatabase", reference]);
      return connection;
    },
    listDatabases() {
      calls.push(["listDatabases"]);
      return [connection];
    },
    executeSavedQuery(reference, queryName, options = {}) {
      calls.push(["executeSavedQuery", reference, queryName, options]);
      return {
        query: {
          title: queryName,
          rawSql: "SELECT 1",
        },
        result: {
          statementCount: 1,
          timingMs: 1,
          statements: [],
          historyId: 8,
        },
      };
    },
  };
  const output = [];
  const originalLog = console.log;

  console.log = (...values) => output.push(values.join(" "));

  try {
    await main(["--database:Database One", "--execute:Hype-Reversal"], { databaseService });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    ["listDatabases"],
    ["getDatabase", "Database One"],
    ["executeSavedQuery", "db-one", "Hype-Reversal", { executedBy: "cli" }],
  ]);
  assert.match(output.join("\n"), /Executing: Hype-Reversal/);
});

test("CLI delegates type generation to the shared command service and writes code to stdout", async () => {
  const calls = [];
  const connection = {
    id: "db-one",
    label: "Database One",
  };
  const databaseService = {
    getDatabase(reference) {
      calls.push(["getDatabase", reference]);
      return connection;
    },
    listDatabases() {
      calls.push(["listDatabases"]);
      return [connection];
    },
    generateTableTypes(reference, tableName, target, options = {}) {
      calls.push(["generateTableTypes", reference, tableName, target, options]);
      return {
        target: "typescript",
        fileName: "User.ts",
        code: "export interface User {}",
        warnings: [],
      };
    },
  };
  const output = [];
  const originalStdoutWrite = process.stdout.write;

  process.stdout.write = value => {
    output.push(String(value));
    return true;
  };

  try {
    await main(["--database:Database One", "--table:users", "--types:ts"], { databaseService });
  } finally {
    process.stdout.write = originalStdoutWrite;
  }

  assert.deepEqual(calls, [
    ["listDatabases"],
    ["getDatabase", "Database One"],
    ["generateTableTypes", "db-one", "users", "ts", {}],
  ]);
  assert.equal(output.join(""), "export interface User {}\n");
});

test("CLI delegates backup creation to the shared command service", async () => {
  const calls = [];
  const accessLogs = [];
  const connection = {
    id: "db-one",
    label: "Database One",
  };
  const databaseService = {
    getDatabase(reference) {
      calls.push(["getDatabase", reference]);
      return connection;
    },
    listDatabases() {
      calls.push(["listDatabases"]);
      return [connection];
    },
    async createBackup(reference, options = {}) {
      calls.push(["createBackup", reference, options]);
      return {
        id: "backup-one",
        name: options.name,
        status: "verified",
        sizeBytes: 2048,
        path: "/tmp/backup.sqlite",
      };
    },
  };
  const appStateStore = {
    recordAccessLog(entry) {
      accessLogs.push(entry);
    },
  };
  const output = [];
  const originalLog = console.log;

  console.log = (...values) => output.push(values.join(" "));

  try {
    await main(
      [
        "--database:Database One",
        "--backup:Before import",
        "--backup-notes:Created before API import",
      ],
      { databaseService, appStateStore }
    );
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    ["listDatabases"],
    ["getDatabase", "Database One"],
    [
      "createBackup",
      "db-one",
      {
        name: "Before import",
        notes: "Created before API import",
        context: "cli",
      },
    ],
  ]);
  assert.equal(accessLogs[0].action, "cli.backup.create");
  assert.equal(accessLogs[0].databaseKey, "db-one");
  assert.equal(accessLogs[0].metadata.hasBackupName, true);
  assert.equal(accessLogs[0].metadata.hasBackupNotes, true);
  assert.match(output.join("\n"), /Backup created: Before import/);
  assert.match(output.join("\n"), /Status: verified/);
});

test("CLI delegates backup listing to the shared command service", async () => {
  const calls = [];
  const accessLogs = [];
  const connection = {
    id: "db-one",
    label: "Database One",
  };
  const databaseService = {
    getDatabase(reference) {
      calls.push(["getDatabase", reference]);
      return connection;
    },
    listDatabases() {
      calls.push(["listDatabases"]);
      return [connection];
    },
    listBackups(reference) {
      calls.push(["listBackups", reference]);
      return [
        {
          id: "backup-one",
          name: "Before import",
          status: "verified",
          fileExists: true,
          sizeBytes: 1024,
          createdAt: "2026-06-28T10:00:00.000Z",
          path: "/tmp/backup.sqlite",
          notes: "Before import notes",
        },
      ];
    },
  };
  const appStateStore = {
    recordAccessLog(entry) {
      accessLogs.push(entry);
    },
  };
  const output = [];
  const originalLog = console.log;

  console.log = (...values) => output.push(values.join(" "));

  try {
    await main(["--database:Database One", "--backups"], { databaseService, appStateStore });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    ["listDatabases"],
    ["getDatabase", "Database One"],
    ["listBackups", "db-one"],
  ]);
  assert.equal(accessLogs[0].action, "cli.backups.list");
  assert.equal(accessLogs[0].databaseKey, "db-one");
  assert.match(output.join("\n"), /Backups for Database One \(1\)/);
  assert.match(output.join("\n"), /Before import/);
  assert.match(output.join("\n"), /Status: verified \(available\)/);
});
