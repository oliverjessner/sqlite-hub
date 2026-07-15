const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let modalModulePromise = null;

function loadModalModule() {
  if (!modalModulePromise) {
    modalModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/components/modal.js")).href
    );
  }

  return modalModulePromise;
}

function buildState(copyMode) {
  return {
    modal: {
      kind: "copy-column",
      scope: "editor",
      columnName: "task",
      copyMode,
      separator: ",",
      wrapper: '"',
      lineBreaks: false,
      error: null,
      submitting: false,
    },
    editor: {
      result: {
        columns: ["task"],
        rows: [{ task: "item1" }, { task: "item2" }],
      },
    },
    charts: {
      result: null,
    },
    connections: {
      recent: [],
      active: null,
    },
  };
}

test("markdown todo column export renders an editable preview textarea", async () => {
  const { renderCopyColumnModal } = await loadModalModule();
  const state = buildState("markdown-todo");
  const html = renderCopyColumnModal(state.modal, state);

  assert.match(html, /Editable Preview/);
  assert.match(html, /<textarea[^>]+name="editedText"/);
  assert.match(html, /- \[ \] item1/);
  assert.match(html, /- \[ \] item2/);
  assert.match(html, /Export to document folder/);
});

test("regular copy column preview stays read-only", async () => {
  const { renderCopyColumnModal } = await loadModalModule();
  const state = buildState("column");
  const html = renderCopyColumnModal(state.modal, state);

  assert.match(html, /<pre class="copy-column-preview custom-scrollbar">/);
  assert.doesNotMatch(html, /name="editedText"/);
});

