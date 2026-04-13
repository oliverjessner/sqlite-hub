import * as api from "./api.js";
import { formatCellValue, inferStatusTone, truncateMiddle } from "./utils/format.js";
import {
  addTableDesignerColumn,
  createTableDesignerDraftFromCsvImport,
  createNewTableDesignerDraft,
  hydrateTableDesignerDraft,
  removeTableDesignerColumn,
  updateTableDesignerColumnField,
  updateTableDesignerDraftField,
} from "./utils/tableDesigner.js";
import {
  analyzeQueryChartResult,
  buildDefaultQueryChartName,
  buildQueryChartResultColumns,
  buildSuggestedChartConfig,
  resolveUniqueQueryChartName,
  suggestQueryChartType,
  validateQueryChartConfig,
} from "./lib/queryCharts.js";

const listeners = new Set();
const DEFAULT_SETTINGS = {
  defaultPageSize: 50,
  maxPageSize: 200,
  csvDelimiter: ",",
};
const DATA_PAGE_SIZES = [25, 50, 100];
const QUERY_HISTORY_PAGE_SIZE = 30;
const QUERY_HISTORY_RUN_LIMIT = 8;
const CHART_HEIGHT_PRESETS = new Set(["small", "medium", "large"]);
const MISSING_DATABASE_ERROR = {
  code: "ACTIVE_DATABASE_REQUIRED",
  message: "No active SQLite database selected.",
};

