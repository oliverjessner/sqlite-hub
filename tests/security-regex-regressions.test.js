const assert = require("node:assert/strict");
const test = require("node:test");

const { readBearerToken } = require("../server/middleware/apiTokenAuth");
const { stripTrailingSemicolons } = require("../server/utils/sqlText");

test("bearer token parsing is strict and case-insensitive", () => {
  assert.equal(readBearerToken("Bearer api-token"), "api-token");
  assert.equal(readBearerToken("bearer\tapi-token  "), "api-token");
  assert.equal(readBearerToken("Bearer"), "");
  assert.equal(readBearerToken("BearerToken"), "");
  assert.equal(readBearerToken(" Basic api-token"), "");
  assert.equal(readBearerToken("Bearer api-token\r\ninjected"), "");
});

test("bearer token parsing handles long invalid input without a regular expression", () => {
  assert.equal(readBearerToken(`Bearer${"x".repeat(200_000)}`), "");
});

test("media queries remove trailing semicolons without a regular expression", () => {
  assert.equal(stripTrailingSemicolons("  SELECT 1;;;  "), "SELECT 1");
  assert.equal(
    stripTrailingSemicolons(`SELECT 1${";".repeat(200_000)}  `),
    "SELECT 1"
  );
});
