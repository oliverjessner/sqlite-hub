import * as api from "./api.js";
import { formatCellValue, inferStatusTone, truncateMiddle } from "./utils/format.js";

const listeners = new Set();
const DEFAULT_SETTINGS = {
  defaultPageSize: 50,
  maxPageSize: 200,
  csvDelimiter: ",",
};
const DATA_PAGE_SIZES = [25, 50, 100];
const MISSING_DATABASE_ERROR = {
  code: "ACTIVE_DATABASE_REQUIRED",
  message: "No active SQLite database selected.",
};

let routeLoadVersion = 0;

const state = {
  ready: false,
  route: { name: "landing", path: "/", params: {} },
  modal: null,
  toasts: [],
  connections: {
    recent: [],
    active: null,
    loading: false,
    backupLoading: false,
    error: null,
  },
  settings: {
    data: { ...DEFAULT_SETTINGS },
    loading: false,
    error: null,
    appVersion: null,
  },
  overview: {
    data: null,
    loading: false,
    error: null,
  },
  dataBrowser: {
    tables: [],
    selectedTable: null,
    table: null,
    loading: false,
    tableLoading: false,
    saving: false,
    deleting: false,
    page: 1,
    pageSize: 50,
    selectedRowIndex: null,
    exportLoading: false,
    error: null,
    saveError: null,
  },
  editor: {
    sqlText: "",
    history: [],
    historyLoading: false,
    historyError: null,
    activeTab: "messages",
    executing: false,
    result: null,
    error: null,
    exportLoading: false,
    selectedRowIndex: null,
    saving: false,
    deleting: false,
    saveError: null,
  },
  structure: {
    data: null,
    selectedName: null,
    detail: null,
    loading: false,
    detailLoading: false,
    error: null,
  },
};

function emitChange() {
  listeners.forEach((listener) => listener(getState()));
}

function clone(value) {
  return structuredClone(value);
}

function normalizeError(error) {
  if (!error) {
    return null;
  }

  return {
    code: error.code ?? "REQUEST_FAILED",
    message: error.message ?? "Request failed.",
    sqliteCode: error.sqliteCode ?? null,
    details: error.details ?? null,
    warnings: error.warnings ?? [],
  };
}

function requiresActiveDatabase(routeName) {
  return ["overview", "data", "editor", "editorResults", "structure"].includes(routeName);
}

function normalizeDataPageSize(value, fallback = 50) {
  const numericValue = Number(value);

  if (DATA_PAGE_SIZES.includes(numericValue)) {
    return numericValue;
  }

  return fallback;
}

function canEditQueryResult(snapshot = state) {
  return Boolean(snapshot.editor.result?.editing?.enabled) && !snapshot.connections.active?.readOnly;
}

function buildUpdatedEditorResultRow(existingRow, updatedSourceRow, editableColumns) {
  const nextRow = {
    ...existingRow,
    __identity: updatedSourceRow?.__identity ?? existingRow?.__identity ?? null,
  };

  editableColumns.forEach((column) => {
    if (column.sourceColumn === "rowid") {
      nextRow[column.resultName] =
        updatedSourceRow?.__identity?.values?.rowid ?? existingRow?.[column.resultName] ?? null;
      return;
    }

    nextRow[column.resultName] = updatedSourceRow?.[column.sourceColumn] ?? null;
  });

  return nextRow;
}

function getCurrentStructureEntry(snapshot = state) {
  const entries = snapshot.structure.data?.entries ?? [];
  return entries.find((entry) => entry.name === snapshot.structure.selectedName) ?? null;
}

function buildDeleteRowPreview(fields = []) {
  return fields
    .filter((field) => field && field.label)
    .slice(0, 8)
    .map((field) => {
      const fullValue = formatCellValue(field.value);

      return {
        label: String(field.label),
        value: truncateMiddle(fullValue, 96),
        fullValue,
      };
    });
}

function buildFallbackDeleteRowPreview(row) {
  return buildDeleteRowPreview(
    Object.entries(row ?? {})
      .filter(([key]) => key !== "__identity")
      .map(([key, value]) => ({
        label: key,
        value,
      }))
  );
}

