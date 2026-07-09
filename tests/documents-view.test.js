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
      folders: [],
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

test("documents view uses document and file dropdowns for blank and markdown import", async () => {
  const { renderDocumentsView } = await loadDocumentsViewModule();
  const { main } = renderDocumentsView(buildDocumentsState());

  assert.match(main, /data-dropdown-button/);
  assert.match(main, />\s*New\s*</);
  assert.match(main, /New Document/);
  assert.match(main, /New Folder/);
  assert.match(main, /data-action="create-document"/);
  assert.match(main, /data-action="open-create-document-folder-modal"/);
  assert.match(main, />\s*File\s*</);
  assert.match(main, /Import MD/);
  assert.match(main, /data-action="import-document-markdown"/);
  assert.match(main, /data-bind="document-import-file"/);
  assert.doesNotMatch(main, /data-form="new-document"/);
  assert.doesNotMatch(main, /Import \.md/);
});

test("documents panes keep both headers visible and expose pane toggles from view menu", async () => {
  const { renderDocumentsView } = await loadDocumentsViewModule();
  const { main } = renderDocumentsView(
    buildSelectedDocumentsState({
      editorVisible: false,
      previewVisible: true,
    }),
  );

  assert.match(main, /documents-workspace--editor-collapsed/);
  assert.match(main, /documents-pane--editor documents-pane--collapsed/);
  assert.match(main, />\s*View\s*</);
  assert.match(main, /data-pane="editor"/);
  assert.match(main, /Show Editor/);
  assert.match(main, /data-pane="preview"/);
  assert.match(main, /Hide Preview/);
  assert.doesNotMatch(main, /documents-pane__toggle/);
});

test("documents subnavi can be hidden while the show documents button stays available", async () => {
  const { renderDocumentsView } = await loadDocumentsViewModule();
  const { main } = renderDocumentsView(
    buildSelectedDocumentsState({
      documentsVisible: false,
    }),
  );

  assert.doesNotMatch(main, /documents-view__sidebar/);
  assert.match(main, />\s*View\s*</);
  assert.match(main, /data-action="toggle-documents-panel"/);
  assert.match(main, /Show Documents/);
  assert.doesNotMatch(main, /aria-pressed="true"/);
});

test("selected document actions render in one titlebar without a save button", async () => {
  const { renderDocumentsView } = await loadDocumentsViewModule();
  const { main } = renderDocumentsView(buildSelectedDocumentsState());
  const orderedFragments = [
    'data-bind="document-field"',
    "New",
    "New Document",
    "New Folder",
    "Insert",
    "Insert Query Note",
    'data-action="open-document-insert-table-definition-modal"',
    "Insert Table Definition",
    'data-action="insert-document-saved-queries"',
    "Insert Saved Queries",
    'data-action="insert-document-time-metadata"',
    "Insert Time Metadata",
    'data-action="insert-document-database-info"',
    "Insert Database Info",
    "View",
    'data-action="toggle-document-pane"',
    'data-action="toggle-documents-panel"',
    "File",
    'data-action="import-document-markdown"',
    "Import MD",
    'data-action="export-document-markdown"',
    "Export MD",
    "Move to",
    'data-action="move-document-to-folder"',
    "Delete",
  ];
  const indexes = orderedFragments.map(fragment => main.indexOf(fragment));

  indexes.forEach(index => assert.notEqual(index, -1));

  for (let index = 1; index < indexes.length; index += 1) {
    assert.ok(indexes[index - 1] < indexes[index]);
  }

  assert.doesNotMatch(main, /documents-toolbar/);
  assert.doesNotMatch(main, /data-action="save-document"/);
  assert.doesNotMatch(main, />Insert Note</);
  assert.match(main, /data-document-list-meta/);
  assert.match(main, /data-document-save-state="saved"/);
});

test("documents sidebar groups root and folder documents and move dropdown lists folders", async () => {
  const { renderDocumentsView } = await loadDocumentsViewModule();
  const { main } = renderDocumentsView(
    buildSelectedDocumentsState({
      folders: [
        {
          id: "folder-one",
          name: "Research",
          createdAt: "2026-07-09T08:00:00.000Z",
          updatedAt: "2026-07-09T08:00:00.000Z",
        },
      ],
      items: [
        {
          contentLength: 11,
          filename: "notes.md",
          folderId: null,
          id: "doc-one",
          title: "Notes",
          updatedAt: "2026-06-21T10:00:00.000Z",
        },
        {
          contentLength: 7,
          filename: "research.md",
          folderId: "folder-one",
          id: "doc-two",
          title: "Research",
          updatedAt: "2026-06-22T10:00:00.000Z",
        },
      ],
      selected: {
        contentLength: 11,
        filename: "notes.md",
        folderId: null,
        id: "doc-one",
        title: "Notes",
        updatedAt: "2026-06-21T10:00:00.000Z",
      },
    }),
  );

  assert.match(main, /No Folder/);
  assert.match(main, /Research/);
  assert.match(main, /notes\.md/);
  assert.match(main, /research\.md/);
  assert.match(main, />\s*Move to\s*</);
  assert.match(main, /data-action="move-document-to-folder"/);
  assert.match(main, /data-folder-id="folder-one"/);
});
