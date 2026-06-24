const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

async function loadModule() {
  return import(pathToFileURL(path.resolve(__dirname, "../frontend/js/views/backups.js")).href);
}

function createState(overrides = {}) {
  return {
    connections: {
      active: { id: "db-one", label: "Customers", path: "/tmp/source.sqlite", readOnly: false },
    },
    backups: {
      items: [],
      loading: false,
      operationLoading: false,
      error: null,
    },
    ...overrides,
  };
}

test("backup manager renders empty state and create action", async () => {
  const { renderBackupsView } = await loadModule();
  const rendered = renderBackupsView(createState()).main;

  assert.match(rendered, /No backups yet/);
  assert.match(rendered, /data-action="open-create-backup-modal"/);
});

test("backup manager renders backup rows with status and actions", async () => {
  const { renderBackupsView } = await loadModule();
  const rendered = renderBackupsView(
    createState({
      backups: {
        items: [
          {
            id: "backup-one",
            name: "Before migration",
            notes: "Schema update",
            sizeBytes: 1024,
            status: "verified",
            sqliteHubVersion: "1.1.2",
            sqliteVersion: "3.50.0",
            fileExists: true,
            fileName: "backup.sqlite",
            path: "/tmp/backup.sqlite",
            connectionId: "db-one",
            sourcePath: "/tmp/source.sqlite",
            createdAt: "2026-06-21T11:42:18.000Z",
          },
        ],
        loading: false,
        operationLoading: false,
        error: null,
      },
    })
  ).main;

  assert.match(rendered, /Before migration/);
  assert.match(rendered, /Verified/);
  assert.match(rendered, /SQLite Hub/);
  assert.match(rendered, /v1\.1\.2/);
  assert.match(rendered, /SQLite/);
  assert.match(rendered, /v3\.50\.0/);
  assert.match(rendered, /PK \/\/ backup-one/);
  assert.match(rendered, /grid-cols-\[minmax\(18rem,1\.2fr\)_minmax\(17rem,0\.85fr\)_minmax\(18rem,1fr\)_14rem\]/);
  assert.doesNotMatch(rendered, /<table/);
  assert.match(rendered, /\[overflow-wrap:anywhere\]/);
  assert.match(rendered, /whitespace-pre-wrap/);
  assert.match(rendered, /data-action="open-edit-backup-modal"/);
  assert.match(rendered, />\s*Edit\s*</);
  assert.match(rendered, /data-action="open-compare-backup-drawer"/);
  assert.ok(
    rendered.indexOf('data-action="open-compare-backup-drawer"') <
      rendered.indexOf('data-action="open-restore-backup-modal"')
  );
  assert.match(rendered, /data-action="open-restore-backup-modal"/);
  assert.match(rendered, /data-action="download-backup"/);
  assert.match(rendered, /data-action="open-delete-backup-modal"/);
});

test("backup manager renders compare results in the right drawer", async () => {
  const { renderBackupsView } = await loadModule();
  const rendered = renderBackupsView(
    createState({
      backups: {
        items: [],
        loading: false,
        operationLoading: false,
        error: null,
        diff: {
          visible: true,
          backupId: "backup-one",
          backupName: "Before migration",
          backupCreatedAt: "2026-06-24T12:30:00.000Z",
          currentLabel: "Customers",
          activeTab: "data",
          requestId: "request-one",
          loading: false,
          error: null,
          data: {
            backup: {
              id: "backup-one",
              name: "Before migration",
              createdAt: "2026-06-24T12:30:00.000Z",
            },
            current: {
              connectionId: "db-one",
              label: "Customers",
            },
            summary: {
              schemaChanges: 2,
              rowsAdded: 1,
              rowsChanged: 1,
              rowsRemoved: 0,
              skippedTables: 0,
            },
            schema: {
              added: [],
              changed: [],
              removed: [],
            },
            data: {
              tables: [
                {
                  name: "users",
                  status: "comparable",
                  statusLabel: "Comparable",
                  reason: "",
                  added: 1,
                  changed: 1,
                  removed: 0,
                  samples: {
                    added: [],
                    removed: [],
                    changed: [
                      {
                        identityLabel: "id = 42",
                        columns: [
                          {
                            name: "status",
                            backup: "trial",
                            current: "active",
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    })
  );

  assert.match(rendered.panel, /Backup Compare/);
  assert.match(rendered.panel, /Before migration/);
  assert.match(rendered.panel, /Customers/);
  assert.doesNotMatch(rendered.panel, />\s*Base\s*</);
  assert.match(rendered.panel, /data-action="close-backup-diff-drawer"/);
  assert.match(rendered.panel, /query-history-icon-button/);
  assert.match(rendered.panel, /Schema changes/);
  assert.match(rendered.panel, /mt-5 flex flex-col items-start gap-2/);
  assert.match(rendered.panel, /charts-height-toggle/);
  assert.match(rendered.panel, /standard-button charts-height-toggle__button/);
  assert.match(rendered.panel, /data-action="set-backup-diff-tab"/);
  assert.match(rendered.panel, /data-tab="schema"/);
  assert.match(rendered.panel, /data-tab="data"/);
  assert.match(rendered.panel, /id = 42/);
  assert.match(rendered.panel, /trial/);
  assert.match(rendered.panel, /active/);
});