function clearRouteSlices() {
  state.overview.error = null;
  state.dataBrowser.error = null;
  state.dataBrowser.saveError = null;
  state.structure.error = null;
}

function setMissingDatabaseState() {
  const error = { ...MISSING_DATABASE_ERROR };

  state.overview.loading = false;
  state.overview.data = null;
  state.overview.error = error;

  state.dataBrowser.loading = false;
  state.dataBrowser.tableLoading = false;
  state.dataBrowser.tables = [];
  state.dataBrowser.selectedTable = null;
  state.dataBrowser.table = null;
  state.dataBrowser.page = 1;
  state.dataBrowser.selectedRowIndex = null;
  state.dataBrowser.exportLoading = false;
  state.dataBrowser.error = error;
  state.dataBrowser.saveError = null;

  state.structure.loading = false;
  state.structure.detailLoading = false;
  state.structure.data = null;
  state.structure.detail = null;
  state.structure.error = error;
}

function syncRouteContext() {
  const { route } = state;

  if (route.name === "editorResults") {
    state.editor.activeTab = "results";
  } else if (route.name === "editor" && state.editor.activeTab === "results") {
    state.editor.activeTab = "messages";
  }

  if (route.name !== "editorResults") {
    state.editor.selectedRowIndex = null;
    state.editor.saveError = null;
  }

  if (
    route.name !== "data" ||
    (route.params?.tableName && route.params.tableName !== state.dataBrowser.selectedTable)
  ) {
    if (route.name !== "data" || route.params?.tableName !== state.dataBrowser.selectedTable) {
      state.dataBrowser.page = 1;
    }
    state.dataBrowser.selectedRowIndex = null;
    state.dataBrowser.saveError = null;
  }

  if (route.name !== "structure") {
    state.structure.detail = null;
    state.structure.selectedName = null;
  }
}

async function refreshConnectionsState() {
  state.connections.loading = true;
  state.connections.error = null;
  emitChange();

  try {
    const [recentResponse, activeResponse] = await Promise.all([
      api.getRecentConnections(),
      api.getActiveConnection(),
    ]);

    state.connections.recent = recentResponse.data ?? [];
    state.connections.active = activeResponse.data ?? null;
    state.connections.error = null;
  } catch (error) {
    state.connections.error = normalizeError(error);
  } finally {
    state.connections.loading = false;
    emitChange();
  }
}

async function refreshSettingsState() {
  state.settings.loading = true;
  state.settings.error = null;
  emitChange();

  try {
    const response = await api.getSettings();
    state.settings.data = {
      ...DEFAULT_SETTINGS,
      ...(response.data ?? {}),
    };
    state.settings.appVersion = response.metadata?.appVersion ?? null;
  } catch (error) {
    state.settings.error = normalizeError(error);
  } finally {
    state.settings.loading = false;
    emitChange();
  }
}

async function refreshSqlHistoryState() {
  state.editor.historyLoading = true;
  state.editor.historyError = null;
  emitChange();

  try {
    const response = await api.getSqlHistory();
    state.editor.history = response.data ?? [];
  } catch (error) {
    state.editor.historyError = normalizeError(error);
  } finally {
    state.editor.historyLoading = false;
    emitChange();
  }
}

async function loadOverview(version) {
  state.overview.loading = true;
  state.overview.error = null;
  emitChange();

  try {
    const response = await api.getOverview();

    if (version !== routeLoadVersion) {
      return;
    }

    state.overview.data = response.data;
    state.overview.error = null;
  } catch (error) {
    if (version !== routeLoadVersion) {
      return;
    }

    state.overview.data = null;
    state.overview.error = normalizeError(error);
  } finally {
    if (version === routeLoadVersion) {
      state.overview.loading = false;
      emitChange();
    }
  }
}

