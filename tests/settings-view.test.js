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
  assert.match(rendered.main, /Version_Check/);
  assert.match(rendered.main, /data-action="check-app-version"/);
  assert.match(rendered.main, /Check Updates/);
  assert.match(rendered.main, /No version check has been run yet\./);
  assert.match(rendered.main, /data-section="information"/);
  assert.match(rendered.main, /data-section="api-tokens"/);
  assert.match(rendered.main, /data-section="mcp"/);
  assert.doesNotMatch(rendered.main, /data-form="create-api-token"/);
});

test("settings view shows available app updates", async () => {
  const { renderSettingsView } = await loadSettingsViewModule();
  const rendered = renderSettingsView({
    settings: {
      loading: false,
      error: null,
      appVersion: "1.0.1",
      sqliteVersion: "3.53.1",
      versionCheckLoading: false,
      versionCheckError: null,
      versionCheck: {
        currentVersion: "1.0.1",
        latestVersion: "1.1.0",
        updateAvailable: true,
        releaseUrl: "https://www.npmjs.com/package/sqlite-hub/v/1.1.0",
      },
    },
  });

  assert.match(rendered.main, /New Version Available/);
  assert.match(rendered.main, /Current v1\.0\.1 · Latest v1\.1\.0/);
  assert.match(rendered.main, /Open Release/);
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
          callCount: 12,
          lastCallAt: "2026-06-25T11:00:00.000Z",
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
  assert.match(rendered.main, /<div>Token<\/div>/);
  assert.match(rendered.main, /<div>Created<\/div>/);
  assert.match(rendered.main, /<div>Calls<\/div>/);
  assert.match(rendered.main, /<div>Last Call<\/div>/);
  assert.match(rendered.main, /<div class="text-right">Actions<\/div>/);
  assert.match(rendered.main, /shub_example\.\.\./);
  assert.match(rendered.main, /title="2026-06-15T10:00:00\.000Z"/);
  assert.match(rendered.main, /title="2026-06-25T11:00:00\.000Z"/);
  assert.match(rendered.main, />\s*12\s*<\/div>/);
  assert.match(rendered.main, /data-api-token-name/);
  assert.match(rendered.main, /data-form="create-api-token"/);
  assert.match(rendered.main, /name="name"/);
  assert.match(rendered.main, /type="submit"/);
  assert.match(rendered.main, /data-action="open-delete-api-token-modal"/);
  assert.match(rendered.main, /<span class="material-symbols-outlined text-sm">delete<\/span>\s*Delete/);
  assert.match(rendered.main, /bg-surface-container-lowest/);
  assert.doesNotMatch(rendered.main, /sqlite-hub --port:PORT/);
  assert.doesNotMatch(rendered.main, /Open Github/);
  assert.doesNotMatch(rendered.main, /token_hash/);
});

test("settings MCP tab renders status, tools, and Codex config", async () => {
  const { renderSettingsView } = await loadSettingsViewModule();
  const rendered = renderSettingsView({
    settings: {
      loading: false,
      error: null,
      section: "mcp",
      mcpStatusLoading: false,
      mcpStatusError: null,
      mcpStatus: {
        enabled: true,
        serverRunning: true,
        connected: true,
        activeClientCount: 1,
        lastConnectedAt: "2026-06-28T10:15:00.000Z",
        lastDisconnectedAt: null,
        lastToolCallAt: "2026-06-28T10:16:12.000Z",
        lastToolName: "get_schema",
        transport: "stdio",
        exposedTools: ["list_connections", "get_schema", "run_readonly_query"],
        toolDetails: [
          {
            name: "list_connections",
            description: "List imported SQLite Hub database connections.",
          },
          {
            name: "get_schema",
            description: "Return schema metadata.",
          },
          {
            name: "run_readonly_query",
            description: "Run a guarded read-only query.",
          },
        ],
        command: "http://127.0.0.1:4173/mcp",
        codexConfig:
          '[mcp_servers.sqlitehub]\nurl = "http://127.0.0.1:4173/mcp"',
        error: null,
      },
    },
  });

  assert.match(rendered.main, /Agents \/\/ Local MCP access/);
  assert.match(rendered.main, /data-section="mcp"/);
  assert.match(rendered.main, /MCP Status/);
  assert.match(rendered.main, /Agent Connected/);
  assert.match(rendered.main, /MCP Server/);
  assert.match(rendered.main, /Running/);
  assert.match(rendered.main, /Active clients/);
  assert.match(rendered.main, /get_schema/);
  assert.match(rendered.main, /list_connections/);
  assert.match(rendered.main, /run_readonly_query/);
  assert.match(rendered.main, /MCP_ENDPOINT/);
  assert.match(rendered.main, /http:\/\/127\.0\.0\.1:4173\/mcp/);
  assert.match(rendered.main, /data-mcp-config/);
  assert.match(rendered.main, /settings-mcp-config-input/);
  assert.match(rendered.main, /data-action="copy-mcp-config"/);
  assert.match(rendered.main, /\[mcp_servers\.sqlitehub\]/);
  assert.match(rendered.main, /Read-only queries are limited to SELECT, PRAGMA, and EXPLAIN/);
});
