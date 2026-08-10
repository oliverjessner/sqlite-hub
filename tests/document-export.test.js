const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

let documentExportModulePromise;

function loadDocumentExportModule() {
  documentExportModulePromise ??= import(
    pathToFileURL(path.resolve(__dirname, '../frontend/js/utils/documentExport.js')).href
  );
  return documentExportModulePromise;
}

test('document exports replace the existing extension for MD and TXT', async () => {
  const { buildDocumentExport } = await loadDocumentExportModule();

  assert.deepEqual(buildDocumentExport('release notes.md', 'txt'), {
    filename: 'release notes.txt',
    format: 'txt',
    mimeType: 'text/plain;charset=utf-8',
  });
  assert.deepEqual(buildDocumentExport('release notes.txt', 'md'), {
    filename: 'release notes.md',
    format: 'md',
    mimeType: 'text/markdown;charset=utf-8',
  });
});

test('document export filenames are safe and have a stable fallback', async () => {
  const { buildDocumentExport } = await loadDocumentExportModule();

  assert.equal(buildDocumentExport('../bad/name?.md', 'txt').filename, 'bad name.txt');
  assert.equal(buildDocumentExport('', 'txt').filename, 'document.txt');
});
