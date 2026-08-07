const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let sidebarModulePromise = null;

function loadSidebarModule() {
  if (!sidebarModulePromise) {
    sidebarModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/components/sidebar.js")).href
    );
  }

  return sidebarModulePromise;
}

test("sidebar renders the primary navigation in the requested group order", async () => {
  const { renderSidebar } = await loadSidebarModule();
  const markup = renderSidebar({
    route: { name: "data" },
    connections: {
      active: null,
      recent: [],
    },
  });

  assert.match(
    markup,
    /Connections[\s\S]*Data[\s\S]*SQL_Editor[\s\S]*SCHEMA[\s\S]*Insights[\s\S]*Workspace[\s\S]*MEDIA_TAGGING[\s\S]*Settings/,
  );
});

test("sidebar exposes table advisor inside the schema group", async () => {
  const { renderSidebar } = await loadSidebarModule();
  const markup = renderSidebar({
    route: { name: "tableAdvisor" },
    connections: {
      active: null,
      recent: [],
    },
  });

  assert.match(markup, /SCHEMA/);
  assert.match(markup, /href="#\/table-advisor"/);
  assert.match(markup, /STRUCTURE[\s\S]*ADVISOR[\s\S]*DESIGNER/);
  assert.match(markup, /sidebar-link is-active/);
  assert.match(markup, /sidebar-sublink is-active[\s\S]*ADVISOR/);
});

test("sidebar expands insights and workspace children in their requested order", async () => {
  const { renderSidebar } = await loadSidebarModule();
  const insightsMarkup = renderSidebar({
    route: { name: "charts" },
    connections: {
      active: null,
      recent: [],
    },
  });
  const workspaceMarkup = renderSidebar({
    route: { name: "documents" },
    connections: {
      active: null,
      recent: [],
    },
  });

  assert.match(insightsMarkup, /Insights[\s\S]*CHARTS[\s\S]*OVERVIEW/);
  assert.match(workspaceMarkup, /Workspace[\s\S]*DOCUMENTS[\s\S]*BACKUPS/);
  assert.match(workspaceMarkup, /DOCUMENTS[\s\S]*BACKUPS[\s\S]*TEXT2STRUCT/);
  assert.doesNotMatch(workspaceMarkup, /<span>Backups<\/span>/);
});

test("Text2Struct is an active Workspace submenu and not a top-level item", async () => {
  const { renderSidebar } = await loadSidebarModule();
  const markup = renderSidebar({
    route: { name: "textToStruct" },
    connections: { active: null, recent: [] },
  });

  assert.match(markup, /sidebar-link is-active[^>]*href="#\/documents"[^>]*data-group="workspace"/);
  assert.match(markup, /sidebar-sublink is-active[^>]*href="#\/text-to-struct"[\s\S]*TEXT2STRUCT/);
  assert.doesNotMatch(markup, /class="sidebar-link[^>]*href="#\/text-to-struct"/);
});

test("Documents and Backups keep Workspace active with their own submenu selected", async () => {
  const { renderSidebar } = await loadSidebarModule();
  const documents = renderSidebar({ route: { name: "documents" }, connections: { active: null, recent: [] } });
  const backups = renderSidebar({ route: { name: "backups" }, connections: { active: null, recent: [] } });

  assert.match(documents, /sidebar-sublink is-active[^>]*href="#\/documents"/);
  assert.doesNotMatch(documents, /sidebar-sublink is-active[^>]*href="#\/backups"/);
  assert.match(backups, /sidebar-sublink is-active[^>]*href="#\/backups"/);
  assert.doesNotMatch(backups, /sidebar-sublink is-active[^>]*href="#\/documents"/);
});