async function loadDataTable(version) {
  const tableName = state.dataBrowser.selectedTable;
  const pageSize = normalizeDataPageSize(state.dataBrowser.pageSize, 50);
  const page = Math.max(1, Number(state.dataBrowser.page) || 1);

  if (!tableName) {
    state.dataBrowser.table = null;
    state.dataBrowser.selectedRowIndex = null;
    return;
  }

  state.dataBrowser.tableLoading = true;
  state.dataBrowser.saveError = null;
  emitChange();

  try {
    const response = await api.getDataTable(tableName, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    if (version !== routeLoadVersion) {
      return;
    }

    state.dataBrowser.table = response.data ?? null;
    state.dataBrowser.pageSize = pageSize;
    state.dataBrowser.page = response.data?.page ?? page;
    state.dataBrowser.selectedRowIndex = null;
  } catch (error) {
    if (version !== routeLoadVersion) {
      return;
    }

    state.dataBrowser.table = null;
    state.dataBrowser.error = normalizeError(error);
  } finally {
    if (version === routeLoadVersion) {
      state.dataBrowser.tableLoading = false;
      emitChange();
    }
  }
}

async function loadData(version, route) {
  state.dataBrowser.loading = true;
  state.dataBrowser.error = null;
  emitChange();

  try {
    const response = await api.getDataTables();

    if (version !== routeLoadVersion) {
      return;
    }

    const tables = response.data?.tables ?? [];
    const requestedTableName = route.params?.tableName ?? null;

    state.dataBrowser.tables = tables;
    state.dataBrowser.error = null;

    if (requestedTableName && tables.some((table) => table.name === requestedTableName)) {
      if (requestedTableName !== state.dataBrowser.selectedTable) {
        state.dataBrowser.page = 1;
      }
      state.dataBrowser.selectedTable = requestedTableName;
    } else if (
      !state.dataBrowser.selectedTable ||
      !tables.some((table) => table.name === state.dataBrowser.selectedTable)
    ) {
      state.dataBrowser.selectedTable = tables[0]?.name ?? null;
      state.dataBrowser.page = 1;
    }

    if (!state.dataBrowser.selectedTable) {
      state.dataBrowser.table = null;
      state.dataBrowser.selectedRowIndex = null;
      return;
    }

    await loadDataTable(version);
  } catch (error) {
    if (version !== routeLoadVersion) {
      return;
    }

    state.dataBrowser.tables = [];
    state.dataBrowser.selectedTable = null;
    state.dataBrowser.table = null;
    state.dataBrowser.error = normalizeError(error);
  } finally {
    if (version === routeLoadVersion) {
      state.dataBrowser.loading = false;
      emitChange();
    }
  }
}

async function loadStructureDetail(version) {
  const entry = getCurrentStructureEntry(state);

  if (!entry) {
    state.structure.detail = null;
    return;
  }

  if (entry.type !== "table") {
    state.structure.detail = {
      name: entry.name,
      type: entry.type,
      tableName: entry.tableName,
      ddl: entry.sql,
      columns: [],
      foreignKeys: [],
      indexes: [],
      triggers: [],
      identityStrategy: null,
      notSafelyUpdatable: true,
    };
    emitChange();
    return;
  }

  state.structure.detailLoading = true;
  emitChange();

  try {
    const response = await api.getStructureDetail(entry.name);

    if (version !== routeLoadVersion) {
      return;
    }

    state.structure.detail = response.data;
  } catch (error) {
    if (version !== routeLoadVersion) {
      return;
    }

    state.structure.error = normalizeError(error);
    state.structure.detail = null;
  } finally {
    if (version === routeLoadVersion) {
      state.structure.detailLoading = false;
      emitChange();
    }
  }
}

async function loadStructure(version) {
  state.structure.loading = true;
  state.structure.error = null;
  emitChange();

  try {
    const response = await api.getStructureOverview();

    if (version !== routeLoadVersion) {
      return;
    }

    state.structure.data = response.data;
    state.structure.selectedName =
      state.structure.selectedName ??
      response.data.grouped.tables[0]?.name ??
      response.data.entries[0]?.name ??
      null;

    await loadStructureDetail(version);
  } catch (error) {
    if (version !== routeLoadVersion) {
      return;
    }

    state.structure.data = null;
    state.structure.detail = null;
    state.structure.error = normalizeError(error);
  } finally {
    if (version === routeLoadVersion) {
      state.structure.loading = false;
      emitChange();
    }
  }
}

function invalidateDatabaseCaches() {
  state.overview.data = null;
  state.dataBrowser.tables = [];
  state.dataBrowser.selectedTable = null;
  state.dataBrowser.table = null;
  state.dataBrowser.page = 1;
  state.dataBrowser.selectedRowIndex = null;
  state.dataBrowser.exportLoading = false;
  state.dataBrowser.error = null;
  state.dataBrowser.saveError = null;
  state.structure.data = null;
  state.structure.detail = null;
}

async function loadRouteData(route) {
  clearRouteSlices();

  if (requiresActiveDatabase(route.name) && !state.connections.active) {
    setMissingDatabaseState();
    emitChange();
    return;
  }

  const version = ++routeLoadVersion;

  if (route.name === "landing" || route.name === "connections") {
    await refreshConnectionsState();
    return;
  }

  switch (route.name) {
    case "overview":
      await loadOverview(version);
      return;
    case "data":
      await loadData(version, route);
      return;
    case "editor":
    case "editorResults":
      await refreshSqlHistoryState();
      return;
    case "structure":
      await loadStructure(version);
      return;
    case "settings":
      await refreshSettingsState();
      return;
    default:
  }
}

function pushToast(message, tone = "muted") {
  const id = crypto.randomUUID();
  state.toasts.push({ id, message, tone });
  emitChange();

  window.setTimeout(() => {
    dismissToast(id);
  }, 3600);
}

function withModalError(error) {
  if (!state.modal) {
    return;
  }

  state.modal.error = normalizeError(error);
  state.modal.submitting = false;
  emitChange();
}

function startModalSubmission() {
  if (!state.modal) {
    return;
  }

  state.modal.submitting = true;
  state.modal.error = null;
  emitChange();
}

function closeModalInternal() {
  state.modal = null;
  emitChange();
}

export function getState() {
  return clone(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function initializeApp() {
  state.ready = false;
  emitChange();

  await Promise.all([
    refreshConnectionsState(),
    refreshSettingsState(),
    refreshSqlHistoryState(),
  ]);

  state.ready = true;
  emitChange();

  await loadRouteData(state.route);
}

export async function setRoute(route) {
  state.route = route;
  syncRouteContext();
  emitChange();
  await loadRouteData(route);
}

export function openModal(kind) {
  state.modal = {
    kind,
    error: null,
    submitting: false,
  };
  emitChange();
}

export function openEditConnectionModal(id) {
  const connection = state.connections.recent.find((entry) => entry.id === id);

  if (!connection) {
    pushToast("Connection could not be loaded for editing.", "alert");
    return;
  }

  state.modal = {
    kind: "edit-connection",
    connectionId: connection.id,
    connection,
    error: null,
    submitting: false,
  };
  emitChange();
}

export function openDeleteDataRowModal(rowIndex) {
  const numericIndex = Number(rowIndex);
  const tableName = state.dataBrowser.selectedTable;
  const row = state.dataBrowser.table?.rows?.[numericIndex];
  const rowPreview = buildDeleteRowPreview(
    (state.dataBrowser.table?.columnMeta ?? [])
      .filter((column) => column.visible)
      .map((column) => ({
        label: column.name,
        value: row[column.name],
      }))
  );

  if (!tableName || !row?.__identity) {
    pushToast("The selected row could not be loaded.", "alert");
    return;
  }

  state.modal = {
    kind: "delete-row",
    target: "data",
    rowIndex: numericIndex,
    tableName,
    rowLabel: `row ${numericIndex + 1}`,
    rowPreview: rowPreview.length ? rowPreview : buildFallbackDeleteRowPreview(row),
    error: null,
    submitting: false,
  };
  emitChange();
}

export function openDeleteEditorRowModal(rowIndex) {
  const numericIndex = Number(rowIndex);
  const tableName = state.editor.result?.editing?.tableName ?? null;
  const row = state.editor.result?.rows?.[numericIndex];
  const columns = state.editor.result?.editing?.columns ?? [];
  const rowPreview = buildDeleteRowPreview(
    columns
      .filter((column) => column.visible !== false)
      .map((column) => ({
        label: column.sourceColumn || column.resultName,
        value: row[column.resultName],
      }))
  );

  if (!tableName || !row?.__identity || !canEditQueryResult()) {
    pushToast("The selected query result row could not be loaded.", "alert");
    return;
  }

  state.modal = {
    kind: "delete-row",
    target: "editor",
    rowIndex: numericIndex,
    tableName,
    rowLabel: `query row ${numericIndex + 1}`,
    rowPreview: rowPreview.length ? rowPreview : buildFallbackDeleteRowPreview(row),
    error: null,
    submitting: false,
  };
  emitChange();
}

export function closeModal() {
  closeModalInternal();
}

export function dismissToast(id) {
  const nextToasts = state.toasts.filter((toast) => toast.id !== id);

  if (nextToasts.length === state.toasts.length) {
    return;
  }

  state.toasts = nextToasts;
  emitChange();
}

export async function submitOpenConnection(payload) {
  startModalSubmission();

  try {
    const response = await api.openConnection(payload);
    closeModalInternal();
    pushToast(response.message || "Database connected.", "success");
    await refreshConnectionsState();
    invalidateDatabaseCaches();
    return response.data;
  } catch (error) {
    withModalError(error);
    return null;
  }
}

export async function submitCreateConnection(payload) {
  startModalSubmission();

  try {
    const response = await api.createConnection(payload);
    closeModalInternal();
    pushToast(response.message || "Database created.", "success");
    await refreshConnectionsState();
    invalidateDatabaseCaches();
    return response.data;
  } catch (error) {
    withModalError(error);
    return null;
  }
}

export async function submitImportSql(payload) {
  startModalSubmission();

  try {
    const response = await api.importSql(payload);
    closeModalInternal();
    pushToast(response.message || "SQL dump imported.", "success");
    await refreshConnectionsState();
    invalidateDatabaseCaches();
    return response.data;
  } catch (error) {
    withModalError(error);
    return null;
  }
}

export async function submitEditConnection(id, payload) {
  startModalSubmission();

  const wasActive = state.connections.active?.id === id;

  try {
    const response = await api.updateRecentConnection(id, payload);
    closeModalInternal();
    pushToast(response.message || "Connection updated.", "success");
    await refreshConnectionsState();
    invalidateDatabaseCaches();

    if (wasActive && state.route.name !== "connections") {
      await loadRouteData(state.route);
    }

    return response.data;
  } catch (error) {
    withModalError(error);
    return null;
  }
}

export async function selectConnection(id) {
  state.connections.loading = true;
  emitChange();

  try {
    const response = await api.selectActiveConnection(id);
    await refreshConnectionsState();
    invalidateDatabaseCaches();
    pushToast(response.message || "Active database updated.", "success");
    return response.data;
  } catch (error) {
    state.connections.error = normalizeError(error);
    emitChange();
    return null;
  } finally {
    state.connections.loading = false;
    emitChange();
  }
}

export async function removeConnection(id) {
  state.connections.loading = true;
  emitChange();

  try {
    const response = await api.removeRecentConnection(id);
    await refreshConnectionsState();
    invalidateDatabaseCaches();
    pushToast(response.message || "Recent connection removed.", "muted");
    return response.data;
  } catch (error) {
    state.connections.error = normalizeError(error);
    emitChange();
    return null;
  } finally {
    state.connections.loading = false;
    emitChange();
  }
}

export async function createActiveConnectionBackup() {
  if (!state.connections.active) {
    pushToast("No active SQLite database selected for backup.", "alert");
    return null;
  }

  state.connections.backupLoading = true;
  emitChange();

  try {
    const response = await api.createActiveConnectionBackup();
    await refreshConnectionsState();
    pushToast(response.message || "Backup created.", "success");
    return response.data;
  } catch (error) {
    pushToast(
      normalizeError(error)?.message || "Backup could not be created.",
      "alert"
    );
    return null;
  } finally {
    state.connections.backupLoading = false;
    emitChange();
  }
}

export function setCurrentQuery(query) {
  const nextQuery = String(query ?? "");
  const previousLineCount = Math.max(1, String(state.editor.sqlText || "").split("\n").length);
  const nextLineCount = Math.max(1, nextQuery.split("\n").length);

  state.editor.sqlText = nextQuery;

  if (previousLineCount !== nextLineCount) {
    emitChange();
  }
}

export function clearCurrentQuery() {
  state.editor.sqlText = "";
  state.editor.error = null;
  emitChange();
}

export function clearEditorResults() {
  state.editor.result = null;
  state.editor.error = null;
  state.editor.selectedRowIndex = null;
  state.editor.saving = false;
  state.editor.saveError = null;
  if (state.editor.activeTab === "results") {
    state.editor.activeTab = "messages";
  }
  emitChange();
}

export function setEditorTab(tab) {
  state.editor.activeTab = tab;
  emitChange();
}

export async function executeCurrentQuery() {
  state.editor.executing = true;
  state.editor.error = null;
  state.editor.selectedRowIndex = null;
  state.editor.saving = false;
  state.editor.saveError = null;
  emitChange();

  try {
    const response = await api.executeSql(state.editor.sqlText);
    state.editor.result = response.data;
    state.editor.error = null;
    state.editor.activeTab = "results";
    invalidateDatabaseCaches();
    await refreshSqlHistoryState();
    pushToast(
      response.message || `Executed ${response.data.statementCount} SQL statement(s).`,
      "success"
    );
    return true;
  } catch (error) {
    state.editor.error = normalizeError(error);
    state.editor.activeTab = "messages";
    emitChange();
    return false;
  } finally {
    state.editor.executing = false;
    emitChange();
  }
}

export async function clearSqlHistoryStateAndData() {
  state.editor.historyLoading = true;
  emitChange();

  try {
    const response = await api.clearSqlHistory();
    state.editor.history = response.data ?? [];
    pushToast(response.message || "SQL history cleared.", "muted");
    return true;
  } catch (error) {
    state.editor.historyError = normalizeError(error);
    emitChange();
    return false;
  } finally {
    state.editor.historyLoading = false;
    emitChange();
  }
}

export function loadQueryFromHistory(id) {
  const historyEntry = state.editor.history.find((entry) => entry.id === id);

  if (!historyEntry) {
    return;
  }

  state.editor.sqlText = historyEntry.sql;
  emitChange();
}

export async function selectStructureEntry(name) {
  state.structure.selectedName = name;
  emitChange();
  await loadStructureDetail(++routeLoadVersion);
}

export function selectDataRow(index) {
  const numericIndex = Number(index);

  if (!Number.isInteger(numericIndex) || numericIndex < 0) {
    return;
  }

  state.dataBrowser.selectedRowIndex = numericIndex;
  state.dataBrowser.saveError = null;
  emitChange();
}

export function selectEditorRow(index) {
  const numericIndex = Number(index);

  if (!Number.isInteger(numericIndex) || numericIndex < 0 || !canEditQueryResult()) {
    return;
  }

  state.editor.selectedRowIndex = numericIndex;
  state.editor.saveError = null;
  emitChange();
}

export function clearEditorRowSelection() {
  if (state.editor.selectedRowIndex === null) {
    return;
  }

  state.editor.selectedRowIndex = null;
  state.editor.saveError = null;
  emitChange();
}

export function clearDataRowSelection() {
  if (state.dataBrowser.selectedRowIndex === null) {
    return;
  }

  state.dataBrowser.selectedRowIndex = null;
  state.dataBrowser.saveError = null;
  emitChange();
}

export async function setDataPage(page) {
  const numericPage = Number(page);

  if (!Number.isInteger(numericPage) || numericPage < 1) {
    return;
  }

  if (numericPage === state.dataBrowser.page) {
    return;
  }

  state.dataBrowser.page = numericPage;
  state.dataBrowser.selectedRowIndex = null;
  state.dataBrowser.saveError = null;
  emitChange();

  if (state.route.name === "data" && state.dataBrowser.selectedTable) {
    await loadDataTable(++routeLoadVersion);
  }
}

export async function setDataPageSize(pageSize) {
  const normalizedPageSize = normalizeDataPageSize(pageSize, state.dataBrowser.pageSize);

  if (normalizedPageSize === state.dataBrowser.pageSize) {
    return;
  }

  state.dataBrowser.pageSize = normalizedPageSize;
  state.dataBrowser.page = 1;
  state.dataBrowser.selectedRowIndex = null;
  state.dataBrowser.saveError = null;
  emitChange();

  if (state.route.name === "data" && state.dataBrowser.selectedTable) {
    await loadDataTable(++routeLoadVersion);
  }
}

export async function submitDataRowUpdate(rowIndex, values) {
  const numericIndex = Number(rowIndex);
  const tableName = state.dataBrowser.selectedTable;
  const row = state.dataBrowser.table?.rows?.[numericIndex];

  if (!tableName || !row) {
    pushToast("The selected row could not be loaded.", "alert");
    return null;
  }

  state.dataBrowser.saving = true;
  state.dataBrowser.saveError = null;
  emitChange();

  try {
    const response = await api.updateDataTableRow(tableName, {
      identity: row.__identity,
      values,
    });

    pushToast(response.message || "Table row updated.", "success");
    await loadDataTable(++routeLoadVersion);
    state.dataBrowser.selectedRowIndex = null;
    return response.data;
  } catch (error) {
    state.dataBrowser.saveError = normalizeError(error);
    emitChange();
    return null;
  } finally {
    state.dataBrowser.saving = false;
    emitChange();
  }
}

export async function submitDataRowDelete(rowIndex, options = {}) {
  const numericIndex = Number(rowIndex);
  const tableName = state.dataBrowser.selectedTable;
  const row = state.dataBrowser.table?.rows?.[numericIndex];
  const reportErrorToModal = Boolean(options.reportErrorToModal);

  if (!tableName || !row?.__identity) {
    pushToast("The selected row could not be loaded.", "alert");
    return null;
  }

  const shouldStepBackPage =
    (state.dataBrowser.table?.rows?.length ?? 0) <= 1 && state.dataBrowser.page > 1;

  state.dataBrowser.deleting = true;
  state.dataBrowser.saveError = null;
  emitChange();

  try {
    const response = await api.deleteDataTableRow(tableName, {
      identity: row.__identity,
    });

    if (shouldStepBackPage) {
      state.dataBrowser.page -= 1;
    }

    pushToast(response.message || "Table row deleted.", "success");
    await loadDataTable(++routeLoadVersion);
    state.dataBrowser.selectedRowIndex = null;
    return response.data;
  } catch (error) {
    if (reportErrorToModal) {
      withModalError(error);
    } else {
      state.dataBrowser.saveError = normalizeError(error);
      emitChange();
    }
    return null;
  } finally {
    state.dataBrowser.deleting = false;
    emitChange();
  }
}

export async function submitEditorRowUpdate(rowIndex, values) {
  const numericIndex = Number(rowIndex);
  const result = state.editor.result;
  const row = result?.rows?.[numericIndex];
  const tableName = result?.editing?.tableName ?? null;

  if (!tableName || !row || !canEditQueryResult()) {
    pushToast("The selected query result row could not be loaded.", "alert");
    return null;
  }

  state.editor.saving = true;
  state.editor.saveError = null;
  emitChange();

  try {
    const response = await api.updateDataTableRow(tableName, {
      identity: row.__identity,
      values,
    });
    const editableColumns = result.editing?.columns ?? [];
    const nextRows = [...(result.rows ?? [])];

    nextRows[numericIndex] = buildUpdatedEditorResultRow(
      row,
      response.data?.row ?? null,
      editableColumns
    );
    state.editor.result = {
      ...result,
      rows: nextRows,
    };
    state.editor.selectedRowIndex = null;
    invalidateDatabaseCaches();
    pushToast(response.message || "Query result row updated.", "success");
    emitChange();
    return response.data;
  } catch (error) {
    state.editor.saveError = normalizeError(error);
    emitChange();
    return null;
  } finally {
    state.editor.saving = false;
    emitChange();
  }
}

export async function submitEditorRowDelete(rowIndex, options = {}) {
  const numericIndex = Number(rowIndex);
  const result = state.editor.result;
  const row = result?.rows?.[numericIndex];
  const tableName = result?.editing?.tableName ?? null;
  const reportErrorToModal = Boolean(options.reportErrorToModal);

  if (!tableName || !row?.__identity || !canEditQueryResult()) {
    pushToast("The selected query result row could not be loaded.", "alert");
    return null;
  }

  state.editor.deleting = true;
  state.editor.saveError = null;
  emitChange();

  try {
    const response = await api.deleteDataTableRow(tableName, {
      identity: row.__identity,
    });
    const nextRows = [...(result.rows ?? [])];

    nextRows.splice(numericIndex, 1);
    state.editor.result = {
      ...result,
      rows: nextRows,
    };
    state.editor.selectedRowIndex = null;
    invalidateDatabaseCaches();
    pushToast(response.message || "Query result row deleted.", "success");
    emitChange();
    return response.data;
  } catch (error) {
    if (reportErrorToModal) {
      withModalError(error);
    } else {
      state.editor.saveError = normalizeError(error);
      emitChange();
    }
    return null;
  } finally {
    state.editor.deleting = false;
    emitChange();
  }
}

export async function submitDeleteRowConfirmation() {
  const modal = state.modal;

  if (modal?.kind !== "delete-row") {
    return null;
  }

  startModalSubmission();

  const result =
    modal.target === "editor"
      ? await submitEditorRowDelete(modal.rowIndex, { reportErrorToModal: true })
      : await submitDataRowDelete(modal.rowIndex, { reportErrorToModal: true });

  if (result) {
    closeModalInternal();
  }

  return result;
}

export async function exportCurrentQueryCsv() {
  state.editor.exportLoading = true;
  emitChange();

  try {
    await api.downloadQueryCsv(state.editor.sqlText);
    pushToast("Query export started.", "success");
    return true;
  } catch (error) {
    state.editor.error = normalizeError(error);
    emitChange();
    return false;
  } finally {
    state.editor.exportLoading = false;
    emitChange();
  }
}

export async function exportCurrentDataTableCsv() {
  const tableName = state.dataBrowser.selectedTable;

  if (!tableName) {
    pushToast("No table selected for export.", "alert");
    return false;
  }

  state.dataBrowser.exportLoading = true;
  emitChange();

  try {
    await api.downloadTableCsv(tableName);
    pushToast(`CSV export started for ${tableName}.`, "success");
    return true;
  } catch (error) {
    state.dataBrowser.error = normalizeError(error);
    emitChange();
    return false;
  } finally {
    state.dataBrowser.exportLoading = false;
    emitChange();
  }
}

export async function refreshCurrentRoute() {
  await loadRouteData(state.route);
}

export function getCurrentConnection(snapshot = state) {
  return snapshot.connections.active;
}

export function getQueryMessages(snapshot = state) {
  if (snapshot.editor.error) {
    return [
      {
        tone: "alert",
        label: snapshot.editor.error.code,
        value: snapshot.editor.error.message,
      },
    ];
  }

  if (!snapshot.editor.result) {
    return [
      {
        tone: "muted",
        label: "IDLE",
        value: "No SQL statements have been executed yet.",
      },
    ];
  }

  return snapshot.editor.result.statements.map((statement) => ({
    tone: statement.kind === "resultSet" ? "success" : inferStatusTone(statement.keyword),
    label: `${statement.keyword} #${statement.index + 1}`,
    value:
      statement.kind === "resultSet"
        ? `${statement.rowCount} row(s) returned.`
        : `${statement.changes} row(s) affected.`,
  }));
}

export function getQueryPerformance(snapshot = state) {
  const result = snapshot.editor.result;

  if (!result) {
    return {
      timingMs: null,
      statementCount: 0,
      rowCount: 0,
      affectedRowCount: 0,
    };
  }

  return {
    timingMs: result.timingMs ?? 0,
    statementCount: result.statementCount ?? result.statements?.length ?? 0,
    rowCount: result.rows?.length ?? 0,
    affectedRowCount: result.affectedRowCount ?? 0,
  };
}

export function getCurrentStructureEntryDetail(snapshot = state) {
  const entry = getCurrentStructureEntry(snapshot);
  return entry ? snapshot.structure.detail : null;
}
