const assert = require("node:assert/strict");
const test = require("node:test");

const { main } = require("../bin/sqlite-hub");

test("CLI delegates database operations to the shared command service", async () => {
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
    listTables(reference) {
      calls.push(["listTables", reference]);
      return [{ name: "companies" }];
    },
  };
  const output = [];
  const originalLog = console.log;

  console.log = (...values) => output.push(values.join(" "));

  try {
    await main(["--database:Database One", "--tables"], { databaseService });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    ["listDatabases"],
    ["getDatabase", "Database One"],
    ["listTables", "db-one"],
  ]);
  assert.match(output.join("\n"), /companies/);
});

test("CLI marks raw query executions as cli", async () => {
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
  const output = [];
  const originalLog = console.log;

  console.log = (...values) => output.push(values.join(" "));

  try {
    await main(["--database:Database One", "--query:SELECT 1"], { databaseService });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    ["listDatabases"],
    ["getDatabase", "Database One"],
    ["executeRawQuery", "db-one", "SELECT 1", { storeName: null, executedBy: "cli" }],
  ]);
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
