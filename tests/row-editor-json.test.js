const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let rowEditorJsonModulePromise = null;

function loadRowEditorJsonModule() {
  if (!rowEditorJsonModulePromise) {
    const source = readFileSync(
      path.resolve(__dirname, "../frontend/js/utils/rowEditorJson.js"),
      "utf8"
    );
    const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

    rowEditorJsonModulePromise = import(url);
  }

  return rowEditorJsonModulePromise;
}

test("row editor JSON for data rows preserves column order and omits identity metadata", async () => {
  const { buildDataRowEditorJsonObject, stringifyRowEditorJson } = await loadRowEditorJsonModule();
  const row = {
    id: 1,
    title: "Event",
    created_at: 1717682400,
    payload: { __type: "blob", sizeBytes: 4, hexPreview: "ffff" },
    __identity: { kind: "primaryKey", values: { id: 1 } },
  };
  const rowObject = buildDataRowEditorJsonObject({
    row,
    columns: ["id", "title", "created_at", "payload"],
  });

  assert.deepEqual(Object.keys(rowObject), ["id", "title", "created_at", "payload"]);
  assert.deepEqual(rowObject, {
    id: 1,
    title: "Event",
    created_at: 1717682400,
    payload: { __type: "blob", sizeBytes: 4, hexPreview: "ffff" },
  });
  assert.equal(
    stringifyRowEditorJson(rowObject),
    [
      "{",
      '  "id": 1,',
      '  "title": "Event",',
      '  "created_at": 1717682400,',
      '  "payload": {',
      '    "__type": "blob",',
      '    "sizeBytes": 4,',
      '    "hexPreview": "ffff"',
      "  }",
      "}",
    ].join("\n")
  );
});

test("row editor JSON for SQL result rows maps visible source columns once", async () => {
  const { buildEditorRowEditorJsonObject } = await loadRowEditorJsonModule();
  const rowObject = buildEditorRowEditorJsonObject({
    row: {
      id: 1,
      title_alias: "Event",
      duplicate_title: "Ignored",
      hidden_note: "Hidden",
      __identity: { kind: "primaryKey", values: { id: 1 } },
    },
    editingColumns: [
      { resultName: "id", sourceColumn: "id", visible: true },
      { resultName: "title_alias", sourceColumn: "title", visible: true },
      { resultName: "duplicate_title", sourceColumn: "title", visible: true },
      { resultName: "hidden_note", sourceColumn: "note", visible: false },
    ],
  });

  assert.deepEqual(rowObject, {
    id: 1,
    title: "Event",
  });
});
