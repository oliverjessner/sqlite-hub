const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildAutoTitle,
  buildSqlPreview,
  normalizeSql,
} = require("../server/services/storage/queryHistoryUtils");

test("query history text helpers remove line comments", () => {
  const sql = "-- heading\r\n  -- context\nSELECT * FROM users; -- trailing comment";

  assert.equal(buildAutoTitle(sql), "SELECT * FROM users");
  assert.equal(buildSqlPreview(sql), "SELECT * FROM users;");
  assert.equal(normalizeSql(sql), "select * from users");
});

test("query history title handles long comment-heavy input", () => {
  const sql = `--${"-x".repeat(100_000)}\nSELECT 1;`;

  assert.equal(buildAutoTitle(sql), "SELECT 1");
});
