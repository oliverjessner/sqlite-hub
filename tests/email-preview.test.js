const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

async function loadEmailPreviewModule() {
  return import(pathToFileURL(path.resolve(__dirname, "../frontend/js/utils/emailPreview.js")).href);
}

async function loadDataViewModule() {
  return import(pathToFileURL(path.resolve(__dirname, "../frontend/js/views/data.js")).href);
}

async function loadRowEditorPanelModule() {
  return import(pathToFileURL(path.resolve(__dirname, "../frontend/js/components/rowEditorPanel.js")).href);
}

test("email preview detects simple email values only", async () => {
  const { detectEmailValue } = await loadEmailPreviewModule();

  assert.deepEqual(detectEmailValue("oli@example.com"), {
    type: "email",
    value: "oli@example.com",
    localPart: "oli",
    domain: "example.com",
  });
  assert.equal(detectEmailValue("https://example.com"), null);
  assert.equal(detectEmailValue("not an email"), null);
  assert.equal(detectEmailValue(null), null);
});

test("data table renders an email icon for email cells", async () => {
  const { renderDataView } = await loadDataViewModule();
  const rendered = renderDataView({
    connections: {
      active: { readOnly: false },
    },
    dataBrowser: {
      error: null,
      loading: false,
      page: 1,
      pageSize: 50,
      selectedRowIndex: null,
      selectedTable: "contacts",
      tableSearchQuery: "",
      tables: [{ name: "contacts", columnCount: 2 }],
      tablesVisible: true,
      table: {
        name: "contacts",
        columns: ["id", "email"],
        columnMeta: [
          { name: "id", visible: true, primaryKeyPosition: 1, affinity: "INTEGER" },
          { name: "email", visible: true, affinity: "TEXT" },
        ],
        foreignKeys: [],
        rows: [{ id: 1, email: "oli@example.com" }],
        rowCount: 1,
        page: 1,
        pageCount: 1,
        offset: 0,
        limit: 50,
      },
    },
  }).main;

  assert.match(rendered, /alternate_email/);
  assert.match(rendered, /oli@example\.com/);
  assert.match(rendered, /data-action="open-generate-data-modal"/);
  assert.match(rendered, />\s*Generate\s*<\/button>/);
  assert.match(rendered, /data-to="\/table-advisor\/contacts"/);
  assert.match(rendered, /Table Advisor/);
});

test("data table generate button is disabled until a table is selected", async () => {
  const { renderDataView } = await loadDataViewModule();
  const rendered = renderDataView({
    connections: {
      active: { readOnly: false },
    },
    dataBrowser: {
      error: null,
      loading: false,
      page: 1,
      pageSize: 50,
      selectedRowIndex: null,
      selectedTable: null,
      tableSearchQuery: "",
      tables: [],
      tablesVisible: true,
      table: null,
    },
  }).main;

  assert.match(rendered, /data-action="open-generate-data-modal"/);
  assert.match(rendered, /disabled aria-disabled="true"/);
});

test("row editor renders an email badge for email fields", async () => {
  const { renderRowEditorPanel } = await loadRowEditorPanelModule();
  const rendered = renderRowEditorPanel({
    title: "contacts",
    closeAction: "close",
    formName: "save-data-row",
    editableFields: [
      {
        name: "email",
        label: "email",
        badges: [{ label: "TEXT", tone: "type" }],
        value: "oli@example.com",
        rawValue: "oli@example.com",
      },
    ],
  });

  assert.match(rendered, /EMAIL/);
  assert.match(rendered, /data-row-editor-email-field/);
});
