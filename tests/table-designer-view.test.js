const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let tableDesignerViewModulePromise = null;

function loadTableDesignerViewModule() {
  if (!tableDesignerViewModulePromise) {
    tableDesignerViewModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/views/tableDesigner.js")).href
    );
  }

  return tableDesignerViewModulePromise;
}

test("table designer open dropdown includes table advisor", async () => {
  const { renderTableDesignerView } = await loadTableDesignerViewModule();
  const { main } = renderTableDesignerView({
    tableDesigner: {
      tablesVisible: false,
      selectedTableName: "companies",
      draft: null,
      loading: false,
      detailLoading: false,
      error: null,
      sqlPreviewVisible: false,
    },
  });

  assert.match(main, /Open companies/);
  assert.match(main, /data-to="\/table-advisor\/companies"/);
  assert.match(main, /Table Advisor/);
});
