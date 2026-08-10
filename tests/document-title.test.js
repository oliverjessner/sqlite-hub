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
  documentName = '',
  documentSelected = false,
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
    editor: { executing },
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

test('document title falls back to SQLite Hub without an active database', async () => {
  const { resolveDocumentTitle } = await loadDocumentTitleModule();

  assert.equal(resolveDocumentTitle(state({ activeLabel: '', routeName: 'connections' })), 'SQLite Hub | Connections');
});

test('running SQL keeps database and menu context in the title', async () => {
  const { resolveDocumentTitle } = await loadDocumentTitleModule();

  assert.equal(
    resolveDocumentTitle(state({ executing: true, routeName: 'editorResults' })),
    'Customers | SQL Editor | Running',
  );
});
