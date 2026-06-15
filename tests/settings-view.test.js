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
  assert.match(rendered.main, /data-section="information"/);
  assert.match(rendered.main, /data-section="api-tokens"/);
  assert.doesNotMatch(rendered.main, /data-form="create-api-token"/);
});

test("settings view scopes API token controls to the active database", async () => {
  const { renderSettingsView } = await loadSettingsViewModule();
  const rendered = renderSettingsView({
    settings: {
      loading: false,
      error: null,
      appVersion: "1.2.3",
      sqliteVersion: "3.53.1",
      section: "api-tokens",
      tokenDatabase: { id: "db-one", label: "Database One" },
      apiTokens: [
        {
          id: "token-one",
          name: "Automation",
          tokenPrefix: "shub_example",
          createdAt: "2026-06-15T10:00:00.000Z",
        },
      ],
      createdApiToken: null,
      tokenSaving: false,
    },
  });

  assert.match(rendered.main, /API Tokens/);
  assert.match(rendered.main, /Security \/\/ Database API access/);
  assert.match(rendered.main, /Database One/);
  assert.match(rendered.main, /Database ID/);
  assert.match(rendered.main, /data-database-id/);
  assert.match(rendered.main, /data-action="copy-database-id"/);
  assert.match(rendered.main, /Copy ID/);
  assert.match(rendered.main, /sm:grid-cols-\[minmax\(0,1fr\)_9rem\]/);
  assert.equal((rendered.main.match(/w-full self-center justify-center/g) ?? []).length, 2);
  assert.match(rendered.main, /shub_example\.\.\./);
  assert.match(rendered.main, /data-api-token-name/);
  assert.match(rendered.main, /data-form="create-api-token"/);
  assert.match(rendered.main, /name="name"/);
  assert.match(rendered.main, /type="submit"/);
  assert.match(rendered.main, /data-action="open-delete-api-token-modal"/);
  assert.match(rendered.main, /bg-surface-container-lowest/);
  assert.doesNotMatch(rendered.main, /sqlite-hub --port:PORT/);
  assert.doesNotMatch(rendered.main, /Open Github/);
  assert.doesNotMatch(rendered.main, /token_hash/);
});
