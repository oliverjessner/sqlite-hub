const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

test("frontend code does not assign strings to direct HTML injection sinks", () => {
  const frontendDirectory = path.resolve(__dirname, "../frontend");
  const pendingDirectories = [frontendDirectory];
  const sourceFiles = [];

  while (pendingDirectories.length) {
    const directory = pendingDirectories.pop();

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath);
      } else if (entry.isFile() && [".html", ".js"].includes(path.extname(entry.name))) {
        sourceFiles.push(entryPath);
      }
    }
  }

  const directHtmlSinkPattern =
    /\.(?:innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(|document\.write(?:ln)?\s*\(/;

  for (const sourceFile of sourceFiles) {
    const source = fs.readFileSync(sourceFile, "utf8");

    assert.doesNotMatch(
      source,
      directHtmlSinkPattern,
      `${path.relative(frontendDirectory, sourceFile)} contains a direct HTML injection sink`
    );
  }
});
