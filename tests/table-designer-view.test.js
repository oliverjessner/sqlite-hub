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

test("table designer import dropdown exposes csv tsv and json formats", async () => {
  const { renderTableDesignerView } = await loadTableDesignerViewModule();
  const { main } = renderTableDesignerView({
    tableDesigner: {
      tablesVisible: false,
      selectedTableName: null,
      draft: null,
      loading: false,
      detailLoading: false,
      error: null,
      sqlPreviewVisible: false,
    },
  });

  assert.match(main, /Import data/);
  assert.match(main, /data-action="import-table-designer-data"/);
  assert.match(main, /data-import-format="csv"/);
  assert.match(main, />CSV</);
  assert.match(main, /data-import-accept="\.csv,text\/csv"/);
  assert.match(main, /data-import-format="tsv"/);
  assert.match(main, />TSV</);
  assert.match(main, /data-import-accept="\.tsv,text\/tab-separated-values"/);
  assert.match(main, /data-import-format="json"/);
  assert.match(main, />JSON</);
  assert.match(main, /data-import-accept="\.json,application\/json"/);
  assert.match(main, /accept="\.csv,text\/csv,\.tsv,text\/tab-separated-values,\.json,application\/json"/);
});

test("table designer imported draft shows source and create import action", async () => {
  const { renderTableDesignerView } = await loadTableDesignerViewModule();
  const { main } = renderTableDesignerView({
    tableDesigner: {
      tablesVisible: false,
      selectedTableName: null,
      tables: [],
      draft: {
        mode: "create",
        tableName: "customers",
        columns: [
          {
            id: "column:id",
            name: "id",
            type: "INTEGER",
            notNull: true,
            unique: false,
            primaryKey: true,
            defaultValue: "",
            referencesTable: "",
            referencesColumn: "",
          },
        ],
        supportedTypes: ["TEXT", "INTEGER", "REAL"],
        importFormat: "json",
        importSourceFileName: "customers.json",
        importRows: [[1]],
        importedCsvRows: [[1]],
        fillImportedRows: true,
        canSave: true,
        validationErrors: [],
        warnings: [],
      },
      loading: false,
      detailLoading: false,
      saving: false,
      saveError: null,
      error: null,
      sqlPreviewVisible: false,
    },
  });

  assert.match(main, /SOURCE \/\/ JSON/);
  assert.match(main, /customers\.json/);
  assert.match(main, /Create &amp; Import/);
  assert.match(main, /1 imported row/);
});

test("table designer check button opens the constraints drawer instead of a modal", async () => {
  const { renderTableDesignerView } = await loadTableDesignerViewModule();
  const { main } = renderTableDesignerView({
    tableDesigner: {
      tablesVisible: false,
      selectedTableName: null,
      tables: [],
      draft: {
        mode: "create",
        tableName: "products",
        columns: [
          {
            id: "column:price",
            name: "price",
            type: "REAL",
            notNull: false,
            unique: false,
            primaryKey: false,
            defaultValue: "",
            referencesTable: "",
            referencesColumn: "",
          },
        ],
        checkConstraints: [],
        uniqueConstraints: [],
        supportedTypes: ["TEXT", "INTEGER", "REAL"],
        canSave: true,
        validationErrors: [],
        warnings: [],
      },
      loading: false,
      detailLoading: false,
      saving: false,
      saveError: null,
      error: null,
      sqlPreviewVisible: false,
    },
  });

  assert.match(main, /data-action="open-table-designer-constraints"/);
  assert.match(main, /table-designer-row-check-button__count is-empty/);
  assert.doesNotMatch(main, /data-modal="table-designer-constraints"/);
  assert.doesNotMatch(main, /table-designer-constraints-modal__summary/);
});

test("table designer constraints render in the right drawer without the old summary block", async () => {
  const { renderTableDesignerView } = await loadTableDesignerViewModule();
  const { panel } = renderTableDesignerView({
    tableDesigner: {
      tablesVisible: false,
      selectedTableName: "products",
      tables: [],
      constraintsDrawer: {
        visible: true,
        columnId: "column:price",
        columnName: "price",
        editingConstraintId: "",
        editor: null,
      },
      draft: {
        mode: "edit",
        tableName: "products",
        columns: [
          {
            id: "column:price",
            name: "price",
            type: "REAL",
            notNull: false,
            unique: false,
            primaryKey: false,
            defaultValue: "",
            referencesTable: "",
            referencesColumn: "",
          },
        ],
        checkConstraints: [
          {
            id: "check:price",
            name: "CHECK 1",
            expression: 'CHECK ("price" >= 0)',
            originalExpression: 'CHECK ("price" >= 0)',
            columns: [{ name: "price", allowedValues: [] }],
            source: "detected",
          },
        ],
        uniqueConstraints: [],
        supportedTypes: ["TEXT", "INTEGER", "REAL"],
        canSave: true,
        validationErrors: [],
        warnings: [],
      },
      loading: false,
      detailLoading: false,
      saving: false,
      saveError: null,
      error: null,
      sqlPreviewVisible: false,
    },
  });

  assert.match(panel, /table-designer-check-drawer/);
  assert.match(panel, /Table Designer \/\/ price/);
  assert.doesNotMatch(panel, /Column \/\/ price/);
  assert.match(panel, /CHECK 1/);
  assert.match(panel, /price/);
  assert.match(panel, /data-action="close-table-designer-constraints"/);
  assert.doesNotMatch(panel, /table-designer-constraints-modal__summary/);
  assert.doesNotMatch(panel, /V2/);
});

test("table designer constraints drawer shows column-aware create presets", async () => {
  const { renderTableDesignerView } = await loadTableDesignerViewModule();
  const { panel } = renderTableDesignerView({
    tableDesigner: {
      tablesVisible: false,
      selectedTableName: null,
      tables: [],
      constraintsDrawer: {
        visible: true,
        columnId: "column:price",
        columnName: "price",
        editingConstraintId: "",
        editor: {
          expression: '"price" >= 0',
          presetId: "numeric-non-negative",
          presetFields: { minValue: "0", maxValue: "100" },
          error: null,
          validating: false,
        },
      },
      draft: {
        mode: "create",
        tableName: "products",
        columns: [
          {
            id: "column:price",
            name: "price",
            type: "REAL",
            notNull: false,
            unique: false,
            primaryKey: false,
            defaultValue: "",
            referencesTable: "",
            referencesColumn: "",
          },
        ],
        checkConstraints: [],
        uniqueConstraints: [],
        supportedTypes: ["TEXT", "INTEGER", "REAL"],
        canSave: true,
        validationErrors: [],
        warnings: [],
      },
      loading: false,
      detailLoading: false,
      saving: false,
      saveError: null,
      error: null,
      sqlPreviewVisible: false,
    },
  });

  assert.match(panel, /Quick Checks/);
  assert.match(panel, /Positive/);
  assert.match(panel, /Non Negative/);
  assert.match(panel, /Generated SQL/);
  assert.match(panel, /CHECK/);
  assert.doesNotMatch(panel, /Non Empty/);
});
