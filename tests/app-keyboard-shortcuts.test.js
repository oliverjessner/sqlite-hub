const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("escape closes the backup compare drawer", () => {
  const source = readFileSync(path.resolve(__dirname, "../frontend/js/app.js"), "utf8");

  assert.match(
    source,
    /state\.route\.name === 'backups' && state\.backups\.diff\?\.visible[\s\S]{0,180}?closeBackupDiffDrawer\(\);/
  );
});
