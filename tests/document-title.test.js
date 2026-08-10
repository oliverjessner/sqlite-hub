const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

let documentTitleModulePromise;

function loadDocumentTitleModule() {
  documentTitleModulePromise ??= import(
    pathToFileURL(path.resolve(__dirname, '../frontend/js/utils/documentTitle.js')).href
  );
  return documentTitleModulePromise;
}

function state({
  activeLabel = 'Customers',
  dataRow = null,
  dataRowIndex = null,
  documentName = '',
  documentSelected = false,
  editorTabs = [],
  activeEditorTabId = '',
  executing = false,
  routeName = 'documents',
} = {}) {
  return {
    connections: { active: activeLabel ? { label: activeLabel } : null },
    documents: {
      draftFilename: documentName,
      selected: documentSelected ? { filename: documentName } : null,
      selectedId: documentSelected ? 'document-one' : null,
    },
    dataBrowser: {
      selectedRow: dataRowIndex === null ? dataRow : null,
      selectedRowIndex: dataRowIndex,
      table: dataRowIndex === null ? null : { rows: [dataRow] },
    },
    editor: {
      activeQueryTabId: activeEditorTabId,
      executing,
      queryTabs: editorTabs,
    },
    route: { name: routeName },
  };
}

test('document title combines the active database and current menu', async () => {
  const { resolveDocumentTitle } = await loadDocumentTitleModule();

  assert.equal(resolveDocumentTitle(state()), 'Customers | Docs.');
  assert.equal(resolveDocumentTitle(state({ routeName: 'textToStruct' })), 'Customers | Text2Struct');
  assert.equal(resolveDocumentTitle(state({ routeName: 'landing' })), 'Customers | Home');
});

test('documents title includes the selected document name', async () => {
  const { resolveDocumentTitle } = await loadDocumentTitleModule();

  assert.equal(
    resolveDocumentTitle(state({ documentName: 'Release notes.md', documentSelected: true })),
    'Customers | Docs. | Release notes.md',
  );
  assert.equal(resolveDocumentTitle(state({ documentName: '', documentSelected: true })), 'Customers | Docs.');
});

test('data title includes the selected row name', async () => {
  const { resolveDocumentTitle } = await loadDocumentTitleModule();

  assert.equal(
    resolveDocumentTitle(state({ routeName: 'data', dataRow: { id: 7, name: 'Ada Lovelace' }, dataRowIndex: 0 })),
    'Customers | Data | Ada Lovelace',
  );
  assert.equal(resolveDocumentTitle(state({ routeName: 'data' })), 'Customers | Data');
});

test('data title falls back to the visible row number when a row has no name', async () => {
  const { resolveDocumentTitle } = await loadDocumentTitleModule();

  assert.equal(
    resolveDocumentTitle(state({ routeName: 'data', dataRow: { id: 7, email: 'ada@example.com' }, dataRowIndex: 0 })),
    'Customers | Data | Row 1',
  );
});

test('document title falls back to SQLite Hub without an active database', async () => {
  const { resolveDocumentTitle } = await loadDocumentTitleModule();

  assert.equal(resolveDocumentTitle(state({ activeLabel: '', routeName: 'connections' })), 'SQLite Hub | Connections');
});

test('running SQL keeps database and menu context in the title', async () => {
  const { resolveDocumentTitle } = await loadDocumentTitleModule();

  assert.equal(
    resolveDocumentTitle(
      state({
        activeEditorTabId: 'query-2',
        editorTabs: [
          { id: 'query-1', title: 'Query 1' },
          { id: 'query-2', title: 'Customer report' },
        ],
        executing: true,
        routeName: 'editorResults',
      }),
    ),
    'Customers | SQL Editor | Customer report | Running',
  );
});

test('SQL editor title follows the active tab when multiple tabs are open', async () => {
  const { resolveDocumentTitle } = await loadDocumentTitleModule();
  const editorTabs = [
    { id: 'query-1', title: 'Query 1' },
    { id: 'query-2', title: 'Monthly revenue' },
  ];

  assert.equal(
    resolveDocumentTitle(state({ routeName: 'editor', editorTabs, activeEditorTabId: 'query-1' })),
    'Customers | SQL Editor | Query 1',
  );
  assert.equal(
    resolveDocumentTitle(state({ routeName: 'editor', editorTabs, activeEditorTabId: 'query-2' })),
    'Customers | SQL Editor | Monthly revenue',
  );
});
