const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { DataBrowserService } = require("../server/services/sqlite/dataBrowserService");

async function loadFrontendModule(relativePath) {
  return import(pathToFileURL(path.resolve(__dirname, relativePath)).href);
}

test("row editor values preserve NULL and empty string as distinct values", async () => {
  const {
    buildRowEditorSubmittedValues,
    getRowEditorValueState,
    getRowEditorValueStateLabel,
  } = await loadFrontendModule("../frontend/js/utils/rowEditorValues.js");
  const formData = new FormData();

  formData.append("field:title", "");
  formData.append("field:description", "");
  formData.append("field:count", "42");

  assert.deepEqual(buildRowEditorSubmittedValues(formData, {
    title: { initialState: "empty", dirty: false },
    description: { initialState: "null", dirty: false },
  }), {
    title: "",
    description: null,
    count: "42",
  });
  assert.equal(
    buildRowEditorSubmittedValues(formData, {
      description: { initialState: "null", dirty: true },
    }).description,
    ""
  );
  assert.equal(getRowEditorValueState(null), "null");
  assert.equal(getRowEditorValueState(""), "empty");
  assert.equal(getRowEditorValueState("text"), "value");
  assert.equal(getRowEditorValueStateLabel("null"), "NULL");
  assert.equal(getRowEditorValueStateLabel("empty"), "EMPTY STRING");
});

test("row editor renders visible NULL and empty-string states", async () => {
  const { renderRowEditorPanel } = await loadFrontendModule(
    "../frontend/js/components/rowEditorPanel.js"
  );
  const html = renderRowEditorPanel({
    title: "Values",
    closeAction: "close",
    formName: "save-data-row",
    editableFields: [
      {
        name: "nullable_text",
        label: "nullable_text",
        rawValue: null,
        value: "",
        notNull: false,
      },
      {
        name: "empty_text",
        label: "empty_text",
        rawValue: "",
        value: "",
        notNull: false,
      },
      {
        name: "required_text",
        label: "required_text",
        rawValue: "value",
        value: "value",
        notNull: true,
      },
    ],
  });

  assert.match(html, /data-value-state="null"[^>]*>NULL</s);
  assert.match(html, /data-value-state="empty"[^>]*>EMPTY STRING</s);
  assert.match(html, /data-value-state="value"[^>]*>VALUE</s);
  assert.doesNotMatch(html, /field-null:|row-editor-null-toggle|Set NULL/);
  assert.doesNotMatch(html, /name="field:nullable_text"[\s\S]*?disabled/);
});

test("data updates can change NULL to empty string and empty string to NULL", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE values_test (
        id INTEGER PRIMARY KEY,
        nullable_text TEXT,
        empty_text TEXT
      );
      INSERT INTO values_test (id, nullable_text, empty_text) VALUES (1, NULL, '');
    `);
    const service = new DataBrowserService({
      connectionManager: {
        assertWritable() {},
        getActiveDatabase: () => db,
      },
    });
    const identity = service.getTableData("values_test", { limit: 10 }).rows[0].__identity;
    const preview = service.previewTableRowUpdate("values_test", {
      identity,
      values: {
        nullable_text: "",
        empty_text: null,
      },
    });

    assert.deepEqual(preview.changes, [
      { column: "nullable_text", oldValue: "NULL", newValue: "" },
      { column: "empty_text", oldValue: "", newValue: "NULL" },
    ]);

    service.updateTableRow("values_test", {
      identity,
      values: {
        nullable_text: "",
        empty_text: null,
      },
    });
    const row = db.prepare("SELECT nullable_text, empty_text FROM values_test WHERE id = 1").get();

    assert.equal(row.nullable_text, "");
    assert.equal(row.empty_text, null);
  } finally {
    db.close();
  }
});