let routeLoadVersion = 0;
let queryHistoryLoadVersion = 0;
let queryHistoryDetailLoadVersion = 0;
let queryHistorySearchTimer = null;
let chartsLoadVersion = 0;
let chartsDetailLoadVersion = 0;

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
    tablesVisible: true,
    table: null,
    loading: false,
    tableLoading: false,
    saving: false,
    deleting: false,
    page: 1,
    pageSize: 50,
    sortColumn: null,
    sortDirection: null,
    searchQuery: "",
    searchColumn: "",
    selectedRowIndex: null,
    exportLoading: false,
    error: null,
    saveError: null,
  },
  editor: {
    sqlText: "",
    editorPanelVisible: true,
    history: [],
    historyPanelVisible: true,
    historyLoading: false,
    historyLoadingMore: false,
    historyError: null,
    historyTab: "recent",
    historySearchInput: "",
    historySearch: "",
    historyPageSize: QUERY_HISTORY_PAGE_SIZE,
    historyTotal: 0,
    historyHasMore: false,
    historyActiveId: null,
    historySelectedId: null,
    historyDetail: null,
    historyRuns: [],
    historyDetailLoading: false,
    historyDetailError: null,
    activeTab: "messages",
    executing: false,
    result: null,
    resultSortColumn: null,
    resultSortDirection: null,
    error: null,
    exportLoading: false,
    selectedRowIndex: null,
    saving: false,
    deleting: false,
    saveError: null,
  },
  charts: {
    queries: [],
    loading: false,
    error: null,
    selectedHistoryId: null,
    chartHeightPreset: "medium",
    sqlExpanded: false,
    resultsVisible: true,
    detail: null,
    detailLoading: false,
    detailError: null,
    result: null,
    resultLoading: false,
    resultError: null,
  },
  tableDesigner: {
    tables: [],
    selectedTableName: null,
    draft: null,
    pendingImportedDraft: null,
    loading: false,
    detailLoading: false,
    saving: false,
    searchQuery: "",
    supportedTypes: [],
    error: null,
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

function setActiveQueryHistoryItem(historyId) {
  const normalizedId = Number(historyId);

  if (!Number.isInteger(normalizedId) || normalizedId < 1) {
    return null;
  }

  state.editor.historyActiveId = normalizedId;
  return normalizedId;
}

function clearQueryHistoryDetailState() {
  queryHistoryDetailLoadVersion += 1;
  state.editor.historySelectedId = null;
  state.editor.historyDetail = null;
  state.editor.historyRuns = [];
  state.editor.historyDetailLoading = false;
  state.editor.historyDetailError = null;
}

function requiresActiveDatabase(routeName) {
  return [
    "overview",
    "data",
    "editor",
    "editorResults",
    "charts",
    "structure",
    "tableDesigner",
  ].includes(routeName);
}

function normalizeDataPageSize(value, fallback = 50) {
  const numericValue = Number(value);

  if (DATA_PAGE_SIZES.includes(numericValue)) {
    return numericValue;
  }

  return fallback;
}

function normalizeSortDirection(value) {
  return String(value ?? "").trim().toLowerCase() === "desc" ? "desc" : "asc";
}

function getNextSortDirection(currentColumn, currentDirection, nextColumn) {
  if (currentColumn === nextColumn) {
    return normalizeSortDirection(currentDirection) === "asc" ? "desc" : "asc";
  }

  return "asc";
}

function canEditQueryResult(snapshot = state) {
  return Boolean(snapshot.editor.result?.editing?.enabled) && !snapshot.connections.active?.readOnly;
}

function resetDataBrowserSearch() {
  state.dataBrowser.searchQuery = "";
  state.dataBrowser.searchColumn = "";
}

function resetDataBrowserSort() {
  state.dataBrowser.sortColumn = null;
  state.dataBrowser.sortDirection = null;
}

function resetEditorResultSort() {
  state.editor.resultSortColumn = null;
  state.editor.resultSortDirection = null;
}

function getSortableEditorValue(value) {
  if (value === null || value === undefined) {
    return { rank: 0, value: "" };
  }

  if (typeof value === "number") {
    return { rank: 1, value };
  }

  if (typeof value === "boolean") {
    return { rank: 2, value: value ? 1 : 0 };
  }

  if (typeof value === "string") {
    return { rank: 3, value };
  }

  if (value && typeof value === "object" && value.__type === "blob") {
    return {
      rank: 4,
      value: `${value.sizeBytes ?? 0}:${value.hexPreview ?? ""}`,
    };
  }

  return { rank: 5, value: JSON.stringify(value) };
}

function compareEditorValues(left, right) {
  const leftValue = getSortableEditorValue(left);
  const rightValue = getSortableEditorValue(right);

  if (leftValue.rank !== rightValue.rank) {
    return leftValue.rank - rightValue.rank;
  }

  if (typeof leftValue.value === "number" && typeof rightValue.value === "number") {
    return leftValue.value - rightValue.value;
  }

  return String(leftValue.value).localeCompare(String(rightValue.value), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortEditorResultRows(rows, sortColumn, sortDirection) {
  if (!sortColumn) {
    return [...(rows ?? [])];
  }

  const directionMultiplier = normalizeSortDirection(sortDirection) === "desc" ? -1 : 1;

  return [...(rows ?? [])].sort(
    (left, right) => compareEditorValues(left?.[sortColumn], right?.[sortColumn]) * directionMultiplier
  );
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

function getTableDesignerContext(snapshot = state) {
  return {
    catalogTables: snapshot.tableDesigner.tables ?? [],
    supportedTypes: snapshot.tableDesigner.supportedTypes ?? [],
    readOnly: Boolean(snapshot.connections.active?.readOnly),
  };
}

function decorateTableDesignerDraft(draft, snapshot = state) {
  if (!draft) {
    return null;
  }

  return hydrateTableDesignerDraft(draft, getTableDesignerContext(snapshot));
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

function normalizeQueryHistoryTab(value) {
  return ["recent", "saved", "failed"].includes(value) ? value : "recent";
}

function findQueryHistoryItem(historyId, snapshot = state) {
  return snapshot.editor.history.find((entry) => String(entry.id) === String(historyId)) ?? null;
}

function clearQueryHistorySearchTimer() {
  if (!queryHistorySearchTimer) {
    return;
  }

  window.clearTimeout(queryHistorySearchTimer);
  queryHistorySearchTimer = null;
}

function resetQueryHistoryState({ preserveSearch = true } = {}) {
  state.editor.history = [];
  state.editor.historyLoading = false;
  state.editor.historyLoadingMore = false;
  state.editor.historyError = null;
  state.editor.historyTotal = 0;
  state.editor.historyHasMore = false;
  state.editor.historyActiveId = null;
  clearQueryHistoryDetailState();

  if (!preserveSearch) {
    clearQueryHistorySearchTimer();
    state.editor.historySearchInput = "";
    state.editor.historySearch = "";
  }
}

function resetChartsState() {
  chartsLoadVersion += 1;
  chartsDetailLoadVersion += 1;
  state.charts.queries = [];
  state.charts.loading = false;
  state.charts.error = null;
  state.charts.selectedHistoryId = null;
  state.charts.chartHeightPreset = "medium";
  state.charts.sqlExpanded = false;
  state.charts.resultsVisible = true;
  state.charts.detail = null;
  state.charts.detailLoading = false;
  state.charts.detailError = null;
  state.charts.result = null;
  state.charts.resultLoading = false;
  state.charts.resultError = null;
}

function normalizeChartsHeightPreset(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase();

  return CHART_HEIGHT_PRESETS.has(normalizedValue) ? normalizedValue : "medium";
}

function mergeQueryHistoryItemWithChartSummary(updatedItem, fallbackItem = null) {
  if (!updatedItem) {
    return updatedItem;
  }

  return {
    ...(fallbackItem ?? {}),
    ...updatedItem,
    chartCount:
      updatedItem.chartCount !== undefined
        ? Number(updatedItem.chartCount ?? 0)
        : Number(fallbackItem?.chartCount ?? 0),
    chartTypes: Array.isArray(updatedItem.chartTypes)
      ? [...updatedItem.chartTypes]
      : Array.isArray(fallbackItem?.chartTypes)
        ? [...fallbackItem.chartTypes]
        : [],
  };
}

function syncQueryHistoryItem(updatedItem) {
  if (!updatedItem) {
    return;
  }

  state.editor.history = state.editor.history.map((entry) =>
    entry.id === updatedItem.id ? updatedItem : entry
  );

  if (state.editor.historyDetail?.id === updatedItem.id) {
    state.editor.historyDetail = updatedItem;
  }

  const existingChartsEntry =
    state.charts.queries.find((entry) => entry.id === updatedItem.id) ??
    (state.charts.detail?.item?.id === updatedItem.id ? state.charts.detail.item : null);
  const mergedChartsItem = mergeQueryHistoryItemWithChartSummary(updatedItem, existingChartsEntry);

  state.charts.queries = state.charts.queries.map((entry) =>
    entry.id === updatedItem.id ? mergedChartsItem : entry
  );

  if (state.charts.detail?.item?.id === updatedItem.id) {
    state.charts.detail = {
      ...state.charts.detail,
      item: mergeQueryHistoryItemWithChartSummary(updatedItem, state.charts.detail.item),
    };
  }
}

function syncChartsQuerySummaryForHistory(historyId) {
  const numericId = Number(historyId);

  if (!Number.isInteger(numericId) || numericId < 1 || state.charts.detail?.item?.id !== numericId) {
    return;
  }

  const charts = state.charts.detail?.charts ?? [];
  const chartTypes = [...new Set(
    charts
      .map((chart) =>
        String(chart?.chartType ?? "")
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  )];
  const chartCount = charts.length;

  state.charts.queries = state.charts.queries.map((entry) =>
    entry.id === numericId
      ? {
          ...entry,
          chartCount,
          chartTypes,
        }
      : entry
  );

  state.charts.detail = {
    ...state.charts.detail,
    item: {
      ...state.charts.detail.item,
      chartCount,
      chartTypes,
    },
  };
}

function resolveQueryHistorySql(historyId) {
  const historyIdAsString = String(historyId);

  if (String(state.editor.historyDetail?.id ?? "") === historyIdAsString) {
    return state.editor.historyDetail.rawSql;
  }

  if (String(state.charts.detail?.item?.id ?? "") === historyIdAsString) {
    return state.charts.detail.item.rawSql;
  }

  return findQueryHistoryItem(historyId)?.rawSql ?? null;
}

function clearRouteSlices() {
  state.overview.error = null;
  state.dataBrowser.error = null;
  state.dataBrowser.saveError = null;
  state.charts.error = null;
  state.charts.detailError = null;
  state.charts.resultError = null;
  state.tableDesigner.error = null;
  state.tableDesigner.saveError = null;
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
  resetDataBrowserSort();
  resetDataBrowserSearch();
  state.dataBrowser.selectedRowIndex = null;
  state.dataBrowser.exportLoading = false;
  state.dataBrowser.error = error;
  state.dataBrowser.saveError = null;

  state.structure.loading = false;
  state.structure.detailLoading = false;
  state.structure.data = null;
  state.structure.detail = null;
  state.structure.error = error;

  state.tableDesigner.loading = false;
  state.tableDesigner.detailLoading = false;
  state.tableDesigner.tables = [];
  state.tableDesigner.selectedTableName = null;
  state.tableDesigner.draft = null;
  state.tableDesigner.pendingImportedDraft = null;
  state.tableDesigner.saving = false;
  state.tableDesigner.searchQuery = "";
  state.tableDesigner.supportedTypes = [];
  state.tableDesigner.error = error;
  state.tableDesigner.saveError = null;

  resetChartsState();
  state.charts.error = error;

  resetQueryHistoryState({ preserveSearch: false });
}

function syncRouteContext() {
  const { route } = state;

  if (route.name === "editorResults") {
    state.editor.activeTab = "results";
    clearQueryHistoryDetailState();
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
    if (route.params?.tableName !== state.dataBrowser.selectedTable) {
      resetDataBrowserSearch();
    }
    state.dataBrowser.selectedRowIndex = null;
    state.dataBrowser.saveError = null;
  }

  if (route.name !== "structure") {
    state.structure.detail = null;
    state.structure.selectedName = null;
  }

  if (route.name !== "tableDesigner") {
    state.tableDesigner.saveError = null;
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

async function loadQueryHistoryDetail(historyId) {
  const normalizedId = String(historyId ?? "").trim();
  const numericId = Number(normalizedId);
  const requestVersion = ++queryHistoryDetailLoadVersion;

  if (!normalizedId) {
    clearQueryHistoryDetailState();
    emitChange();
    return;
  }

  state.editor.historyDetailLoading = true;
  state.editor.historyDetailError = null;
  emitChange();

  try {
    const [detailResponse, runsResponse] = await Promise.all([
      api.getQueryHistoryItem(normalizedId),
      api.getQueryHistoryRuns(normalizedId, { limit: QUERY_HISTORY_RUN_LIMIT }),
    ]);

    if (
      requestVersion !== queryHistoryDetailLoadVersion ||
      state.editor.historySelectedId !== numericId
    ) {
      return;
    }

    state.editor.historyDetail = detailResponse.data ?? null;
    state.editor.historyRuns = runsResponse.data ?? [];
    state.editor.historyDetailError = null;
    if (detailResponse.data) {
      syncQueryHistoryItem(detailResponse.data);
    }
  } catch (error) {
    if (
      requestVersion !== queryHistoryDetailLoadVersion ||
      state.editor.historySelectedId !== numericId
    ) {
      return;
    }

    state.editor.historyDetail = null;
    state.editor.historyRuns = [];
    state.editor.historyDetailError = normalizeError(error);
  } finally {
    if (requestVersion === queryHistoryDetailLoadVersion) {
      state.editor.historyDetailLoading = false;
      emitChange();
    }
  }
}

async function refreshQueryHistoryState({ append = false } = {}) {
  if (!state.connections.active) {
    resetQueryHistoryState({ preserveSearch: false });
    emitChange();
    return;
  }

  const requestVersion = ++queryHistoryLoadVersion;
  const nextOffset = append ? state.editor.history.length : 0;

  if (append) {
    state.editor.historyLoadingMore = true;
  } else {
    state.editor.historyLoading = true;
    state.editor.historyError = null;
  }
  emitChange();

  try {
    const response = await api.getQueryHistory({
      tab: state.editor.historyTab,
      limit: state.editor.historyPageSize,
      offset: nextOffset,
      search: state.editor.historySearch,
    });

    if (requestVersion !== queryHistoryLoadVersion) {
      return;
    }

    const payload = response.data ?? {};
    const items = payload.items ?? [];
    state.editor.history = append ? [...state.editor.history, ...items] : items;
    state.editor.historyTotal = payload.total ?? state.editor.history.length;
    state.editor.historyHasMore = Boolean(payload.hasMore);
    state.editor.historyError = null;

    if (
      state.editor.historyActiveId &&
      !state.editor.history.some((entry) => entry.id === state.editor.historyActiveId)
    ) {
      state.editor.historyActiveId = null;
    }

    if (
      state.editor.historySelectedId &&
      !state.editor.history.some((entry) => entry.id === state.editor.historySelectedId)
    ) {
      clearQueryHistoryDetailState();
    }

    if (
      state.editor.historySelectedId &&
      !state.editor.historyDetailLoading &&
      state.editor.historyDetail?.id !== state.editor.historySelectedId
    ) {
      await loadQueryHistoryDetail(state.editor.historySelectedId);
    } else {
      emitChange();
    }
  } catch (error) {
    if (requestVersion !== queryHistoryLoadVersion) {
      return;
    }

    state.editor.historyError = normalizeError(error);
  } finally {
    if (requestVersion === queryHistoryLoadVersion) {
      state.editor.historyLoading = false;
      state.editor.historyLoadingMore = false;
      emitChange();
    }
  }
}

async function loadChartsDetail(historyId) {
  const numericId = Number(historyId);
  const requestVersion = ++chartsDetailLoadVersion;

  if (!Number.isInteger(numericId) || numericId < 1) {
    state.charts.selectedHistoryId = null;
    state.charts.sqlExpanded = false;
    state.charts.resultsVisible = true;
    state.charts.detail = null;
    state.charts.detailLoading = false;
    state.charts.detailError = null;
    state.charts.result = null;
    state.charts.resultLoading = false;
    state.charts.resultError = null;
    emitChange();
    return;
  }

  state.charts.selectedHistoryId = numericId;
  state.charts.sqlExpanded = false;
  state.charts.resultsVisible = true;
  state.charts.detail = null;
  state.charts.detailLoading = true;
  state.charts.detailError = null;
  state.charts.result = null;
  state.charts.resultLoading = true;
  state.charts.resultError = null;
  emitChange();

  const [detailResponse, resultResponse] = await Promise.allSettled([
    api.getChartsQueryHistoryDetail(numericId),
    api.executeChartsQueryHistory(numericId),
  ]);

  if (
    requestVersion !== chartsDetailLoadVersion ||
    state.charts.selectedHistoryId !== numericId
  ) {
    return;
  }

  if (detailResponse.status === "fulfilled") {
    state.charts.detail = detailResponse.value.data ?? null;
    state.charts.detailError = null;
    if (detailResponse.value.data?.item) {
      syncQueryHistoryItem(detailResponse.value.data.item);
      syncChartsQuerySummaryForHistory(detailResponse.value.data.item.id);
    }
  } else {
    state.charts.detail = null;
    state.charts.detailError = normalizeError(detailResponse.reason);
  }

  if (resultResponse.status === "fulfilled") {
    state.charts.result = resultResponse.value.data ?? null;
    state.charts.resultError = null;
  } else {
    state.charts.result = null;
    state.charts.resultError = normalizeError(resultResponse.reason);
  }

  if (requestVersion === chartsDetailLoadVersion) {
    state.charts.detailLoading = false;
    state.charts.resultLoading = false;
    emitChange();
  }
}

async function loadCharts(version, route) {
  state.charts.loading = true;
  state.charts.error = null;
  emitChange();

  try {
    const response = await api.getChartsQueryHistory();

    if (version !== routeLoadVersion) {
      return;
    }

    state.charts.queries = response.data ?? [];
    state.charts.error = null;
  } catch (error) {
    if (version !== routeLoadVersion) {
      return;
    }

    state.charts.queries = [];
    state.charts.error = normalizeError(error);
  } finally {
    if (version === routeLoadVersion) {
      state.charts.loading = false;
      emitChange();
    }
  }

  if (version !== routeLoadVersion) {
    return;
  }

  const requestedHistoryId = Number(route.params?.historyId ?? null);
  const canLoadRequestedHistory =
    Number.isInteger(requestedHistoryId) &&
    state.charts.queries.some((item) => item.id === requestedHistoryId);

  await loadChartsDetail(canLoadRequestedHistory ? requestedHistoryId : null);
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
  const sortColumn = state.dataBrowser.sortColumn;
  const sortDirection = normalizeSortDirection(state.dataBrowser.sortDirection);

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
      sortColumn,
      sortDirection,
    });

    if (version !== routeLoadVersion) {
      return;
    }

    state.dataBrowser.table = response.data ?? null;
    state.dataBrowser.pageSize = pageSize;
    state.dataBrowser.page = response.data?.page ?? page;
    state.dataBrowser.sortColumn = response.data?.sort?.column ?? null;
    state.dataBrowser.sortDirection = response.data?.sort?.direction ?? null;
    state.dataBrowser.searchColumn = response.data?.columns?.includes(state.dataBrowser.searchColumn)
      ? state.dataBrowser.searchColumn
      : (response.data?.columns?.[0] ?? "");
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
        resetDataBrowserSort();
        resetDataBrowserSearch();
      }
      state.dataBrowser.selectedTable = requestedTableName;
    } else if (
      !state.dataBrowser.selectedTable ||
      !tables.some((table) => table.name === state.dataBrowser.selectedTable)
    ) {
      state.dataBrowser.selectedTable = tables[0]?.name ?? null;
      state.dataBrowser.page = 1;
      resetDataBrowserSort();
      resetDataBrowserSearch();
    }

    if (!state.dataBrowser.selectedTable) {
      state.dataBrowser.table = null;
      resetDataBrowserSearch();
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

async function loadTableDesignerDetail(version, tableName) {
  if (!tableName) {
    state.tableDesigner.draft = null;
    return;
  }

  state.tableDesigner.detailLoading = true;
  state.tableDesigner.saveError = null;
  emitChange();

  try {
    const response = await api.getTableDesignerTable(tableName);

    if (version !== routeLoadVersion) {
      return;
    }

    state.tableDesigner.selectedTableName = tableName;
    state.tableDesigner.draft = decorateTableDesignerDraft(response.data?.draft ?? null);
  } catch (error) {
    if (version !== routeLoadVersion) {
      return;
    }

    state.tableDesigner.error = normalizeError(error);
    state.tableDesigner.draft = null;
  } finally {
    if (version === routeLoadVersion) {
      state.tableDesigner.detailLoading = false;
      emitChange();
    }
  }
}

async function loadTableDesigner(version, route) {
  state.tableDesigner.loading = true;
  state.tableDesigner.error = null;
  emitChange();

  try {
    const response = await api.getTableDesignerOverview();

    if (version !== routeLoadVersion) {
      return;
    }

    state.tableDesigner.tables = response.data?.tables ?? [];
    state.tableDesigner.supportedTypes = response.data?.supportedTypes ?? [];

    if (route.params?.isNew) {
      const importedDraft = state.tableDesigner.pendingImportedDraft;
      state.tableDesigner.selectedTableName = null;
      state.tableDesigner.detailLoading = false;
      state.tableDesigner.pendingImportedDraft = null;
      state.tableDesigner.draft = decorateTableDesignerDraft(
        importedDraft ?? createNewTableDesignerDraft()
      );
      return;
    }

    const requestedTableName = route.params?.tableName ?? null;
    const tableName =
      requestedTableName &&
      state.tableDesigner.tables.some((table) => table.name === requestedTableName)
        ? requestedTableName
        : state.tableDesigner.selectedTableName &&
            state.tableDesigner.tables.some(
              (table) => table.name === state.tableDesigner.selectedTableName
            )
          ? state.tableDesigner.selectedTableName
          : state.tableDesigner.tables[0]?.name ?? null;

    if (!tableName) {
      state.tableDesigner.selectedTableName = null;
      state.tableDesigner.detailLoading = false;
      state.tableDesigner.draft = null;
      return;
    }

    await loadTableDesignerDetail(version, tableName);
  } catch (error) {
    if (version !== routeLoadVersion) {
      return;
    }

    state.tableDesigner.tables = [];
    state.tableDesigner.selectedTableName = null;
    state.tableDesigner.draft = null;
    state.tableDesigner.error = normalizeError(error);
  } finally {
    if (version === routeLoadVersion) {
      state.tableDesigner.loading = false;
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
  resetDataBrowserSearch();
  state.dataBrowser.selectedRowIndex = null;
  state.dataBrowser.exportLoading = false;
  state.dataBrowser.error = null;
  state.dataBrowser.saveError = null;
  state.tableDesigner.tables = [];
  state.tableDesigner.selectedTableName = null;
  state.tableDesigner.draft = null;
  state.tableDesigner.pendingImportedDraft = null;
  state.tableDesigner.saving = false;
  state.tableDesigner.searchQuery = "";
  state.tableDesigner.supportedTypes = [];
  state.tableDesigner.error = null;
  state.tableDesigner.saveError = null;
  resetChartsState();
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
    case "charts":
      await loadCharts(version, route);
      return;
    case "editor":
    case "editorResults":
      await refreshQueryHistoryState();
      return;
    case "structure":
      await loadStructure(version);
      return;
    case "tableDesigner":
      await loadTableDesigner(version, route);
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

function getChartsResultAnalysis(snapshot = state) {
  return snapshot.charts.result ? analyzeQueryChartResult(snapshot.charts.result) : null;
}

function buildQueryChartDraft(mode, chart = null) {
  const queryItem = state.charts.detail?.item ?? null;
  const analysis = getChartsResultAnalysis();

  if (!queryItem || !analysis) {
    return null;
  }

  const existingCharts = state.charts.detail?.charts ?? [];

  if (mode === "edit" && chart) {
    return {
      mode,
      chartId: chart.id,
      queryHistoryId: chart.queryHistoryId,
      chartType: chart.chartType,
      name: chart.name,
      nameTouched: true,
      config: structuredClone(chart.config),
      tableVisible: chart.tableVisible,
      resultColumns: buildQueryChartResultColumns(analysis),
    };
  }

  const chartType = suggestQueryChartType(analysis);
  const name = resolveUniqueQueryChartName(
    buildDefaultQueryChartName(chartType, queryItem.displayTitle),
    existingCharts
  );

  return {
    mode: "create",
    chartId: null,
    queryHistoryId: queryItem.id,
    chartType,
    name,
    nameTouched: false,
    config: buildSuggestedChartConfig(chartType, analysis),
    tableVisible: true,
    resultColumns: buildQueryChartResultColumns(analysis),
  };
}

function upsertChartDetailItem(updatedChart) {
  if (!updatedChart || state.charts.detail?.item?.id !== updatedChart.queryHistoryId) {
    return;
  }

  const nextCharts = [...(state.charts.detail?.charts ?? [])];
  const existingIndex = nextCharts.findIndex((chart) => chart.id === updatedChart.id);

  if (existingIndex >= 0) {
    nextCharts.splice(existingIndex, 1, updatedChart);
  } else {
    nextCharts.push(updatedChart);
  }

  nextCharts.sort((left, right) => {
    const leftTime = Date.parse(left.createdAt ?? "") || 0;
    const rightTime = Date.parse(right.createdAt ?? "") || 0;
    return leftTime - rightTime || left.id - right.id;
  });

  state.charts.detail = {
    ...state.charts.detail,
    charts: nextCharts,
  };

  syncChartsQuerySummaryForHistory(updatedChart.queryHistoryId);
}

function removeChartDetailItem(chartId) {
  if (!state.charts.detail) {
    return;
  }

  state.charts.detail = {
    ...state.charts.detail,
    charts: (state.charts.detail.charts ?? []).filter((chart) => chart.id !== Number(chartId)),
  };

  syncChartsQuerySummaryForHistory(state.charts.detail.item?.id);
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
    refreshQueryHistoryState(),
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

export function openCreateQueryChartModal() {
  const draft = buildQueryChartDraft("create");

  if (!state.charts.detail?.item || !state.charts.result) {
    pushToast("The selected query has no chartable result set yet.", "alert");
    return;
  }

  if (!draft) {
    pushToast("The chart editor could not be opened for this query.", "alert");
    return;
  }

  state.modal = {
    kind: "chart-editor",
    error: null,
    submitting: false,
    draft,
  };
  emitChange();
}

export function openEditQueryChartModal(chartId) {
  if (!state.charts.result) {
    pushToast("Reload the query result before editing this chart.", "alert");
    return;
  }

  const chart = state.charts.detail?.charts?.find((entry) => entry.id === Number(chartId)) ?? null;
  const draft = chart ? buildQueryChartDraft("edit", chart) : null;

  if (!chart || !draft) {
    pushToast("The selected chart could not be loaded.", "alert");
    return;
  }

  state.modal = {
    kind: "chart-editor",
    error: null,
    submitting: false,
    draft,
  };
  emitChange();
}

export function openDeleteQueryChartModal(chartId) {
  const chart = state.charts.detail?.charts?.find((entry) => entry.id === Number(chartId)) ?? null;

  if (!chart) {
    pushToast("The selected chart could not be loaded.", "alert");
    return;
  }

  state.modal = {
    kind: "delete-chart",
    chartId: chart.id,
    chartName: chart.name,
    error: null,
    submitting: false,
  };
  emitChange();
}

export function closeModal() {
  closeModalInternal();
}

export function toggleChartsSqlPanel() {
  state.charts.sqlExpanded = !state.charts.sqlExpanded;
  emitChange();
}

export function toggleChartsResultsPanel() {
  state.charts.resultsVisible = !state.charts.resultsVisible;
  emitChange();
}

export function setChartsHeightPreset(preset) {
  const nextPreset = normalizeChartsHeightPreset(preset);

  if (state.charts.chartHeightPreset === nextPreset) {
    return;
  }

  state.charts.chartHeightPreset = nextPreset;
  emitChange();
}

export function updateCurrentQueryChartDraftField(field, value) {
  if (state.modal?.kind !== "chart-editor" || !state.modal.draft) {
    return;
  }

  state.modal.error = null;

  if (field === "name") {
    state.modal.draft.name = String(value ?? "");
    state.modal.draft.nameTouched = true;
    emitChange();
    return;
  }

  if (field === "chartType") {
    const nextType = String(value ?? "").trim().toLowerCase();
    const analysis = getChartsResultAnalysis();

    state.modal.draft.chartType = nextType;
    state.modal.draft.config = buildSuggestedChartConfig(nextType, analysis);

    if (!state.modal.draft.nameTouched) {
      const existingCharts = state.charts.detail?.charts ?? [];
      state.modal.draft.name = resolveUniqueQueryChartName(
        buildDefaultQueryChartName(nextType, state.charts.detail?.item?.displayTitle),
        existingCharts,
        state.modal.draft.chartId
      );
    }

    emitChange();
    return;
  }

  if (field === "tableVisible") {
    state.modal.draft.tableVisible = Boolean(value);
    emitChange();
  }
}

export function updateCurrentQueryChartDraftConfigField(field, value) {
  if (state.modal?.kind !== "chart-editor" || !state.modal.draft) {
    return;
  }

  state.modal.error = null;
  state.modal.draft.config = {
    ...state.modal.draft.config,
    [field]: value,
  };
  emitChange();
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

export async function openOverviewInFinder() {
  try {
    const response = await api.openOverviewInFinder();
    pushToast(response.message || "Database file revealed in Finder.", "muted");
    return true;
  } catch (error) {
    pushToast(normalizeError(error)?.message || "Finder could not be opened.", "alert");
    return false;
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
  state.editor.result = null;
  resetEditorResultSort();
  state.editor.error = null;
  state.editor.selectedRowIndex = null;
  state.editor.saving = false;
  state.editor.deleting = false;
  state.editor.saveError = null;
  if (state.editor.activeTab === "results" || state.editor.activeTab === "performance") {
    state.editor.activeTab = "messages";
  }
  emitChange();
}

export function clearEditorResults() {
  state.editor.result = null;
  resetEditorResultSort();
  state.editor.error = null;
  state.editor.selectedRowIndex = null;
  state.editor.saving = false;
  state.editor.saveError = null;
  if (state.editor.activeTab === "results") {
    state.editor.activeTab = "messages";
  }
  emitChange();
}

export function setEditorPanelVisibility(visible) {
  const nextValue =
    typeof visible === "boolean" ? visible : !Boolean(state.editor.editorPanelVisible);

  if (state.editor.editorPanelVisible === nextValue) {
    return;
  }

  state.editor.editorPanelVisible = nextValue;
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
    resetEditorResultSort();
    state.editor.error = null;
    state.editor.activeTab = "results";
    invalidateDatabaseCaches();
    await refreshQueryHistoryState();
    pushToast(
      response.message || `Executed ${response.data.statementCount} SQL statement(s).`,
      "success"
    );
    return true;
  } catch (error) {
    state.editor.error = normalizeError(error);
    state.editor.activeTab = "messages";
    await refreshQueryHistoryState();
    return false;
  } finally {
    state.editor.executing = false;
    emitChange();
  }
}

export async function clearQueryHistoryStateAndData() {
  state.editor.historyLoading = true;
  emitChange();

  try {
    const response = await api.clearQueryHistory();
    resetQueryHistoryState({ preserveSearch: false });
    pushToast(response.message || "Query history cleared.", "muted");
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

export async function setQueryHistoryTab(tab) {
  const normalizedTab = normalizeQueryHistoryTab(String(tab ?? "").trim().toLowerCase());

  if (state.editor.historyTab === normalizedTab) {
    return;
  }

  state.editor.historyTab = normalizedTab;
  state.editor.historyActiveId = null;
  clearQueryHistoryDetailState();
  emitChange();
  await refreshQueryHistoryState();
}

export function setQueryHistoryPanelVisibility(visible) {
  const nextValue =
    typeof visible === "boolean" ? visible : !Boolean(state.editor.historyPanelVisible);

  if (state.editor.historyPanelVisible === nextValue) {
    return;
  }

  state.editor.historyPanelVisible = nextValue;
  emitChange();
}

export function setQueryHistorySearchInput(query) {
  state.editor.historySearchInput = String(query ?? "");
  emitChange();

  clearQueryHistorySearchTimer();
  queryHistorySearchTimer = window.setTimeout(() => {
    state.editor.historySearch = state.editor.historySearchInput.trim();
    state.editor.historyActiveId = null;
    clearQueryHistoryDetailState();
    emitChange();
    void refreshQueryHistoryState();
  }, 180);
}

export async function loadMoreQueryHistory() {
  if (
    state.editor.historyLoading ||
    state.editor.historyLoadingMore ||
    !state.editor.historyHasMore
  ) {
    return;
  }

  await refreshQueryHistoryState({ append: true });
}

export async function selectQueryHistoryItem(historyId) {
  const normalizedId = setActiveQueryHistoryItem(historyId);

  if (normalizedId === null) {
    return;
  }

  state.editor.historySelectedId = normalizedId;
  state.editor.historyDetail = null;
  state.editor.historyRuns = [];
  state.editor.historyDetailError = null;
  emitChange();
  await loadQueryHistoryDetail(normalizedId);
}

export function clearQueryHistorySelection() {
  if (state.editor.historySelectedId === null && !state.editor.historyDetail) {
    return;
  }

  clearQueryHistoryDetailState();
  emitChange();
}

export function openQueryHistoryInEditor(historyId, options = {}) {
  const rawSql = resolveQueryHistorySql(historyId);

  if (!rawSql) {
    pushToast("The selected history query could not be loaded.", "alert");
    return false;
  }

  setActiveQueryHistoryItem(historyId);
  clearQueryHistoryDetailState();
  state.editor.sqlText = options.append
    ? [state.editor.sqlText.trim(), rawSql].filter(Boolean).join("\n\n")
    : rawSql;
  emitChange();
  return true;
}

export async function runQueryHistoryItem(historyId) {
  const loaded = openQueryHistoryInEditor(historyId);

  if (!loaded) {
    return false;
  }

  return executeCurrentQuery();
}

export async function toggleQueryHistorySavedState(historyId, nextValue) {
  try {
    const response = await api.toggleQueryHistorySaved(historyId, nextValue);
    syncQueryHistoryItem(response.data);
    pushToast(response.message || "Query save state updated.", "muted");
    await refreshQueryHistoryState();
    return true;
  } catch (error) {
    state.editor.historyDetailError = normalizeError(error);
    emitChange();
    return false;
  }
}

export async function saveQueryHistoryTitle(historyId, title) {
  try {
    const response = await api.renameQueryHistoryItem(historyId, title);
    syncQueryHistoryItem(response.data);
    pushToast(response.message || "Query title updated.", "success");
    await loadQueryHistoryDetail(historyId);
    return true;
  } catch (error) {
    state.editor.historyDetailError = normalizeError(error);
    emitChange();
    return false;
  }
}

export async function saveQueryHistoryNotes(historyId, notes) {
  try {
    const response = await api.updateQueryHistoryNotes(historyId, notes);
    syncQueryHistoryItem(response.data);
    pushToast(response.message || "Query notes updated.", "success");
    await loadQueryHistoryDetail(historyId);
    return true;
  } catch (error) {
    state.editor.historyDetailError = normalizeError(error);
    emitChange();
    return false;
  }
}

export async function deleteQueryHistoryStateItem(historyId) {
  try {
    const response = await api.deleteQueryHistoryItem(historyId);
    if (state.editor.historyActiveId === Number(historyId)) {
      state.editor.historyActiveId = null;
    }
    if (state.editor.historySelectedId === Number(historyId)) {
      clearQueryHistorySelection();
    }
    pushToast(response.message || "Query history item deleted.", "muted");
    await refreshQueryHistoryState();
    return true;
  } catch (error) {
    state.editor.historyDetailError = normalizeError(error);
    emitChange();
    return false;
  }
}

export async function selectStructureEntry(name) {
  state.structure.selectedName = name;
  emitChange();
  await loadStructureDetail(++routeLoadVersion);
}

export function setTableDesignerSearchQuery(query) {
  state.tableDesigner.searchQuery = String(query ?? "");
  emitChange();
}

export function updateCurrentTableDesignerField(field, value) {
  if (!state.tableDesigner.draft) {
    return;
  }

  state.tableDesigner.draft = updateTableDesignerDraftField(
    state.tableDesigner.draft,
    field,
    value,
    getTableDesignerContext()
  );
  state.tableDesigner.saveError = null;
  emitChange();
}

export function updateCurrentTableDesignerColumnField(columnId, field, value) {
  if (!state.tableDesigner.draft) {
    return;
  }

  state.tableDesigner.draft = updateTableDesignerColumnField(
    state.tableDesigner.draft,
    columnId,
    field,
    value,
    getTableDesignerContext()
  );
  state.tableDesigner.saveError = null;
  emitChange();
}

export function addCurrentTableDesignerColumn() {
  if (!state.tableDesigner.draft) {
    return null;
  }

  const previousColumnIds = new Set(state.tableDesigner.draft.columns.map((column) => column.id));
  state.tableDesigner.draft = addTableDesignerColumn(
    state.tableDesigner.draft,
    getTableDesignerContext()
  );
  state.tableDesigner.saveError = null;
  emitChange();

  const nextColumn = state.tableDesigner.draft.columns.find(
    (column) => !previousColumnIds.has(column.id)
  );

  return nextColumn?.id ?? null;
}

export function queueTableDesignerCsvImport(fileName, csvText) {
  try {
    const imported = createTableDesignerDraftFromCsvImport(
      { fileName, csvText },
      getTableDesignerContext()
    );

    state.tableDesigner.pendingImportedDraft = imported.draft;
    state.tableDesigner.selectedTableName = null;
    state.tableDesigner.saveError = null;
    state.tableDesigner.error = null;
    emitChange();
    return imported;
  } catch (error) {
    pushToast(error?.message || "CSV import failed.", "alert");
    return null;
  }
}

export function removeCurrentTableDesignerColumn(columnId) {
  if (!state.tableDesigner.draft) {
    return;
  }

  state.tableDesigner.draft = removeTableDesignerColumn(
    state.tableDesigner.draft,
    columnId,
    getTableDesignerContext()
  );
  state.tableDesigner.saveError = null;
  emitChange();
}

export async function saveCurrentTableDesignerDraft() {
  if (!state.tableDesigner.draft) {
    return null;
  }

  state.tableDesigner.saving = true;
  state.tableDesigner.saveError = null;
  emitChange();

  try {
    const response = await api.saveTableDesignerDraft({
      draft: state.tableDesigner.draft,
    });

    state.tableDesigner.tables = response.data?.tables ?? state.tableDesigner.tables;
    state.tableDesigner.selectedTableName =
      response.data?.savedTableName ?? state.tableDesigner.selectedTableName;
    state.tableDesigner.draft = decorateTableDesignerDraft(response.data?.draft ?? null);
    pushToast(response.message || "Table schema saved.", "success");
    return response.data?.savedTableName ?? null;
  } catch (error) {
    state.tableDesigner.saveError = normalizeError(error);
    emitChange();
    return null;
  } finally {
    state.tableDesigner.saving = false;
    emitChange();
  }
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

export function setDataSearchQuery(query) {
  state.dataBrowser.searchQuery = String(query ?? "");
  state.dataBrowser.selectedRowIndex = null;
  state.dataBrowser.saveError = null;
  emitChange();
}

export function setDataSearchColumn(columnName) {
  state.dataBrowser.searchColumn = String(columnName ?? "");
  state.dataBrowser.selectedRowIndex = null;
  state.dataBrowser.saveError = null;
  emitChange();
}

export function toggleDataTablesPanel() {
  state.dataBrowser.tablesVisible = state.dataBrowser.tablesVisible === false;
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

export async function sortDataTableByColumn(columnName) {
  const normalizedColumn = String(columnName ?? "").trim();

  if (
    !normalizedColumn ||
    !state.dataBrowser.table?.columns?.includes(normalizedColumn)
  ) {
    return;
  }

  state.dataBrowser.sortDirection = getNextSortDirection(
    state.dataBrowser.sortColumn,
    state.dataBrowser.sortDirection,
    normalizedColumn
  );
  state.dataBrowser.sortColumn = normalizedColumn;
  state.dataBrowser.page = 1;
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
      rows: sortEditorResultRows(
        nextRows,
        state.editor.resultSortColumn,
        state.editor.resultSortDirection
      ),
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

export async function saveCurrentQueryChartDraft() {
  if (state.modal?.kind !== "chart-editor" || !state.modal.draft) {
    return null;
  }

  const analysis = getChartsResultAnalysis();

  if (!analysis) {
    state.modal.error = {
      code: "RESULT_SET_REQUIRED",
      message: "Reload the query result before saving a chart.",
    };
    emitChange();
    return null;
  }

  const validation = validateQueryChartConfig(
    state.modal.draft.chartType,
    state.modal.draft.config,
    analysis
  );

  if (!validation.valid) {
    state.modal.error = {
      code: "VALIDATION_ERROR",
      message: validation.errors.join(" "),
    };
    emitChange();
    return null;
  }

  startModalSubmission();
  const draftMode = state.modal.draft.mode;

  const payload = {
    queryHistoryId: state.modal.draft.queryHistoryId,
    name: state.modal.draft.name,
    chartType: state.modal.draft.chartType,
    config: state.modal.draft.config,
    resultColumns: buildQueryChartResultColumns(analysis),
    tableVisible: state.modal.draft.tableVisible,
  };

  try {
    const response =
      state.modal.draft.mode === "edit"
        ? await api.updateQueryHistoryChart(state.modal.draft.chartId, payload)
        : await api.createQueryHistoryChart(payload);
    const chart = response.data ?? null;

    if (chart) {
      upsertChartDetailItem(chart);
      closeModalInternal();
      pushToast(response.message || (draftMode === "edit" ? "Chart updated." : "Chart created."), "success");
      return chart;
    }

    closeModalInternal();
    return null;
  } catch (error) {
    withModalError(error);
    return null;
  }
}

export async function toggleQueryChartTableVisibility(chartId) {
  const chart = state.charts.detail?.charts?.find((entry) => entry.id === Number(chartId)) ?? null;

  if (!chart) {
    pushToast("The selected chart could not be loaded.", "alert");
    return null;
  }

  try {
    const response = await api.updateQueryHistoryChart(chart.id, {
      tableVisible: !chart.tableVisible,
    });

    upsertChartDetailItem(response.data ?? null);
    emitChange();
    return response.data ?? null;
  } catch (error) {
    pushToast(normalizeError(error)?.message || "Chart update failed.", "alert");
    return null;
  }
}

export async function deleteQueryChart(chartId) {
  try {
    const response = await api.deleteQueryHistoryChart(chartId);
    removeChartDetailItem(chartId);
    closeModalInternal();
    pushToast(response.message || "Chart deleted.", "muted");
    emitChange();
    return true;
  } catch (error) {
    withModalError(error);
    return false;
  }
}

export async function submitDeleteChartConfirmation() {
  if (state.modal?.kind !== "delete-chart") {
    return false;
  }

  startModalSubmission();
  return deleteQueryChart(state.modal.chartId);
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
    await api.downloadTableCsv(tableName, {
      sortColumn: state.dataBrowser.sortColumn,
      sortDirection: state.dataBrowser.sortDirection,
    });
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

export function sortEditorResultsByColumn(columnName) {
  const normalizedColumn = String(columnName ?? "").trim();
  const result = state.editor.result;

  if (!normalizedColumn || !result?.columns?.includes(normalizedColumn)) {
    return;
  }

  const nextDirection = getNextSortDirection(
    state.editor.resultSortColumn,
    state.editor.resultSortDirection,
    normalizedColumn
  );

  state.editor.result = {
    ...result,
    rows: sortEditorResultRows(result.rows ?? [], normalizedColumn, nextDirection),
  };
  state.editor.resultSortColumn = normalizedColumn;
  state.editor.resultSortDirection = nextDirection;
  state.editor.selectedRowIndex = null;
  state.editor.saveError = null;
  emitChange();
}

export async function refreshCurrentRoute() {
  await loadRouteData(state.route);
}

export function showToast(message, tone = "muted") {
  pushToast(message, tone);
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
