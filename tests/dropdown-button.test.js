const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let dropdownButtonModulePromise = null;

function loadDropdownButtonModule() {
  if (!dropdownButtonModulePromise) {
    dropdownButtonModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/components/dropdownButton.js")).href
    );
  }

  return dropdownButtonModulePromise;
}

test("dropdown button renders reusable action items", async () => {
  const { renderDropdownButton } = await loadDropdownButtonModule();
  const markup = renderDropdownButton({
    icon: "add_box",
    label: "Insert",
    title: "Insert content",
    items: [
      {
        action: "open-document-insert-table-modal",
        dataAttributes: { sourceView: "documents" },
        icon: "table_chart",
        label: "Insert Table",
      },
      {
        action: "open-document-insert-note-modal",
        icon: "note_add",
        label: "Insert Note",
      },
    ],
  });

  assert.match(markup, /data-dropdown-button/);
  assert.match(markup, /dropdown-button__toggle/);
  assert.match(markup, /dropdown-button__panel/);
  assert.match(markup, /data-action="open-document-insert-table-modal"/);
  assert.match(markup, /data-source-view="documents"/);
  assert.match(markup, /Insert Note/);
});

test("dropdown button renders disabled as a real disabled button", async () => {
  const { renderDropdownButton } = await loadDropdownButtonModule();
  const markup = renderDropdownButton({
    disabled: true,
    label: "Insert",
    items: [{ action: "noop", label: "Noop" }],
  });

  assert.doesNotMatch(markup, /<details/);
  assert.match(markup, /disabled/);
  assert.match(markup, /aria-disabled="true"/);
});

test("dropdown button supports local action attributes", async () => {
  const { renderDropdownButton } = await loadDropdownButtonModule();
  const markup = renderDropdownButton({
    label: "Format",
    items: [
      {
        action: "fit",
        actionAttribute: "data-structure-graph-action",
        label: "Fit Graph",
      },
    ],
  });

  assert.match(markup, /data-structure-graph-action="fit"/);
  assert.doesNotMatch(markup, /data-action="fit"/);
});
