const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let settingsViewModulePromise = null;

function loadSettingsViewModule() {
  if (!settingsViewModulePromise) {
    settingsViewModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/views/settings.js")).href
    );
  }

  return settingsViewModulePromise;
}

test("settings view shows SQLite runtime version and custom port command", async () => {
  const { renderSettingsView } = await loadSettingsViewModule();
  const rendered = renderSettingsView({
    settings: {
      loading: false,
      error: null,
      appVersion: "1.2.3",
      sqliteVersion: "3.53.1",
    },
  });

  assert.match(rendered.main, /SQLite_Runtime/);
  assert.match(rendered.main, /3\.53\.1/);
  assert.match(rendered.main, /sqlite-hub --port:PORT/);
});
