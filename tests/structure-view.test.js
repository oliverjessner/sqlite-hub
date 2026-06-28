const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let structureViewModulePromise = null;

function loadStructureViewModule() {
  if (!structureViewModulePromise) {
    structureViewModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/views/structure.js")).href
    );
  }

  return structureViewModulePromise;
}

function buildStructureState() {
  return {
    structure: {
      data: {
        grouped: {
          tables: [{ name: "companies", type: "table" }],
          views: [],
          indexes: [],
          triggers: [],
        },
        graph: {
          relationshipCount: 0,
          tables: [{ name: "companies", type: "table", columns: [], foreignKeys: [] }],
        },
      },
      detail: null,
      detailLoading: false,
      error: null,
      loading: false,
      selectedName: "companies",
      tableSearchQuery: "",
      tablesVisible: true,
    },
  };
}

test("structure toolbar groups graph format actions in a dropdown", async () => {
  const { renderStructureView } = await loadStructureViewModule();
  const { main } = renderStructureView(buildStructureState());

  assert.match(main, /data-dropdown-button/);
  assert.match(main, /Open companies/);
  assert.match(main, /data-to="\/data\/companies"/);
  assert.match(main, /data-to="\/table-designer\/companies"/);
  assert.match(main, /data-to="\/table-advisor\/companies"/);
  assert.match(main, /Table Advisor/);
  assert.match(main, /data-action="open-table-in-sql-editor"/);
  assert.match(main, /Format graph/);
  assert.match(main, /Fit Graph/);
  assert.match(main, /data-structure-graph-action="fit"/);
  assert.match(main, /Recalculate Layout/);
  assert.match(main, /data-structure-graph-action="relayout"/);
  assert.match(main, /Clear Selection/);
  assert.match(main, /data-structure-graph-action="clear"/);
});

test("structure toolbar exposes generate types scope actions", async () => {
  const { renderStructureView } = await loadStructureViewModule();
  const state = buildStructureState();
  state.structure.detail = {
    type: "table",
    name: "companies",
    tableName: "companies",
    columns: [{ name: "id", visible: true, primaryKeyPosition: 1, declaredType: "INTEGER" }],
    foreignKeys: [],
    indexes: [],
    triggers: [],
    ddl: "CREATE TABLE companies (id INTEGER PRIMARY KEY)",
  };
  const { main } = renderStructureView(state);

  assert.match(main, /Generate Types/);
  assert.match(main, /Selected table/);
  assert.match(main, /All tables/);
  assert.match(main, /data-action="open-generate-types-modal"/);
  assert.match(main, /data-table-name="companies"/);
  assert.match(main, /data-type-scope="selected"/);
  assert.match(main, /data-type-scope="all"/);
});
