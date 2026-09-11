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

  assert.doesNotMatch(markup, />\s*Data\s*</);
  assert.match(
    markup,
    /Connections[\s\S]*SQL_Editor[\s\S]*Tables[\s\S]*SCHEMA[\s\S]*Insights[\s\S]*Workspace[\s\S]*MEDIA_TAGGING[\s\S]*Settings/,
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

test("sidebar groups reopen their last visited submenu", async (t) => {
  const oldLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
    },
  });
  t.after(() => {
    if (oldLocalStorageDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', oldLocalStorageDescriptor);
    } else {
      delete globalThis.localStorage;
    }
  });

  const { renderSidebar } = await loadSidebarModule();
  renderSidebar({
    route: { name: 'tableAdvisor' },
    connections: { active: null, recent: [] },
  });
  const markup = renderSidebar({
    route: { name: 'editor' },
    connections: { active: null, recent: [] },
  });

  assert.match(markup, /href="#\/table-advisor" data-group="schema"/);
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

  assert.match(markup, /sidebar-link is-active[^>]*href="#\/text-to-struct"[^>]*data-group="workspace"/);
  assert.match(markup, /sidebar-sublink is-active[^>]*href="#\/text-to-struct"[\s\S]*TEXT2STRUCT/);
  assert.doesNotMatch(markup, /<span>Text2Struct<\/span>/);
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

test("Tables uses the shared submenu with Browse and Sheets and highlights only the selected mode", async () => {
  const { renderSidebar } = await loadSidebarModule();
  for (const mode of ['browse', 'sheets']) {
    const markup = renderSidebar({
      route: { name: 'data', path: `/${mode}` },
      connections: { active: null, recent: [] },
      dataBrowser: { mode, selectedTable: 'order items' },
    });
    assert.match(markup, /sidebar-link is-active[^>]*data-group="data"/);
    const sublinks = [...markup.matchAll(/<a class="sidebar-sublink[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
    assert.equal(sublinks.length, 2);
    assert.match(sublinks[0], />\s*Browse\s*<\/a>/);
    assert.match(sublinks[1], />\s*Sheets\s*<\/a>/);
    for (const link of sublinks) {
      assert.match(link, /href="#\/(browse|sheets)"/);
      assert.doesNotMatch(link, /data-action=/);
      const active = link.includes(`data-mode="${mode}"`);
      assert.equal(link.includes('sidebar-sublink is-active'), active);
      assert.equal(link.includes('aria-current="page"'), active);
    }
  }
});
