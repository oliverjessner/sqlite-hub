const assert = require("node:assert/strict");
const test = require("node:test");
const { MENU_SCENARIOS, modalExtraName } = require("../scripts/screenshot_sqlite_hub");

test("automatic screenshots include the Find Installed Databases modal", () => {
  const connections = MENU_SCENARIOS.find((scenario) => scenario.slug === "connections");

  assert.ok(connections);
  assert.ok(connections.modalActions.includes("open-database-discovery"));
  assert.equal(modalExtraName({ action: "open-database-discovery" }), "database_discovery_modal");
});
