const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let queryEditorModulePromise = null;

function loadQueryEditorModule() {
  if (!queryEditorModulePromise) {
    queryEditorModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/components/queryEditor.js")).href
    );
  }

  return queryEditorModulePromise;
}

test("query editor groups editor actions in a reusable dropdown", async () => {
  const { renderQueryEditor } = await loadQueryEditorModule();
  const markup = renderQueryEditor({ query: "select * from companies;" });

  assert.match(markup, /data-dropdown-button/);
  assert.match(markup, /Editor actions/);
  assert.match(markup, /data-action="format-current-query"/);
  assert.match(markup, /data-action="clear-query"/);
  assert.match(markup, /data-action="copy-current-query"/);
  assert.match(markup, /Copy to Clipboard/);
});
