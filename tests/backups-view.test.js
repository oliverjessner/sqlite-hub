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
      active: { id: "db-one", label: "Customers", readOnly: false },
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
            fileExists: true,
            fileName: "backup.sqlite",
            path: "/tmp/backup.sqlite",
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
  assert.match(rendered, /data-action="open-edit-backup-notes-modal"/);
  assert.match(rendered, /data-action="open-restore-backup-modal"/);
  assert.match(rendered, /data-action="download-backup"/);
  assert.match(rendered, /data-action="open-delete-backup-modal"/);
});
