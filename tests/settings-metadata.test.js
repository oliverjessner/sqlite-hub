const assert = require("node:assert/strict");
const test = require("node:test");

const { version } = require("../package.json");
const { readSettingsMetadata, readSqliteVersion } = require("../server/routes/settings");

test("settings metadata exposes app and SQLite versions", () => {
  const metadata = readSettingsMetadata();

  assert.equal(metadata.appVersion, version);
  assert.match(metadata.sqliteVersion, /^\d+\.\d+\.\d+$/);
});

test("SQLite runtime version is readable", () => {
  assert.match(readSqliteVersion(), /^\d+\.\d+\.\d+$/);
});
