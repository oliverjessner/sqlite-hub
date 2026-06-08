import * as api from './api.js';
import { formatCellValue, inferStatusTone, truncateMiddle } from './utils/format.js';
import {
    addTableDesignerColumn,
    createTableDesignerDraftFromCsvImport,
    createNewTableDesignerDraft,
    hydrateTableDesignerDraft,
    removeTableDesignerColumn,
    updateTableDesignerColumnField,
    updateTableDesignerConstraintField,
    updateTableDesignerDraftField,
} from './utils/tableDesigner.js';
import {
    analyzeQueryChartResult,
    buildDefaultQueryChartName,
    buildQueryChartResultColumns,
    buildSuggestedChartConfig,
    resolveUniqueQueryChartName,
    suggestQueryChartType,
    validateQueryChartConfig,
} from './lib/queryCharts.js';
import {
    MEDIA_TAGGING_DEFAULT_MAPPING_TABLE,
    MEDIA_TAGGING_DEFAULT_TAG_TABLE,
} from './lib/mediaTaggingDefaults.js';
import { buildTextExportFilename } from './utils/exportFilenames.js';

const listeners = new Set();
const DEFAULT_SETTINGS = {
    defaultPageSize: 50,
    maxPageSize: 200,
    csvDelimiter: ',',
};
const DEFAULT_DATA_PAGE_SIZE = 50;
const DATA_PAGE_SIZES = [25, 50, 100, 250];
const DATA_FILTER_OPERATORS = new Set(['=', '!=', '<', '>', '<=', '>=', 'equals']);
const DATA_ROW_SIZE_STORAGE_KEY = 'data_row_size';
const CHARTS_HISTORY_TAB_STORAGE_KEY = 'charts_history_tab';
const QUERY_HISTORY_TAB_STORAGE_KEY = 'query_history_tab';
const COPY_COLUMN_SEPARATOR_STORAGE_KEY = 'sqlitehub.copyColumn.separator';
const COPY_COLUMN_WRAPPER_STORAGE_KEY = 'sqlitehub.copyColumn.wrapper';
const COPY_COLUMN_LINE_BREAKS_STORAGE_KEY = 'sqlitehub.copyColumn.lineBreaks';
const UI_PREFERENCE_STORAGE_KEYS = {
    sqlEditorHistoryVisible: 'sqlite_hub_sql_editor_history_visible',
    sqlEditorEditorVisible: 'sqlite_hub_sql_editor_editor_visible',
    sqlEditorActiveTab: 'sqlite_hub_sql_editor_active_tab',
    sqlEditorQueryDraft: 'sqlite_hub_sql_editor_query_draft',
    dataTablesVisible: 'sqlite_hub_data_tables_visible',
    structureTablesVisible: 'sqlite_hub_structure_tables_visible',
    chartsHistoryVisible: 'sqlite_hub_charts_history_visible',
    chartsResultsVisible: 'sqlite_hub_charts_results_visible',
    tableDesignerSqlPreviewVisible: 'sqlite_hub_table_designer_sql_preview_visible',
};
const QUERY_HISTORY_PAGE_SIZE = 30;
const QUERY_HISTORY_RUN_LIMIT = 8;
const CHART_HEIGHT_PRESETS = new Set(['small', 'medium', 'large']);
const EDITOR_RESULT_TABS = new Set(['results', 'performance', 'messages']);
const COPY_COLUMN_MODES = new Set(['column', 'column-with-header', 'first-10', 'markdown-todo']);
const TEXT_EXPORT_FORMAT_LABELS = {
    csv: 'CSV',
    tsv: 'TSV',
    md: 'Markdown',
};
const MISSING_DATABASE_ERROR = {
    code: 'ACTIVE_DATABASE_REQUIRED',
    message: 'No active SQLite database selected.',
};

let routeLoadVersion = 0;
let queryHistoryLoadVersion = 0;
let queryHistoryDetailLoadVersion = 0;
let queryHistorySearchTimer = null;
let chartsLoadVersion = 0;
let chartsDetailLoadVersion = 0;
let mediaTaggingPreviewVersion = 0;

function readStoredDataPageSize(fallback = DEFAULT_DATA_PAGE_SIZE) {
    try {
        return normalizeDataPageSize(globalThis.localStorage?.getItem(DATA_ROW_SIZE_STORAGE_KEY), fallback);
    } catch {
        return fallback;
    }
}

function storeDataPageSize(pageSize) {
    try {
        globalThis.localStorage?.setItem(DATA_ROW_SIZE_STORAGE_KEY, String(pageSize));
    } catch {
        // Ignore unavailable browser storage; the in-memory setting still applies.
    }
}

function findQueryHistoryItemBySql(sql, snapshot = state) {
    const normalizedSql = String(sql ?? '').trim();

    if (!normalizedSql) {
        return null;
    }

    if (String(snapshot.editor.historyDetail?.rawSql ?? '').trim() === normalizedSql) {
        return snapshot.editor.historyDetail;
    }

    return snapshot.editor.history.find(entry => String(entry.rawSql ?? '').trim() === normalizedSql) ?? null;
}

function getCurrentQueryExportFilename(format = 'csv', filename = '') {
    const queryText = String(state.editor.sqlText ?? '');
    const historyItem = findQueryHistoryItemBySql(queryText);
    const fallback = historyItem?.displayTitle || 'query-results';

    return buildTextExportFilename(filename || fallback, { format, fallback });
}

function getCurrentDataTableExportFilename(format = 'csv', filename = '') {
    const fallback = state.dataBrowser.selectedTable || 'table';

    return buildTextExportFilename(filename || fallback, { format, fallback });
}

function readStoredBoolean(key, fallback) {
    try {
        const value = globalThis.localStorage?.getItem(key);

        if (value === 'true') {
            return true;
        }

        if (value === 'false') {
            return false;
        }

        return fallback;
    } catch {
        return fallback;
    }
}

function storeBoolean(key, value) {
    try {
        globalThis.localStorage?.setItem(key, String(Boolean(value)));
    } catch {
        // Ignore unavailable browser storage; the in-memory setting still applies.
    }
}

function readStoredString(key, fallback = '') {
    try {
        const value = globalThis.localStorage?.getItem(key);
        return value === null || value === undefined ? fallback : value;
    } catch {
        return fallback;
    }
}

function storeString(key, value) {
    try {
        globalThis.localStorage?.setItem(key, String(value ?? ''));
    } catch {
        // Ignore unavailable browser storage; the in-memory value still applies.
    }
}

function readCopyColumnPreferences() {
    return {
        separator: readStoredString(COPY_COLUMN_SEPARATOR_STORAGE_KEY, ','),
        wrapper: readStoredString(COPY_COLUMN_WRAPPER_STORAGE_KEY, '"'),
        lineBreaks: readStoredBoolean(COPY_COLUMN_LINE_BREAKS_STORAGE_KEY, false),
    };
}

function normalizeCopyColumnMode(mode) {
    const normalizedMode = String(mode ?? '').trim();
    return COPY_COLUMN_MODES.has(normalizedMode) ? normalizedMode : 'column';
}

function normalizeCopyColumnScope(scope) {
    return scope === 'charts' ? 'charts' : 'editor';
}

function getResultByCopyColumnScope(scope, snapshot = state) {
    return normalizeCopyColumnScope(scope) === 'charts' ? snapshot.charts.result : snapshot.editor.result;
}

function readStoredEditorActiveTab(fallback = 'messages') {
    try {
        const value = globalThis.localStorage?.getItem(UI_PREFERENCE_STORAGE_KEYS.sqlEditorActiveTab);
        return EDITOR_RESULT_TABS.has(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

function storeEditorActiveTab(tab) {
    if (!EDITOR_RESULT_TABS.has(tab)) {
        return;
    }

    try {
        globalThis.localStorage?.setItem(UI_PREFERENCE_STORAGE_KEYS.sqlEditorActiveTab, tab);
    } catch {
        // Ignore unavailable browser storage; the in-memory setting still applies.
    }
}

function readStoredChartsHistoryTab(fallback = 'recent') {
    try {
        return normalizeChartsHistoryTab(globalThis.localStorage?.getItem(CHARTS_HISTORY_TAB_STORAGE_KEY) ?? fallback);
    } catch {
        return normalizeChartsHistoryTab(fallback);
    }
}

function storeChartsHistoryTab(tab) {
    try {
        globalThis.localStorage?.setItem(CHARTS_HISTORY_TAB_STORAGE_KEY, normalizeChartsHistoryTab(tab));
    } catch {
        // Ignore unavailable browser storage; the in-memory setting still applies.
    }
}

function readStoredQueryHistoryTab(fallback = 'recent') {
    try {
        return normalizeQueryHistoryTab(globalThis.localStorage?.getItem(QUERY_HISTORY_TAB_STORAGE_KEY) ?? fallback);
    } catch {
        return normalizeQueryHistoryTab(fallback);
    }
}

function storeQueryHistoryTab(tab) {
    try {
        globalThis.localStorage?.setItem(QUERY_HISTORY_TAB_STORAGE_KEY, normalizeQueryHistoryTab(tab));
    } catch {
        // Ignore unavailable browser storage; the in-memory setting still applies.
    }
}

const state = {
    ready: false,
    route: { name: 'landing', path: '/', params: {} },
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
        tablesVisible: readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.dataTablesVisible, true),
        table: null,
        loading: false,
        tableLoading: false,
        saving: false,
        deleting: false,
        page: 1,
        pageSize: readStoredDataPageSize(),
        sortColumn: null,
        sortDirection: null,
        searchQuery: '',
        tableSearchQuery: '',
        searchColumn: '',
        filterOperator: '=',
        selectedRowIndex: null,
        selectedRow: null,
        pendingOpenRow: null,
        exportLoading: false,
        error: null,
        saveError: null,
    },
    editor: {
        sqlText: readStoredString(UI_PREFERENCE_STORAGE_KEYS.sqlEditorQueryDraft),
        editorPanelVisible: readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.sqlEditorEditorVisible, true),
        history: [],
        historyPanelVisible: readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.sqlEditorHistoryVisible, true),
        historyLoading: false,
        historyLoadingMore: false,
        historyError: null,
        historyTab: readStoredQueryHistoryTab(),
        historySearchInput: '',
        historySearch: '',
        historyPageSize: QUERY_HISTORY_PAGE_SIZE,
        historyTotal: 0,
        historyHasMore: false,
        historyActiveId: null,
        historySelectedId: null,
        historyDetail: null,
        historyRuns: [],
        historyDetailLoading: false,
        historyDetailError: null,
        activeTab: readStoredEditorActiveTab(),
        executing: false,
        result: null,
        lastExecutedSql: '',
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
        loaded: false,
        queries: [],
        loading: false,
        error: null,
        historyTab: readStoredChartsHistoryTab(),
        historyPanelVisible: readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.chartsHistoryVisible, true),
        selectedHistoryId: null,
        chartHeightPreset: 'medium',
        sqlExpanded: false,
        resultsVisible: readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.chartsResultsVisible, true),
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
        sqlPreviewVisible: readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.tableDesignerSqlPreviewVisible, true),
        pendingImportedDraft: null,
        loading: false,
        detailLoading: false,
        saving: false,
        searchQuery: '',
        supportedTypes: [],
        error: null,
        saveError: null,
    },
    structure: {
        data: null,
        selectedName: null,
        detail: null,
        tablesVisible: readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.structureTablesVisible, true),
        tableSearchQuery: '',
        loading: false,
        detailLoading: false,
        error: null,
    },
    mediaTagging: {
        loading: false,
        previewLoading: false,
        saving: false,
        creatingTag: false,
        removingTagKey: null,
        applying: false,
        error: null,
        persistedConfig: null,
        persistedAt: null,
        connection: null,
        draft: null,
        suggestedConfig: null,
        schemaTables: [],
        tagTableColumns: [],
        mediaTableColumns: [],
        pathCandidates: [],
        booleanCandidates: [],
        defaultQueries: {
            untaggedQuery: '',
            taggedQuery: '',
        },
        mappingCandidates: [],
        mappingSelection: {
            selectedTableName: '',
            autoDetected: false,
        },
        tags: [],
        workflow: null,
        issues: [],
        dismissedIssueKeys: [],
        selectedTagKeys: [],
        workflowMediaDetailsVisible: true,
        workflowMediaRotationDegrees: 0,
        skippedMediaKeys: [],
        tagFormValues: {},
    },
};

function emitChange() {
    listeners.forEach(listener => listener(getState()));
}

function clone(value) {
    return structuredClone(value);
}

function createEmptyMediaTaggingDraft() {
    return {
        tagTable: MEDIA_TAGGING_DEFAULT_TAG_TABLE,
        mediaTable: '',
        pathColumn: '',
        taggedColumn: '',
        untaggedQuery: '',
        taggedQuery: '',
        mappingTable: MEDIA_TAGGING_DEFAULT_MAPPING_TABLE,
    };
}

function normalizeMediaTaggingDraft(draft = {}) {
    return {
        tagTable: MEDIA_TAGGING_DEFAULT_TAG_TABLE,
        mediaTable: String(draft.mediaTable ?? '').trim(),
        pathColumn: String(draft.pathColumn ?? '').trim(),
        taggedColumn: String(draft.taggedColumn ?? '').trim(),
        untaggedQuery: String(draft.untaggedQuery ?? ''),
        taggedQuery: String(draft.taggedQuery ?? ''),
        mappingTable: MEDIA_TAGGING_DEFAULT_MAPPING_TABLE,
    };
}

