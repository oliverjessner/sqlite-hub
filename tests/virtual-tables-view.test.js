const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

async function loadFrontendModule(relativePath) {
  return import(pathToFileURL(path.resolve(__dirname, relativePath)).href);
}

test("table kind badges render in data, advisor, designer, and structure views", async () => {
  const [{ renderDataView }, { renderTableAdvisorView }, { renderTableDesignerView }, { renderStructureView }] =
    await Promise.all([
      loadFrontendModule("../frontend/js/views/data.js"),
      loadFrontendModule("../frontend/js/views/tableAdvisor.js"),
      loadFrontendModule("../frontend/js/views/tableDesigner.js"),
      loadFrontendModule("../frontend/js/views/structure.js"),
    ]);
  const virtualTable = { name: "docs", columnCount: 2, isVirtual: true, tableKind: "virtual" };
  const shadowTable = { name: "docs_data", columnCount: 2, isShadow: true, tableKind: "shadow" };

  const dataHtml = renderDataView({
    connections: { active: { readOnly: false } },
    dataBrowser: {
      error: null,
      loading: false,
      page: 1,
      pageSize: 50,
      selectedRowIndex: null,
      selectedTable: "docs",
      tableSearchQuery: "",
      tables: [virtualTable, shadowTable],
      tablesVisible: true,
      table: null,
    },
  }).main;
  const advisorHtml = renderTableAdvisorView({
    tableAdvisor: {
      tables: [virtualTable, shadowTable],
      selectedTableName: "docs",
      loading: false,
      analysisLoading: false,
      error: null,
      analysisError: null,
      result: {
        tableName: "docs",
        isVirtual: true,
        score: 100,
        issueCount: 0,
        rowCount: 1,
        analyzedAt: "2026-06-28T10:00:00.000Z",
        issues: [],
      },
    },
  }).main;
  const designerHtml = renderTableDesignerView({
    tableDesigner: {
      tablesVisible: true,
      tables: [virtualTable, shadowTable],
      selectedTableName: "docs",
      searchQuery: "",
      draft: null,
      loading: false,
      detailLoading: false,
      error: null,
      sqlPreviewVisible: false,
    },
  }).main;
  const structureHtml = renderStructureView({
    structure: {
      data: {
        grouped: {
          tables: [
            { name: "docs", type: "table", isVirtual: true, tableKind: "virtual" },
            { name: "docs_data", type: "table", isShadow: true, tableKind: "shadow" },
          ],
          views: [],
          indexes: [],
          triggers: [],
        },
        graph: {
          relationshipCount: 0,
          tables: [
            { name: "docs", type: "table", isVirtual: true, tableKind: "virtual", columns: [], foreignKeys: [] },
            { name: "docs_data", type: "table", isShadow: true, tableKind: "shadow", columns: [], foreignKeys: [] },
          ],
        },
      },
      detail: null,
      detailLoading: false,
      error: null,
      loading: false,
      selectedName: "docs_data",
      tableSearchQuery: "",
      tablesVisible: true,
    },
  }).main;

  assert.match(dataHtml, /title="Virtual table">Virtual</);
  assert.match(dataHtml, /title="Shadow table">Shadow</);
  assert.match(advisorHtml, /title="Virtual table">Virtual</);
  assert.doesNotMatch(advisorHtml, /title="Shadow table">Shadow/);
  assert.doesNotMatch(advisorHtml, /docs_data/);
  assert.match(designerHtml, /title="Virtual table">Virtual</);
  assert.doesNotMatch(designerHtml, /title="Shadow table">Shadow/);
  assert.doesNotMatch(designerHtml, /docs_data/);
  assert.match(structureHtml, /title="Virtual table">Virtual</);
  assert.match(structureHtml, /title="Shadow table">Shadow</);
  assert.match(structureHtml, /Shadow Tables/);
  assert.match(structureHtml, /Tables[\s\S]*docs[\s\S]*Shadow Tables[\s\S]*docs_data/);
});

