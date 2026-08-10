const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

let exportModulePromise;

function loadExportModule() {
  exportModulePromise ??= import(
    pathToFileURL(path.resolve(__dirname, '../frontend/js/utils/textToStructExport.js')).href
  );
  return exportModulePromise;
}

test('Text2Struct exports use the selected output extension and MIME type', async () => {
  const { buildTextToStructExport } = await loadExportModule();

  assert.deepEqual(buildTextToStructExport('json'), {
    extension: 'json',
    filename: 'text2struct-output.json',
    format: 'json',
    label: 'JSON',
    mimeType: 'application/json;charset=utf-8',
  });
  assert.equal(buildTextToStructExport('jsonl').filename, 'text2struct-output.jsonl');
  assert.equal(buildTextToStructExport('csv').mimeType, 'text/csv;charset=utf-8');
  assert.equal(buildTextToStructExport('tsv').filename, 'text2struct-output.tsv');
  assert.equal(buildTextToStructExport('markdown').filename, 'text2struct-output.md');
  assert.equal(buildTextToStructExport('yaml').filename, 'text2struct-output.yaml');
});

test('SQLite output uses a safe table-based SQL filename', async () => {
  const { buildTextToStructExport } = await loadExportModule();

  assert.deepEqual(buildTextToStructExport('sqlite', { table: '../Customer: imports?' }), {
    extension: 'sql',
    filename: 'Customer imports.sql',
    format: 'sqlite',
    label: 'SQLite SQL',
    mimeType: 'application/sql;charset=utf-8',
  });
  assert.equal(buildTextToStructExport('sqlite').filename, 'text2struct-output.sql');
});
