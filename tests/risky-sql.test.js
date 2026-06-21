const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

async function loadModule() {
  return import(pathToFileURL(path.resolve(__dirname, "../frontend/js/utils/riskySql.js")).href);
}

test("risky SQL detector ignores selects and detects schema changes", async () => {
  const { detectRiskySqlOperations } = await loadModule();

  assert.deepEqual(detectRiskySqlOperations("SELECT * FROM companies"), []);
  assert.equal(detectRiskySqlOperations("  ALTER TABLE companies ADD COLUMN ticker TEXT")[0].type, "schema_change");
});

test("risky SQL detector handles comments, case, multiple statements, and drop table names", async () => {
  const { detectRiskySqlOperations } = await loadModule();
  const operations = detectRiskySqlOperations(`
    -- DROP TABLE ignored;
    select 1;
    /* comment */ drop table if exists "users";
    create index idx_users_name on users(name);
  `);

  assert.equal(operations.length, 2);
  assert.equal(operations[0].type, "drop_table");
  assert.equal(operations[0].tableName, "users");
  assert.equal(operations[1].type, "migration");
});
