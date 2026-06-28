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

test("workspace open dropdown renders navigation and SQL editor actions", async () => {
  const { renderWorkspaceOpenDropdown } = await import(
    pathToFileURL(path.resolve(__dirname, "../frontend/js/components/workspaceOpenDropdown.js")).href
  );
  const markup = renderWorkspaceOpenDropdown({
    tableName: "companies",
    destinations: [
      {
        icon: "account_tree",
        key: "structure",
        label: "Structure",
        target: tableName => `/structure/${encodeURIComponent(tableName)}`,
      },
      {
        icon: "troubleshoot",
        key: "table-advisor",
        label: "Table Advisor",
        target: tableName => `/table-advisor/${encodeURIComponent(tableName)}`,
      },
      {
        key: "sql-editor",
      },
    ],
  });

  assert.match(markup, /data-dropdown-button/);
  assert.match(markup, /data-action="navigate"/);
  assert.match(markup, /data-to="\/structure\/companies"/);
  assert.match(markup, /data-to="\/table-advisor\/companies"/);
  assert.match(markup, /Table Advisor/);
  assert.match(markup, /data-action="open-table-in-sql-editor"/);
  assert.match(markup, /data-table-name="companies"/);
});
