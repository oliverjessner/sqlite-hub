const assert = require("node:assert/strict");
const test = require("node:test");

const { version } = require("../package.json");
const {
  checkLatestAppVersion,
  compareSemver,
  isNewerVersion,
  readSettingsMetadata,
  readSqliteVersion,
} = require("../server/routes/settings");

test("settings metadata exposes app and SQLite versions", () => {
  const metadata = readSettingsMetadata();

  assert.equal(metadata.appVersion, version);
  assert.match(metadata.sqliteVersion, /^\d+\.\d+\.\d+$/);
});

test("SQLite runtime version is readable", () => {
  assert.match(readSqliteVersion(), /^\d+\.\d+\.\d+$/);
});

test("settings version comparison detects newer releases", () => {
  assert.equal(compareSemver("1.2.0", "1.1.9"), 1);
  assert.equal(compareSemver("1.0.1", "1.0.1"), 0);
  assert.equal(compareSemver("1.0.0", "1.0.1"), -1);
  assert.equal(isNewerVersion("1.0.2", "1.0.1"), true);
  assert.equal(isNewerVersion("1.0.1", "1.0.1"), false);
});

test("settings version check reads the npm latest version", async () => {
  const result = await checkLatestAppVersion({
    currentVersion: "1.0.1",
    packageName: "sqlite-hub",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://registry.npmjs.org/sqlite-hub/latest");
      assert.equal(options.headers.Accept, "application/json");

      return {
        ok: true,
        json: async () => ({ version: "1.1.0" }),
      };
    },
  });

  assert.equal(result.packageName, "sqlite-hub");
  assert.equal(result.currentVersion, "1.0.1");
  assert.equal(result.latestVersion, "1.1.0");
  assert.equal(result.updateAvailable, true);
  assert.equal(result.source, "npm");
  assert.equal(result.releaseUrl, "https://www.npmjs.com/package/sqlite-hub/v/1.1.0");
  assert.match(result.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
});
