const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const Database = require('better-sqlite3');
const { DataBrowserService } = require('../server/services/sqlite/dataBrowserService');
const moduleUrl = name => pathToFileURL(path.resolve(__dirname, '../frontend/js', name)).href;

async function fixture(t, options = {}) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
    score INTEGER CHECK(score >= 0), derived TEXT GENERATED ALWAYS AS (upper(name)), payload BLOB) STRICT;
    CREATE TABLE other_items (id INTEGER PRIMARY KEY, label TEXT);
    INSERT INTO other_items(label) VALUES ('Other');
    INSERT INTO items(id, name, score, payload) VALUES (1, 'Alpha', 5, x'01'), (2, 'Beta', NULL, x'02');`);
  const service = new DataBrowserService({ connectionManager: { getActiveDatabase: () => db, assertWritable() {} } });
  const requests = [];
  let patchGate = null;
  const oldFetch = global.fetch;
  const oldWindow = global.window;
  const oldLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  if (options.localStorage) {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: options.localStorage });
  }
  global.window = { setTimeout: () => 0, clearTimeout() {} };
  global.fetch = async (url, options) => {
    requests.push({ url, ...options });
    try {
      let data;
      if (url === '/api/connections/active') data = { id: 'test', readOnly: false };
      else if (url.startsWith('/api/connections/')) data = [];
      else if (url === '/api/data') data = { tables: service.listTables() };
      else if (options.method === 'PATCH' && url === '/api/data/items/rows') {
        if (patchGate) await patchGate;
        data = service.updateTableRow('items', JSON.parse(options.body));
      } else if (options.method === 'POST' && /\/rows$/.test(url)) {
        const tableName = decodeURIComponent(new URL(url, 'http://test').pathname.split('/').at(-2));
        data = service.insertTableRow(tableName, JSON.parse(options.body ?? '{}'));
      } else if (options.method === 'POST' && /\/columns$/.test(url)) {
        const tableName = decodeURIComponent(new URL(url, 'http://test').pathname.split('/').at(-2));
        data = service.addTableColumn(tableName, JSON.parse(options.body ?? '{}'));
      } else if (options.method === 'PATCH' && /\/columns\//.test(url)) {
        const parts = new URL(url, 'http://test').pathname.split('/');
        data = service.renameTableColumn(
          decodeURIComponent(parts.at(-3)),
          decodeURIComponent(parts.at(-1)),
          JSON.parse(options.body ?? '{}'),
        );
      } else if (options.method === 'DELETE' && /\/columns\//.test(url)) {
        const parts = new URL(url, 'http://test').pathname.split('/');
        data = service.deleteTableColumn(decodeURIComponent(parts.at(-3)), decodeURIComponent(parts.at(-1)));
      } else if (url.startsWith('/api/data/')) {
        const tableName = decodeURIComponent(new URL(url, 'http://test').pathname.split('/').at(-1));
        data = service.getTableData(tableName, Object.fromEntries(new URL(url, 'http://test').searchParams));
      } else throw new Error(`Unexpected request: ${url}`);
      return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: { message: error.message, code: error.code } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
  };
  t.after(() => {
    global.fetch = oldFetch;
    global.window = oldWindow;
    if (options.localStorage) {
      if (oldLocalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', oldLocalStorageDescriptor);
      else delete globalThis.localStorage;
    }
    db.close();
  });
  const store = await import(`${moduleUrl('store.js')}?sheets=${Math.random()}`);
  await store.setRoute({ name: 'connections', path: '/connections', params: {} });
  await store.setRoute({ name: 'data', path: '/data/items', params: { tableName: 'items' } });
  assert.equal(store.getState().dataBrowser.table.name, 'items');
  return { store, db, service, requests, setGate: gate => { patchGate = gate; } };
}

async function key(store, key, shiftKey = false) {
  const { handleDataCellKeydown } = await import(moduleUrl('components/editableDataCell.js'));
  let prevented = false;
  await handleDataCellKeydown({ key, shiftKey, preventDefault() { prevented = true; }, stopPropagation() {} }, {
    commit: store.commitDataCellEdit, cancel: store.cancelDataCellEdit, focus() {},
  });
  assert.equal(prevented, true);
}

test('Tables has sibling modes; each mode reloads its correct range and Browse retains its drawer', async t => {
  const { store, requests, db } = await fixture(t);
  const insert = db.prepare('INSERT INTO items(name,score) VALUES(?,?)');
  for (let i = 0; i < 60; i++) insert.run(`Filtered ${i}`, i);
  await store.setDataPageSize(25);
  await store.setDataSearchColumn('name');
  await store.setDataSearchQuery('Filtered');
  await store.sortDataTableByColumn('name');
  await store.setDataPage(2);
  const { renderDataView } = await import(moduleUrl('views/data.js'));
  const before = store.getState().dataBrowser;
  const count = requests.length;
  let html = renderDataView(store.getState()).main;
  assert.doesNotMatch(html, /data-action="set-data-mode"/);
  assert.doesNotMatch(html, /data-data-mode-indicator/);
  assert.doesNotMatch(html, /Click a row to open the row editor/);
  assert.match(html, /data-bind="data-search-query"/);
  assert.match(html, /data-action="select-data-row"/);
  store.selectDataRow(0);
  assert.match(renderDataView(store.getState()).panel, /data-form="save-data-row"/);
  const { parseHash } = await import(moduleUrl('router.js'));
  await store.setRoute(parseHash('#/sheets'));
  store.selectDataRow(0);
  assert.equal(renderDataView(store.getState()).panel, '');
  html = renderDataView(store.getState()).main;
  assert.doesNotMatch(html, /data-action="select-data-row"/);
  assert.doesNotMatch(html, /data-data-mode-indicator/);
  assert.doesNotMatch(html, /Click a writable cell to edit/);
  assert.match(html, /data-sheet-grid/);
  assert.doesNotMatch(html, /data-bind="data-search-query"/);
  assert.doesNotMatch(html, /data-action="open-generate-data-modal"/);
  assert.doesNotMatch(html, /data-dropdown-button/);
  assert.doesNotMatch(html, /data-action="open-data-export-modal"/);
  assert.doesNotMatch(html, /data-action="refresh-view"/);
  assert.match(html, /data-sheets-infinite-scroll/);
  assert.match(html, /data-data-sheet-column-menu/);
  assert.match(html, /data-action="sort-data-column"/);
  assert.match(html, /data-action="insert-data-sheet-column-left"/);
  assert.match(html, /data-action="insert-data-sheet-column-right"/);
  assert.match(html, /data-action="open-rename-data-sheet-column-modal"/);
  assert.match(html, /data-action="open-delete-data-sheet-column-modal"/);
  assert.match(html, /data-data-sheet-column-resizer/);
  assert.doesNotMatch(html, /data-action="set-data-page"/);
  assert.doesNotMatch(html, /data-action="set-data-page-size"/);
  assert.match(html, /data-sheet-row-number[^>]*>\s*26\s*</);
  assert.match(html, /data-sheet-row-number[^>]*>\s*27\s*</);
  await store.setRoute(parseHash('#/browse'));
  const after = store.getState().dataBrowser;
  for (const field of ['selectedTable', 'table', 'page', 'pageSize', 'searchQuery', 'searchColumn', 'filterOperator', 'sortColumn', 'sortDirection']) {
    assert.deepEqual(after[field], before[field]);
  }
  assert.equal(requests.length, count + 2);
  store.selectDataRow(1);
  assert.match(renderDataView(store.getState()).panel, /Row Editor/);
});

test('Sheets uses real metadata for editable, primary key, generated, BLOB, unsafe and read-only cells', async t => {
  const { store } = await fixture(t);
  const { getDataCellReadonlyReason, renderEditableDataCell } = await import(moduleUrl('components/editableDataCell.js'));
  store.setDataMode('sheets');
  const state = store.getState();
  const row = state.dataBrowser.table.rows[0];
  assert.equal(getDataCellReadonlyReason(state, row, 'name'), '');
  assert.match(renderEditableDataCell(state, row, 0, 'name', '').attrs, /data-action="edit-data-cell"/);
  for (const [column, message] of [['id', /Primary-key/], ['derived', /Generated/], ['payload', /BLOB/]]) {
    assert.match(getDataCellReadonlyReason(state, row, column), message);
    assert.doesNotMatch(renderEditableDataCell(state, row, 0, column, '').attrs, /data-action/);
    assert.equal(store.startDataCellEdit(0, column), false);
  }
  for (const property of ['notSafelyUpdatable', 'isShadow', 'readOnly']) {
    const copy = structuredClone(state);
    copy.dataBrowser.table[property] = true;
    assert.ok(getDataCellReadonlyReason(copy, row, 'name'));
    assert.doesNotMatch(renderEditableDataCell(copy, row, 0, 'name', '').attrs, /data-action/);
  }
  state.connections.active.readOnly = true;
  assert.match(getDataCellReadonlyReason(state, row, 'name'), /read-only/);
  state.connections.active.readOnly = false;
  assert.match(getDataCellReadonlyReason(state, { ...row, __identity: null }, 'name'), /stable identity/);
});

test('Sheets marks primary-key and foreign-key column headers with locks', async t => {
  const { store, db } = await fixture(t);
  db.exec(`CREATE TABLE linked_items (
    id INTEGER PRIMARY KEY,
    other_id INTEGER REFERENCES other_items(id),
    note TEXT
  ); INSERT INTO linked_items(other_id, note) VALUES (1, 'Linked');`);
  await store.setRoute({ name: 'data', path: '/sheets', params: { tableName: 'linked_items', mode: 'sheets' } });
  const { renderDataView } = await import(moduleUrl('views/data.js'));
  const html = renderDataView(store.getState()).main;

  assert.match(html, /data-sheet-column-lock="primary-key"[^>]*aria-label="Primary key column"/);
  assert.match(html, /data-sheet-column-lock="foreign-key"[^>]*aria-label="Foreign key column"/);
  assert.equal((html.match(/data-sheet-column-lock=/g) ?? []).length, 2);

  await store.setRoute({ name: 'data', path: '/browse', params: { tableName: null, mode: 'browse' } });
  assert.doesNotMatch(renderDataView(store.getState()).main, /data-sheet-column-lock=/);
});

test('Browse and Sheets persist table-panel visibility independently', async t => {
  const values = new Map([
    ['sqlite_hub_data_tables_visible', 'false'],
    ['sqlite_hub_data_sheets_tables_visible', 'true'],
  ]);
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  const { store } = await fixture(t, { localStorage });
  const { parseHash } = await import(moduleUrl('router.js'));

  assert.equal(store.getState().dataBrowser.mode, 'browse');
  assert.equal(store.getState().dataBrowser.tablesVisible, false);
  await store.setRoute(parseHash('#/sheets'));
  assert.equal(store.getState().dataBrowser.tablesVisible, true);
  store.toggleDataTablesPanel();
  assert.equal(store.getState().dataBrowser.tablesVisible, false);
  assert.equal(values.get('sqlite_hub_data_sheets_tables_visible'), 'false');
  assert.equal(values.get('sqlite_hub_data_tables_visible'), 'false');

  await store.setRoute(parseHash('#/browse'));
  assert.equal(store.getState().dataBrowser.tablesVisible, false);
  store.toggleDataTablesPanel();
  assert.equal(store.getState().dataBrowser.tablesVisible, true);
  assert.equal(values.get('sqlite_hub_data_tables_visible'), 'true');
  assert.equal(values.get('sqlite_hub_data_sheets_tables_visible'), 'false');

  await store.setRoute(parseHash('#/sheets'));
  assert.equal(store.getState().dataBrowser.tablesVisible, false);
});

test('Enter PATCHes only the changed column and identity; returned generated values update locally without GETs', async t => {
  const { store, requests, db } = await fixture(t);
  store.setDataMode('sheets');
  const before = store.getState().dataBrowser;
  const count = requests.length;
  assert.equal(store.startDataCellEdit(0, 'name'), true);
  store.updateDataCellDraft('Changed');
  await key(store, 'Enter');
  assert.equal(requests.length, count + 1);
  assert.equal(requests.at(-1).method, 'PATCH');
  assert.equal(requests.at(-1).url, '/api/data/items/rows');
  assert.deepEqual(JSON.parse(requests.at(-1).body), { identity: before.table.rows[0].__identity, values: { name: 'Changed' } });
  const after = store.getState().dataBrowser;
  assert.equal(after.table.rows[0].name, 'Changed');
  assert.equal(after.table.rows[0].derived, 'CHANGED');
  assert.equal(after.editingCell, null);
  assert.equal(after.savingCell, null);
  assert.equal(db.prepare('SELECT name FROM items WHERE id=1').get().name, 'Changed');
  for (const field of ['selectedTable', 'page', 'pageSize', 'searchQuery', 'searchColumn', 'sortColumn', 'sortDirection']) assert.deepEqual(after[field], before[field]);
  store.setDataMode('browse');
  store.selectDataRow(0);
  assert.equal(store.getState().dataBrowser.table.rows[0].name, 'Changed');
});

test('Escape cancels; Tab and Shift+Tab save and skip read-only cells across row boundaries', async t => {
  const { store, requests } = await fixture(t);
  store.setDataMode('sheets');
  store.startDataCellEdit(0, 'name');
  store.updateDataCellDraft('Discard');
  const count = requests.length;
  await key(store, 'Escape');
  assert.equal(requests.length, count);
  assert.equal(store.getState().dataBrowser.table.rows[0].name, 'Alpha');
  assert.equal(store.getState().dataBrowser.editingCell, null);
  store.startDataCellEdit(0, 'name');
  store.updateDataCellDraft('Saved');
  await key(store, 'Tab');
  assert.equal(store.getState().dataBrowser.editingCell.columnName, 'score');
  store.updateDataCellDraft('8');
  await key(store, 'Tab');
  assert.equal(store.getState().dataBrowser.editingCell.columnName, 'name');
  assert.equal(store.getState().dataBrowser.editingCell.rowIndex, 1);
  store.updateDataCellDraft('Second');
  await key(store, 'Tab', true);
  assert.equal(store.getState().dataBrowser.editingCell.columnName, 'score');
  assert.equal(store.getState().dataBrowser.editingCell.rowIndex, 0);
  assert.equal(store.getState().dataBrowser.table.rows[1].name, 'Second');
});

test('SQLite CHECK, UNIQUE and STRICT errors keep original state and show useful errors; cells can be retried', async t => {
  const { store } = await fixture(t);
  store.setDataMode('sheets');
  for (const [column, value, message] of [['score', '-1', /CHECK/], ['name', 'Beta', /UNIQUE/], ['score', 'invalid', /cannot store TEXT/]]) {
    const before = store.getState().dataBrowser.table.rows;
    store.startDataCellEdit(0, column);
    store.updateDataCellDraft(value);
    await key(store, 'Enter');
    assert.deepEqual(store.getState().dataBrowser.table.rows, before);
    assert.equal(store.getState().dataBrowser.savingCell, null);
    assert.equal(store.getState().dataBrowser.editingCell, null);
    assert.match(store.getState().toasts.at(-1).message, message);
    assert.equal(store.startDataCellEdit(0, column), true);
    store.cancelDataCellEdit();
  }
});

test('empty string stays empty; unchanged values do not PATCH; NULL is never inferred', async t => {
  const { store, requests, db } = await fixture(t);
  store.setDataMode('sheets');
  store.startDataCellEdit(0, 'name');
  const count = requests.length;
  await key(store, 'Enter');
  assert.equal(requests.length, count);
  store.startDataCellEdit(0, 'name');
  store.updateDataCellDraft('');
  await key(store, 'Enter');
  assert.deepEqual(JSON.parse(requests.at(-1).body).values, { name: '' });
  assert.equal(db.prepare('SELECT name FROM items WHERE id=1').get().name, '');
  store.startDataCellEdit(1, 'score');
  assert.equal(store.getState().dataBrowser.editingCell.value, '');
  await key(store, 'Enter');
  assert.deepEqual(JSON.parse(requests.at(-1).body).values, { score: '' });
  assert.equal(store.getState().dataBrowser.table.rows[1].score, null); // STRICT rejects empty numeric text.
});

test('pending saves block duplicate commits and stale responses cannot overwrite reloaded pages', async t => {
  const { store, requests, setGate } = await fixture(t);
  store.setDataMode('sheets');
  store.startDataCellEdit(0, 'name');
  store.updateDataCellDraft('Pending');
  let release;
  setGate(new Promise(resolve => { release = resolve; }));
  const pending = store.commitDataCellEdit();
  assert.ok(store.getState().dataBrowser.savingCell);
  assert.equal(await store.commitDataCellEdit(), false);
  assert.equal(store.startDataCellEdit(1, 'name'), false);
  assert.equal(requests.filter(request => request.method === 'PATCH').length, 1);
  await store.setRoute({ name: 'data', path: '/data/items', params: { tableName: 'items' } });
  const reloaded = store.getState().dataBrowser.table.rows;
  release();
  assert.equal(await pending, false);
  assert.deepEqual(store.getState().dataBrowser.table.rows, reloaded);
  assert.equal(store.getState().dataBrowser.savingCell, null);
  assert.equal(store.getState().dataBrowser.editingCell, null);
});


test('NOT NULL, foreign key and read-only database errors use the same recoverable save path', async t => {
  const { store, db } = await fixture(t);
  db.exec(`CREATE TABLE parents(id INTEGER PRIMARY KEY);
    ALTER TABLE items ADD COLUMN parent_id INTEGER REFERENCES parents(id);
    CREATE TRIGGER require_name AFTER UPDATE OF name ON items WHEN new.name = 'trigger null'
    BEGIN UPDATE items SET name = NULL WHERE id = new.id; END;`);
  db.pragma('foreign_keys = ON');
  await store.setRoute({ name: 'data', path: '/data/items', params: { tableName: 'items' } });
  store.setDataMode('sheets');
  for (const [column, value, message] of [['name', 'trigger null', /NOT NULL/], ['parent_id', '999', /FOREIGN KEY/], ['name', 'Read only', /readonly database/]]) {
    if (value === 'Read only') db.pragma('query_only = ON');
    const before = store.getState().dataBrowser.table.rows;
    store.startDataCellEdit(0, column);
    store.updateDataCellDraft(value);
    assert.equal(await store.commitDataCellEdit(), false);
    assert.deepEqual(store.getState().dataBrowser.table.rows, before);
    assert.match(store.getState().toasts.at(-1).message, message);
    assert.equal(store.getState().dataBrowser.savingCell, null);
    assert.equal(store.startDataCellEdit(0, column), true);
    store.cancelDataCellEdit();
  }
});

test('Tab edges stop on the current page, and a mode change during saving keeps the returned row', async t => {
  const { store, setGate } = await fixture(t);
  store.setDataMode('sheets');
  store.startDataCellEdit(0, 'name');
  await key(store, 'Tab', true);
  assert.equal(store.getState().dataBrowser.editingCell, null);
  store.startDataCellEdit(1, 'score');
  store.updateDataCellDraft('10');
  await key(store, 'Tab');
  assert.equal(store.getState().dataBrowser.editingCell, null);
  store.startDataCellEdit(0, 'name');
  store.updateDataCellDraft('Mode changed');
  let release;
  setGate(new Promise(resolve => { release = resolve; }));
  const pending = store.commitDataCellEdit(1);
  store.setDataMode('browse');
  release();
  await pending;
  assert.equal(store.getState().dataBrowser.mode, 'browse');
  assert.equal(store.getState().dataBrowser.editingCell, null);
  assert.equal(store.getState().dataBrowser.table.rows[0].name, 'Mode changed');
});

test('cell-only patches leave unchanged cells and the scroll container mounted', async () => {
  const { patchDataGridCells } = await import(moduleUrl('components/editableDataCell.js'));
  const changed = { outerHTML: '<td>new</td>' };
  const same = { outerHTML: '<td>same</td>' };
  const replaced = [];
  const cells = [
    { outerHTML: '<td>old</td>', replaceWith: node => replaced.push(node) },
    { outerHTML: same.outerHTML, replaceWith: () => assert.fail('unchanged cell was replaced') },
  ];
  const current = { innerHTML: '<header>Sheets</header><tbody><tr><td>old</td><td>same</td></tr></tbody>', querySelectorAll: () => cells, scrollTop: 700, scrollLeft: 200 };
  const next = { innerHTML: '<header>Sheets</header><tbody><tr><td>new</td><td>same</td></tr></tbody>', querySelectorAll: () => [changed, same] };
  assert.equal(patchDataGridCells(current, next), true);
  assert.deepEqual(replaced, [changed]);
  assert.equal(current.scrollTop, 700);
  assert.equal(current.scrollLeft, 200);
  assert.equal(patchDataGridCells(current, { ...next, innerHTML: next.innerHTML.replace('Sheets', 'Browse') }), false);
});


test('a direct Sheets URL opens Sheets and browser history reloads each mode-specific range', async t => {
  const { store, requests } = await fixture(t);
  const { parseHash } = await import(moduleUrl('router.js'));
  await store.setRoute({ name: 'connections', path: '/connections', params: {} });
  await store.setRoute(parseHash('#/sheets'));
  assert.equal(store.getState().dataBrowser.mode, 'sheets');
  assert.equal(store.startDataCellEdit(0, 'name'), true);
  const count = requests.length;
  await store.setRoute(parseHash('#/browse'));
  assert.equal(store.getState().dataBrowser.mode, 'browse');
  assert.equal(store.getState().dataBrowser.editingCell, null);
  await store.setRoute(parseHash('#/sheets'));
  assert.equal(store.getState().dataBrowser.mode, 'sheets');
  assert.equal(requests.length, count + 2);
});

test('Sheets appends 100-row batches until every row is loaded and renders no pagination', async t => {
  const { store, db, requests } = await fixture(t);
  const insert = db.prepare('INSERT INTO items(name,score) VALUES(?,?)');
  for (let i = 0; i < 203; i++) insert.run(`Infinite ${i}`, i);
  const { parseHash } = await import(moduleUrl('router.js'));
  const { renderDataView } = await import(moduleUrl('views/data.js'));

  await store.setRoute(parseHash('#/sheets'));
  let state = store.getState();
  assert.equal(state.dataBrowser.table.rows.length, 100);
  assert.equal(state.dataBrowser.sheetsHasMore, true);
  assert.match(requests.at(-1).url, /limit=100/);
  assert.match(requests.at(-1).url, /offset=0/);
  let html = renderDataView(state).main;
  assert.match(html, /data-sheets-infinite-scroll/);
  assert.doesNotMatch(html, /data-action="set-data-page"/);
  assert.doesNotMatch(html, /data-action="set-data-page-size"/);

  assert.equal(await store.loadMoreDataSheets(), true);
  state = store.getState();
  assert.equal(state.dataBrowser.table.rows.length, 200);
  assert.equal(state.dataBrowser.sheetsHasMore, true);
  assert.match(requests.at(-1).url, /offset=100/);
  html = renderDataView(state).main;
  assert.match(html, /data-sheet-row-number[^>]*>\s*200\s*</);

  assert.equal(await store.loadMoreDataSheets(), true);
  state = store.getState();
  assert.equal(state.dataBrowser.table.rows.length, 205);
  assert.equal(state.dataBrowser.sheetsHasMore, false);
  assert.match(requests.at(-1).url, /offset=200/);
  const count = requests.length;
  assert.equal(await store.loadMoreDataSheets(), false);
  assert.equal(requests.length, count);
});

test('table selection changes local Data Browser state without putting the table in the mode URL', async t => {
  const { store } = await fixture(t);
  const { parseHash } = await import(moduleUrl('router.js'));
  await store.setRoute(parseHash('#/sheets'));
  assert.equal(await store.selectDataTable('other_items'), true);
  const state = store.getState();
  assert.equal(state.route.path, '/sheets');
  assert.equal(state.dataBrowser.mode, 'sheets');
  assert.equal(state.dataBrowser.selectedTable, 'other_items');
  assert.equal(state.dataBrowser.table.name, 'other_items');
});

test('Sheets persists bounded column widths and applies column settings operations', async t => {
  const values = new Map();
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  const { store, db } = await fixture(t, { localStorage });
  const { parseHash } = await import(moduleUrl('router.js'));
  const { renderDataView } = await import(moduleUrl('views/data.js'));

  await store.setRoute(parseHash('#/sheets'));
  assert.equal(store.setDataSheetColumnWidth('name', 20), 96);
  assert.equal(store.setDataSheetColumnWidth('score', 900), 480);
  let html = renderDataView(store.getState()).main;
  assert.match(html, /data-data-sheet-col="name"[^>]*width:96px/);
  assert.match(html, /data-data-sheet-col="score"[^>]*width:480px/);

  assert.equal(await store.insertDataSheetColumn('name', 'left'), true);
  let columns = store.getState().dataBrowser.table.columns;
  assert.ok(columns.indexOf('column_1') < columns.indexOf('name'));
  assert.ok(db.prepare('PRAGMA table_info(items)').all().some(column => column.name === 'column_1'));

  store.openRenameDataSheetColumnModal('column_1');
  assert.equal(await store.submitRenameDataSheetColumn('notes'), true);
  columns = store.getState().dataBrowser.table.columns;
  assert.ok(columns.includes('notes'));
  assert.ok(!columns.includes('column_1'));

  store.openDeleteDataSheetColumnModal('notes');
  assert.equal(await store.submitDeleteDataSheetColumn(), true);
  assert.ok(!store.getState().dataBrowser.table.columns.includes('notes'));
  assert.ok(!db.prepare('PRAGMA table_info(items)').all().some(column => column.name === 'notes'));
});

test('Sheets adds a default row only after the table has been fully loaded', async t => {
  const { store, db } = await fixture(t);
  db.exec(`CREATE TABLE defaults_table (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New row',
    quantity INTEGER DEFAULT 0
  );`);
  await store.setRoute({ name: 'data', path: '/sheets', params: { tableName: 'defaults_table', mode: 'sheets' } });
  const { renderDataView } = await import(moduleUrl('views/data.js'));

  assert.match(renderDataView(store.getState()).main, /data-action="insert-data-sheet-row"/);
  assert.equal(await store.insertDataSheetRow(), true);
  assert.equal(store.getState().dataBrowser.table.rows.at(-1).title, 'New row');
  assert.equal(store.getState().dataBrowser.table.rows.at(-1).quantity, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM defaults_table').get().count, 1);
});

test('data service supports default rows and safe column schema operations', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE sheet_ops (id INTEGER PRIMARY KEY, title TEXT DEFAULT 'Untitled');`);
  const service = new DataBrowserService({
    connectionManager: { getActiveDatabase: () => db, assertWritable() {} },
  });

  try {
    assert.equal(service.addTableColumn('sheet_ops', { name: 'notes' }).added, true);
    assert.equal(service.renameTableColumn('sheet_ops', 'notes', { name: 'details' }).renamed, true);
    const inserted = service.insertTableRow('sheet_ops');
    assert.equal(inserted.row.title, 'Untitled');
    assert.ok(inserted.row.__identity);
    assert.equal(service.deleteTableColumn('sheet_ops', 'details').deleted, true);
    assert.deepEqual(
      db.prepare('PRAGMA table_info(sheet_ops)').all().map(column => column.name),
      ['id', 'title'],
    );
  } finally {
    db.close();
  }
});