test("structure graph marks table-kind nodes without label suffixes", async () => {
  const { buildGraphElements, renderInspector } = await loadFrontendModule("../frontend/js/components/structureGraph.js");
  const elements = buildGraphElements({
    tables: [
      {
        name: "docs",
        type: "table",
        isVirtual: true,
        tableKind: "virtual",
        ddl: "CREATE VIRTUAL TABLE docs USING fts5(title, body)",
        columns: [],
        foreignKeys: [],
      },
      { name: "docs_data", type: "table", isShadow: true, tableKind: "shadow", columns: [], foreignKeys: [] },
    ],
  });
  const virtualNode = elements.find((element) => element.data?.tableName === "docs");
  const shadowNode = elements.find((element) => element.data?.tableName === "docs_data");
  const shadowEdge = elements.find(
    (element) =>
      element.group === "edges" &&
      element.classes === "shadow-link" &&
      element.data?.source === "table:docs" &&
      element.data?.target === "table:docs_data"
  );
  const virtualInspectorHtml = renderInspector({
    name: "docs",
    type: "table",
    isVirtual: true,
    columns: [],
    foreignKeys: [],
    ddl: "CREATE VIRTUAL TABLE docs USING fts5(title, body)",
  });
  const shadowInspectorHtml = renderInspector({
    name: "docs_data",
    type: "table",
    isShadow: true,
    columns: [],
    foreignKeys: [],
    ddl: "CREATE TABLE docs_data(id INTEGER PRIMARY KEY, block BLOB)",
  });

  assert.equal(virtualNode.classes, "virtual-table");
  assert.equal(virtualNode.data.isVirtual, true);
  assert.equal(virtualNode.data.label, "docs");
  assert.equal(virtualNode.data.virtualModule, "fts5");
  assert.equal(virtualNode.data.height, 82);
  assert.equal(shadowNode.classes, "shadow-table");
  assert.equal(shadowNode.data.isShadow, true);
  assert.equal(shadowNode.data.label, "docs_data");
  assert.ok(shadowEdge);
  assert.equal(Object.hasOwn(shadowEdge.data, "id"), false);
  assert.equal(shadowEdge.data.relationshipKind, "shadow");
  assert.match(virtualInspectorHtml, /class="structure-graph__flag is-virtual" title="Virtual table">Virtual</);
  assert.match(shadowInspectorHtml, /class="structure-graph__flag is-shadow" title="Shadow table">Shadow</);
});

test("data view treats selected shadow tables as read-only", async () => {
  const { renderDataView } = await loadFrontendModule("../frontend/js/views/data.js");
  const rendered = renderDataView({
    connections: { active: { readOnly: false } },
    dataBrowser: {
      error: null,
      loading: false,
      page: 1,
      pageSize: 50,
      selectedRowIndex: 0,
      selectedTable: "docs_data",
      tableSearchQuery: "",
      tables: [{ name: "docs_data", columnCount: 2, isShadow: true, tableKind: "shadow" }],
      tablesVisible: true,
      table: {
        name: "docs_data",
        isShadow: true,
        readOnly: true,
        columns: ["id", "block"],
        columnMeta: [
          { name: "id", visible: true, primaryKeyPosition: 1, affinity: "INTEGER" },
          { name: "block", visible: true, affinity: "BLOB" },
        ],
        foreignKeys: [],
        rows: [
          {
            id: 1,
            block: "content",
            __identity: {
              kind: "primaryKey",
              columns: ["id"],
              values: { id: 1 },
            },
          },
        ],
        rowCount: 1,
        page: 1,
        pageCount: 1,
        offset: 0,
        limit: 50,
      },
    },
  });

  assert.match(rendered.main, /title="Shadow tables are read-only in Data"/);
  assert.match(rendered.main, /data-action="open-generate-data-modal"[\s\S]*disabled aria-disabled="true"/);
  assert.match(rendered.panel, /Shadow tables are read-only in Data\./);
  assert.doesNotMatch(rendered.panel, /data-action="delete-data-row"[\s\S]*Delete Row/);
});
