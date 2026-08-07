const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let viewPromise;

function loadView() {
  viewPromise ??= import(pathToFileURL(path.resolve(__dirname, "../frontend/js/views/textToStruct.js")).href);
  return viewPromise;
}

function textToStructState(overrides = {}) {
  return {
    connections: { active: null },
    textToStruct: {
      input: "Oliver|34",
      parser: { type: "delimiter", delimiter: "|", separator: ":", header: true },
      fields: [
        {
          id: "field-name",
          name: "name",
          type: "string",
          required: true,
          trim: true,
          separator: ",",
          primaryKey: false,
          autoIncrement: false,
          unique: false,
        },
        {
          id: "field-age",
          name: "age",
          type: "integer",
          required: false,
          trim: true,
          separator: ",",
          primaryKey: false,
          autoIncrement: false,
          unique: false,
        },
      ],
      deduplicate: false,
      deduplicateFields: [],
      errors: "collect",
      output: "json",
      outputOptions: { table: "items", createTable: true },
      result: { output: "", records: [], errors: [], metadata: null },
      converting: false,
      error: null,
      ...overrides,
    },
  };
}

test("Text2Struct renders schema rows and works without an active database", async () => {
  const { renderTextToStructView } = await loadView();
  const { main } = renderTextToStructView(textToStructState());

  assert.match(main, /TEXT2STRUCT/i);
  assert.match(main, /data-action="convert-text-to-struct"/);
  assert.match(main, /data-column-id="field-name"/);
  assert.match(main, /data-column-id="field-age"/);
  assert.match(main, /data-bind="text-to-struct-input"/);
  assert.match(main, /9 CHARS/);
  assert.doesNotMatch(main, /ACTIVE_DATABASE_REQUIRED/);
});

test("duplicate property names render compact validation feedback and disable conversion", async () => {
  const { renderTextToStructView } = await loadView();
  const state = textToStructState();
  state.textToStruct.fields[1].name = "name";
  const { main } = renderTextToStructView(state);

  assert.match(main, /DUPLICATE PROPERTY: name/);
  assert.match(main, /data-text-to-struct-convert[\s\S]{0,120}?disabled/);
});

test("SQLite-specific controls only render for SQLite output", async () => {
  const { renderTextToStructView } = await loadView();
  const jsonMarkup = renderTextToStructView(textToStructState()).main;
  const sqliteMarkup = renderTextToStructView(textToStructState({ output: "sqlite" })).main;

  assert.doesNotMatch(jsonMarkup, /data-text-to-struct-sqlite-options/);
  assert.doesNotMatch(jsonMarkup, /data-text-to-struct-sqlite-field-options/);
  assert.doesNotMatch(jsonMarkup, /open-text-to-struct-in-editor/);
  assert.match(sqliteMarkup, /data-text-to-struct-sqlite-options/);
  assert.match(sqliteMarkup, /data-text-to-struct-sqlite-field-options/);
  assert.match(sqliteMarkup, /Primary key/);
  assert.match(sqliteMarkup, /Auto increment/);
  assert.match(sqliteMarkup, /Open in SQL Editor/);
});

test("output is escaped and rendered as plain source text with collected errors", async () => {
  const { renderTextToStructView } = await loadView();
  const state = textToStructState({
    result: {
      output: "<script>alert(1)</script>\n| markdown |",
      records: [{ name: "Oliver", age: 34 }],
      errors: [{ row: 2, property: "age", code: "INVALID_INTEGER", message: 'Expected integer, received "abc"' }],
      metadata: { recordCount: 1, errorCount: 1, format: "json" },
    },
  });
  const { main } = renderTextToStructView(state);

  assert.match(main, /<pre class="text-to-struct-output/);
  assert.match(main, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(main, /<script>alert/);
  assert.match(main, /ROW 2/);
  assert.match(main, /INVALID_INTEGER/);
  assert.match(main, /1 RECORDS \/\/ 1 ERRORS \/\/ JSON/);
});

test("generated SQLite SQL transfers to editor state without execution", async () => {
  const previousFetch = global.fetch;
  const previousWindow = global.window;
  global.window = { setTimeout() {} };
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        message: "Text converted.",
        data: {
          output: 'CREATE TABLE "items" (\n  "name" TEXT\n);',
          records: [{ name: "Oliver" }],
          errors: [],
        },
        metadata: { recordCount: 1, errorCount: 0, format: "sqlite" },
        warnings: [],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  try {
    const store = await import(
      `${pathToFileURL(path.resolve(__dirname, "../frontend/js/store.js")).href}?text-to-struct-transfer`
    );
    const fieldId = store.getState().textToStruct.fields[0].id;
    store.setTextToStructInput("Oliver");
    store.updateTextToStructField(fieldId, "name", "name");
    store.setTextToStructOutput("sqlite");

    assert.equal(await store.convertCurrentTextToStruct(), true);
    assert.equal(store.transferTextToStructSqlToEditor(), true);

    const editor = store.getState().editor;
    assert.match(editor.sqlText, /CREATE TABLE/);
    assert.equal(editor.queryTabs[0].origin, "Generated by Text2Struct");
    assert.equal(editor.executing, false);
    assert.equal(editor.result, null);
    assert.equal(editor.lastExecutedSql, "");
  } finally {
    global.fetch = previousFetch;
    global.window = previousWindow;
  }
});

test("changing output format clears stale serialized output until the next conversion", async () => {
  const previousWindow = global.window;
  global.window = { setTimeout() {} };

  try {
    const store = await import(
      `${pathToFileURL(path.resolve(__dirname, "../frontend/js/store.js")).href}?text-to-struct-output-change`
    );
    assert.equal(store.getState().textToStruct.result.metadata, null);
    store.setTextToStructOutput("sqlite");
    assert.equal(store.getState().textToStruct.output, "sqlite");
    assert.equal(store.getState().textToStruct.result.metadata, null);
    assert.equal(store.transferTextToStructSqlToEditor(), false);
  } finally {
    global.window = previousWindow;
  }
});

test("Text2Struct route state loads without an active database", async () => {
  const previousWindow = global.window;
  global.window = { setTimeout() {} };

  try {
    const store = await import(
      `${pathToFileURL(path.resolve(__dirname, "../frontend/js/store.js")).href}?text-to-struct-no-database`
    );
    assert.equal(store.getState().connections.active, null);

    await store.setRoute({ name: "textToStruct", path: "/text-to-struct", params: {} });

    const state = store.getState();
    assert.equal(state.route.name, "textToStruct");
    assert.equal(state.textToStruct.error, null);
    assert.equal(state.textToStruct.converting, false);
  } finally {
    global.window = previousWindow;
  }
});

test("copy uses the complete output and Escape handling does not clear the multiline input", () => {
  const source = readFileSync(path.resolve(__dirname, "../frontend/js/app.js"), "utf8");

  assert.match(source, /navigator\.clipboard\.writeText\(String\(textToStruct\.result\.output \?\? ''\)\)/);
  assert.match(source, /showToast\('OUTPUT COPIED', 'success'\)/);
  assert.match(source, /target instanceof HTMLInputElement && clearInputForEscape\(target\)/);
  assert.doesNotMatch(source, /target instanceof HTMLTextAreaElement && clearInputForEscape\(target\)/);
});
