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
