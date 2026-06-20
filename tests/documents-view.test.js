const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let documentsViewModulePromise = null;

function loadDocumentsViewModule() {
  if (!documentsViewModulePromise) {
    documentsViewModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/views/documents.js")).href
    );
  }

  return documentsViewModulePromise;
}

function buildDocumentsState() {
  return {
    connections: {
      active: { id: "db-one", label: "Database One" },
    },
    documents: {
      items: [],
      selectedId: null,
      selected: null,
      searchQuery: "",
      draftFilename: "",
      draftContent: "",
      dirty: false,
      documentsVisible: true,
      editorVisible: true,
      previewVisible: true,
      loading: false,
      detailLoading: false,
      saving: false,
      deleting: false,
      error: null,
      saveError: null,
    },
  };
}

function buildSelectedDocumentsState(overrides = {}) {
  const state = buildDocumentsState();
  state.documents.items = [
    {
      contentLength: 11,
      filename: "notes.md",
      id: "doc-one",
      title: "Notes",
      updatedAt: "2026-06-21T10:00:00.000Z",
    },
  ];
  state.documents.selectedId = "doc-one";
  state.documents.selected = state.documents.items[0];
  state.documents.draftFilename = "notes.md";
  state.documents.draftContent = "# Notes";
  Object.assign(state.documents, overrides);

  return state;
}

test("documents view uses a new document dropdown for blank and markdown import", async () => {
  const { renderDocumentsView } = await loadDocumentsViewModule();
  const { main } = renderDocumentsView(buildDocumentsState());

  assert.match(main, /data-dropdown-button/);
  assert.match(main, /New Document/);
  assert.match(main, /Blank Page/);
  assert.match(main, /data-action="create-document"/);
  assert.match(main, /Import \.md/);
  assert.match(main, /data-action="import-document-markdown"/);
  assert.match(main, /data-bind="document-import-file"/);
  assert.doesNotMatch(main, /data-form="new-document"/);
});

test("documents panes keep both headers visible and move pane toggles into headers", async () => {
  const { renderDocumentsView } = await loadDocumentsViewModule();
  const { main } = renderDocumentsView(
    buildSelectedDocumentsState({
      editorVisible: false,
      previewVisible: true,
    }),
  );

  assert.match(main, /documents-workspace--editor-collapsed/);
  assert.match(main, /documents-pane--editor documents-pane--collapsed/);
  assert.match(main, /data-pane="editor"/);
  assert.match(main, /Show Editor/);
  assert.match(main, /data-pane="preview"/);
  assert.match(main, /Hide Preview/);
  assert.doesNotMatch(main, />Editor<\/span>/);
  assert.doesNotMatch(main, />Preview<\/span>/);
});

test("documents subnavi can be hidden while the show documents button stays available", async () => {
  const { renderDocumentsView } = await loadDocumentsViewModule();
  const { main } = renderDocumentsView(
    buildSelectedDocumentsState({
      documentsVisible: false,
    }),
  );

  assert.doesNotMatch(main, /documents-view__sidebar/);
  assert.match(main, /data-action="toggle-documents-panel"/);
  assert.match(main, /Show Documents/);
  assert.match(main, /aria-pressed="true"/);
});

test("selected document actions render in one titlebar without a save button", async () => {
  const { renderDocumentsView } = await loadDocumentsViewModule();
  const { main } = renderDocumentsView(buildSelectedDocumentsState());
  const orderedFragments = [
    'data-action="toggle-documents-panel"',
    'data-bind="document-field"',
    "New Document",
    "Insert",
    "Export .md",
    "Delete",
  ];
  const indexes = orderedFragments.map(fragment => main.indexOf(fragment));

  indexes.forEach(index => assert.notEqual(index, -1));

  for (let index = 1; index < indexes.length; index += 1) {
    assert.ok(indexes[index - 1] < indexes[index]);
  }

  assert.doesNotMatch(main, /documents-toolbar/);
  assert.doesNotMatch(main, /data-action="save-document"/);
});