function areMediaTaggingDraftsEqual(left, right) {
    return JSON.stringify(normalizeMediaTaggingDraft(left)) === JSON.stringify(normalizeMediaTaggingDraft(right));
}

function getMediaTaggingCoreSignature(draft = {}) {
    const normalized = normalizeMediaTaggingDraft(draft);

    return JSON.stringify({
        tagTable: normalized.tagTable,
        mediaTable: normalized.mediaTable,
        pathColumn: normalized.pathColumn,
        taggedColumn: normalized.taggedColumn,
        untaggedQuery: normalized.untaggedQuery,
        taggedQuery: normalized.taggedQuery,
        mappingTable: normalized.mappingTable,
    });
}

function buildMediaTaggingTagFormValues(columns = [], previousValues = {}) {
    return Object.fromEntries(
        columns.map(column => {
            const previousValue = previousValues?.[column.name];

            if (previousValue !== undefined) {
                return [column.name, previousValue];
            }

            if (column.uiRole === 'parent-toggle') {
                return [column.name, false];
            }

            if (column.inputKind === 'checkbox') {
                return [column.name, false];
            }

            return [column.name, ''];
        }),
    );
}

function intersectMediaTaggingKeys(candidateKeys = [], allowedKeys = []) {
    const allowedSet = new Set(allowedKeys);
    return candidateKeys.filter(key => allowedSet.has(key));
}

function normalizeError(error) {
    if (!error) {
        return null;
    }

    return {
        code: error.code ?? 'REQUEST_FAILED',
        message: error.message ?? 'Request failed.',
        sqliteCode: error.sqliteCode ?? null,
        details: error.details ?? null,
        warnings: error.warnings ?? [],
    };
}

function getMediaTaggingIssueKey(issue = {}) {
    return `issue:${String(issue.scope ?? '').trim()}:${String(issue.code ?? '').trim()}:${String(issue.message ?? '').trim()}`;
}

function getMediaTaggingRouteErrorKey(error = {}) {
    return `route:${String(error.code ?? '').trim()}:${String(error.message ?? '').trim()}`;
}

function syncDismissedMediaTaggingIssues() {
    const availableKeys = new Set();

    if (state.mediaTagging.error) {
        availableKeys.add(getMediaTaggingRouteErrorKey(state.mediaTagging.error));
    }

    for (const issue of state.mediaTagging.issues ?? []) {
        availableKeys.add(getMediaTaggingIssueKey(issue));
    }

    state.mediaTagging.dismissedIssueKeys = (state.mediaTagging.dismissedIssueKeys ?? []).filter(key =>
        availableKeys.has(key),
    );
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
        'overview',
        'data',
        'editor',
        'editorResults',
        'charts',
        'structure',
        'tableDesigner',
        'mediaTaggingSetup',
        'mediaTaggingQueue',
    ].includes(routeName);
}

function isMediaTaggingRouteName(routeName) {
    return routeName === 'mediaTaggingSetup' || routeName === 'mediaTaggingQueue';
}

function getConnectionIdentity(connection) {
    return connection?.id ?? connection?.path ?? null;
}

function hasLoadedMediaTaggingForActiveConnection() {
    const activeConnectionId = getConnectionIdentity(state.connections.active);

    return (
        Boolean(activeConnectionId) &&
        getConnectionIdentity(state.mediaTagging.connection) === activeConnectionId &&
        !state.mediaTagging.loading &&
        (state.mediaTagging.draft !== null || state.mediaTagging.suggestedConfig !== null)
    );
}

function normalizeMediaTaggingRotationDegrees(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return ((Math.round(numericValue / 90) * 90) % 360 + 360) % 360;
}

function normalizeDataPageSize(value, fallback = 50) {
    const numericValue = Number(value);

    if (DATA_PAGE_SIZES.includes(numericValue)) {
        return numericValue;
    }

    return fallback;
}

function normalizeSortDirection(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase() === 'desc'
        ? 'desc'
        : 'asc';
}

function getNextSortDirection(currentColumn, currentDirection, nextColumn) {
    if (currentColumn === nextColumn) {
        return normalizeSortDirection(currentDirection) === 'asc' ? 'desc' : 'asc';
    }

    return 'asc';
}

function canEditQueryResult(snapshot = state) {
    return Boolean(snapshot.editor.result?.editing?.enabled) && !snapshot.connections.active?.readOnly;
}

function resetDataBrowserSearch() {
    state.dataBrowser.searchQuery = '';
    state.dataBrowser.searchColumn = '';
    state.dataBrowser.filterOperator = '=';
}

function isDataBrowserTextColumn(columnName) {
    const column = (state.dataBrowser.table?.columnMeta ?? []).find(item => item.name === columnName);

    return String(column?.affinity ?? '').toUpperCase() === 'TEXT';
}

function normalizeDataFilterOperatorForColumn(operator, columnName) {
    const normalizedOperator = DATA_FILTER_OPERATORS.has(operator) ? operator : '=';

    if (normalizedOperator === 'equals' && !isDataBrowserTextColumn(columnName)) {
        return '=';
    }

    return normalizedOperator;
}

