const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("escape closes the backup compare drawer", () => {
  const source = readFileSync(path.resolve(__dirname, "../frontend/js/app.js"), "utf8");

  assert.match(
    source,
    /state\.route\.name === 'backups' && state\.backups\.diff\?\.visible[\s\S]{0,180}?closeBackupDiffDrawer\(\);/
  );
});

test("document todo changes use the autosave debounce", () => {
  const source = readFileSync(path.resolve(__dirname, "../frontend/js/app.js"), "utf8");

  assert.match(
    source,
    /case 'toggle-document-todo':[\s\S]{0,180}?toggleCurrentDocumentTodo\(actionNode\.dataset\.lineIndex\)[\s\S]{0,180}?scheduleDocumentAutosave\(getState\(\)\.documents\.selectedId\);/
  );
});

test("document saved state patches text nodes without replacing the view", () => {
  const source = readFileSync(path.resolve(__dirname, "../frontend/js/app.js"), "utf8");

  assert.match(source, /function patchDocumentsTextOnlyUi\(state, nextMainMarkup\)/);
  assert.match(source, /patchDocumentsTextNodes\('\[data-document-save-state\]', scratch\)/);
  assert.match(source, /patchDocumentsTextNodes\('\[data-document-list-meta\]', scratch\)/);
  assert.match(
    source,
    /canPatchDocumentsMain[\s\S]{0,180}?mainPatched = patchDocumentsTextOnlyUi\(state, main\);/
  );
});

test("document insert actions use the remembered editor cursor range", () => {
  const source = readFileSync(path.resolve(__dirname, "../frontend/js/app.js"), "utf8");

  assert.match(source, /let lastDocumentEditorInsertionRange = null;/);
  assert.match(source, /function rememberDocumentEditorInsertionRange\(textarea\)/);
  assert.match(source, /function rememberDocumentEditorInsertionRangeFromTarget\(target\)/);
  assert.match(source, /document\.addEventListener\('selectionchange'/);
  assert.match(
    source,
    /case 'insert-document-time-metadata':[\s\S]{0,120}?getCurrentDocumentEditorInsertionRange\(\)/
  );
  assert.match(
    source,
    /case 'insert-document-saved-queries':[\s\S]{0,120}?getCurrentDocumentEditorInsertionRange\(\)/
  );
  assert.match(
    source,
    /case 'insert-document-database-info':[\s\S]{0,120}?getCurrentDocumentEditorInsertionRange\(\)/
  );
});

test("dynamic modals focus autofocus controls after render", () => {
  const source = readFileSync(path.resolve(__dirname, "../frontend/js/app.js"), "utf8");

  assert.match(source, /function focusModalAutofocusElement\(\)/);
  assert.match(source, /shellRefs\.modal\.querySelector\('\[autofocus\]'\)/);
  assert.match(source, /element\.focus\(\{ preventScroll: true \}\);/);
  assert.match(source, /modalChanged && state\.modal && focusModalAutofocusElement\(\)/);
});