test("generate types modal renders left settings, right code preview, and stacked checkboxes", async () => {
  const { renderGenerateTypesForm } = await loadModalModule();
  const html = renderGenerateTypesForm({
    kind: "generate-types",
    tableName: "users",
    target: "typescript",
    options: {
      exportDeclaration: true,
      includeDefaultsAsComments: false,
      includeGeneratedColumns: true,
      includeHiddenColumns: false,
      nullableMode: "native",
      propertyNaming: "camel",
      jsonType: "unknown",
    },
    result: {
      fileName: "User.ts",
      code: "export interface User {\\n  id: string;\\n}",
    },
    warnings: [],
    loading: false,
    error: null,
  });

  assert.match(html, /xl:grid-cols-\[24rem_minmax\(0,1fr\)\]/);
  assert.match(html, /type-generation-code-preview custom-scrollbar/);
  assert.match(html, /<div class="grid gap-2">\s*<label class="standard-checkbox">/);
  assert.match(html, /<span class="block whitespace-pre">export interface User \{<\/span>/);
  assert.match(html, /<span class="block whitespace-pre">  id: string;<\/span>/);
  assert.match(html, /<span class="block whitespace-pre">\}<\/span>/);

  const css = readFileSync(
    path.resolve(__dirname, "../frontend/styles/components.css"),
    "utf8"
  );
  assert.match(css, /\.type-generation-code-preview\s*\{[\s\S]*overflow-y: scroll;/);
  assert.match(css, /\.app-modal-shell\s*\{[\s\S]*max-height: calc\(100dvh - var\(--spacing-8\)\);/);
  assert.match(css, /\.app-modal-body\s*\{[\s\S]*overflow-y: auto;/);
});

test("generate types modal offers Go as a target", async () => {
  const { renderGenerateTypesForm } = await loadModalModule();
  const html = renderGenerateTypesForm({
    kind: "generate-types",
    tableName: "users",
    target: "go",
    options: {
      exportDeclaration: true,
      includeDefaultsAsComments: false,
      includeGeneratedColumns: true,
      includeHiddenColumns: false,
      nullableMode: "native",
      propertyNaming: "pascal",
    },
    result: {
      fileName: "User.go",
      code: "package models\\n\\ntype User struct {}",
    },
    warnings: [],
    loading: false,
    error: null,
  });

  assert.match(html, /<option value="go" selected>Go<\/option>/);
  assert.match(html, /User\.go/);
});

test("generate types modal renders all-table file badges and download label", async () => {
  const { renderGenerateTypesForm } = await loadModalModule();
  const html = renderGenerateTypesForm({
    kind: "generate-types",
    scope: "all",
    tableNames: ["users", "accounts"],
    target: "typescript",
    options: {
      exportDeclaration: true,
      includeDefaultsAsComments: false,
      includeGeneratedColumns: true,
      includeHiddenColumns: false,
      nullableMode: "native",
      propertyNaming: "camel",
      jsonType: "unknown",
    },
    result: {
      fileName: "2 files",
      code: "// User.ts\nexport interface User {}\n\n// Account.ts\nexport interface Account {}",
      files: [
        { tableName: "users", fileName: "User.ts", code: "export interface User {}" },
        { tableName: "accounts", fileName: "Account.ts", code: "export interface Account {}" },
      ],
    },
    warnings: [
      "users: SQLite uses dynamic typing. Generated types are based on declared column types and schema constraints.",
      "accounts: warning two",
    ],
    loading: false,
    error: null,
  });

  assert.match(html, /Generate application types from all 2 tables\./);
  assert.match(html, /User\.ts/);
  assert.match(html, /Account\.ts/);
  assert.match(html, /Download Files/);
  assert.doesNotMatch(html, /type-generation-warning-list/);
  assert.doesNotMatch(html, /SQLite uses dynamic typing/);
  assert.doesNotMatch(html, /accounts: warning two/);
});

test("generate data modal renders schema mappings and preview controls", async () => {
  const { renderGenerateDataForm, renderModal } = await loadModalModule();
  const modal = {
    kind: "generate-data",
    tableName: "contacts",
    columns: [
      {
        name: "id",
        visible: true,
        primaryKeyPosition: 1,
        declaredType: "INTEGER",
        affinity: "INTEGER",
      },
      {
        name: "email",
        visible: true,
        declaredType: "TEXT",
        affinity: "TEXT",
        notNull: true,
      },
    ],
    rowCount: 100,
    mappings: [
      { columnName: "id", generator: "skip", options: {}, note: "Auto increment / skipped" },
      { columnName: "email", generator: "email", options: {} },
    ],
    previewColumns: ["id", "email"],
    previewRows: [{ id: null, email: "ada.lovelace.1@example.test" }],
    previewLoading: false,
    submitting: false,
    error: null,
  };
  const html = renderGenerateDataForm(modal);
  const shellHtml = renderModal({
    modal,
    connections: {
      recent: [],
    },
    charts: {
      result: null,
      detail: null,
    },
    documents: {
      selectedId: null,
    },
    editor: {
      result: null,
    },
    mediaTagging: {
      config: null,
    },
    tableDesigner: {
      draft: null,
    },
  });

  assert.match(html, /Create test rows for "contacts"\./);
  assert.doesNotMatch(html, /Generated locally from the current table schema/);
  assert.match(html, /data-form="generate-data"/);
  assert.match(html, /data-bind="generate-data-field"/);
  assert.match(html, /data-action="preview-generate-data"/);
  assert.match(html, /Insert Rows/);
  assert.match(html, /Auto increment \/ skipped/);
  assert.match(html, /<option value="email" selected>Email<\/option>/);
  assert.match(html, /ada\.lovelace\.1@example\.test/);
  assert.match(shellHtml, /app-modal-body app-modal-body--no-scroll/);
  assert.match(shellHtml, /synthetic-generator-grid custom-scrollbar/);
  assert.doesNotMatch(shellHtml, /synthetic-generator-preview custom-scrollbar/);

  const css = readFileSync(
    path.resolve(__dirname, "../frontend/styles/components.css"),
    "utf8"
  );
  assert.match(css, /\.app-modal-body--no-scroll\s*\{[\s\S]*overflow: hidden;/);
  assert.match(css, /\.synthetic-generator-grid\s*\{[\s\S]*max-height: min\(44dvh, 34rem\);[\s\S]*overflow: auto;/);
  const generateDataFormCss = css.match(/\.generate-data-modal-form\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert.doesNotMatch(generateDataFormCss, /height: 100%;/);
});

test("modal footer close buttons are not right-aligned", () => {
  const source = readFileSync(
    path.resolve(__dirname, "../frontend/js/components/modal.js"),
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /<div class="[^"]*justify-end[^"]*pt-2[^"]*"[\s\S]{0,500}?data-action="close-modal"/
  );
  assert.doesNotMatch(
    source,
    /'<div class="[^']*justify-end[^']*pt-2[^']*>'[\s\S]{0,500}?data-action="close-modal"/
  );
});

test("create database modal offers a native path picker and manual fallback", async () => {
  const { renderCreateDatabaseForm } = await loadModalModule();
  const html = renderCreateDatabaseForm({
    kind: "create-connection",
    error: null,
    submitting: false,
  });

  assert.match(html, /data-action="choose-create-database-path"/);
  assert.match(html, /data-create-database-path/);
  assert.match(html, /name="path"/);
  assert.match(html, /enter an absolute path manually/);
});

test("open database modal offers a native file picker and manual fallback", async () => {
  const { renderOpenConnectionForm } = await loadModalModule();
  const html = renderOpenConnectionForm({
    kind: "open-connection",
    error: null,
    submitting: false,
  });

  assert.match(html, /data-action="choose-open-database-path"/);
  assert.match(html, /data-open-database-path/);
  assert.match(html, /name="path"/);
  assert.match(html, /enter an absolute path manually/);
});

test("API token deletion uses the shared confirmation modal", async () => {
  const { renderDeleteApiTokenForm } = await loadModalModule();
  const html = renderDeleteApiTokenForm({
    kind: "delete-api-token",
    tokenId: "token-one",
    tokenName: "Automation",
    tokenPrefix: "shub_example",
    databaseLabel: "Database One",
    error: null,
    submitting: false,
  });

  assert.match(html, /Delete API token/);
  assert.match(html, /Automation/);
  assert.match(html, /Database One/);
  assert.match(html, /shub_example\.\.\./);
  assert.match(html, /data-form="delete-api-token-confirm"/);
  assert.match(html, /Delete Token/);
});

test("document table definition modal filters shadow tables and renders options", async () => {
  const { renderModal } = await loadModalModule();
  const html = renderModal({
    modal: {
      kind: "document-insert-table-definition",
      documentId: "doc-one",
      tables: [
        { name: "users", tableKind: "table", isShadow: false },
        { name: "docs", tableKind: "virtual", isVirtual: true, isShadow: false },
        { name: "docs_data", tableKind: "shadow", isShadow: true },
      ],
      selectedTableName: "docs",
      markdownTable: true,
      sqlDefinition: true,
      sampleData: true,
      sampleRowCount: 10,
      loading: false,
      error: null,
      submitting: false,
    },
    connections: {
      recent: [],
    },
    charts: {
      result: null,
      detail: null,
    },
    documents: {
      selectedId: "doc-one",
    },
    editor: {
      result: null,
    },
    mediaTagging: {
      config: null,
    },
    tableDesigner: {
      draft: null,
    },
  });

  assert.match(html, /Insert Table Definition/);
  assert.match(html, /data-form="document-insert-table-definition"/);
  assert.match(html, /<option[^>]+value="users"/);
  assert.match(html, /docs \(virtual\)/);
  assert.doesNotMatch(html, /docs_data/);
  assert.match(html, /data-bind="document-table-definition-option"/);
  assert.match(html, /name="markdownTable"/);
  assert.match(html, /name="sqlDefinition"/);
  assert.match(html, /name="sampleData"/);
  assert.match(html, /data-bind="document-table-definition-row-count"/);
  assert.match(html, /<option value="10" selected>/);
});

test("document folder creation modal renders name input", async () => {
  const { renderModal } = await loadModalModule();
  const html = renderModal({
    modal: {
      kind: "create-document-folder",
      name: "",
      error: null,
      submitting: false,
    },
    connections: {
      recent: [],
    },
    charts: {
      result: null,
      detail: null,
    },
    documents: {
      selectedId: null,
    },
    editor: {
      result: null,
    },
    mediaTagging: {
      config: null,
    },
    tableDesigner: {
      draft: null,
    },
  });

  assert.match(html, /New Folder/);
  assert.match(html, /data-form="create-document-folder"/);
  assert.match(html, /name="name"/);
  assert.match(html, /bg-surface-container-lowest/);
  assert.match(html, /focus:border-primary-container/);
  assert.match(html, /Create Folder/);
});