function resetDataBrowserTableSearch() {
    state.dataBrowser.tableSearchQuery = '';
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
        return { rank: 0, value: '' };
    }

    if (typeof value === 'number') {
        return { rank: 1, value };
    }

    if (typeof value === 'boolean') {
        return { rank: 2, value: value ? 1 : 0 };
    }

    if (typeof value === 'string') {
        return { rank: 3, value };
    }

    if (value && typeof value === 'object' && value.__type === 'blob') {
        return {
            rank: 4,
            value: `${value.sizeBytes ?? 0}:${value.hexPreview ?? ''}`,
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

    if (typeof leftValue.value === 'number' && typeof rightValue.value === 'number') {
        return leftValue.value - rightValue.value;
    }

    return String(leftValue.value).localeCompare(String(rightValue.value), undefined, {
        numeric: true,
        sensitivity: 'base',
    });
}

function sortEditorResultRows(rows, sortColumn, sortDirection) {
    if (!sortColumn) {
        return [...(rows ?? [])];
    }

    const directionMultiplier = normalizeSortDirection(sortDirection) === 'desc' ? -1 : 1;

    return [...(rows ?? [])].sort(
        (left, right) => compareEditorValues(left?.[sortColumn], right?.[sortColumn]) * directionMultiplier,
    );
}

function buildUpdatedEditorResultRow(existingRow, updatedSourceRow, editableColumns) {
    const nextRow = {
        ...existingRow,
        __identity: updatedSourceRow?.__identity ?? existingRow?.__identity ?? null,
    };

    editableColumns.forEach(column => {
        if (column.sourceColumn === 'rowid') {
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
    return entries.find(entry => entry.name === snapshot.structure.selectedName) ?? null;
}

function resolveStructureSelectedName(structure, preferredName) {
    const entries = structure?.entries ?? [];

    if (preferredName && entries.some(entry => entry.name === preferredName)) {
        return preferredName;
    }

    return structure?.grouped?.tables?.[0]?.name ?? entries[0]?.name ?? null;
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
        .filter(field => field && field.label)
        .slice(0, 8)
        .map(field => {
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
            .filter(([key]) => key !== '__identity')
            .map(([key, value]) => ({
                label: key,
                value,
            })),
    );
}

function areRowIdentitiesEqual(left, right) {
    if (!left || !right || left.kind !== right.kind) {
        return false;
    }

    return JSON.stringify(left.columns ?? []) === JSON.stringify(right.columns ?? [])
        && JSON.stringify(left.values ?? null) === JSON.stringify(right.values ?? null);
}

function getSelectedDataBrowserRow(snapshot = state) {
    if (snapshot.dataBrowser.selectedRow) {
        return snapshot.dataBrowser.selectedRow;
    }

    const rowIndex = snapshot.dataBrowser.selectedRowIndex;

    if (typeof rowIndex !== 'number') {
        return null;
    }

    return snapshot.dataBrowser.table?.rows?.[rowIndex] ?? null;
}

function findDataBrowserRowIndexByIdentity(rows = [], identity) {
    if (!identity) {
        return -1;
    }

    return rows.findIndex(row => areRowIdentitiesEqual(row?.__identity, identity));
}

function clearDataBrowserRowSelectionState() {
    state.dataBrowser.selectedRowIndex = null;
    state.dataBrowser.selectedRow = null;
}

function resolveDataBrowserRowSelection(rowIndex, identity = null) {
    const hasRowIndex =
        rowIndex !== null &&
        rowIndex !== undefined &&
        (typeof rowIndex !== 'string' || rowIndex.trim() !== '');
    const numericIndex = hasRowIndex ? Number(rowIndex) : NaN;

    if (Number.isInteger(numericIndex) && numericIndex >= 0) {
        const indexedRow = state.dataBrowser.table?.rows?.[numericIndex] ?? null;

        if (indexedRow?.__identity) {
            return {
                row: indexedRow,
                rowIndex: numericIndex,
                identity: indexedRow.__identity,
            };
        }
    }

    const selectedRow = getSelectedDataBrowserRow();
    const selectedIdentity = identity ?? selectedRow?.__identity ?? null;

    if (!selectedRow?.__identity || !selectedIdentity || !areRowIdentitiesEqual(selectedRow.__identity, selectedIdentity)) {
        return {
            row: null,
            rowIndex: null,
            identity: selectedIdentity,
        };
    }

    return {
        row: selectedRow,
        rowIndex: null,
        identity: selectedIdentity,
    };
}

function normalizeQueryHistoryTab(value) {
    return ['recent', 'saved', 'unsaved', 'failed'].includes(value) ? value : 'recent';
}

function findQueryHistoryItem(historyId, snapshot = state) {
    return snapshot.editor.history.find(entry => String(entry.id) === String(historyId)) ?? null;
}

function resolveQueryHistoryItem(historyId, snapshot = state) {
    const historyIdAsString = String(historyId);

    if (String(snapshot.editor.historyDetail?.id ?? '') === historyIdAsString) {
        return snapshot.editor.historyDetail;
    }

    if (String(snapshot.charts.detail?.item?.id ?? '') === historyIdAsString) {
        return snapshot.charts.detail.item;
    }

    return findQueryHistoryItem(historyId, snapshot);
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
        state.editor.historySearchInput = '';
        state.editor.historySearch = '';
    }
}

function resetChartsState() {
    chartsLoadVersion += 1;
    chartsDetailLoadVersion += 1;
    state.charts.loaded = false;
    state.charts.queries = [];
    state.charts.loading = false;
    state.charts.error = null;
    state.charts.historyTab = readStoredChartsHistoryTab(state.charts.historyTab);
    state.charts.historyPanelVisible = readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.chartsHistoryVisible, true);
    state.charts.selectedHistoryId = null;
    state.charts.chartHeightPreset = 'medium';
    state.charts.sqlExpanded = false;
    state.charts.resultsVisible = readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.chartsResultsVisible, true);
    state.charts.detail = null;
    state.charts.detailLoading = false;
    state.charts.detailError = null;
    state.charts.result = null;
    state.charts.resultLoading = false;
    state.charts.resultError = null;
}

function normalizeChartsHeightPreset(value) {
    const normalizedValue = String(value ?? '')
        .trim()
        .toLowerCase();

    return CHART_HEIGHT_PRESETS.has(normalizedValue) ? normalizedValue : 'medium';
}

function normalizeChartsHistoryTab(value) {
    return ['recent', 'saved'].includes(value) ? value : 'recent';
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

    const updatedItemId = String(updatedItem.id);

    state.editor.history = state.editor.history.map(entry => (String(entry.id) === updatedItemId ? updatedItem : entry));

    if (String(state.editor.historyDetail?.id ?? '') === updatedItemId) {
        state.editor.historyDetail = updatedItem;
    }

    const existingChartsEntry =
        state.charts.queries.find(entry => String(entry.id) === updatedItemId) ??
        (String(state.charts.detail?.item?.id ?? '') === updatedItemId ? state.charts.detail.item : null);
    const mergedChartsItem = mergeQueryHistoryItemWithChartSummary(updatedItem, existingChartsEntry);

    state.charts.queries = state.charts.queries.map(entry =>
        String(entry.id) === updatedItemId ? mergedChartsItem : entry,
    );

    if (String(state.charts.detail?.item?.id ?? '') === updatedItemId) {
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
    const chartTypes = [
        ...new Set(
            charts
                .map(chart =>
                    String(chart?.chartType ?? '')
                        .trim()
                        .toLowerCase(),
                )
                .filter(Boolean),
        ),
    ];
    const chartCount = charts.length;

    state.charts.queries = state.charts.queries.map(entry =>
        entry.id === numericId
            ? {
                  ...entry,
                  chartCount,
                  chartTypes,
              }
            : entry,
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

    if (String(state.editor.historyDetail?.id ?? '') === historyIdAsString) {
        return state.editor.historyDetail.rawSql;
    }

    if (String(state.charts.detail?.item?.id ?? '') === historyIdAsString) {
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
    state.mediaTagging.error = null;
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
    resetDataBrowserTableSearch();
    resetDataBrowserSort();
    resetDataBrowserSearch();
    clearDataBrowserRowSelectionState();
    state.dataBrowser.pendingOpenRow = null;
    state.dataBrowser.exportLoading = false;
    state.dataBrowser.error = error;
    state.dataBrowser.saveError = null;

    state.structure.loading = false;
    state.structure.detailLoading = false;
    state.structure.data = null;
    state.structure.detail = null;
    state.structure.tablesVisible = readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.structureTablesVisible, true);
    state.structure.tableSearchQuery = '';
    state.structure.error = error;

    state.tableDesigner.loading = false;
    state.tableDesigner.detailLoading = false;
    state.tableDesigner.tables = [];
    state.tableDesigner.selectedTableName = null;
    state.tableDesigner.draft = null;
    state.tableDesigner.sqlPreviewVisible = readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.tableDesignerSqlPreviewVisible, true);
    state.tableDesigner.pendingImportedDraft = null;
    state.tableDesigner.saving = false;
    state.tableDesigner.searchQuery = '';
    state.tableDesigner.supportedTypes = [];
    state.tableDesigner.error = error;
    state.tableDesigner.saveError = null;

    state.mediaTagging.loading = false;
    state.mediaTagging.previewLoading = false;
    state.mediaTagging.saving = false;
    state.mediaTagging.creatingTag = false;
    state.mediaTagging.removingTagKey = null;
    state.mediaTagging.applying = false;
    state.mediaTagging.connection = state.connections.active;
    state.mediaTagging.persistedConfig = null;
    state.mediaTagging.persistedAt = null;
    state.mediaTagging.draft = createEmptyMediaTaggingDraft();
    state.mediaTagging.suggestedConfig = null;
    state.mediaTagging.schemaTables = [];
    state.mediaTagging.tagTableColumns = [];
    state.mediaTagging.mediaTableColumns = [];
    state.mediaTagging.pathCandidates = [];
    state.mediaTagging.booleanCandidates = [];
    state.mediaTagging.defaultQueries = {
        untaggedQuery: '',
        taggedQuery: '',
    };
    state.mediaTagging.mappingCandidates = [];
    state.mediaTagging.mappingSelection = {
        selectedTableName: '',
        autoDetected: false,
    };
    state.mediaTagging.tags = [];
    state.mediaTagging.workflow = null;
    state.mediaTagging.issues = [];
    state.mediaTagging.dismissedIssueKeys = [];
    state.mediaTagging.selectedTagKeys = [];
    state.mediaTagging.workflowMediaRotationDegrees = 0;
    state.mediaTagging.skippedMediaKeys = [];
    state.mediaTagging.tagFormValues = {};
    state.mediaTagging.error = error;

    resetChartsState();
    state.charts.error = error;

    resetQueryHistoryState({ preserveSearch: false });
}

function syncRouteContext() {
    const { route } = state;

    if (route.name === 'editorResults') {
        state.editor.activeTab = 'results';
        storeEditorActiveTab('results');
        clearQueryHistoryDetailState();
    }

    if (route.name !== 'editorResults') {
        state.editor.selectedRowIndex = null;
        state.editor.saveError = null;
    }

    if (
        route.name !== 'data' ||
        (route.params?.tableName && route.params.tableName !== state.dataBrowser.selectedTable)
    ) {
        if (route.name !== 'data' || route.params?.tableName !== state.dataBrowser.selectedTable) {
            state.dataBrowser.page = 1;
        }
        if (route.params?.tableName !== state.dataBrowser.selectedTable) {
            resetDataBrowserSearch();
        }
        clearDataBrowserRowSelectionState();
        if (route.name !== 'data') {
            state.dataBrowser.pendingOpenRow = null;
        }
        state.dataBrowser.saveError = null;
    }

    if (route.name === 'structure' && route.params?.tableName) {
        state.structure.selectedName = route.params.tableName;
        state.structure.detail = null;
    } else if (route.name !== 'structure') {
        state.structure.detail = null;
    }

    if (route.name !== 'tableDesigner') {
        state.tableDesigner.saveError = null;
    }

    if (route.name !== 'mediaTaggingSetup' && route.name !== 'mediaTaggingQueue') {
        state.mediaTagging.selectedTagKeys = [];
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

async function loadQueryHistoryDetail(historyId, options = {}) {
    const normalizedId = String(historyId ?? '').trim();
    const numericId = Number(normalizedId);
    const requestVersion = ++queryHistoryDetailLoadVersion;

    if (!normalizedId) {
        clearQueryHistoryDetailState();
        if (options.notify !== false) {
            emitChange();
        }
        return;
    }

    state.editor.historyDetailLoading = true;
    state.editor.historyDetailError = null;
    if (options.notify !== false) {
        emitChange();
    }

    try {
        const [detailResponse, runsResponse] = await Promise.all([
            api.getQueryHistoryItem(normalizedId),
            api.getQueryHistoryRuns(normalizedId, { limit: QUERY_HISTORY_RUN_LIMIT }),
        ]);

        if (requestVersion !== queryHistoryDetailLoadVersion || state.editor.historySelectedId !== numericId) {
            return;
        }

        state.editor.historyDetail = detailResponse.data ?? null;
        state.editor.historyRuns = runsResponse.data ?? [];
        state.editor.historyDetailError = null;
        if (detailResponse.data) {
            syncQueryHistoryItem(detailResponse.data);
        }
    } catch (error) {
        if (requestVersion !== queryHistoryDetailLoadVersion || state.editor.historySelectedId !== numericId) {
            return;
        }

        state.editor.historyDetail = null;
        state.editor.historyRuns = [];
        state.editor.historyDetailError = normalizeError(error);
    } finally {
        if (requestVersion === queryHistoryDetailLoadVersion) {
            state.editor.historyDetailLoading = false;
            if (options.notify !== false) {
                emitChange();
            }
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
            !state.editor.history.some(entry => entry.id === state.editor.historyActiveId)
        ) {
            state.editor.historyActiveId = null;
        }

        if (
            state.editor.historySelectedId &&
            !state.editor.history.some(entry => entry.id === state.editor.historySelectedId)
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
        state.charts.resultsVisible = readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.chartsResultsVisible, true);
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
    state.charts.resultsVisible = readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.chartsResultsVisible, true);
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

    if (requestVersion !== chartsDetailLoadVersion || state.charts.selectedHistoryId !== numericId) {
        return;
    }

    if (detailResponse.status === 'fulfilled') {
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

    if (resultResponse.status === 'fulfilled') {
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

function getRequestedChartsHistoryId(route) {
    const requestedHistoryId = Number(route.params?.historyId ?? null);

    return Number.isInteger(requestedHistoryId) && requestedHistoryId > 0 ? requestedHistoryId : null;
}

function resolveLoadableChartsHistoryId(route) {
    const requestedHistoryId = getRequestedChartsHistoryId(route);

    if (!requestedHistoryId) {
        return null;
    }

    return state.charts.queries.some(item => item.id === requestedHistoryId) ? requestedHistoryId : null;
}

function hasSettledChartsDetail(historyId) {
    if (state.charts.detailLoading || state.charts.resultLoading) {
        return false;
    }

    if (historyId === null) {
        return (
            state.charts.selectedHistoryId === null &&
            !state.charts.detail &&
            !state.charts.result &&
            !state.charts.detailError &&
            !state.charts.resultError
        );
    }

    return (
        state.charts.selectedHistoryId === historyId &&
        (state.charts.detail?.item?.id === historyId || Boolean(state.charts.detailError)) &&
        (Boolean(state.charts.result) || Boolean(state.charts.resultError))
    );
}

async function loadCharts(version, route, options = {}) {
    if (!options.force && state.charts.loaded) {
        const historyId = resolveLoadableChartsHistoryId(route);

        if (hasSettledChartsDetail(historyId)) {
            return;
        }

        await loadChartsDetail(historyId);
        return;
    }

    state.charts.loading = true;
    state.charts.error = null;
    emitChange();

    try {
        const response = await api.getChartsQueryHistory();

        if (version !== routeLoadVersion) {
            return;
        }

        state.charts.queries = response.data ?? [];
        state.charts.loaded = true;
        state.charts.error = null;
    } catch (error) {
        if (version !== routeLoadVersion) {
            return;
        }

        state.charts.queries = [];
        state.charts.loaded = false;
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

    await loadChartsDetail(resolveLoadableChartsHistoryId(route));
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

async function resolvePendingDataBrowserRow(version) {
    const pendingTarget = state.dataBrowser.pendingOpenRow;
    const tableName = state.dataBrowser.selectedTable;
    const table = state.dataBrowser.table;

    if (!pendingTarget || !tableName || pendingTarget.tableName !== tableName || !table) {
        return;
    }

    if (!pendingTarget.identity && Number.isInteger(pendingTarget.rowIndex)) {
        if (table.rows?.[pendingTarget.rowIndex]) {
            state.dataBrowser.selectedRowIndex = pendingTarget.rowIndex;
            state.dataBrowser.selectedRow = null;
        }

        state.dataBrowser.pendingOpenRow = null;
        return;
    }

    const matchingRowIndex = findDataBrowserRowIndexByIdentity(table.rows ?? [], pendingTarget.identity);

    if (matchingRowIndex >= 0) {
        state.dataBrowser.selectedRowIndex = matchingRowIndex;
        state.dataBrowser.selectedRow = null;
        state.dataBrowser.pendingOpenRow = null;
        return;
    }

    try {
        const response = await api.getDataTableRow(tableName, {
            identity: pendingTarget.identity,
        });

        if (version !== routeLoadVersion) {
            return;
        }

        state.dataBrowser.selectedRowIndex = null;
        state.dataBrowser.selectedRow = response.data?.row ?? null;
        state.dataBrowser.pendingOpenRow = null;
    } catch (error) {
        if (version !== routeLoadVersion) {
            return;
        }

        state.dataBrowser.pendingOpenRow = null;
        state.dataBrowser.selectedRow = null;
        pushToast(normalizeError(error).message || 'The requested row could not be opened.', 'alert');
    }
}

async function loadDataTable(version) {
    const tableName = state.dataBrowser.selectedTable;
    const pageSize = normalizeDataPageSize(state.dataBrowser.pageSize, DEFAULT_DATA_PAGE_SIZE);
    const page = Math.max(1, Number(state.dataBrowser.page) || 1);
    const sortColumn = state.dataBrowser.sortColumn;
    const sortDirection = normalizeSortDirection(state.dataBrowser.sortDirection);

    if (!tableName) {
        state.dataBrowser.table = null;
        clearDataBrowserRowSelectionState();
        state.dataBrowser.pendingOpenRow = null;
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
            filterColumn: state.dataBrowser.searchColumn,
            filterOperator: state.dataBrowser.filterOperator,
            filterValue: state.dataBrowser.searchQuery,
        });

        if (version !== routeLoadVersion) {
            return;
        }

        state.dataBrowser.table = response.data ?? null;
        state.dataBrowser.pageSize = pageSize;
        state.dataBrowser.page = response.data?.page ?? page;
        state.dataBrowser.sortColumn = response.data?.sort?.column ?? null;
        state.dataBrowser.sortDirection = response.data?.sort?.direction ?? null;
        const responseColumns = response.data?.columns ?? [];
        const responseFilter = response.data?.filter ?? null;

        state.dataBrowser.searchColumn =
            responseFilter?.column ??
            (responseColumns.includes(state.dataBrowser.searchColumn)
                ? state.dataBrowser.searchColumn
                : (responseColumns[0] ?? ''));
        const responseOperator = DATA_FILTER_OPERATORS.has(responseFilter?.operator)
            ? responseFilter.operator
            : state.dataBrowser.filterOperator;

        state.dataBrowser.filterOperator = normalizeDataFilterOperatorForColumn(
            responseOperator,
            state.dataBrowser.searchColumn,
        );
        clearDataBrowserRowSelectionState();
        await resolvePendingDataBrowserRow(version);
    } catch (error) {
        if (version !== routeLoadVersion) {
            return;
        }

        state.dataBrowser.table = null;
        clearDataBrowserRowSelectionState();
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

        if (requestedTableName && tables.some(table => table.name === requestedTableName)) {
            if (requestedTableName !== state.dataBrowser.selectedTable) {
                state.dataBrowser.page = 1;
                resetDataBrowserSort();
                resetDataBrowserSearch();
            }
            state.dataBrowser.selectedTable = requestedTableName;
        } else if (
            !state.dataBrowser.selectedTable ||
            !tables.some(table => table.name === state.dataBrowser.selectedTable)
        ) {
            state.dataBrowser.selectedTable = tables[0]?.name ?? null;
            state.dataBrowser.page = 1;
            resetDataBrowserSort();
            resetDataBrowserSearch();
        }

        if (!state.dataBrowser.selectedTable) {
            state.dataBrowser.table = null;
            resetDataBrowserSearch();
            clearDataBrowserRowSelectionState();
            state.dataBrowser.pendingOpenRow = null;
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
        clearDataBrowserRowSelectionState();
        state.dataBrowser.pendingOpenRow = null;
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

    if (entry.type !== 'table') {
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
        state.structure.selectedName = resolveStructureSelectedName(response.data, state.structure.selectedName);

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
            state.tableDesigner.draft = decorateTableDesignerDraft(importedDraft ?? createNewTableDesignerDraft());
            return;
        }

        const requestedTableName = route.params?.tableName ?? null;
        const tableName =
            requestedTableName && state.tableDesigner.tables.some(table => table.name === requestedTableName)
                ? requestedTableName
                : state.tableDesigner.selectedTableName &&
                    state.tableDesigner.tables.some(table => table.name === state.tableDesigner.selectedTableName)
                  ? state.tableDesigner.selectedTableName
                  : (state.tableDesigner.tables[0]?.name ?? null);

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

function applyMediaTaggingResponse(data, options = {}) {
    const nextDraft = normalizeMediaTaggingDraft(data?.config ?? createEmptyMediaTaggingDraft());
    const previousDraft = normalizeMediaTaggingDraft(state.mediaTagging.draft ?? createEmptyMediaTaggingDraft());
    const previousCurrentKey = state.mediaTagging.workflow?.currentItem?.key ?? null;
    const nextCurrentKey = data?.workflow?.currentItem?.key ?? null;
    const coreChanged = getMediaTaggingCoreSignature(previousDraft) !== getMediaTaggingCoreSignature(nextDraft);
    const allowedTagKeys = (data?.tags ?? []).filter(tag => !tag.isParentTag).map(tag => tag.key);
    const preferredExistingKeys = Array.isArray(data?.workflow?.currentItem?.existingTagKeys)
        ? data.workflow.currentItem.existingTagKeys
        : [];

    state.mediaTagging.connection = data?.connection ?? state.connections.active ?? null;
    state.mediaTagging.persistedConfig = data?.persistedConfig ?? null;
    state.mediaTagging.persistedAt = data?.persistedAt ?? null;
    state.mediaTagging.draft = nextDraft;
    state.mediaTagging.suggestedConfig = normalizeMediaTaggingDraft(
        data?.suggestedConfig ?? createEmptyMediaTaggingDraft(),
    );
    state.mediaTagging.schemaTables = data?.schemaTables ?? [];
    state.mediaTagging.tagTableColumns = data?.tagTableColumns ?? [];
    state.mediaTagging.mediaTableColumns = data?.mediaTableColumns ?? [];
    state.mediaTagging.pathCandidates = data?.pathCandidates ?? [];
    state.mediaTagging.booleanCandidates = data?.booleanCandidates ?? [];
    state.mediaTagging.defaultQueries = data?.defaultQueries ?? {
        untaggedQuery: '',
        taggedQuery: '',
    };
    state.mediaTagging.mappingCandidates = data?.mappingCandidates ?? [];
    state.mediaTagging.mappingSelection = data?.mappingSelection ?? {
        selectedTableName: '',
        autoDetected: false,
    };
    state.mediaTagging.tags = data?.tags ?? [];
    state.mediaTagging.workflow = data?.workflow ?? null;
    if (previousCurrentKey !== nextCurrentKey) {
        state.mediaTagging.workflowMediaRotationDegrees = 0;
    }
    state.mediaTagging.issues = data?.issues ?? [];
    state.mediaTagging.error = null;
    syncDismissedMediaTaggingIssues();

    if (coreChanged) {
        state.mediaTagging.skippedMediaKeys = [];
    } else if (Array.isArray(options.skippedMediaKeys)) {
        state.mediaTagging.skippedMediaKeys = [...options.skippedMediaKeys];
    }

    const keepSelectedTags =
        !coreChanged && previousCurrentKey === nextCurrentKey && options.keepSelectedTags !== false;
    state.mediaTagging.selectedTagKeys = keepSelectedTags
        ? intersectMediaTaggingKeys(state.mediaTagging.selectedTagKeys, allowedTagKeys)
        : intersectMediaTaggingKeys(preferredExistingKeys, allowedTagKeys);

    state.mediaTagging.tagFormValues =
        options.resetTagForm === true
            ? buildMediaTaggingTagFormValues(state.mediaTagging.tagTableColumns)
            : buildMediaTaggingTagFormValues(
                  state.mediaTagging.tagTableColumns,
                  coreChanged ? {} : state.mediaTagging.tagFormValues,
              );
}

async function loadMediaTagging(version) {
    state.mediaTagging.loading = true;
    state.mediaTagging.error = null;
    emitChange();

    try {
        const response = await api.getMediaTaggingState();

        if (version !== routeLoadVersion) {
            return;
        }

        applyMediaTaggingResponse(response.data ?? null, {
            resetTagForm: false,
            keepSelectedTags: false,
        });
    } catch (error) {
        if (version !== routeLoadVersion) {
            return;
        }

        state.mediaTagging.error = normalizeError(error);
        state.mediaTagging.connection = state.connections.active ?? null;
        state.mediaTagging.persistedConfig = null;
        state.mediaTagging.persistedAt = null;
        state.mediaTagging.draft = createEmptyMediaTaggingDraft();
        state.mediaTagging.suggestedConfig = createEmptyMediaTaggingDraft();
        state.mediaTagging.schemaTables = [];
        state.mediaTagging.tagTableColumns = [];
        state.mediaTagging.mediaTableColumns = [];
        state.mediaTagging.pathCandidates = [];
        state.mediaTagging.booleanCandidates = [];
        state.mediaTagging.defaultQueries = {
            untaggedQuery: '',
            taggedQuery: '',
        };
        state.mediaTagging.mappingCandidates = [];
        state.mediaTagging.mappingSelection = {
            selectedTableName: '',
            autoDetected: false,
        };
        state.mediaTagging.tags = [];
        state.mediaTagging.workflow = null;
        state.mediaTagging.issues = [];
        state.mediaTagging.dismissedIssueKeys = [];
        state.mediaTagging.selectedTagKeys = [];
        state.mediaTagging.workflowMediaRotationDegrees = 0;
        state.mediaTagging.skippedMediaKeys = [];
        state.mediaTagging.tagFormValues = {};
        state.mediaTagging.removingTagKey = null;
        syncDismissedMediaTaggingIssues();
    } finally {
        if (version === routeLoadVersion) {
            state.mediaTagging.loading = false;
            emitChange();
        }
    }
}

async function previewMediaTaggingDraft(options = {}) {
    const requestVersion = ++mediaTaggingPreviewVersion;

    state.mediaTagging.previewLoading = true;
    state.mediaTagging.error = null;
    emitChange();

    try {
        const response = await api.previewMediaTaggingConfig({
            config: state.mediaTagging.draft ?? createEmptyMediaTaggingDraft(),
            skippedMediaKeys: options.resetSkippedMediaKeys === true ? [] : state.mediaTagging.skippedMediaKeys,
        });

        if (requestVersion !== mediaTaggingPreviewVersion) {
            return null;
        }

        applyMediaTaggingResponse(response.data ?? null, {
            resetTagForm: Boolean(options.resetTagForm),
            keepSelectedTags: options.keepSelectedTags !== false,
            skippedMediaKeys: options.resetSkippedMediaKeys === true ? [] : state.mediaTagging.skippedMediaKeys,
        });
        return response.data ?? null;
    } catch (error) {
        if (requestVersion !== mediaTaggingPreviewVersion) {
            return null;
        }

        state.mediaTagging.error = normalizeError(error);
        syncDismissedMediaTaggingIssues();
        emitChange();
        return null;
    } finally {
        if (requestVersion === mediaTaggingPreviewVersion) {
            state.mediaTagging.previewLoading = false;
            emitChange();
        }
    }
}

function invalidateDatabaseCaches(options = {}) {
    const preserveDataBrowserState = options.preserveDataBrowserState === true;

    state.overview.data = null;
    state.dataBrowser.tables = [];
    if (!preserveDataBrowserState) {
        state.dataBrowser.selectedTable = null;
    }
    state.dataBrowser.table = null;
    if (!preserveDataBrowserState) {
        state.dataBrowser.page = 1;
        resetDataBrowserTableSearch();
        resetDataBrowserSearch();
    }
    clearDataBrowserRowSelectionState();
    state.dataBrowser.pendingOpenRow = null;
    state.dataBrowser.exportLoading = false;
    state.dataBrowser.error = null;
    state.dataBrowser.saveError = null;
    state.tableDesigner.tables = [];
    state.tableDesigner.selectedTableName = null;
    state.tableDesigner.draft = null;
    state.tableDesigner.sqlPreviewVisible = readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.tableDesignerSqlPreviewVisible, true);
    state.tableDesigner.pendingImportedDraft = null;
    state.tableDesigner.saving = false;
    state.tableDesigner.searchQuery = '';
    state.tableDesigner.supportedTypes = [];
    state.tableDesigner.error = null;
    state.tableDesigner.saveError = null;
    resetChartsState();
    state.structure.data = null;
    state.structure.detail = null;
    state.structure.tablesVisible = readStoredBoolean(UI_PREFERENCE_STORAGE_KEYS.structureTablesVisible, true);
    state.structure.tableSearchQuery = '';
    state.mediaTagging.loading = false;
    state.mediaTagging.previewLoading = false;
    state.mediaTagging.saving = false;
    state.mediaTagging.creatingTag = false;
    state.mediaTagging.removingTagKey = null;
    state.mediaTagging.applying = false;
    state.mediaTagging.error = null;
    state.mediaTagging.persistedConfig = null;
    state.mediaTagging.persistedAt = null;
    state.mediaTagging.connection = null;
    state.mediaTagging.draft = createEmptyMediaTaggingDraft();
    state.mediaTagging.suggestedConfig = null;
    state.mediaTagging.schemaTables = [];
    state.mediaTagging.tagTableColumns = [];
    state.mediaTagging.mediaTableColumns = [];
    state.mediaTagging.pathCandidates = [];
    state.mediaTagging.booleanCandidates = [];
    state.mediaTagging.defaultQueries = {
        untaggedQuery: '',
        taggedQuery: '',
    };
    state.mediaTagging.mappingCandidates = [];
    state.mediaTagging.mappingSelection = {
        selectedTableName: '',
        autoDetected: false,
    };
    state.mediaTagging.tags = [];
    state.mediaTagging.workflow = null;
    state.mediaTagging.issues = [];
    state.mediaTagging.dismissedIssueKeys = [];
    state.mediaTagging.selectedTagKeys = [];
    state.mediaTagging.workflowMediaRotationDegrees = 0;
    state.mediaTagging.skippedMediaKeys = [];
    state.mediaTagging.tagFormValues = {};
}

async function loadRouteData(route, options = {}) {
    clearRouteSlices();

    if (requiresActiveDatabase(route.name) && !state.connections.active) {
        setMissingDatabaseState();
        emitChange();
        return;
    }

    if (!options.force && isMediaTaggingRouteName(route.name) && hasLoadedMediaTaggingForActiveConnection()) {
        return;
    }

    const version = ++routeLoadVersion;

    if (route.name === 'landing' || route.name === 'connections') {
        await refreshConnectionsState();
        return;
    }

    switch (route.name) {
        case 'overview':
            await loadOverview(version);
            return;
        case 'data':
            await loadData(version, route);
            return;
        case 'charts':
            await loadCharts(version, route, options);
            return;
        case 'editor':
        case 'editorResults':
            await refreshQueryHistoryState();
            return;
        case 'structure':
            await loadStructure(version);
            return;
        case 'tableDesigner':
            await loadTableDesigner(version, route);
            return;
        case 'mediaTaggingSetup':
        case 'mediaTaggingQueue':
            await loadMediaTagging(version);
            return;
        case 'settings':
            await refreshSettingsState();
            return;
        default:
    }
}

function pushToast(message, tone = 'muted') {
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

    if (mode === 'edit' && chart) {
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
        existingCharts,
    );

    return {
        mode: 'create',
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
    const existingIndex = nextCharts.findIndex(chart => chart.id === updatedChart.id);

    if (existingIndex >= 0) {
        nextCharts.splice(existingIndex, 1, updatedChart);
    } else {
        nextCharts.push(updatedChart);
    }

    nextCharts.sort((left, right) => {
        const leftTime = Date.parse(left.createdAt ?? '') || 0;
        const rightTime = Date.parse(right.createdAt ?? '') || 0;
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
        charts: (state.charts.detail.charts ?? []).filter(chart => chart.id !== Number(chartId)),
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

    await Promise.all([refreshConnectionsState(), refreshSettingsState(), refreshQueryHistoryState()]);

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

export function openModal(kind, options = {}) {
    state.modal = {
        kind,
        error: null,
        submitting: false,
        ...options,
    };
    emitChange();
}

export function openQueryExportModal() {
    if (!String(state.editor.sqlText ?? '').trim()) {
        pushToast('Enter a query before exporting.', 'alert');
        return;
    }

    state.modal = {
        kind: 'query-export',
        filename: getCurrentQueryExportFilename('csv'),
        error: null,
        submitting: false,
    };
    emitChange();
}

export function openDataExportModal() {
    if (!state.dataBrowser.selectedTable) {
        pushToast('No table selected for export.', 'alert');
        return;
    }

    state.modal = {
        kind: 'data-export',
        filename: getCurrentDataTableExportFilename('csv'),
        error: null,
        submitting: false,
    };
    emitChange();
}

export function openCopyColumnModal({ scope = 'editor', columnName = '', mode = 'column' } = {}) {
    const resultScope = normalizeCopyColumnScope(scope);
    const normalizedColumnName = String(columnName ?? '');
    const result = getResultByCopyColumnScope(resultScope);
    const hasColumn = (result?.columns ?? []).some(column => String(column) === normalizedColumnName);

    if (!hasColumn) {
        pushToast('Column could not be found in the current result set.', 'alert');
        return;
    }

    const preferences = readCopyColumnPreferences();

    state.modal = {
        kind: 'copy-column',
        scope: resultScope,
        columnName: normalizedColumnName,
        copyMode: normalizeCopyColumnMode(mode),
        separator: preferences.separator,
        wrapper: preferences.wrapper,
        lineBreaks: preferences.lineBreaks,
        error: null,
        submitting: false,
    };
    emitChange();
}

export function storeCopyColumnPreferences({ separator = ',', wrapper = '"', lineBreaks = false } = {}) {
    storeString(COPY_COLUMN_SEPARATOR_STORAGE_KEY, separator);
    storeString(COPY_COLUMN_WRAPPER_STORAGE_KEY, wrapper);
    storeBoolean(COPY_COLUMN_LINE_BREAKS_STORAGE_KEY, lineBreaks);

    if (state.modal?.kind === 'copy-column') {
        state.modal.separator = String(separator ?? '');
        state.modal.wrapper = String(wrapper ?? '');
        state.modal.lineBreaks = Boolean(lineBreaks);
    }
}

export function updateCopyColumnModalFormatField(field, value) {
    if (state.modal?.kind !== 'copy-column') {
        return;
    }

    const normalizedField = String(field ?? '').trim();

    if (normalizedField !== 'separator' && normalizedField !== 'wrapper' && normalizedField !== 'lineBreaks') {
        return;
    }

    const normalizedValue = normalizedField === 'lineBreaks' ? Boolean(value) : String(value ?? '');
    state.modal[normalizedField] = normalizedValue;
    state.modal.error = null;

    if (normalizedField === 'lineBreaks') {
        storeBoolean(COPY_COLUMN_LINE_BREAKS_STORAGE_KEY, normalizedValue);
    } else {
        storeString(
            normalizedField === 'separator' ? COPY_COLUMN_SEPARATOR_STORAGE_KEY : COPY_COLUMN_WRAPPER_STORAGE_KEY,
            normalizedValue,
        );
    }
    emitChange();
}

export function setCopyColumnModalSubmitting(submitting) {
    if (state.modal?.kind !== 'copy-column') {
        return;
    }

    state.modal.submitting = Boolean(submitting);
    if (submitting) {
        state.modal.error = null;
    }
    emitChange();
}

export function setCopyColumnModalError(error) {
    if (state.modal?.kind !== 'copy-column') {
        return;
    }

    withModalError(error);
}

export function openEditConnectionModal(id) {
    const connection = state.connections.recent.find(entry => entry.id === id);

    if (!connection) {
        pushToast('Connection could not be loaded for editing.', 'alert');
        return;
    }

    state.modal = {
        kind: 'edit-connection',
        connectionId: connection.id,
        connection,
        error: null,
        submitting: false,
    };
    emitChange();
}

export function openDeleteDataRowModal(rowIndex) {
    const tableName = state.dataBrowser.selectedTable;
    const numericIndex = Number(rowIndex);
    const hasNumericIndex = Number.isInteger(numericIndex) && numericIndex >= 0;
    const row = hasNumericIndex
        ? state.dataBrowser.table?.rows?.[numericIndex] ?? null
        : getSelectedDataBrowserRow();
    const rowPreview = buildDeleteRowPreview(
        (state.dataBrowser.table?.columnMeta ?? [])
            .filter(column => column.visible)
            .map(column => ({
                label: column.name,
                value: row?.[column.name],
            })),
    );

    if (!tableName || !row?.__identity) {
        pushToast('The selected row could not be loaded.', 'alert');
        return;
    }

    state.modal = {
        kind: 'delete-row',
        target: 'data',
        rowIndex: hasNumericIndex ? numericIndex : null,
        identity: row.__identity,
        tableName,
        rowLabel: hasNumericIndex ? `row ${numericIndex + 1}` : 'targeted row',
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
            .filter(column => column.visible !== false)
            .map(column => ({
                label: column.sourceColumn || column.resultName,
                value: row[column.resultName],
            })),
    );

    if (!tableName || !row?.__identity || !canEditQueryResult()) {
        pushToast('The selected query result row could not be loaded.', 'alert');
        return;
    }

    state.modal = {
        kind: 'delete-row',
        target: 'editor',
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
    const draft = buildQueryChartDraft('create');

    if (!state.charts.detail?.item || !state.charts.result) {
        pushToast('The selected query has no chartable result set yet.', 'alert');
        return;
    }

    if (!draft) {
        pushToast('The chart editor could not be opened for this query.', 'alert');
        return;
    }

    state.modal = {
        kind: 'chart-editor',
        error: null,
        submitting: false,
        draft,
    };
    emitChange();
}

export function openEditQueryChartModal(chartId) {
    if (!state.charts.result) {
        pushToast('Reload the query result before editing this chart.', 'alert');
        return;
    }

    const chart = state.charts.detail?.charts?.find(entry => entry.id === Number(chartId)) ?? null;
    const draft = chart ? buildQueryChartDraft('edit', chart) : null;

    if (!chart || !draft) {
        pushToast('The selected chart could not be loaded.', 'alert');
        return;
    }

    state.modal = {
        kind: 'chart-editor',
        error: null,
        submitting: false,
        draft,
    };
    emitChange();
}

export function openDeleteQueryChartModal(chartId) {
    const chart = state.charts.detail?.charts?.find(entry => entry.id === Number(chartId)) ?? null;

    if (!chart) {
        pushToast('The selected chart could not be loaded.', 'alert');
        return;
    }

    state.modal = {
        kind: 'delete-chart',
        chartId: chart.id,
        chartName: chart.name,
        error: null,
        submitting: false,
    };
    emitChange();
}

export function openDeleteQueryHistoryModal(historyId) {
    const queryItem = resolveQueryHistoryItem(historyId);

    if (!queryItem) {
        pushToast('The selected query could not be loaded.', 'alert');
        return;
    }

    state.modal = {
        kind: 'delete-query-history',
        historyId: queryItem.id,
        queryTitle: queryItem.displayTitle,
        error: null,
        submitting: false,
    };
    emitChange();
}

export function closeModal() {
    closeModalInternal();
}

export async function openDataRowUpdatePreview(rowIndex, values, identity = null) {
    const tableName = state.dataBrowser.selectedTable;
    const selected = resolveDataBrowserRowSelection(rowIndex, identity);

    if (!tableName || !selected.identity) {
        pushToast('The selected row could not be loaded.', 'alert');
        return null;
    }

    state.dataBrowser.saving = true;
    state.dataBrowser.saveError = null;
    emitChange();

    try {
        const response = await api.previewDataTableRowUpdate(tableName, {
            identity: selected.identity,
            values,
        });

        state.modal = {
            kind: 'row-update-preview',
            target: 'data',
            tableName,
            rowIndex: selected.rowIndex,
            identity: selected.identity,
            values,
            preview: response.data,
            error: null,
            submitting: false,
        };
        emitChange();
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

export async function openEditorRowUpdatePreview(rowIndex, values) {
    const numericIndex = Number(rowIndex);
    const result = state.editor.result;
    const row = result?.rows?.[numericIndex];
    const tableName = result?.editing?.tableName ?? null;

    if (!tableName || !row || !canEditQueryResult()) {
        pushToast('The selected query result row could not be loaded.', 'alert');
        return null;
    }

    state.editor.saving = true;
    state.editor.saveError = null;
    emitChange();

    try {
        const response = await api.previewDataTableRowUpdate(tableName, {
            identity: row.__identity,
            values,
        });

        state.modal = {
            kind: 'row-update-preview',
            target: 'editor',
            tableName,
            rowIndex: numericIndex,
            identity: row.__identity,
            values,
            preview: response.data,
            error: null,
            submitting: false,
        };
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

export function toggleChartsSqlPanel() {
    state.charts.sqlExpanded = !state.charts.sqlExpanded;
    emitChange();
}

export function toggleChartsResultsPanel() {
    state.charts.resultsVisible = !state.charts.resultsVisible;
    storeBoolean(UI_PREFERENCE_STORAGE_KEYS.chartsResultsVisible, state.charts.resultsVisible);
    emitChange();
}

export function setChartsHistoryPanelVisibility(visible) {
    const nextValue = typeof visible === 'boolean' ? visible : !Boolean(state.charts.historyPanelVisible);

    if (state.charts.historyPanelVisible === nextValue) {
        return;
    }

    state.charts.historyPanelVisible = nextValue;
    storeBoolean(UI_PREFERENCE_STORAGE_KEYS.chartsHistoryVisible, nextValue);
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

export function setChartsHistoryTab(tab) {
    const nextTab = normalizeChartsHistoryTab(
        String(tab ?? '')
            .trim()
            .toLowerCase(),
    );

    if (state.charts.historyTab === nextTab) {
        return;
    }

    state.charts.historyTab = nextTab;
    storeChartsHistoryTab(nextTab);
    emitChange();
}

export function updateCurrentQueryChartDraftField(field, value) {
    if (state.modal?.kind !== 'chart-editor' || !state.modal.draft) {
        return;
    }

    state.modal.error = null;

    if (field === 'name') {
        state.modal.draft.name = String(value ?? '');
        state.modal.draft.nameTouched = true;
        emitChange();
        return;
    }

    if (field === 'chartType') {
        const nextType = String(value ?? '')
            .trim()
            .toLowerCase();
        const analysis = getChartsResultAnalysis();

        state.modal.draft.chartType = nextType;
        state.modal.draft.config = buildSuggestedChartConfig(nextType, analysis);

        if (!state.modal.draft.nameTouched) {
            const existingCharts = state.charts.detail?.charts ?? [];
            state.modal.draft.name = resolveUniqueQueryChartName(
                buildDefaultQueryChartName(nextType, state.charts.detail?.item?.displayTitle),
                existingCharts,
                state.modal.draft.chartId,
            );
        }

        emitChange();
        return;
    }

    if (field === 'tableVisible') {
        state.modal.draft.tableVisible = Boolean(value);
        emitChange();
    }
}

export function updateCurrentQueryChartDraftConfigField(field, value) {
    if (state.modal?.kind !== 'chart-editor' || !state.modal.draft) {
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
    const nextToasts = state.toasts.filter(toast => toast.id !== id);

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
        pushToast(response.message || 'Database connected.', 'success');
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
        pushToast(response.message || 'Database created.', 'success');
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
        pushToast(response.message || 'SQL dump imported.', 'success');
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
        pushToast(response.message || 'Connection updated.', 'success');
        await refreshConnectionsState();
        invalidateDatabaseCaches();

        if (wasActive && state.route.name !== 'connections') {
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
        pushToast(response.message || 'Active database updated.', 'success');
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
        pushToast(response.message || 'Recent connection removed.', 'muted');
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
        pushToast('No active SQLite database selected for backup.', 'alert');
        return null;
    }

    state.connections.backupLoading = true;
    emitChange();

    try {
        const response = await api.createActiveConnectionBackup();
        await refreshConnectionsState();
        pushToast(response.message || 'Backup created.', 'success');
        return response.data;
    } catch (error) {
        pushToast(normalizeError(error)?.message || 'Backup could not be created.', 'alert');
        return null;
    } finally {
        state.connections.backupLoading = false;
        emitChange();
    }
}

export async function openOverviewInFinder() {
    try {
        const response = await api.openOverviewInFinder();
        pushToast(response.message || 'Database file revealed in Finder.', 'muted');
        return true;
    } catch (error) {
        pushToast(normalizeError(error)?.message || 'Finder could not be opened.', 'alert');
        return false;
    }
}

export function setCurrentQuery(query) {
    const nextQuery = String(query ?? '');
    const previousLineCount = Math.max(1, String(state.editor.sqlText || '').split('\n').length);
    const nextLineCount = Math.max(1, nextQuery.split('\n').length);

    state.editor.sqlText = nextQuery;
    storeString(UI_PREFERENCE_STORAGE_KEYS.sqlEditorQueryDraft, nextQuery);

    if (previousLineCount !== nextLineCount) {
        emitChange();
    }
}

export function clearCurrentQuery() {
    state.editor.sqlText = '';
    storeString(UI_PREFERENCE_STORAGE_KEYS.sqlEditorQueryDraft, '');
    state.editor.result = null;
    state.editor.lastExecutedSql = '';
    resetEditorResultSort();
    state.editor.error = null;
    clearQueryHistoryDetailState();
    state.editor.selectedRowIndex = null;
    state.editor.saving = false;
    state.editor.deleting = false;
    state.editor.saveError = null;
    emitChange();
}

export function clearEditorResults() {
    state.editor.result = null;
    state.editor.lastExecutedSql = '';
    resetEditorResultSort();
    state.editor.error = null;
    state.editor.selectedRowIndex = null;
    state.editor.saving = false;
    state.editor.saveError = null;
    emitChange();
}

export function setEditorPanelVisibility(visible) {
    const nextValue = typeof visible === 'boolean' ? visible : !Boolean(state.editor.editorPanelVisible);

    if (state.editor.editorPanelVisible === nextValue) {
        return;
    }

    state.editor.editorPanelVisible = nextValue;
    storeBoolean(UI_PREFERENCE_STORAGE_KEYS.sqlEditorEditorVisible, nextValue);
    emitChange();
}

export function setEditorTab(tab) {
    if (!EDITOR_RESULT_TABS.has(tab)) {
        return;
    }

    state.editor.activeTab = tab;
    storeEditorActiveTab(tab);
    emitChange();
}

export async function executeCurrentQuery() {
    state.editor.executing = true;
    state.editor.lastExecutedSql = state.editor.sqlText;
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
        invalidateDatabaseCaches({ preserveDataBrowserState: true });
        await refreshQueryHistoryState();
        pushToast(response.message || `Executed ${response.data.statementCount} SQL statement(s).`, 'success');
        return true;
    } catch (error) {
        state.editor.error = normalizeError(error);
        state.editor.activeTab = 'messages';
        storeEditorActiveTab('messages');
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
        pushToast(response.message || 'Query history cleared.', 'muted');
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
    const normalizedTab = normalizeQueryHistoryTab(
        String(tab ?? '')
            .trim()
            .toLowerCase(),
    );

    if (state.editor.historyTab === normalizedTab) {
        return;
    }

    state.editor.historyTab = normalizedTab;
    storeQueryHistoryTab(normalizedTab);
    state.editor.historyActiveId = null;
    clearQueryHistoryDetailState();
    emitChange();
    await refreshQueryHistoryState();
}

export function setQueryHistoryPanelVisibility(visible) {
    const nextValue = typeof visible === 'boolean' ? visible : !Boolean(state.editor.historyPanelVisible);

    if (state.editor.historyPanelVisible === nextValue) {
        return;
    }

    state.editor.historyPanelVisible = nextValue;
    storeBoolean(UI_PREFERENCE_STORAGE_KEYS.sqlEditorHistoryVisible, nextValue);
    emitChange();
}

export function setQueryHistorySearchInput(query) {
    state.editor.historySearchInput = String(query ?? '');
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
    if (state.editor.historyLoading || state.editor.historyLoadingMore || !state.editor.historyHasMore) {
        return;
    }

    await refreshQueryHistoryState({ append: true });
}

export async function selectQueryHistoryItem(historyId, options = {}) {
    const normalizedId = Number(historyId);

    if (!Number.isInteger(normalizedId) || normalizedId < 1) {
        return;
    }

    state.editor.historySelectedId = normalizedId;
    state.editor.historyDetail = null;
    state.editor.historyRuns = [];
    state.editor.historyDetailError = null;
    state.editor.historyDetailLoading = true;

    if (options.notify !== false) {
        emitChange();
    }

    await loadQueryHistoryDetail(normalizedId, options);
}

export function clearQueryHistorySelection(options = {}) {
    if (state.editor.historySelectedId === null && !state.editor.historyDetail) {
        return;
    }

    clearQueryHistoryDetailState();

    if (options.notify !== false) {
        emitChange();
    }
}

export function openQueryHistoryInEditor(historyId, options = {}) {
    const rawSql = resolveQueryHistorySql(historyId);

    if (!rawSql) {
        pushToast('The selected history query could not be loaded.', 'alert');
        return false;
    }

    setActiveQueryHistoryItem(historyId);
    clearQueryHistoryDetailState();
    state.editor.sqlText = options.append ? [state.editor.sqlText.trim(), rawSql].filter(Boolean).join('\n\n') : rawSql;
    storeString(UI_PREFERENCE_STORAGE_KEYS.sqlEditorQueryDraft, state.editor.sqlText);
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

export async function toggleQueryHistorySavedState(historyId, nextValue, options = {}) {
    try {
        const response = await api.toggleQueryHistorySaved(historyId, nextValue);
        syncQueryHistoryItem(response.data);
        if (options.toast !== false) {
            pushToast(response.message || 'Query save state updated.', 'muted');
        }
        if (options.notify !== false) {
            emitChange();
        }
        if (options.refresh !== false) {
            await refreshQueryHistoryState();
        }
        return true;
    } catch (error) {
        state.editor.historyDetailError = normalizeError(error);
        if (options.notify !== false) {
            emitChange();
        }
        return false;
    }
}

export async function saveQueryHistoryTitle(historyId, title) {
    try {
        const response = await api.renameQueryHistoryItem(historyId, title);
        syncQueryHistoryItem(response.data);
        pushToast(response.message || 'Query title updated.', 'success');
        state.editor.historyDetailError = null;
        return response.data ?? null;
    } catch (error) {
        state.editor.historyDetailError = normalizeError(error);
        emitChange();
        return null;
    }
}

export async function saveQueryHistoryNotes(historyId, notes) {
    try {
        const response = await api.updateQueryHistoryNotes(historyId, notes);
        syncQueryHistoryItem(response.data);
        pushToast(response.message || 'Query notes updated.', 'success');
        state.editor.historyDetailError = null;
        return response.data ?? null;
    } catch (error) {
        state.editor.historyDetailError = normalizeError(error);
        emitChange();
        return null;
    }
}

export async function deleteQueryHistoryStateItem(historyId, options = {}) {
    const reportErrorToModal = Boolean(options.reportErrorToModal);

    try {
        const response = await api.deleteQueryHistoryItem(historyId);
        if (state.editor.historyActiveId === Number(historyId)) {
            state.editor.historyActiveId = null;
        }
        if (state.editor.historySelectedId === Number(historyId)) {
            clearQueryHistorySelection();
        }
        pushToast(response.message || 'Query history item deleted.', 'muted');
        await refreshQueryHistoryState();
        return true;
    } catch (error) {
        if (reportErrorToModal) {
            withModalError(error);
        } else {
            state.editor.historyDetailError = normalizeError(error);
            emitChange();
        }
        return false;
    }
}

export async function selectStructureEntry(name) {
    state.structure.selectedName = name;
    emitChange();
    await loadStructureDetail(++routeLoadVersion);
}

export function toggleStructureTablesPanel() {
    state.structure.tablesVisible = state.structure.tablesVisible === false;
    storeBoolean(UI_PREFERENCE_STORAGE_KEYS.structureTablesVisible, state.structure.tablesVisible);
    emitChange();
}

export function setTableDesignerSearchQuery(query) {
    state.tableDesigner.searchQuery = String(query ?? '');
    emitChange();
}

export function setDataTableSearchQuery(query) {
    state.dataBrowser.tableSearchQuery = String(query ?? '');
    emitChange();
}

export function setStructureTableSearchQuery(query) {
    state.structure.tableSearchQuery = String(query ?? '');
    emitChange();
}

export function setTableDesignerSqlPreviewVisibility(visible) {
    const nextValue = typeof visible === 'boolean' ? visible : !Boolean(state.tableDesigner.sqlPreviewVisible);

    if (state.tableDesigner.sqlPreviewVisible === nextValue) {
        return;
    }

    state.tableDesigner.sqlPreviewVisible = nextValue;
    storeBoolean(UI_PREFERENCE_STORAGE_KEYS.tableDesignerSqlPreviewVisible, nextValue);
    emitChange();
}

export function updateCurrentTableDesignerField(field, value, options = {}) {
    if (!state.tableDesigner.draft) {
        return;
    }

    state.tableDesigner.draft = updateTableDesignerDraftField(
        state.tableDesigner.draft,
        field,
        value,
        getTableDesignerContext(),
    );
    state.tableDesigner.saveError = null;

    if (options.notify !== false) {
        emitChange();
    }
}

export function updateCurrentTableDesignerColumnField(columnId, field, value, options = {}) {
    if (!state.tableDesigner.draft) {
        return;
    }

    state.tableDesigner.draft = updateTableDesignerColumnField(
        state.tableDesigner.draft,
        columnId,
        field,
        value,
        getTableDesignerContext(),
    );
    state.tableDesigner.saveError = null;

    if (options.notify !== false) {
        emitChange();
    }
}

export function updateCurrentTableDesignerConstraintField(constraintKind, constraintId, field, value, options = {}) {
    if (!state.tableDesigner.draft) {
        return;
    }

    state.tableDesigner.draft = updateTableDesignerConstraintField(
        state.tableDesigner.draft,
        constraintKind,
        constraintId,
        field,
        value,
        getTableDesignerContext(),
    );
    state.tableDesigner.saveError = null;

    if (options.notify !== false) {
        emitChange();
    }
}

export function addCurrentTableDesignerColumn() {
    if (!state.tableDesigner.draft) {
        return null;
    }

    const previousColumnIds = new Set(state.tableDesigner.draft.columns.map(column => column.id));
    state.tableDesigner.draft = addTableDesignerColumn(state.tableDesigner.draft, getTableDesignerContext());
    state.tableDesigner.saveError = null;
    emitChange();

    const nextColumn = state.tableDesigner.draft.columns.find(column => !previousColumnIds.has(column.id));

    return nextColumn?.id ?? null;
}

export function queueTableDesignerCsvImport(fileName, csvText, options = {}) {
    try {
        const imported = createTableDesignerDraftFromCsvImport(
            { fileName, csvText },
            {
                ...getTableDesignerContext(),
                ...(options.context ?? {}),
            },
        );

        state.tableDesigner.pendingImportedDraft = imported.draft;
        state.tableDesigner.selectedTableName = null;
        state.tableDesigner.saveError = null;
        state.tableDesigner.error = null;
        emitChange();
        return imported;
    } catch (error) {
        if (options.throwOnError) {
            throw error;
        }

        pushToast(error?.message || 'CSV import failed.', 'alert');
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
        getTableDesignerContext(),
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
        state.tableDesigner.selectedTableName = response.data?.savedTableName ?? state.tableDesigner.selectedTableName;
        state.tableDesigner.draft = decorateTableDesignerDraft(response.data?.draft ?? null);
        pushToast(response.message || 'Table schema saved.', 'success');
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

export function updateCurrentMediaTaggingField(field, value) {
    const nextDraft = normalizeMediaTaggingDraft(state.mediaTagging.draft ?? createEmptyMediaTaggingDraft());
    const normalizedField = String(field ?? '').trim();

    if (!normalizedField || !Object.prototype.hasOwnProperty.call(nextDraft, normalizedField)) {
        return;
    }

    nextDraft[normalizedField] =
        normalizedField === 'untaggedQuery' || normalizedField === 'taggedQuery'
            ? String(value ?? '')
            : String(value ?? '').trim();

    if (['tagTable', 'mediaTable', 'pathColumn', 'taggedColumn', 'mappingTable'].includes(normalizedField)) {
        state.mediaTagging.skippedMediaKeys = [];
    }

    if (['mediaTable', 'pathColumn', 'taggedColumn'].includes(normalizedField)) {
        nextDraft.untaggedQuery = '';
        nextDraft.taggedQuery = '';
        state.mediaTagging.selectedTagKeys = [];
    }

    if (normalizedField === 'tagTable') {
        state.mediaTagging.selectedTagKeys = [];
        state.mediaTagging.tagFormValues = {};
    }

    if (normalizedField === 'mappingTable') {
        state.mediaTagging.selectedTagKeys = [];
    }

    state.mediaTagging.draft = nextDraft;
    state.mediaTagging.error = null;
    emitChange();
}

export function updateCurrentMediaTaggingTagFormField(field, value) {
    const normalizedField = String(field ?? '').trim();

    if (!normalizedField) {
        return;
    }

    const nextValues = {
        ...state.mediaTagging.tagFormValues,
        [normalizedField]: value,
    };

    if (normalizedField === 'isParentTag' && value) {
        nextValues.parentTagId = '';
    }

    state.mediaTagging.tagFormValues = nextValues;
    state.mediaTagging.error = null;
    emitChange();
}

export function toggleCurrentMediaTagSelection(tagKey, value, options = {}) {
    const normalizedKey = String(tagKey ?? '');

    if (!normalizedKey) {
        return;
    }

    const selectedSet = new Set(state.mediaTagging.selectedTagKeys);

    if (value) {
        selectedSet.add(normalizedKey);
    } else {
        selectedSet.delete(normalizedKey);
    }

    state.mediaTagging.selectedTagKeys = Array.from(selectedSet);

    if (options.notify !== false) {
        emitChange();
    }
}

export function setMediaTaggingWorkflowMediaDetailsVisible(value, options = {}) {
    const nextValue = Boolean(value);

    if (state.mediaTagging.workflowMediaDetailsVisible === nextValue) {
        return;
    }

    state.mediaTagging.workflowMediaDetailsVisible = nextValue;

    if (options.notify !== false) {
        emitChange();
    }
}

export function setMediaTaggingWorkflowMediaRotationDegrees(value, options = {}) {
    const nextValue = normalizeMediaTaggingRotationDegrees(value);

    if (state.mediaTagging.workflowMediaRotationDegrees === nextValue) {
        return;
    }

    state.mediaTagging.workflowMediaRotationDegrees = nextValue;

    if (options.notify !== false) {
        emitChange();
    }
}

export async function refreshMediaTaggingPreview() {
    return previewMediaTaggingDraft({
        keepSelectedTags: true,
    });
}

export async function resetMediaTaggingQueriesToDefault() {
    state.mediaTagging.draft = {
        ...normalizeMediaTaggingDraft(state.mediaTagging.draft ?? createEmptyMediaTaggingDraft()),
        untaggedQuery: '',
        taggedQuery: '',
    };
    emitChange();

    return previewMediaTaggingDraft({
        keepSelectedTags: false,
    });
}

export async function saveCurrentMediaTaggingConfig() {
    state.mediaTagging.saving = true;
    state.mediaTagging.error = null;
    emitChange();

    try {
        const response = await api.saveMediaTaggingConfig({
            config: state.mediaTagging.draft ?? createEmptyMediaTaggingDraft(),
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
        });

        applyMediaTaggingResponse(response.data ?? null, {
            keepSelectedTags: true,
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
        });
        pushToast(response.message || 'Media tagging configuration saved.', 'success');
        return response.data ?? null;
    } catch (error) {
        state.mediaTagging.error = normalizeError(error);
        syncDismissedMediaTaggingIssues();
        emitChange();
        return null;
    } finally {
        state.mediaTagging.saving = false;
        emitChange();
    }
}

export async function submitCreateMediaTaggingTagTable() {
    if (state.modal?.kind !== 'create-media-tagging-tag-table') {
        return null;
    }

    startModalSubmission();

    try {
        const response = await api.createMediaTaggingTagTable({
            config: state.mediaTagging.draft ?? createEmptyMediaTaggingDraft(),
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
        });

        applyMediaTaggingResponse(response.data ?? null, {
            keepSelectedTags: true,
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
        });
        invalidateDatabaseCaches();
        closeModalInternal();
        pushToast(response.message || 'Tag table created.', 'success');
        emitChange();
        return response.data ?? null;
    } catch (error) {
        withModalError(error);
        return null;
    }
}

export async function submitCreateMediaTaggingMappingTable() {
    if (state.modal?.kind !== 'create-media-tagging-mapping-table') {
        return null;
    }

    startModalSubmission();

    try {
        const response = await api.createMediaTaggingMappingTable({
            config: state.mediaTagging.draft ?? createEmptyMediaTaggingDraft(),
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
        });

        applyMediaTaggingResponse(response.data ?? null, {
            keepSelectedTags: true,
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
        });
        invalidateDatabaseCaches();
        closeModalInternal();
        pushToast(response.message || 'Mapping table created.', 'success');
        emitChange();
        return response.data ?? null;
    } catch (error) {
        withModalError(error);
        return null;
    }
}

export async function createCurrentMediaTag() {
    state.mediaTagging.creatingTag = true;
    state.mediaTagging.error = null;
    emitChange();

    try {
        const response = await api.createMediaTag({
            config: state.mediaTagging.draft ?? createEmptyMediaTaggingDraft(),
            values: state.mediaTagging.tagFormValues ?? {},
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
        });

        applyMediaTaggingResponse(response.data ?? null, {
            resetTagForm: true,
            keepSelectedTags: true,
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
        });
        pushToast(response.message || 'Tag created.', 'success');
        return response.data ?? null;
    } catch (error) {
        state.mediaTagging.error = normalizeError(error);
        syncDismissedMediaTaggingIssues();
        emitChange();
        return null;
    } finally {
        state.mediaTagging.creatingTag = false;
        emitChange();
    }
}

export async function removeCurrentMediaTag(tagKey) {
    const normalizedTagKey = String(tagKey ?? '');

    if (!normalizedTagKey) {
        return null;
    }

    state.mediaTagging.removingTagKey = normalizedTagKey;
    state.mediaTagging.error = null;
    emitChange();

    try {
        const response = await api.deleteMediaTag({
            config: state.mediaTagging.draft ?? createEmptyMediaTaggingDraft(),
            tagKey: normalizedTagKey,
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
        });

        applyMediaTaggingResponse(response.data ?? null, {
            keepSelectedTags: true,
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
        });
        pushToast(response.message || 'Tag removed.', 'success');
        return response.data ?? null;
    } catch (error) {
        state.mediaTagging.error = normalizeError(error);
        syncDismissedMediaTaggingIssues();
        emitChange();
        return null;
    } finally {
        if (state.mediaTagging.removingTagKey === normalizedTagKey) {
            state.mediaTagging.removingTagKey = null;
        }
        emitChange();
    }
}

export async function skipCurrentMediaTaggingItem() {
    const currentItem = state.mediaTagging.workflow?.currentItem ?? null;

    if (!currentItem) {
        return null;
    }

    state.mediaTagging.applying = true;
    state.mediaTagging.error = null;
    emitChange();

    try {
        const response = await api.skipMediaTagging({
            config: state.mediaTagging.draft ?? createEmptyMediaTaggingDraft(),
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
            currentItemKey: currentItem.key,
        });

        state.mediaTagging.selectedTagKeys = [];
        applyMediaTaggingResponse(response.data ?? null, {
            keepSelectedTags: false,
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
        });
        pushToast(response.message || 'Media item skipped and marked tagged.', 'success');
        return response.data ?? null;
    } catch (error) {
        state.mediaTagging.error = normalizeError(error);
        syncDismissedMediaTaggingIssues();
        emitChange();
        return null;
    } finally {
        state.mediaTagging.applying = false;
        emitChange();
    }
}

export async function resetSkippedMediaTaggingItems() {
    state.mediaTagging.skippedMediaKeys = [];
    state.mediaTagging.selectedTagKeys = [];
    emitChange();

    return previewMediaTaggingDraft({
        keepSelectedTags: false,
        resetSkippedMediaKeys: true,
    });
}

export async function applyCurrentMediaTaggingSelection() {
    const currentItem = state.mediaTagging.workflow?.currentItem ?? null;

    if (!currentItem) {
        pushToast('No current media item is loaded.', 'alert');
        return null;
    }

    state.mediaTagging.applying = true;
    state.mediaTagging.error = null;
    emitChange();

    try {
        const response = await api.applyMediaTagging({
            config: state.mediaTagging.draft ?? createEmptyMediaTaggingDraft(),
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
            currentItemKey: currentItem.key,
            selectedTagKeys: state.mediaTagging.selectedTagKeys,
            markTagged: true,
        });

        applyMediaTaggingResponse(response.data ?? null, {
            keepSelectedTags: false,
            skippedMediaKeys: state.mediaTagging.skippedMediaKeys,
        });
        pushToast(response.message || 'Media item tagged.', 'success');
        return response.data ?? null;
    } catch (error) {
        state.mediaTagging.error = normalizeError(error);
        syncDismissedMediaTaggingIssues();
        emitChange();
        return null;
    } finally {
        state.mediaTagging.applying = false;
        emitChange();
    }
}

export function dismissMediaTaggingIssue(issueKey) {
    const normalizedKey = String(issueKey ?? '').trim();

    if (!normalizedKey) {
        return;
    }

    if ((state.mediaTagging.dismissedIssueKeys ?? []).includes(normalizedKey)) {
        return;
    }

    state.mediaTagging.dismissedIssueKeys = [...(state.mediaTagging.dismissedIssueKeys ?? []), normalizedKey];
    emitChange();
}

export function selectDataRow(index, options = {}) {
    const numericIndex = Number(index);

    if (!Number.isInteger(numericIndex) || numericIndex < 0) {
        return;
    }

    state.dataBrowser.selectedRowIndex = numericIndex;
    state.dataBrowser.selectedRow = null;
    state.dataBrowser.saveError = null;

    if (options.notify !== false) {
        emitChange();
    }
}

export function openDataRowByIdentity(tableName, identity) {
    const normalizedTableName = String(tableName ?? '').trim();

    if (!normalizedTableName || !identity) {
        return false;
    }

    state.dataBrowser.pendingOpenRow = {
        tableName: normalizedTableName,
        identity,
    };
    clearDataBrowserRowSelectionState();
    state.dataBrowser.saveError = null;
    return true;
}

export function preserveCurrentDataRowSelectionForReload() {
    const tableName = state.dataBrowser.selectedTable ?? state.dataBrowser.table?.name ?? '';
    const row = getSelectedDataBrowserRow();
    const rowIndex =
        typeof state.dataBrowser.selectedRowIndex === 'number' ? state.dataBrowser.selectedRowIndex : null;

    if (!tableName || !row) {
        return false;
    }

    state.dataBrowser.pendingOpenRow = {
        tableName,
        identity: row.__identity ?? null,
        rowIndex,
    };
    clearDataBrowserRowSelectionState();
    state.dataBrowser.saveError = null;
    return true;
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

export function clearDataRowSelection(options = {}) {
    if (state.dataBrowser.selectedRowIndex === null && !state.dataBrowser.selectedRow) {
        return;
    }

    clearDataBrowserRowSelectionState();
    state.dataBrowser.saveError = null;

    if (options.notify !== false) {
        emitChange();
    }
}

async function reloadDataTableForFilterChange() {
    if (state.route.name === 'data' && state.dataBrowser.selectedTable) {
        await loadDataTable(++routeLoadVersion);
    }
}

export async function setDataSearchQuery(query) {
    const nextQuery = String(query ?? '');

    if (state.dataBrowser.searchQuery === nextQuery) {
        return;
    }

    state.dataBrowser.searchQuery = nextQuery;
    state.dataBrowser.page = 1;
    clearDataBrowserRowSelectionState();
    state.dataBrowser.saveError = null;
    emitChange();
    await reloadDataTableForFilterChange();
}

export async function setDataSearchColumn(columnName) {
    const nextColumnName = String(columnName ?? '');

    if (state.dataBrowser.searchColumn === nextColumnName) {
        return;
    }

    state.dataBrowser.searchColumn = nextColumnName;
    state.dataBrowser.filterOperator = normalizeDataFilterOperatorForColumn(
        state.dataBrowser.filterOperator,
        nextColumnName,
    );
    state.dataBrowser.page = 1;
    clearDataBrowserRowSelectionState();
    state.dataBrowser.saveError = null;
    emitChange();
    await reloadDataTableForFilterChange();
}

export async function setDataFilterOperator(operator) {
    const nextOperator = String(operator ?? '=').trim();

    if (!DATA_FILTER_OPERATORS.has(nextOperator) || state.dataBrowser.filterOperator === nextOperator) {
        return;
    }

    state.dataBrowser.filterOperator = nextOperator;
    state.dataBrowser.page = 1;
    clearDataBrowserRowSelectionState();
    state.dataBrowser.saveError = null;
    emitChange();
    await reloadDataTableForFilterChange();
}

export function toggleDataTablesPanel() {
    state.dataBrowser.tablesVisible = state.dataBrowser.tablesVisible === false;
    storeBoolean(UI_PREFERENCE_STORAGE_KEYS.dataTablesVisible, state.dataBrowser.tablesVisible);
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
    clearDataBrowserRowSelectionState();
    state.dataBrowser.saveError = null;
    emitChange();

    if (state.route.name === 'data' && state.dataBrowser.selectedTable) {
        await loadDataTable(++routeLoadVersion);
    }
}

export async function sortDataTableByColumn(columnName) {
    const normalizedColumn = String(columnName ?? '').trim();

    if (!normalizedColumn || !state.dataBrowser.table?.columns?.includes(normalizedColumn)) {
        return;
    }

    state.dataBrowser.sortDirection = getNextSortDirection(
        state.dataBrowser.sortColumn,
        state.dataBrowser.sortDirection,
        normalizedColumn,
    );
    state.dataBrowser.sortColumn = normalizedColumn;
    state.dataBrowser.page = 1;
    clearDataBrowserRowSelectionState();
    state.dataBrowser.saveError = null;
    emitChange();

    if (state.route.name === 'data' && state.dataBrowser.selectedTable) {
        await loadDataTable(++routeLoadVersion);
    }
}

export async function setDataPageSize(pageSize) {
    const normalizedPageSize = normalizeDataPageSize(pageSize, state.dataBrowser.pageSize);

    if (normalizedPageSize === state.dataBrowser.pageSize) {
        return;
    }

    state.dataBrowser.pageSize = normalizedPageSize;
    storeDataPageSize(normalizedPageSize);
    state.dataBrowser.page = 1;
    clearDataBrowserRowSelectionState();
    state.dataBrowser.saveError = null;
    emitChange();

    if (state.route.name === 'data' && state.dataBrowser.selectedTable) {
        await loadDataTable(++routeLoadVersion);
    }
}

export async function submitDataRowUpdate(rowIndex, values, identity = null, options = {}) {
    const tableName = state.dataBrowser.selectedTable;
    const selected = resolveDataBrowserRowSelection(rowIndex, identity);
    const reportErrorToModal = Boolean(options.reportErrorToModal);

    if (!tableName || !selected.identity) {
        pushToast('The selected row could not be loaded.', 'alert');
        return null;
    }

    state.dataBrowser.saving = true;
    state.dataBrowser.saveError = null;
    emitChange();

    try {
        const response = await api.updateDataTableRow(tableName, {
            identity: selected.identity,
            values,
        });

        pushToast(response.message || 'Table row updated.', 'success');
        await loadDataTable(++routeLoadVersion);
        clearDataBrowserRowSelectionState();
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
        state.dataBrowser.saving = false;
        emitChange();
    }
}

export async function submitDataRowDelete(rowIndex, options = {}) {
    const tableName = state.dataBrowser.selectedTable;
    const selected = resolveDataBrowserRowSelection(rowIndex, options.identity ?? null);
    const reportErrorToModal = Boolean(options.reportErrorToModal);

    if (!tableName || !selected.identity) {
        pushToast('The selected row could not be loaded.', 'alert');
        return null;
    }

    const shouldStepBackPage =
        selected.rowIndex !== null && (state.dataBrowser.table?.rows?.length ?? 0) <= 1 && state.dataBrowser.page > 1;

    state.dataBrowser.deleting = true;
    state.dataBrowser.saveError = null;
    emitChange();

    try {
        const response = await api.deleteDataTableRow(tableName, {
            identity: selected.identity,
        });

        if (shouldStepBackPage) {
            state.dataBrowser.page -= 1;
        }

        pushToast(response.message || 'Table row deleted.', 'success');
        await loadDataTable(++routeLoadVersion);
        clearDataBrowserRowSelectionState();
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

export async function submitEditorRowUpdate(rowIndex, values, options = {}) {
    const numericIndex = Number(rowIndex);
    const result = state.editor.result;
    const row = result?.rows?.[numericIndex];
    const tableName = result?.editing?.tableName ?? null;
    const reportErrorToModal = Boolean(options.reportErrorToModal);

    if (!tableName || !row || !canEditQueryResult()) {
        pushToast('The selected query result row could not be loaded.', 'alert');
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

        nextRows[numericIndex] = buildUpdatedEditorResultRow(row, response.data?.row ?? null, editableColumns);
        state.editor.result = {
            ...result,
            rows: sortEditorResultRows(nextRows, state.editor.resultSortColumn, state.editor.resultSortDirection),
        };
        state.editor.selectedRowIndex = null;
        invalidateDatabaseCaches();
        pushToast(response.message || 'Query result row updated.', 'success');
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
        pushToast('The selected query result row could not be loaded.', 'alert');
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
        pushToast(response.message || 'Query result row deleted.', 'success');
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

    if (modal?.kind !== 'delete-row') {
        return null;
    }

    startModalSubmission();

    const result =
        modal.target === 'editor'
            ? await submitEditorRowDelete(modal.rowIndex, { reportErrorToModal: true })
            : await submitDataRowDelete(modal.rowIndex, {
                  reportErrorToModal: true,
                  identity: modal.identity ?? null,
              });

    if (result) {
        closeModalInternal();
    }

    return result;
}

export async function submitRowUpdatePreviewConfirmation() {
    const modal = state.modal;

    if (modal?.kind !== 'row-update-preview') {
        return null;
    }

    startModalSubmission();

    const result =
        modal.target === 'editor'
            ? await submitEditorRowUpdate(modal.rowIndex, modal.values, { reportErrorToModal: true })
            : await submitDataRowUpdate(modal.rowIndex, modal.values, modal.identity, {
                  reportErrorToModal: true,
              });

    if (result) {
        closeModalInternal();
    }

    return result;
}

export async function saveCurrentQueryChartDraft() {
    if (state.modal?.kind !== 'chart-editor' || !state.modal.draft) {
        return null;
    }

    const analysis = getChartsResultAnalysis();

    if (!analysis) {
        state.modal.error = {
            code: 'RESULT_SET_REQUIRED',
            message: 'Reload the query result before saving a chart.',
        };
        emitChange();
        return null;
    }

    const validation = validateQueryChartConfig(state.modal.draft.chartType, state.modal.draft.config, analysis);

    if (!validation.valid) {
        state.modal.error = {
            code: 'VALIDATION_ERROR',
            message: validation.errors.join(' '),
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
            state.modal.draft.mode === 'edit'
                ? await api.updateQueryHistoryChart(state.modal.draft.chartId, payload)
                : await api.createQueryHistoryChart(payload);
        const chart = response.data ?? null;

        if (chart) {
            upsertChartDetailItem(chart);
            closeModalInternal();
            pushToast(response.message || (draftMode === 'edit' ? 'Chart updated.' : 'Chart created.'), 'success');
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
    const chart = state.charts.detail?.charts?.find(entry => entry.id === Number(chartId)) ?? null;

    if (!chart) {
        pushToast('The selected chart could not be loaded.', 'alert');
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
        pushToast(normalizeError(error)?.message || 'Chart update failed.', 'alert');
        return null;
    }
}

export async function deleteQueryChart(chartId) {
    try {
        const response = await api.deleteQueryHistoryChart(chartId);
        removeChartDetailItem(chartId);
        closeModalInternal();
        pushToast(response.message || 'Chart deleted.', 'muted');
        emitChange();
        return true;
    } catch (error) {
        withModalError(error);
        return false;
    }
}

export async function submitDeleteChartConfirmation() {
    if (state.modal?.kind !== 'delete-chart') {
        return false;
    }

    startModalSubmission();
    return deleteQueryChart(state.modal.chartId);
}

export async function submitDeleteQueryHistoryConfirmation() {
    if (state.modal?.kind !== 'delete-query-history') {
        return false;
    }

    startModalSubmission();
    const deleted = await deleteQueryHistoryStateItem(state.modal.historyId, {
        reportErrorToModal: true,
    });

    if (deleted) {
        closeModalInternal();
    }

    return deleted;
}

function beginCurrentQueryExport() {
    state.editor.exportLoading = true;
    if (state.modal?.kind === 'query-export') {
        state.modal.submitting = true;
        state.modal.error = null;
    }
    emitChange();
}

function reportCurrentQueryExportError(error) {
    if (state.modal?.kind === 'query-export') {
        withModalError(error);
        return;
    }

    state.editor.error = normalizeError(error);
    emitChange();
}

function finishCurrentQueryExport() {
    state.editor.exportLoading = false;
    if (state.modal?.kind === 'query-export') {
        state.modal.submitting = false;
    }
    emitChange();
}

export async function exportCurrentQueryFormat(format = 'csv', filename = '') {
    const normalizedFormat = String(format ?? 'csv').toLowerCase();
    const label = TEXT_EXPORT_FORMAT_LABELS[normalizedFormat] ?? TEXT_EXPORT_FORMAT_LABELS.csv;
    const exportFilename = getCurrentQueryExportFilename(normalizedFormat, filename || state.modal?.filename);

    if (state.modal?.kind === 'query-export') {
        state.modal.filename = exportFilename;
    }

    beginCurrentQueryExport();

    try {
        await api.downloadQueryExport(state.editor.sqlText, normalizedFormat, { filename: exportFilename });
        closeModalInternal();
        pushToast(`${label} export started.`, 'success');
        return true;
    } catch (error) {
        reportCurrentQueryExportError(error);
        return false;
    } finally {
        finishCurrentQueryExport();
    }
}

export async function duplicateCurrentQueryAsTable(filename = '') {
    const exportFilename = getCurrentQueryExportFilename('csv', filename || state.modal?.filename);

    if (state.modal?.kind === 'query-export') {
        state.modal.filename = exportFilename;
    }

    beginCurrentQueryExport();

    try {
        const response = await api.getQueryExport(state.editor.sqlText, 'csv');
        const exportData = response?.data ?? {};
        const imported = queueTableDesignerCsvImport(
            exportFilename || getCurrentQueryExportFilename('csv', exportData.filename),
            exportData.content || '',
            { throwOnError: true },
        );

        closeModalInternal();
        pushToast(
            `Table draft created from ${imported.importedRowCount} row${imported.importedRowCount === 1 ? '' : 's'}.`,
            'success',
        );
        return imported;
    } catch (error) {
        reportCurrentQueryExportError(error);
        return null;
    } finally {
        finishCurrentQueryExport();
    }
}

export async function exportCurrentQueryCsv() {
    try {
        return await exportCurrentQueryFormat('csv');
    } catch (error) {
        state.editor.error = normalizeError(error);
        emitChange();
        return false;
    }
}

function getCurrentDataTableExportOptions(format = 'csv') {
    return {
        sortColumn: state.dataBrowser.sortColumn,
        sortDirection: state.dataBrowser.sortDirection,
        filterColumn: state.dataBrowser.searchColumn,
        filterOperator: state.dataBrowser.filterOperator,
        filterValue: state.dataBrowser.searchQuery,
        format,
    };
}

function beginCurrentDataTableExport() {
    state.dataBrowser.exportLoading = true;
    if (state.modal?.kind === 'data-export') {
        state.modal.submitting = true;
        state.modal.error = null;
    }
    emitChange();
}

function reportCurrentDataTableExportError(error) {
    if (state.modal?.kind === 'data-export') {
        withModalError(error);
        return;
    }

    state.dataBrowser.error = normalizeError(error);
    emitChange();
}

function finishCurrentDataTableExport() {
    state.dataBrowser.exportLoading = false;
    if (state.modal?.kind === 'data-export') {
        state.modal.submitting = false;
    }
    emitChange();
}

export async function exportCurrentDataTableFormat(format = 'csv', filename = '') {
    const tableName = state.dataBrowser.selectedTable;

    if (!tableName) {
        pushToast('No table selected for export.', 'alert');
        return false;
    }

    const normalizedFormat = String(format ?? 'csv').toLowerCase();
    const label = TEXT_EXPORT_FORMAT_LABELS[normalizedFormat] ?? TEXT_EXPORT_FORMAT_LABELS.csv;
    const exportFilename = getCurrentDataTableExportFilename(normalizedFormat, filename || state.modal?.filename);

    if (state.modal?.kind === 'data-export') {
        state.modal.filename = exportFilename;
    }

    beginCurrentDataTableExport();

    try {
        await api.downloadTableExport(tableName, {
            ...getCurrentDataTableExportOptions(normalizedFormat),
            filename: exportFilename,
        });
        closeModalInternal();
        pushToast(`${label} export started for ${tableName}.`, 'success');
        return true;
    } catch (error) {
        reportCurrentDataTableExportError(error);
        return false;
    } finally {
        finishCurrentDataTableExport();
    }
}

export async function duplicateCurrentDataTableAsTable(filename = '') {
    const tableName = state.dataBrowser.selectedTable;

    if (!tableName) {
        pushToast('No table selected for export.', 'alert');
        return null;
    }

    const exportFilename = getCurrentDataTableExportFilename('csv', filename || state.modal?.filename);

    if (state.modal?.kind === 'data-export') {
        state.modal.filename = exportFilename;
    }

    beginCurrentDataTableExport();

    try {
        const response = await api.getTableExport(tableName, getCurrentDataTableExportOptions('csv'));
        const exportData = response?.data ?? {};
        const imported = queueTableDesignerCsvImport(
            exportFilename || getCurrentDataTableExportFilename('csv', exportData.filename),
            exportData.content || '',
            {
                throwOnError: true,
                context: {
                    catalogTables: state.tableDesigner.tables?.length
                        ? state.tableDesigner.tables
                        : state.dataBrowser.tables,
                },
            },
        );

        closeModalInternal();
        pushToast(
            `Table draft created from ${imported.importedRowCount} row${imported.importedRowCount === 1 ? '' : 's'}.`,
            'success',
        );
        return imported;
    } catch (error) {
        reportCurrentDataTableExportError(error);
        return null;
    } finally {
        finishCurrentDataTableExport();
    }
}

export async function exportCurrentDataTableCsv() {
    return exportCurrentDataTableFormat('csv');
}

export function sortEditorResultsByColumn(columnName) {
    const normalizedColumn = String(columnName ?? '').trim();
    const result = state.editor.result;

    if (!normalizedColumn || !result?.columns?.includes(normalizedColumn)) {
        return;
    }

    const nextDirection = getNextSortDirection(
        state.editor.resultSortColumn,
        state.editor.resultSortDirection,
        normalizedColumn,
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
    await loadRouteData(state.route, { force: true });
}

export function showToast(message, tone = 'muted') {
    pushToast(message, tone);
}

export function getCurrentConnection(snapshot = state) {
    return snapshot.connections.active;
}

export function getQueryMessages(snapshot = state) {
    const queryText = snapshot.editor.result?.sql ?? (snapshot.editor.error ? snapshot.editor.lastExecutedSql : '');
    const queryMessages = queryText
        ? [
              {
                  tone: 'muted',
                  label: 'QUERY',
                  value: queryText,
                  kind: 'query',
              },
          ]
        : [];

    if (snapshot.editor.error) {
        return [
            {
                tone: 'alert',
                label: snapshot.editor.error.code,
                value: snapshot.editor.error.message,
            },
            ...queryMessages,
        ];
    }

    if (!snapshot.editor.result) {
        return [
            {
                tone: 'muted',
                label: 'IDLE',
                value: 'No SQL statements have been executed yet.',
            },
        ];
    }

    return [
        ...snapshot.editor.result.statements.map(statement => ({
            tone: statement.kind === 'resultSet' ? 'success' : inferStatusTone(statement.keyword),
            label: `${statement.keyword} #${statement.index + 1}`,
            value:
                statement.kind === 'resultSet'
                    ? `${statement.rowCount} row(s) returned.`
                    : `${statement.changes} row(s) affected.`,
        })),
        ...queryMessages,
    ];
}

export function getQueryPerformance(snapshot = state) {
    const result = snapshot.editor.result;

    if (!result) {
        return {
            timingMs: null,
            memoryBytes: 0,
            statementCount: 0,
            rowCount: 0,
            affectedRowCount: 0,
        };
    }

    return {
        timingMs: result.timingMs ?? 0,
        memoryBytes: result.memoryBytes ?? 0,
        statementCount: result.statementCount ?? result.statements?.length ?? 0,
        rowCount: result.rows?.length ?? 0,
        affectedRowCount: result.affectedRowCount ?? 0,
    };
}

export function getCurrentStructureEntryDetail(snapshot = state) {
    const entry = getCurrentStructureEntry(snapshot);
    return entry ? snapshot.structure.detail : null;
}
