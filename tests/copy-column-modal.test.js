const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let modalModulePromise = null;

function loadModalModule() {
  if (!modalModulePromise) {
    modalModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/components/modal.js")).href
    );
  }

  return modalModulePromise;
}

function buildState(copyMode) {
  return {
    modal: {
      kind: "copy-column",
      scope: "editor",
      columnName: "task",
      copyMode,
      separator: ",",
      wrapper: '"',
      lineBreaks: false,
      error: null,
      submitting: false,
    },
    editor: {
      result: {
        columns: ["task"],
        rows: [{ task: "item1" }, { task: "item2" }],
      },
    },
    charts: {
      result: null,
    },
    connections: {
      recent: [],
      active: null,
    },
  };
}

test("markdown todo column export renders an editable preview textarea", async () => {
  const { renderCopyColumnModal } = await loadModalModule();
  const state = buildState("markdown-todo");
  const html = renderCopyColumnModal(state.modal, state);

  assert.match(html, /Editable Preview/);
  assert.match(html, /<textarea[^>]+name="editedText"/);
  assert.match(html, /- \[ \] item1/);
  assert.match(html, /- \[ \] item2/);
  assert.match(html, /Export to document folder/);
});

test("regular copy column preview stays read-only", async () => {
  const { renderCopyColumnModal } = await loadModalModule();
  const state = buildState("column");
  const html = renderCopyColumnModal(state.modal, state);

  assert.match(html, /<pre class="copy-column-preview custom-scrollbar">/);
  assert.doesNotMatch(html, /name="editedText"/);
});

test("modal footer close buttons are not right-aligned", () => {
  const source = readFileSync(
    path.resolve(__dirname, "../frontend/js/components/modal.js"),
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /<div class="[^"]*justify-end[^"]*pt-2[^"]*"[\s\S]{0,500}?data-action="close-modal"/
  );
  assert.doesNotMatch(
    source,
    /'<div class="[^']*justify-end[^']*pt-2[^']*>'[\s\S]{0,500}?data-action="close-modal"/
  );
});

test("create database modal offers a native path picker and manual fallback", async () => {
  const { renderCreateDatabaseForm } = await loadModalModule();
  const html = renderCreateDatabaseForm({
    kind: "create-connection",
    error: null,
    submitting: false,
  });

  assert.match(html, /data-action="choose-create-database-path"/);
  assert.match(html, /data-create-database-path/);
  assert.match(html, /name="path"/);
  assert.match(html, /enter an absolute path manually/);
});

test("open database modal offers a native file picker and manual fallback", async () => {
  const { renderOpenConnectionForm } = await loadModalModule();
  const html = renderOpenConnectionForm({
    kind: "open-connection",
    error: null,
    submitting: false,
  });

  assert.match(html, /data-action="choose-open-database-path"/);
  assert.match(html, /data-open-database-path/);
  assert.match(html, /name="path"/);
  assert.match(html, /enter an absolute path manually/);
});
