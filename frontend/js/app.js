import { renderAppShell } from './components/appShell.js';
import { renderModal } from './components/modal.js';
import { renderQueryHistoryDetail } from './components/queryHistoryDetail.js';
import { renderQueryHistoryListItem } from './components/queryHistoryPanel.js';
import { renderSidebar } from './components/sidebar.js';
import { renderStatusBar } from './components/statusBar.js';
import {
    renderTableDesignerFeedback,
    renderTableDesignerReferenceColumnOptions,
} from './components/tableDesignerEditor.js';
import { renderTableDesignerSqlPreview } from './components/tableDesignerSqlPreview.js';
import {
    mountStructureGraph,
    teardownStructureGraph,
    resetPersistedStructureGraphState,
} from './components/structureGraph.js';
import {
    exportQueryChartAsPng,
    mountQueryChartRenderer,
    teardownQueryChartRenderer,
} from './components/queryChartRenderer.js';
import { renderToasts } from './components/toast.js';
import { renderTopNav } from './components/topNav.js';
import { createRouter } from './router.js';
import {
    createActiveConnectionBackup,
    downloadBackup,
    createSettingsApiToken,
    chooseOpenDatabasePath,
    chooseCreateDatabasePath,
    createDocument,
    createDocumentFromMarkdownExport,
    clearCurrentQuery,
    clearDataRowSelection,
    clearEditorRowSelection,
    clearEditorResults,
    clearQueryHistorySelection,
    clearConnectionTagFilters,
    closeModal,
    checkSettingsAppVersion,
    dismissMediaTaggingIssue,
    dismissToast,
    executeCurrentQuery,
    duplicateCurrentDataTableAsTable,
    exportCurrentDataTableFormat,
    duplicateCurrentQueryAsTable,
    exportCurrentQueryFormat,
    getState,
    initializeApp,
    insertMarkdownIntoLastOpenDocument,
    loadMoreQueryHistory,
    loadMoreLogs,
    openModal,
    openOverviewInFinder,
    openQueryHistoryInEditor,
    openDeleteDataRowModal,
    openDeleteEditorRowModal,
    openDeleteQueryHistoryModal,
    openDeleteSettingsApiTokenModal,
    openCreateBackupModal,
    openEditBackupModal,
    openBackupDiffDrawer,
    closeBackupDiffDrawer,
    openGenerateTypesModal,
    openDeleteBackupModal,
    openRestoreBackupModal,
    openDeleteQueryChartModal,
    openDataExportModal,
    openGenerateDataModal,
    openDeleteDocumentModal,
    openQueryExportModal,
    openDataRowByIdentity,
    openEditConnectionModal,
    openCreateQueryChartModal,
    openCopyColumnModal,
    openEditQueryChartModal,
    openDocumentInsertNoteModal,
    openDocumentInsertTableModal,
    preserveCurrentDataRowSelectionForReload,
    openDataRowUpdatePreview,
    openEditorRowUpdatePreview,
    refreshCurrentRoute,
    refreshLogs,
    refreshBackups,
    refreshMediaTaggingPreview,
    removeConnection,
    removeCurrentMediaTag,
    resetMediaTaggingQueriesToDefault,
    resetSkippedMediaTaggingItems,
    runQueryHistoryItem,
    skipCurrentMediaTaggingItem,
    saveCurrentQueryChartDraft,
    saveCurrentDocument,
    saveCurrentMediaTaggingConfig,
    selectDataRow,
    selectEditorRow,
    selectConnection,
    selectQueryHistoryItem,
    selectStructureEntry,
    setDocumentsSearchQuery,
    setConnectionSearchQuery,
    setLogFilter,
    setLogSearchInput,
    applyLogSearch,
    setTableDesignerSearchQuery,
    setTableDesignerSqlPreviewVisibility,
    toggleTableDesignerTablesPanel,
    setDataTableSearchQuery,
    setStructureTableSearchQuery,
    toggleStructureTablesPanel,
    setDataPage,
    setDataPageSize,
    setDataFilterOperator,
    setDataSearchColumn,
    setDataSearchQuery,
    toggleDataTablesPanel,
    setCurrentQuery,
    setChartsHeightPreset,
    setChartsDetailPanelVisibility,
    setChartsHistoryTab,
    setChartsHistorySearchInput,
    setChartsHistoryPanelVisibility,
    setEditorPanelVisibility,
    setEditorTab,
    submitDeleteChartConfirmation,
    submitDeleteBackupConfirmation,
    submitDeleteDocumentConfirmation,
    submitDocumentInsertNote,
    submitDocumentInsertTable,
    submitCreateMediaTaggingTagTable,
    submitCreateMediaTaggingMappingTable,
    submitDeleteQueryHistoryConfirmation,
    submitDeleteSettingsApiTokenConfirmation,
    submitBackupSafetyChoice,
    submitCreateBackupConfirmation,
    submitEditBackupConfirmation,
    submitGenerateDataRows,
    submitRowUpdatePreviewConfirmation,
    previewGenerateDataRows,
    setQueryHistoryPanelVisibility,
    sortDataTableByColumn,
    sortEditorResultsByColumn,
    setQueryHistorySearchInput,
    setQueryHistoryTab,
    setCopyColumnModalError,
    setCopyColumnModalEditedText,
    setCopyColumnModalSubmitting,
    setBackupDiffTab,
    setRoute,
    setSettingsSection,
    saveQueryHistoryNotes,
    saveQueryHistoryTitle,
    saveCurrentTableDesignerDraft,
    toggleChartsResultsPanel,
    toggleChartsSqlPanel,
    toggleCurrentDocumentTodo,
    toggleDocumentsPanel,
    toggleDocumentsPane,
    setMediaTaggingWorkflowMediaDetailsVisible,
    setMediaTaggingWorkflowMediaRotationDegrees,
    queueTableDesignerCsvImport,
    showToast,
    storeCopyColumnPreferences,
    submitCreateConnection,
    createCurrentMediaTag,
    submitDeleteRowConfirmation,
    submitEditConnection,
    submitImportSql,
    submitOpenConnection,
    subscribe,
    toggleCurrentMediaTagSelection,
    toggleConnectionTagFilter,
    toggleQueryHistorySavedState,
    addEditConnectionTag,
    updateCurrentMediaTaggingField,
    updateCurrentMediaTaggingTagFormField,
    updateCopyColumnModalFormatField,
    updateCurrentDocumentDraftField,
    updateDocumentInsertQuerySelection,
    updateCurrentQueryChartDraftConfigField,
    updateCurrentQueryChartDraftField,
    updateCurrentTableDesignerColumnField,
    updateCurrentTableDesignerConstraintField,
    updateCurrentTableDesignerField,
    updateGenerateDataMapping,
    updateGenerateDataModal,
    updateGenerateTypesModal,
    updateEditConnectionTagQuery,
    removeEditConnectionTag,
    addCurrentTableDesignerColumn,
    applyCurrentMediaTaggingSelection,
    removeCurrentTableDesignerColumn,
} from './store.js';
import { renderChartsDetail, renderChartsView } from './views/charts.js';
import { renderBackupsView } from './views/backups.js';
import { renderConnectionsView } from './views/connections.js';
import { renderDataRowEditorPanel, renderDataView } from './views/data.js';
import { renderDocumentsView } from './views/documents.js';
import { renderEditorView } from './views/editor.js';
import { renderLandingView } from './views/landing.js';
import { renderLogsView, renderLogTable } from './views/logs.js';
import { renderMediaTaggingView } from './views/mediaTagging.js';
import { renderOverviewView } from './views/overview.js';
import { renderSettingsView } from './views/settings.js';
import { renderStructureView } from './views/structure.js';
import { renderTableAdvisorView } from './views/tableAdvisor.js';
import { renderTableDesignerView } from './views/tableDesigner.js';
import { replaceChildrenFromRenderedMarkup, replaceElementFromRenderedMarkup } from './utils/dom.js';
import {
    buildCopyColumnText,
    getCopyColumnExportMetadata,
    isMarkdownTodoCopyColumnMode,
    normalizeCopyColumnMode,
} from './utils/copyColumnExport.js';
import { formatNumber, highlightSql } from './utils/format.js';
import {
    compactPathForDisplay,
    detectFilePathValue,
    getPathTypeLabel,
} from './utils/filePathPreview.js';
import { clearInputForEscape } from './utils/inputClear.js';
import { formatSqlQuery } from './utils/sqlFormatter.js';
import {
    buildDataRowEditorJsonObject,
    buildEditorRowEditorJsonObject,
    stringifyRowEditorJson,
} from './utils/rowEditorJson.js';
import { getTimestampPreviewForField } from './utils/timestampPreview.js';
import {
    buildRowEditorSubmittedValues,
    getRowEditorValueState,
    getRowEditorValueStateLabel,
} from './utils/rowEditorValues.js';
import {
    formatTextCellCharacterCount,
    getTextCellCharacterCount,
} from './utils/textCellStats.js';
import {
    captureTableHorizontalScrollState,
    restoreTableHorizontalScrollState,
} from './utils/tableScrollState.js';

const appRoot = document.querySelector('#app');

replaceChildrenFromRenderedMarkup(appRoot, renderAppShell());

const shellRefs = {
    shell: document.querySelector('.app-shell'),
    topNav: document.querySelector('#top-nav'),
    sidebar: document.querySelector('#sidebar'),
    view: document.querySelector('#app-view'),
    panel: document.querySelector('#app-panel'),
    statusBar: document.querySelector('#status-bar'),
    modal: document.querySelector('#modal-root'),
    toast: document.querySelector('#toast-root'),
};
let lastRenderedRoutePath = null;
let lastRenderedRouteName = null;
let lastRenderedTopNavMarkup = '';
let lastRenderedSidebarMarkup = '';
let lastRenderedStatusBarMarkup = '';
let lastRenderedMainMarkup = '';
let lastRenderedPanelMarkup = '';
let lastRenderedModalMarkup = '';
let lastRenderedToastMarkup = '';
let lastRenderedChartsHistorySignature = '';
let lastRenderedChartsDetailSignature = '';
let lastRenderedChartsCardSignature = '';
let lastRenderedPanelOpen = false;
let lastRenderedLockedRoute = false;
let pendingNewTableDesignerAutofocus = false;
let pendingQueryEditorFocus = false;
let pendingMediaTaggingTagSearchFocus = false;
let documentAutosaveTimer = null;
let pendingDocumentAutosaveId = null;

const DOCUMENT_AUTOSAVE_DELAY_MS = 5000;

const APP_TITLE = 'SQLite Hub';
const ROUTE_TITLE_SEGMENTS = {
    connections: 'Connections',
    backups: 'Backups',
    overview: 'Overview',
    data: 'Data',
    tableAdvisor: 'Table Advisor',
    structure: 'Structure',
    editor: 'SQL Editor',
    editorResults: 'SQL Editor',
    charts: 'Charts',
    documents: 'Documents',
    tableDesigner: 'Table Designer',
    mediaTaggingSetup: 'Media Tagging',
    mediaTaggingQueue: 'Tagging Queue',
    settings: 'Settings',
    logs: 'Logs',
    notFound: 'Not Found',
};

function invalidateMainRenderCache() {
    lastRenderedMainMarkup = null;
}

function isSqlEditorRouteName(routeName) {
    return routeName === 'editor' || routeName === 'editorResults';
}

function resolveDocumentTitle(state) {
    if (isSqlEditorRouteName(state.route.name) && state.editor.executing) {
        return `${APP_TITLE} | Running`;
    }

    const segment = ROUTE_TITLE_SEGMENTS[state.route.name];
    return segment ? `${APP_TITLE} | ${segment}` : APP_TITLE;
}

function syncDocumentTitle(state) {
    const nextTitle = resolveDocumentTitle(state);

    if (document.title !== nextTitle) {
        document.title = nextTitle;
    }
}

function isMediaTaggingRouteName(routeName) {
    return routeName === 'mediaTaggingSetup' || routeName === 'mediaTaggingQueue';
}

function resetStructureGraphForDatabaseChange() {
    resetPersistedStructureGraphState();
}

function renderQueryHighlightMarkup(query) {
    if (query) {
        return highlightSql(query);
    }

    return '<span class="text-on-surface-variant/35">SELECT name FROM sqlite_master WHERE type = \'table\';</span>';
}

function syncQueryEditorHighlight(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) {
        return;
    }

    const layer = textarea.closest('.query-editor-layer');
    const highlightNode = layer?.querySelector('[data-query-editor-highlight]');

    if (!(highlightNode instanceof HTMLElement)) {
        return;
    }

    replaceChildrenFromRenderedMarkup(highlightNode, renderQueryHighlightMarkup(textarea.value));
}

function syncQueryEditorScroll(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) {
        return;
    }

    const layer = textarea.closest('.query-editor-layer');
    const highlightNode = layer?.querySelector('[data-query-editor-highlight]');
    const gutterNode = textarea.closest('.query-editor-shell')?.querySelector('[data-query-editor-gutter]');

    if (!(highlightNode instanceof HTMLElement)) {
        return;
    }

    highlightNode.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;

    if (gutterNode instanceof HTMLElement) {
        gutterNode.style.transform = `translateY(${-textarea.scrollTop}px)`;
    }
}

function syncMediaTagSelectionUi(input, checked) {
    if (!(input instanceof HTMLInputElement)) {
        return;
    }

    const tagOption = input.closest('.media-tagging-tag-option');
    input.checked = Boolean(checked);
    tagOption?.classList.toggle('is-selected', Boolean(checked));
    syncMediaTaggingApplyButtonUi(input);
}

function syncMediaTaggingApplyButtonUi(node) {
    if (!(node instanceof HTMLElement)) {
        return false;
    }

    const tagPanel = node.closest('.media-tagging-tag-panel');

    if (!(tagPanel instanceof HTMLElement)) {
        return false;
    }

    const applyButton = tagPanel.querySelector('[data-action="apply-media-tagging"]');

    if (!(applyButton instanceof HTMLButtonElement)) {
        return false;
    }

    const selectedCount = tagPanel.querySelectorAll('.media-tagging-tag-option__checkbox:checked').length;
    const canApply = applyButton.dataset.canApply === 'true';
    applyButton.textContent = `${selectedCount} tagged & next`;
    applyButton.disabled = !canApply || selectedCount < 1;
    return true;
}

function syncMediaTaggingCurrentMediaUi(button, detailsVisible) {
    if (!(button instanceof HTMLButtonElement)) {
        return false;
    }

    const preview = button.closest('.media-tagging-preview');

    if (!(preview instanceof HTMLElement)) {
        return false;
    }

    const nextVisible = Boolean(detailsVisible);
    const expandedLabel = button.dataset.expandedLabel || 'Hide Viewer';
    const collapsedLabel = button.dataset.collapsedLabel || 'Show Viewer';
    preview.classList.toggle('media-tagging-preview--meta-hidden', !nextVisible);
    button.classList.toggle('is-active', !nextVisible);
    button.dataset.nextValue = nextVisible ? 'false' : 'true';
    button.setAttribute('aria-expanded', nextVisible ? 'true' : 'false');
    button.setAttribute('aria-pressed', nextVisible ? 'false' : 'true');

    const icon = document.createElement('span');

    icon.className = 'material-symbols-outlined';
    icon.textContent = nextVisible ? 'visibility_off' : 'visibility';
    button.replaceChildren(icon, document.createTextNode(` ${nextVisible ? expandedLabel : collapsedLabel}`));

    return true;
}

function normalizeMediaTaggingRotationDegrees(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return (((Math.round(numericValue / 90) * 90) % 360) + 360) % 360;
}

function syncMediaTaggingMediaRotationUi(node, rotationDegrees) {
    if (!(node instanceof HTMLElement)) {
        return false;
    }

    const preview = node.closest('.media-tagging-preview');
    const target = preview?.querySelector('[data-media-tagging-rotation-target]');

    if (!(preview instanceof HTMLElement) || !(target instanceof HTMLElement)) {
        return false;
    }

    const normalizedRotation = normalizeMediaTaggingRotationDegrees(rotationDegrees);

    target.style.setProperty('--media-tagging-preview-rotation', `${normalizedRotation}deg`);
    target.dataset.rotationDegrees = String(normalizedRotation);
    target.classList.toggle('is-rotated-quarter', normalizedRotation === 90 || normalizedRotation === 270);

    const resetButton = preview.querySelector(
        '[data-action="rotate-media-tagging-current-media"][data-rotation-command="reset"]',
    );

    if (resetButton instanceof HTMLButtonElement) {
        resetButton.disabled = normalizedRotation === 0;
    }

    return true;
}

function syncMediaTaggingTagSearchUi(input) {
    if (!(input instanceof HTMLInputElement)) {
        return false;
    }

    const tagPanel = input.closest('.media-tagging-tag-panel');

    if (!(tagPanel instanceof HTMLElement)) {
        return false;
    }

    const normalizedQuery = input.value.trim().toLowerCase();
    const tagOptions = tagPanel.querySelectorAll('.media-tagging-tag-option');

    for (const tagOption of tagOptions) {
        if (!(tagOption instanceof HTMLElement)) {
            continue;
        }

        const searchText = String(tagOption.dataset.tagSearchText ?? '')
            .trim()
            .toLowerCase();
        tagOption.hidden = Boolean(normalizedQuery) && !searchText.includes(normalizedQuery);
    }

    return true;
}

function syncTableDesignerReferenceColumnOptions(sourceNode, state) {
    if (
        !(sourceNode instanceof HTMLSelectElement) ||
        sourceNode.dataset.bind !== 'table-designer-column-field' ||
        sourceNode.dataset.field !== 'referencesTable'
    ) {
        return true;
    }

    const rowNode = sourceNode.closest('.table-designer-grid__row');
    const referenceColumnSelect = rowNode?.querySelector(
        '[data-bind="table-designer-column-field"][data-field="referencesColumn"]',
    );
    const column = state.tableDesigner.draft?.columns.find(item => item.id === sourceNode.dataset.columnId);

    if (!(referenceColumnSelect instanceof HTMLSelectElement) || !column) {
        return false;
    }

    replaceChildrenFromRenderedMarkup(
        referenceColumnSelect,
        renderTableDesignerReferenceColumnOptions(
            state.tableDesigner.draft,
            state.tableDesigner.tables ?? [],
            column.referencesTable,
            column.referencesColumn,
        ),
    );
    referenceColumnSelect.value = column.referencesColumn ?? '';
    return true;
}

function syncTableDesignerDraftUi(sourceNode) {
    const state = getState();
    const draft = state.tableDesigner.draft;

    if (state.route.name !== 'tableDesigner' || !draft) {
        return false;
    }

    let synced = syncTableDesignerReferenceColumnOptions(sourceNode, state);

    const saveButton = shellRefs.view.querySelector('[data-table-designer-save-button]');
    if (saveButton instanceof HTMLButtonElement) {
        saveButton.disabled = !draft.canSave;
    } else {
        synced = false;
    }

    const feedbackNode = shellRefs.view.querySelector('[data-table-designer-feedback]');
    if (feedbackNode instanceof HTMLElement) {
        replaceChildrenFromRenderedMarkup(
            feedbackNode,
            renderTableDesignerFeedback(draft, state.tableDesigner.saveError),
        );
    } else {
        synced = false;
    }

    const previewNode = shellRefs.view.querySelector('.table-designer-workspace__bottom');
    if (previewNode instanceof HTMLElement) {
        previewNode.classList.toggle('is-collapsed', !state.tableDesigner.sqlPreviewVisible);
        replaceChildrenFromRenderedMarkup(
            previewNode,
            renderTableDesignerSqlPreview(draft, state.tableDesigner.sqlPreviewVisible),
        );
    } else {
        synced = false;
    }

    if (synced) {
        lastRenderedMainMarkup = renderTableDesignerView(state).main;
        lastRenderedPanelMarkup = '';
    }

    return synced;
}

function syncDataRowSelectionUi(selectedRowIndex = null) {
    if (getState().route.name !== 'data') {
        return false;
    }

    const rowNodes = shellRefs.view.querySelectorAll('[data-action="select-data-row"][data-row-index]');

    for (const rowNode of rowNodes) {
        if (!(rowNode instanceof HTMLElement)) {
            continue;
        }

        rowNode.classList.toggle('is-selected', rowNode.dataset.rowIndex === String(selectedRowIndex));
    }

    const panelMarkup = renderDataRowEditorPanel(getState());
    const panelOpen = Boolean(panelMarkup);

    replaceChildrenFromRenderedMarkup(shellRefs.panel, panelMarkup);
    shellRefs.shell.classList.toggle('panel-open', panelOpen);
    lastRenderedPanelMarkup = panelMarkup;
    lastRenderedPanelOpen = panelOpen;
    return true;
}

function syncQueryHistoryUi(historyId) {
    const state = getState();
    const numericId = Number(historyId);

    if (!Number.isInteger(numericId) || numericId < 1) {
        return false;
    }

    const historyItem =
        state.editor.history.find(entry => Number(entry.id) === numericId) ?? state.editor.historyDetail ?? null;
    const listItemNode = shellRefs.view
        .querySelector(
            ['[data-action="select-query-history-item"][data-history-id="', String(numericId), '"]'].join(''),
        )
        ?.closest('.query-history-item');

    if (historyItem && listItemNode instanceof HTMLElement) {
        replaceElementFromRenderedMarkup(
            listItemNode,
            renderQueryHistoryListItem(historyItem, state.editor.historyActiveId, state.editor.historySelectedId),
        );
    }

    if (state.editor.historySelectedId === numericId) {
        const panelMarkup = renderQueryHistoryDetail({
            item: state.editor.historyDetail,
            runs: state.editor.historyRuns,
            loading: state.editor.historyDetailLoading,
            error: state.editor.historyDetailError,
        });
        const panelOpen = Boolean(panelMarkup);

        replaceChildrenFromRenderedMarkup(shellRefs.panel, panelMarkup);
        shellRefs.shell.classList.toggle('panel-open', panelOpen);
        lastRenderedPanelMarkup = panelMarkup;
        lastRenderedPanelOpen = panelOpen;
    }

    return true;
}

function syncQueryHistorySelectionUi(selectedHistoryId = null) {
    const historyButtons = shellRefs.view.querySelectorAll(
        '[data-action="select-query-history-item"][data-history-id]',
    );

    for (const button of historyButtons) {
        if (!(button instanceof HTMLElement) || !button.classList.contains('query-history-icon-button')) {
            continue;
        }

        button.classList.toggle('is-active', button.dataset.historyId === String(selectedHistoryId));
    }

    if (selectedHistoryId === null) {
        shellRefs.panel.replaceChildren();
        shellRefs.shell.classList.remove('panel-open');
        lastRenderedPanelMarkup = '';
        lastRenderedPanelOpen = false;
    }

    return true;
}

function isEditorRouteName(routeName) {
    return routeName === 'editor' || routeName === 'editorResults';
}

function captureQueryHistoryScrollState() {
    if (!isEditorRouteName(lastRenderedRouteName)) {
        return null;
    }

    const scrollNode = shellRefs.view.querySelector('[data-query-history-scroll]');

    if (!(scrollNode instanceof HTMLElement)) {
        return null;
    }

    return {
        committedSearch: scrollNode.dataset.queryHistoryCommittedSearch ?? '',
        historyTab: scrollNode.dataset.queryHistoryTab ?? '',
        routeName: lastRenderedRouteName,
        renderedItemCount: scrollNode.querySelectorAll('.query-history-item').length,
        renderedLoadingMore: scrollNode.dataset.queryHistoryLoadingMore === 'true',
        searchInput: scrollNode.dataset.queryHistorySearch ?? '',
        scrollLeft: scrollNode.scrollLeft,
        scrollTop: scrollNode.scrollTop,
    };
}

function shouldRestoreQueryHistoryScroll(snapshot, state) {
    if (!snapshot || !isEditorRouteName(state.route.name) || snapshot.routeName !== state.route.name) {
        return false;
    }

    if (!state.editor.historyPanelVisible) {
        return false;
    }

    if (
        snapshot.historyTab !== state.editor.historyTab ||
        snapshot.searchInput !== state.editor.historySearchInput ||
        snapshot.committedSearch !== state.editor.historySearch
    ) {
        return false;
    }

    return (
        state.editor.historyLoadingMore ||
        snapshot.renderedLoadingMore ||
        state.editor.history.length > snapshot.renderedItemCount
    );
}

function restoreQueryHistoryScrollState(snapshot) {
    const scrollNode = shellRefs.view.querySelector('[data-query-history-scroll]');

    if (!(scrollNode instanceof HTMLElement)) {
        return false;
    }

    scrollNode.scrollLeft = snapshot.scrollLeft;
    scrollNode.scrollTop = snapshot.scrollTop;
    return true;
}

function buildChartsHistorySignature(state) {
    if (state.route.name !== 'charts') {
        return '';
    }

    const historyVisible = state.charts.historyPanelVisible !== false || !state.charts.selectedHistoryId;

    if (!historyVisible) {
        return 'charts-history:hidden';
    }

    const queries = state.charts.queries ?? [];

    if (!queries.length) {
        if (state.charts.loading) {
            return 'charts-history:loading-empty';
        }

        if (state.charts.error) {
            return `charts-history:error:${state.charts.error.code}:${state.charts.error.message}`;
        }

        return 'charts-history:empty';
    }

    return JSON.stringify({
        detailPanelVisible: Boolean(state.charts.detailPanelVisible),
        detailPanelHistoryId: state.charts.detailPanelVisible ? state.charts.selectedHistoryId : null,
        tab: state.charts.historyTab ?? 'recent',
        searchInput: state.charts.historySearchInput ?? '',
        search: state.charts.historySearch ?? '',
        queries: queries.map(item => [
            item.id,
            item.displayTitle,
            item.previewSql,
            Boolean(item.isSaved),
            Array.isArray(item.chartTypes) ? item.chartTypes.join(',') : '',
        ]),
    });
}

const chartSignatureObjectIds = new WeakMap();
let nextChartSignatureObjectId = 1;

function getChartSignatureObjectId(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    if (!chartSignatureObjectIds.has(value)) {
        chartSignatureObjectIds.set(value, nextChartSignatureObjectId);
        nextChartSignatureObjectId += 1;
    }

    return chartSignatureObjectIds.get(value);
}

function buildChartsCardSignature(state) {
    if (state.route.name !== 'charts' || !state.charts.selectedHistoryId || !state.charts.detail?.item) {
        return '';
    }

    const charts = state.charts.detail?.charts ?? [];

    return JSON.stringify({
        selectedHistoryId: state.charts.selectedHistoryId,
        chartHeightPreset: state.charts.chartHeightPreset ?? 'medium',
        resultObjectId: getChartSignatureObjectId(state.charts.result),
        resultLoading: Boolean(state.charts.resultLoading),
        resultError: state.charts.resultError
            ? [state.charts.resultError.code ?? '', state.charts.resultError.message ?? '']
            : null,
        charts: charts.map(chart => [
            chart.id,
            chart.name,
            chart.chartType,
            JSON.stringify(chart.config ?? {}),
        ]),
    });
}

function buildChartsDetailSignature(state) {
    if (state.route.name !== 'charts') {
        return '';
    }

    const detail = state.charts.detail;
    const historyVisible = state.charts.historyPanelVisible !== false || !state.charts.selectedHistoryId;

    return JSON.stringify({
        selectedHistoryId: state.charts.selectedHistoryId ?? null,
        historyVisible,
        detailLoading: Boolean(state.charts.detailLoading),
        detailError: state.charts.detailError
            ? [state.charts.detailError.code ?? '', state.charts.detailError.message ?? '']
            : null,
        hasDetailItem: Boolean(detail?.item),
        displayTitle: detail?.item?.displayTitle ?? '',
        cards: buildChartsCardSignature(state),
    });
}

function syncChartsHistorySelectionUi(state) {
    const selectedHistoryId = String(state.charts.selectedHistoryId ?? '');
    const historyButtons = shellRefs.view.querySelectorAll(
        '.charts-view__sidebar [data-action="navigate"][data-history-id]',
    );

    for (const button of historyButtons) {
        if (!(button instanceof HTMLElement)) {
            continue;
        }

        const itemNode = button.closest('[data-charts-history-item]');
        const isSelected = button.dataset.historyId === selectedHistoryId;
        const selectionNode = itemNode instanceof HTMLElement ? itemNode : button;

        selectionNode.classList.toggle('is-active', isSelected);
        button.classList.toggle('is-active', isSelected);
    }

    return true;
}

function syncChartsSavedToggleButtonUi(button, nextValue) {
    button.classList.toggle('is-active', nextValue);
    button.dataset.nextValue = nextValue ? 'false' : 'true';
    button.title = nextValue ? 'Remove from saved' : 'Save query';

    const iconNode = button.querySelector('.material-symbols-outlined');
    if (iconNode instanceof HTMLElement) {
        iconNode.textContent = nextValue ? 'bookmark' : 'bookmark_add';
    }

    const labelNode = button.querySelector('[data-charts-saved-label]');
    if (labelNode instanceof HTMLElement) {
        labelNode.textContent = nextValue ? 'Unsave' : 'Save';
    }
}

function syncChartsSavedToggleUi(actionNode, nextValue) {
    const historyId = actionNode.dataset.historyId;
    const relatedButtons = [
        actionNode,
        ...shellRefs.view.querySelectorAll('[data-action="toggle-charts-query-history-saved"][data-history-id]'),
        ...shellRefs.panel.querySelectorAll('[data-action="toggle-charts-query-history-saved"][data-history-id]'),
    ].filter((button, index, buttons) => {
        return (
            button instanceof HTMLElement &&
            button.dataset.historyId === historyId &&
            buttons.indexOf(button) === index
        );
    });

    for (const button of relatedButtons) {
        syncChartsSavedToggleButtonUi(button, nextValue);

        const itemNode = button.closest('[data-charts-history-item]');
        const historyTab = getState().charts.historyTab;
        if (
            itemNode instanceof HTMLElement &&
            ((historyTab === 'saved' && !nextValue) || (historyTab === 'unsaved' && nextValue))
        ) {
            itemNode.remove();
        }
    }

    for (const badgeNode of [
        ...shellRefs.view.querySelectorAll('[data-charts-saved-badge][data-history-id]'),
        ...shellRefs.panel.querySelectorAll('[data-charts-saved-badge][data-history-id]'),
    ]) {
        if (badgeNode instanceof HTMLElement && badgeNode.dataset.historyId === historyId) {
            badgeNode.toggleAttribute('hidden', !nextValue);
        }
    }

    const countNode = shellRefs.view.querySelector('[data-charts-history-count]');
    if (countNode instanceof HTMLElement) {
        countNode.textContent = String(shellRefs.view.querySelectorAll('[data-charts-history-item]').length);
    }
}

function renderChartsMainIntoScratch(state) {
    const scratch = document.createElement('div');

    replaceChildrenFromRenderedMarkup(scratch, renderChartsView(state).main);
    return scratch;
}

function patchChartsHistoryUi(state) {
    const chartsView = shellRefs.view.querySelector('.charts-view');

    if (!(chartsView instanceof HTMLElement)) {
        return false;
    }

    const currentSidebar = chartsView.querySelector('.charts-view__sidebar');
    const scratch = renderChartsMainIntoScratch(state);
    const nextSidebar = scratch.querySelector('.charts-view__sidebar');

    if (!currentSidebar && !nextSidebar) {
        return true;
    }

    if (!(currentSidebar instanceof HTMLElement) || !(nextSidebar instanceof HTMLElement)) {
        return false;
    }

    currentSidebar.replaceWith(nextSidebar);
    return true;
}

function renderChartsDetailIntoScratch(state) {
    const scratch = document.createElement('div');

    replaceChildrenFromRenderedMarkup(scratch, renderChartsDetail(state));
    return scratch;
}

function replaceChartsDetailSection(detailNode, scratchNode, selector) {
    const currentNode = detailNode.querySelector(selector);
    const nextNode = scratchNode.querySelector(selector);

    if (!(currentNode instanceof HTMLElement) || !(nextNode instanceof HTMLElement)) {
        return false;
    }

    currentNode.replaceWith(nextNode);
    return true;
}

function patchChartsDetailUi(state, { preserveCharts = false } = {}) {
    const chartsView = shellRefs.view.querySelector('.charts-view');
    const detailNode = chartsView?.querySelector('.charts-view__detail');

    if (!(chartsView instanceof HTMLElement) || !(detailNode instanceof HTMLElement)) {
        return false;
    }

    const historyVisible = state.charts.historyPanelVisible !== false || !state.charts.selectedHistoryId;
    const sidebarNode = chartsView.querySelector('.charts-view__sidebar');

    if (Boolean(sidebarNode) !== historyVisible) {
        return false;
    }

    if (preserveCharts) {
        const scratch = renderChartsDetailIntoScratch(state);
        const patched = replaceChartsDetailSection(detailNode, scratch, '[data-charts-detail-header]');

        if (!patched) {
            return false;
        }
    } else {
        replaceChildrenFromRenderedMarkup(detailNode, renderChartsDetail(state));
    }

    syncChartsHistorySelectionUi(state);
    return true;
}

function getLogsActiveDatabaseId(state) {
    return String(state.connections?.active?.id ?? state.logs?.metadata?.activeDatabase?.id ?? '');
}

function syncLogsFilterControls(state) {
    const filters = state.logs?.filters ?? {};

    for (const button of shellRefs.view.querySelectorAll('[data-action="set-log-filter"][data-field][data-value]')) {
        if (!(button instanceof HTMLElement)) {
            continue;
        }

        const field = button.dataset.field;
        const value = button.dataset.value;
        const active = String(filters[field] ?? '') === String(value ?? '');

        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
}

function syncLogsMetaStrip(state) {
    const logs = state.logs ?? {};
    const values = {
        visible: formatNumber((logs.items ?? []).length),
        matched: formatNumber(logs.total ?? 0),
        scope: logs.metadata?.activeDatabase?.label ?? 'Active Database',
    };

    for (const [key, value] of Object.entries(values)) {
        const node = shellRefs.view.querySelector(`[data-logs-meta="${key}"]`);

        if (node instanceof HTMLElement) {
            node.textContent = value;
            node.title = value;
        }
    }
}

function patchLogsTableUi(state) {
    const logsView = shellRefs.view.querySelector('[data-logs-view]');

    if (!(logsView instanceof HTMLElement)) {
        return false;
    }

    const activeDatabaseId = getLogsActiveDatabaseId(state);

    if (String(logsView.dataset.logsActiveDatabaseId ?? '') !== activeDatabaseId) {
        return false;
    }

    const currentTable = logsView.querySelector('[data-logs-table]');

    if (!(currentTable instanceof HTMLElement)) {
        return false;
    }

    const currentScrollNode = currentTable.querySelector('[data-logs-table-scroll]');
    const scrollState =
        currentScrollNode instanceof HTMLElement
            ? {
                  left: currentScrollNode.scrollLeft,
                  top: currentScrollNode.scrollTop,
              }
            : null;
    const patched = replaceElementFromRenderedMarkup(currentTable, renderLogTable(state.logs ?? {}));

    if (!patched) {
        return false;
    }

    if (scrollState) {
        const nextScrollNode = logsView.querySelector('[data-logs-table-scroll]');

        if (nextScrollNode instanceof HTMLElement) {
            nextScrollNode.scrollLeft = scrollState.left;
            nextScrollNode.scrollTop = scrollState.top;
        }
    }

    syncLogsFilterControls(state);
    syncLogsMetaStrip(state);
    return true;
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const result = String(reader.result ?? '');
            const markerIndex = result.indexOf(',');
            resolve(markerIndex >= 0 ? result.slice(markerIndex + 1) : result);
        };
        reader.onerror = () => {
            reject(reader.error ?? new Error('The selected logo could not be read.'));
        };

        reader.readAsDataURL(file);
    });
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            resolve(String(reader.result ?? ''));
        };
        reader.onerror = () => {
            reject(reader.error ?? new Error('The selected file could not be read.'));
        };

        reader.readAsText(file);
    });
}

function clearDocumentAutosaveTimer() {
    if (documentAutosaveTimer !== null) {
        window.clearTimeout(documentAutosaveTimer);
    }

    documentAutosaveTimer = null;
    pendingDocumentAutosaveId = null;
}

function scheduleDocumentAutosave(documentId) {
    clearDocumentAutosaveTimer();

    if (!documentId) {
        return;
    }

    pendingDocumentAutosaveId = String(documentId);
    documentAutosaveTimer = window.setTimeout(async () => {
        const state = getState();
        const scheduledDocumentId = pendingDocumentAutosaveId;

        documentAutosaveTimer = null;
        pendingDocumentAutosaveId = null;

        if (
            state.route.name !== 'documents' ||
            String(state.documents.selectedId ?? '') !== scheduledDocumentId ||
            !state.documents.dirty
        ) {
            return;
        }

        if (state.documents.saving) {
            scheduleDocumentAutosave(scheduledDocumentId);
            return;
        }

        if (state.documents.deleting) {
            return;
        }

        await saveCurrentDocument({ toast: false });
    }, DOCUMENT_AUTOSAVE_DELAY_MS);
}

async function buildConnectionLogoUpload(file) {
    if (!(file instanceof File) || !file.size) {
        return null;
    }

    return {
        fileName: file.name,
        mimeType: file.type,
        base64: await readFileAsBase64(file),
    };
}

function renderNotFoundView() {
    return {
        main: `
      <section class="landing-view machined-grid px-6">
        <div class="text-center z-10">
          <p class="font-mono text-[10px] uppercase tracking-[0.3em] text-primary-container/40">
            ROUTE_LOST // HASH_NOT_RECOGNIZED
          </p>
          <h1 class="mt-4 font-body text-6xl font-black uppercase tracking-tight text-primary-container">
            404_SIGNAL
          </h1>
          <button
            class="standard-button mt-8 px-6 font-body text-sm"
            data-action="navigate"
            data-to="/"
            type="button"
          >
            Return_Home
          </button>
        </div>
      </section>
    `,
        panel: '',
    };
}

function resolveView(state) {
    switch (state.route.name) {
        case 'landing':
            return renderLandingView(state);
        case 'connections':
            return renderConnectionsView(state);
        case 'backups':
            return renderBackupsView(state);
        case 'overview':
            return renderOverviewView(state);
        case 'charts':
            return renderChartsView(state);
        case 'documents':
            return renderDocumentsView(state);
        case 'data':
            return renderDataView(state);
        case 'editor':
            return renderEditorView(state, { isResultsRoute: false });
        case 'editorResults':
            return renderEditorView(state, { isResultsRoute: true });
        case 'structure':
            return renderStructureView(state);
        case 'tableDesigner':
            return renderTableDesignerView(state);
        case 'tableAdvisor':
            return renderTableAdvisorView(state);
        case 'mediaTaggingSetup':
            return renderMediaTaggingView(state, { subView: 'setup' });
        case 'mediaTaggingQueue':
            return renderMediaTaggingView(state, { subView: 'queue' });
        case 'settings':
            return renderSettingsView(state);
        case 'logs':
            return renderLogsView(state);
        default:
            return renderNotFoundView();
    }
}

function captureFocusedInputState() {
    const activeElement = document.activeElement;

    if (
        !activeElement ||
        !(
            activeElement instanceof HTMLInputElement ||
            activeElement instanceof HTMLTextAreaElement ||
            activeElement instanceof HTMLSelectElement
        )
    ) {
        return null;
    }

    const { bind } = activeElement.dataset;
    if (!bind) {
        return null;
    }

    return {
        bind,
        field: activeElement.dataset.field ?? null,
        columnId: activeElement.dataset.columnId ?? null,
        selectionStart: activeElement.selectionStart,
        selectionEnd: activeElement.selectionEnd,
        selectionDirection: activeElement.selectionDirection,
        scrollTop: activeElement.scrollTop,
        scrollLeft: activeElement.scrollLeft,
    };
}

function buildFocusedInputSelectors(snapshot) {
    if (!snapshot?.bind) {
        return [];
    }

    const selectors = [];
    const bindSelector = `[data-bind="${CSS.escape(snapshot.bind)}"]`;

    if (snapshot.columnId && snapshot.field) {
        selectors.push(
            `${bindSelector}[data-column-id="${CSS.escape(snapshot.columnId)}"][data-field="${CSS.escape(snapshot.field)}"]`,
        );
    }

    if (snapshot.field) {
        selectors.push(`${bindSelector}[data-field="${CSS.escape(snapshot.field)}"]`);
    }

    if (snapshot.columnId) {
        selectors.push(`${bindSelector}[data-column-id="${CSS.escape(snapshot.columnId)}"]`);
    }

    selectors.push(bindSelector);
    return selectors;
}

function restoreFocusedInputState(snapshot) {
    if (!snapshot) {
        return false;
    }

    const nextElement = buildFocusedInputSelectors(snapshot)
        .map(selector => document.querySelector(selector))
        .find(
            candidate =>
                candidate instanceof HTMLInputElement ||
                candidate instanceof HTMLTextAreaElement ||
                candidate instanceof HTMLSelectElement,
        );

    if (
        !nextElement ||
        !(
            nextElement instanceof HTMLInputElement ||
            nextElement instanceof HTMLTextAreaElement ||
            nextElement instanceof HTMLSelectElement
        )
    ) {
        return false;
    }

    nextElement.focus({ preventScroll: true });

    if (
        (nextElement instanceof HTMLInputElement || nextElement instanceof HTMLTextAreaElement) &&
        typeof snapshot.selectionStart === 'number' &&
        typeof snapshot.selectionEnd === 'number'
    ) {
        nextElement.setSelectionRange(
            snapshot.selectionStart,
            snapshot.selectionEnd,
            snapshot.selectionDirection || 'none',
        );
    }

    nextElement.scrollTop = snapshot.scrollTop;
    nextElement.scrollLeft = snapshot.scrollLeft;
    return true;
}

function focusNewTableDesignerNameField() {
    const input = document.querySelector('[data-bind="table-designer-field"][data-field="tableName"]');

    if (!(input instanceof HTMLInputElement)) {
        return false;
    }

    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    return true;
}

function focusTableDesignerColumnNameField(columnId) {
    if (!columnId) {
        return false;
    }

    const input = document.querySelector(
        `[data-bind="table-designer-column-field"][data-column-id="${CSS.escape(columnId)}"][data-field="name"]`,
    );

    if (!(input instanceof HTMLInputElement)) {
        return false;
    }

    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    return true;
}

function focusQueryEditorInput() {
    const input = document.querySelector('[data-bind="current-query"]');

    if (!(input instanceof HTMLTextAreaElement)) {
        return false;
    }

    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    return true;
}

function focusMediaTaggingTagSearchInput() {
    const input = document.querySelector('[data-bind="media-tagging-tag-search"]');

    if (!(input instanceof HTMLInputElement)) {
        return false;
    }

    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    return true;
}

function syncSidebarActiveRoute(routeName) {
    if (!isMediaTaggingRouteName(routeName)) {
        return false;
    }

    const mediaTaggingLink = shellRefs.sidebar.querySelector('a.sidebar-link[data-group="mediaTagging"]');
    const setupLink = shellRefs.sidebar.querySelector('a.sidebar-sublink[href="#/media-tagging"]');
    const queueLink = shellRefs.sidebar.querySelector('a.sidebar-sublink[href="#/media-tagging/queue"]');

    if (
        !(mediaTaggingLink instanceof HTMLAnchorElement) ||
        !(setupLink instanceof HTMLAnchorElement) ||
        !(queueLink instanceof HTMLAnchorElement)
    ) {
        return false;
    }

    mediaTaggingLink.classList.add('is-active');
    setupLink.classList.toggle('is-active', routeName === 'mediaTaggingSetup');
    queueLink.classList.toggle('is-active', routeName === 'mediaTaggingQueue');
    return true;
}

async function applyMediaTaggingAndFocusSearch() {
    pendingMediaTaggingTagSearchFocus = true;
    const result = await applyCurrentMediaTaggingSelection();

    if (!result) {
        pendingMediaTaggingTagSearchFocus = false;
    }

    return result;
}

async function handleTableDesignerCsvImport(fileInput) {
    if (!(fileInput instanceof HTMLInputElement)) {
        return;
    }

    const file = fileInput.files?.[0];

    if (!(file instanceof File)) {
        return;
    }

    if (!file.size) {
        showToast('The selected CSV file is empty.', 'alert');
        fileInput.value = '';
        return;
    }

    try {
        const csvText = await readFileAsText(file);
        const imported = queueTableDesignerCsvImport(file.name, csvText);

        if (!imported) {
            return;
        }

        router.navigate('/table-designer/new');
        showToast(
            `Imported ${imported.columnCount} columns and ${imported.importedRowCount} row${
                imported.importedRowCount === 1 ? '' : 's'
            } from ${file.name}.`,
            'success',
        );
    } catch (error) {
        showToast(error?.message || 'CSV import failed.', 'alert');
    } finally {
        fileInput.value = '';
    }
}

async function handleDocumentMarkdownImport(fileInput) {
    if (!(fileInput instanceof HTMLInputElement)) {
        return;
    }

    const file = fileInput.files?.[0];

    if (!(file instanceof File)) {
        return;
    }

    try {
        const content = await readFileAsText(file);
        const document = await createDocumentFromMarkdownExport({
            filename: file.name,
            content,
        });

        if (!document?.id) {
            showToast('Markdown document could not be imported.', 'alert');
            return;
        }

        clearDocumentAutosaveTimer();
        showToast(`Document "${document.filename}" imported.`, 'success');
        router.navigate(`/documents/${encodeURIComponent(document.id)}`);
    } catch (error) {
        showToast(error?.message || 'Markdown import failed.', 'alert');
    } finally {
        fileInput.value = '';
    }
}

function renderApp(state) {
    syncDocumentTitle(state);

    const previousRoutePath = lastRenderedRoutePath;
    const previousRouteName = lastRenderedRouteName;
    const { main, panel } = resolveView(state);
    const topNavMarkup = renderTopNav(state);
    const sidebarMarkup = renderSidebar(state);
    const statusBarMarkup = renderStatusBar(state);
    const modalMarkup = renderModal(state);
    const toastMarkup = renderToasts(state.toasts);
    const chartsHistorySignature = buildChartsHistorySignature(state);
    const chartsDetailSignature = buildChartsDetailSignature(state);
    const chartsCardSignature = buildChartsCardSignature(state);
    const isLockedRoute = [
        'editor',
        'editorResults',
        'data',
        'charts',
        'logs',
        'documents',
        'structure',
        'tableDesigner',
        'tableAdvisor',
        'mediaTaggingSetup',
        'mediaTaggingQueue',
    ].includes(state.route.name);
    const panelOpen = Boolean(panel);
    const topNavChanged = topNavMarkup !== lastRenderedTopNavMarkup;
    const sidebarChanged = sidebarMarkup !== lastRenderedSidebarMarkup;
    const statusBarChanged = statusBarMarkup !== lastRenderedStatusBarMarkup;
    const mainChanged = main !== lastRenderedMainMarkup;
    const panelChanged = panel !== lastRenderedPanelMarkup;
    const modalChanged = modalMarkup !== lastRenderedModalMarkup;
    const chartsHistoryChanged = chartsHistorySignature !== lastRenderedChartsHistorySignature;
    const chartsDetailChanged = chartsDetailSignature !== lastRenderedChartsDetailSignature;
    const chartsCardsChanged = chartsCardSignature !== lastRenderedChartsCardSignature;
    const panelOpenChanged = panelOpen !== lastRenderedPanelOpen;
    const lockedRouteChanged = isLockedRoute !== lastRenderedLockedRoute;
    const shellMarkupUnchanged =
        state.route.path === lastRenderedRoutePath &&
        !topNavChanged &&
        !sidebarChanged &&
        !statusBarChanged &&
        !mainChanged &&
        !panelChanged &&
        !modalChanged &&
        !panelOpenChanged &&
        !lockedRouteChanged;

    if (shellMarkupUnchanged && toastMarkup !== lastRenderedToastMarkup) {
        replaceChildrenFromRenderedMarkup(shellRefs.toast, toastMarkup);
        lastRenderedToastMarkup = toastMarkup;
        return;
    }

    if (shellMarkupUnchanged && toastMarkup === lastRenderedToastMarkup) {
        return;
    }

    const focusedInput = captureFocusedInputState();
    const queryHistoryScrollState = captureQueryHistoryScrollState();
    const tableHorizontalScrollState = captureTableHorizontalScrollState({
        routeName: lastRenderedRouteName,
        scrollNodes: shellRefs.view.querySelectorAll('[data-table-horizontal-scroll]'),
    });
    const isEnteringNewTableDesignerRoute =
        state.route.name === 'tableDesigner' && state.route.params?.isNew && previousRoutePath !== state.route.path;

    if (isEnteringNewTableDesignerRoute) {
        pendingNewTableDesignerAutofocus = true;
    } else if (state.route.name !== 'tableDesigner' || !state.route.params?.isNew) {
        pendingNewTableDesignerAutofocus = false;
    }

    const canPatchChartsMain = mainChanged && previousRouteName === 'charts' && state.route.name === 'charts';
    const canPatchLogsMain = mainChanged && previousRouteName === 'logs' && state.route.name === 'logs';
    let mainPatched = false;
    let preservedChartsDom = false;

    if (canPatchChartsMain) {
        const historyPatched = !chartsHistoryChanged || patchChartsHistoryUi(state);

        if (historyPatched) {
            if (chartsDetailChanged) {
                if (chartsCardsChanged) {
                    teardownQueryChartRenderer();
                }

                preservedChartsDom = !chartsCardsChanged;
                mainPatched = patchChartsDetailUi(state, { preserveCharts: preservedChartsDom });
            } else {
                preservedChartsDom = true;
                mainPatched = syncChartsHistorySelectionUi(state);
            }
        }

        if (!mainPatched) {
            preservedChartsDom = false;
        }
    }

    if (!mainPatched && canPatchLogsMain) {
        mainPatched = patchLogsTableUi(state);
    }

    if (mainChanged) {
        if (!mainPatched) {
            teardownStructureGraph();
            teardownQueryChartRenderer();
        }
    }

    if (topNavChanged) {
        replaceChildrenFromRenderedMarkup(shellRefs.topNav, topNavMarkup);
    }

    if (sidebarChanged) {
        const sidebarSynced =
            isMediaTaggingRouteName(previousRouteName) &&
            isMediaTaggingRouteName(state.route.name) &&
            syncSidebarActiveRoute(state.route.name);

        if (!sidebarSynced) {
            replaceChildrenFromRenderedMarkup(shellRefs.sidebar, sidebarMarkup);
        }
    }

    if (statusBarChanged) {
        replaceChildrenFromRenderedMarkup(shellRefs.statusBar, statusBarMarkup);
    }

    if (mainChanged && !mainPatched) {
        replaceChildrenFromRenderedMarkup(shellRefs.view, main);
    }

    if (mainChanged || lockedRouteChanged) {
        shellRefs.view.classList.toggle('app-main-scroll--locked', isLockedRoute);
    }

    if (panelChanged) {
        replaceChildrenFromRenderedMarkup(shellRefs.panel, panel);
    }

    if (modalChanged) {
        replaceChildrenFromRenderedMarkup(shellRefs.modal, modalMarkup);
    }

    if (toastMarkup !== lastRenderedToastMarkup) {
        replaceChildrenFromRenderedMarkup(shellRefs.toast, toastMarkup);
    }

    if (panelChanged || panelOpenChanged) {
        shellRefs.shell.classList.toggle('panel-open', panelOpen);
    }

    if (shouldRestoreQueryHistoryScroll(queryHistoryScrollState, state)) {
        restoreQueryHistoryScrollState(queryHistoryScrollState);
    }

    if (mainChanged && !mainPatched) {
        restoreTableHorizontalScrollState({
            snapshot: tableHorizontalScrollState,
            routeName: state.route.name,
            scrollNodes: shellRefs.view.querySelectorAll('[data-table-horizontal-scroll]'),
        });
    }

    if (pendingQueryEditorFocus && (state.route.name === 'editor' || state.route.name === 'editorResults')) {
        if (focusQueryEditorInput()) {
            pendingQueryEditorFocus = false;
        }
    } else if (pendingMediaTaggingTagSearchFocus && state.route.name === 'mediaTaggingQueue') {
        if (focusMediaTaggingTagSearchInput()) {
            pendingMediaTaggingTagSearchFocus = false;
        }
    } else if (
        pendingNewTableDesignerAutofocus &&
        state.route.name === 'tableDesigner' &&
        state.route.params?.isNew &&
        state.tableDesigner.draft?.mode === 'create'
    ) {
        if (focusNewTableDesignerNameField()) {
            pendingNewTableDesignerAutofocus = false;
        }
    } else {
        restoreFocusedInputState(focusedInput);
    }

    lastRenderedRoutePath = state.route.path;
    lastRenderedRouteName = state.route.name;
    lastRenderedTopNavMarkup = topNavMarkup;
    lastRenderedSidebarMarkup = sidebarMarkup;
    lastRenderedStatusBarMarkup = statusBarMarkup;
    lastRenderedMainMarkup = main;
    lastRenderedPanelMarkup = panel;
    lastRenderedModalMarkup = modalMarkup;
    lastRenderedToastMarkup = toastMarkup;
    lastRenderedChartsHistorySignature = chartsHistorySignature;
    lastRenderedChartsDetailSignature = chartsDetailSignature;
    lastRenderedChartsCardSignature = chartsCardSignature;
    lastRenderedPanelOpen = panelOpen;
    lastRenderedLockedRoute = isLockedRoute;

    if (state.route.name === 'structure') {
        mountStructureGraph(state).catch(error => {
            console.error('Failed to mount structure graph.', error);
        });
    }

    if (state.route.name === 'charts' && !preservedChartsDom) {
        mountQueryChartRenderer(state);
    }
}

const router = createRouter(route => {
    setRoute(route);
});

async function executeEditorQueryAndNavigate() {
    const success = await executeCurrentQuery();
    const activeTab = getState().editor.activeTab;
    router.navigate(success && activeTab === 'results' ? '/editor/results' : '/editor');
}

function quoteSqlIdentifier(identifier) {
    return `"${String(identifier ?? '').replace(/"/g, '""')}"`;
}

async function openTableInSqlEditor(tableName) {
    const normalizedTableName = String(tableName ?? '').trim();

    if (!normalizedTableName) {
        showToast('No table selected for SQL Editor.', 'alert');
        return;
    }

    setCurrentQuery(`SELECT * FROM ${quoteSqlIdentifier(normalizedTableName)};`);
    router.navigate('/editor');
}

function formatCurrentQuery() {
    const currentQuery = getState().editor.sqlText ?? '';
    const formattedQuery = formatSqlQuery(currentQuery);

    if (!formattedQuery) {
        showToast('No SQL query to format.', 'alert');
        return;
    }

    if (formattedQuery === currentQuery) {
        focusQueryEditorInput();
        showToast('SQL query is already formatted.', 'muted');
        return;
    }

    invalidateMainRenderCache();
    setCurrentQuery(formattedQuery);

    const input = document.querySelector('[data-bind="current-query"]');

    if (input instanceof HTMLTextAreaElement) {
        input.value = formattedQuery;
        syncQueryEditorHighlight(input);
        syncQueryEditorScroll(input);
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
    } else {
        pendingQueryEditorFocus = true;
    }

    showToast('SQL query formatted.', 'success');
}

async function copyCurrentQueryToClipboard() {
    const currentQuery = getState().editor.sqlText ?? '';

    if (!currentQuery.trim()) {
        showToast('No SQL query to copy.', 'alert');
        return;
    }

    if (!navigator.clipboard?.writeText) {
        showToast('Clipboard API is not available.', 'alert');
        return;
    }

    try {
        await navigator.clipboard.writeText(currentQuery);
        showToast('SQL query copied.', 'success');
    } catch (error) {
        showToast('SQL query could not be copied.', 'alert');
    }
}

const OPENABLE_URL_PATTERN = /^https?:\/\/[^\s<>"']+$/i;

function getOpenableUrl(value) {
    const text = String(value ?? '').trim();

    if (!OPENABLE_URL_PATTERN.test(text)) {
        return null;
    }

    try {
        const url = new URL(text);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch (error) {
        return null;
    }
}

function openRowEditorUrl(actionNode) {
    const field = actionNode.closest('[data-row-editor-url-field]');
    const inputValue = field?.querySelector('[data-row-editor-url-input]')?.value;
    const url = getOpenableUrl(inputValue ?? actionNode.dataset.url);

    if (!url) {
        showToast('Field value is not a valid URL.', 'alert');
        return;
    }

    const link = document.createElement('a');

    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function getExportFilenameFromAction(actionNode) {
    const input = actionNode.closest('[data-export-modal]')?.querySelector('input[name="filename"]');
    return input instanceof HTMLInputElement ? input.value : '';
}

function syncRowEditorTimestampPreview(inputNode) {
    const fieldNode = inputNode.closest('[data-row-editor-field]');
    const previewNode = fieldNode?.querySelector('[data-row-editor-timestamp-preview]');

    if (!fieldNode || !previewNode) {
        return;
    }

    const columnName = fieldNode.dataset.rowEditorColumnName ?? '';
    const protectedKeyColumn = fieldNode.dataset.rowEditorProtectedKey === 'true';
    const tableMeta = {
        columns: [
            {
                name: columnName,
                primaryKeyPosition: protectedKeyColumn ? 1 : 0,
                foreignKey: protectedKeyColumn,
            },
        ],
        foreignKeys: [],
    };
    const preview = getTimestampPreviewForField({
        columnName,
        value: inputNode.value,
        tableMeta,
    });

    if (preview.kind !== 'timestamp') {
        previewNode.hidden = true;
        previewNode.textContent = '';
        return;
    }

    previewNode.hidden = false;
    previewNode.textContent = `Interpretiert als Datum: ${preview.formatted}`;
}

function syncRowEditorCharacterCount(inputNode) {
    const fieldNode = inputNode.closest('[data-row-editor-field]');
    const countNode = fieldNode?.querySelector('[data-row-editor-char-count]');

    if (!fieldNode || !countNode) {
        return;
    }

    const count = getTextCellCharacterCount(inputNode.value);

    if (count === null) {
        countNode.hidden = true;
        countNode.textContent = '';
        return;
    }

    countNode.hidden = false;
    countNode.textContent = formatTextCellCharacterCount(count);
}

function syncRowEditorFilePathPreview(inputNode) {
    const fieldNode = inputNode.closest('[data-row-editor-field]');
    const previewNode = fieldNode?.querySelector('[data-row-editor-filepath-preview]');

    if (!fieldNode || !previewNode) {
        return;
    }

    const columnName = fieldNode.dataset.rowEditorColumnName ?? '';
    const protectedKeyColumn = fieldNode.dataset.rowEditorProtectedKey === 'true';
    const tableMeta = {
        columns: [
            {
                name: columnName,
                primaryKeyPosition: protectedKeyColumn ? 1 : 0,
                foreignKey: protectedKeyColumn,
            },
        ],
        foreignKeys: [],
    };
    const preview = detectFilePathValue(inputNode.value, columnName, tableMeta);

    if (!preview) {
        previewNode.hidden = true;
        return;
    }

    const filenameNode = previewNode.querySelector('[data-row-editor-filepath-filename]');
    const directoryRowNode = previewNode.querySelector('[data-row-editor-filepath-directory-row]');
    const directoryNode = previewNode.querySelector('[data-row-editor-filepath-directory]');
    const extensionNode = previewNode.querySelector('[data-row-editor-filepath-extension]');
    const typeNode = previewNode.querySelector('[data-row-editor-filepath-type]');

    if (filenameNode) {
        filenameNode.textContent = preview.fileName ?? 'N/A';
    }

    if (directoryRowNode) {
        directoryRowNode.hidden = !preview.directory;
    }

    if (directoryNode) {
        directoryNode.textContent = preview.directory ? compactPathForDisplay(preview.directory, 72) : '';
        directoryNode.setAttribute('title', preview.directory ?? '');
    }

    if (extensionNode) {
        extensionNode.textContent = preview.extension ?? 'N/A';
    }

    if (typeNode) {
        typeNode.textContent = getPathTypeLabel(preview.pathType);
    }

    previewNode.hidden = false;
}

function getRowEditorValueStateClassName(state) {
    if (state === 'null') {
        return 'border px-2 py-1 text-[9px] border-primary-container/35 bg-primary-container/15 text-primary-container';
    }

    if (state === 'empty') {
        return 'border px-2 py-1 text-[9px] border-outline-variant/35 bg-surface-container-high text-on-surface-variant';
    }

    return 'border px-2 py-1 text-[9px] border-outline-variant/20 bg-surface-container text-on-surface-variant';
}

function syncRowEditorValueState(controlNode) {
    const fieldNode = controlNode.closest('[data-row-editor-field]');
    const valueInput = fieldNode?.querySelector('[data-row-editor-value-source]');
    const stateBadge = fieldNode?.querySelector('[data-row-editor-value-state]');

    if (!fieldNode || !valueInput || !stateBadge) {
        return;
    }

    const valueState = getRowEditorValueState(valueInput.value);

    valueInput.dataset.rowEditorDirty = 'true';
    stateBadge.dataset.valueState = valueState;
    stateBadge.className = getRowEditorValueStateClassName(valueState);
    stateBadge.textContent = getRowEditorValueStateLabel(valueState);

    syncRowEditorTimestampPreview(valueInput);
    syncRowEditorFilePathPreview(valueInput);
    syncRowEditorCharacterCount(valueInput);
}

function getRowEditorFieldMetadata(form) {
    return Object.fromEntries(
        Array.from(form.elements)
            .filter(element => element.name?.startsWith('field:'))
            .map(element => [
                element.name.slice('field:'.length),
                {
                    initialState: element.closest('[data-row-editor-field]')?.dataset?.rowEditorInitialState,
                    dirty: element.dataset.rowEditorDirty === 'true',
                },
            ]),
    );
}

function closeCopyColumnMenus(exceptMenu = null) {
    document.querySelectorAll('[data-copy-column-menu][open]').forEach(menu => {
        if (menu !== exceptMenu && menu instanceof HTMLDetailsElement) {
            menu.open = false;
        }
    });
}

function closeDropdownButtons(exceptDropdown = null) {
    document.querySelectorAll('[data-dropdown-button][open]').forEach(dropdown => {
        if (dropdown !== exceptDropdown && dropdown instanceof HTMLDetailsElement) {
            dropdown.open = false;
        }
    });
}

function closeSidebarDatabasePickers(exceptPicker = null) {
    document.querySelectorAll('.sidebar-db-picker[open]').forEach(picker => {
        if (picker !== exceptPicker && picker instanceof HTMLDetailsElement) {
            picker.open = false;
        }
    });
}

function openCopyColumnMenu(headerNode) {
    const menu = headerNode?.querySelector('[data-copy-column-menu]');

    if (!(menu instanceof HTMLDetailsElement)) {
        return;
    }

    closeCopyColumnMenus(menu);
    menu.open = true;
    menu.querySelector('summary')?.focus({ preventScroll: true });
}

function getCopyColumnResult(state, scope) {
    return scope === 'charts' ? state.charts.result : state.editor.result;
}

function slugifyExportFilenamePart(value, fallback = 'column') {
    const slug = String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return slug || fallback;
}

function buildCopyColumnExportFilename(columnName, copyMode) {
    const metadata = getCopyColumnExportMetadata(copyMode);
    const columnSlug = slugifyExportFilenamePart(columnName);

    return `${columnSlug}-${metadata.suffix}.${metadata.extension}`;
}

function normalizeMarkdownDownloadFilename(value) {
    let filename = String(value ?? '')
        .trim()
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/[\\/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^\.+/, '')
        .trim();

    if (!filename) {
        filename = 'document.md';
    }

    if (!/\.md$/i.test(filename)) {
        filename = `${filename}.md`;
    }

    return filename;
}

function countEditedMarkdownTodoItems(text) {
    const lines = String(text ?? '')
        .split(/\r\n|\r|\n/g)
        .filter(line => line.trim());

    return lines.length;
}

function buildDocumentTimestampSlug(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        pad(date.getHours()),
        pad(date.getMinutes()),
    ].join('-');
}

function buildCopyColumnDocumentFilename(columnName) {
    const columnSlug = slugifyExportFilenamePart(columnName);

    return `${columnSlug}-todos-${buildDocumentTimestampSlug()}.md`;
}

function buildCopyColumnDocumentContent({ state, columnName, text, valueCount }) {
    const activeConnection = state.connections.active;
    const lines = [
        `# ${columnName || 'Column'} todos`,
        '',
        `- Database: ${activeConnection?.label || 'Active database'}`,
        `- Column: ${columnName || 'N/A'}`,
        `- Items: ${valueCount}`,
        `- Generated: ${new Date().toLocaleString()}`,
        '',
    ];

    lines.push('## Todos', '', String(text ?? '').trim(), '');

    return lines.join('\n');
}

function downloadTextFile({ text, filename, mimeType }) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function copyGeneratedTypes() {
    const modal = getState().modal;
    const code = modal?.kind === 'generate-types' ? String(modal.result?.code ?? '') : '';

    if (!code) {
        showToast('No generated code to copy.', 'alert');
        return;
    }

    if (!navigator.clipboard?.writeText) {
        showToast('Clipboard API is not available.', 'alert');
        return;
    }

    try {
        await navigator.clipboard.writeText(code);
        showToast(
            modal.result?.files?.length ? 'Type definitions copied to clipboard.' : 'Type definition copied to clipboard.',
            'success',
        );
    } catch (error) {
        showToast(
            modal.result?.files?.length
                ? 'Type definitions could not be copied.'
                : 'Type definition could not be copied.',
            'alert',
        );
    }
}

function downloadGeneratedTypes() {
    const modal = getState().modal;
    const result = modal?.kind === 'generate-types' ? modal.result : null;
    const files = result?.files ?? [];

    if (files.length) {
        files.forEach((file, index) => {
            window.setTimeout(() => {
                downloadTextFile({
                    text: file.code,
                    filename: file.fileName || `${file.tableName || 'types'}.txt`,
                    mimeType: 'text/plain;charset=utf-8',
                });
            }, index * 120);
        });
        showToast(`${files.length} type definition downloads started.`, 'success');
        return;
    }

    if (!result?.code) {
        showToast('No generated code to download.', 'alert');
        return;
    }

    downloadTextFile({
        text: result.code,
        filename: result.fileName || 'types.txt',
        mimeType: 'text/plain;charset=utf-8',
    });
    showToast('Type definition download started.', 'success');
}

function getSelectedDataBrowserRowForJson(state) {
    if (state.dataBrowser.selectedRow) {
        return state.dataBrowser.selectedRow;
    }

    const rowIndex = state.dataBrowser.selectedRowIndex;

    if (typeof rowIndex !== 'number') {
        return null;
    }

    return state.dataBrowser.table?.rows?.[rowIndex] ?? null;
}

function getSelectedEditorResultRowForJson(state) {
    const rowIndex = state.editor.selectedRowIndex;

    if (typeof rowIndex !== 'number') {
        return null;
    }

    return state.editor.result?.rows?.[rowIndex] ?? null;
}

function applyChangedRowEditorFormValues(rowObject) {
    const form = shellRefs.panel.querySelector(
        'form[data-form="save-data-row"], form[data-form="save-editor-row"]',
    );

    if (!form) {
        return rowObject;
    }

    const nextRowObject = { ...rowObject };
    const formData = new FormData(form);
    const submittedValues = buildRowEditorSubmittedValues(formData, getRowEditorFieldMetadata(form));

    for (const [fieldName, value] of Object.entries(submittedValues)) {
        const key = `field:${fieldName}`;
        const control = Array.from(form.elements).find(element => element.name === key);
        const initialValue = control?.dataset?.rowEditorInitialValue;
        const initialState = control?.closest('[data-row-editor-field]')?.dataset?.rowEditorInitialState;
        const currentState = getRowEditorValueState(value);
        const currentValue = value === null ? null : String(value);

        if (
            initialState === currentState &&
            (currentState === 'null' || (initialValue !== undefined && currentValue === initialValue))
        ) {
            continue;
        }

        nextRowObject[fieldName] = currentValue;
    }

    return nextRowObject;
}

function buildRowEditorJsonPayload(state) {
    if (state.route.name === 'data') {
        const row = getSelectedDataBrowserRowForJson(state);
        const table = state.dataBrowser.table;
        const tableName = table?.name ?? state.dataBrowser.selectedTable ?? 'row';

        if (!row || !table) {
            return null;
        }

        const rowObject = applyChangedRowEditorFormValues(
            buildDataRowEditorJsonObject({
                row,
                columns: table.columns ?? table.columnMeta ?? [],
            }),
        );

        return {
            filename: `${slugifyExportFilenamePart(tableName, 'row')}-row.json`,
            label: tableName,
            text: stringifyRowEditorJson(rowObject),
        };
    }

    if (state.route.name === 'editorResults') {
        const row = getSelectedEditorResultRowForJson(state);
        const result = state.editor.result;
        const rowIndex = state.editor.selectedRowIndex;
        const tableName = result?.editing?.tableName ?? 'query-result';

        if (!row || !result) {
            return null;
        }

        const rowObject = applyChangedRowEditorFormValues(
            buildEditorRowEditorJsonObject({
                row,
                editingColumns: result.editing?.columns ?? [],
                resultColumns: result.columns ?? [],
            }),
        );

        return {
            filename: `${slugifyExportFilenamePart(tableName, 'query-result')}-row-${Number(rowIndex) + 1}.json`,
            label: tableName,
            text: stringifyRowEditorJson(rowObject),
        };
    }

    return null;
}

async function copyRowEditorJson() {
    const payload = buildRowEditorJsonPayload(getState());

    if (!payload) {
        showToast('No row is selected.', 'alert');
        return;
    }

    if (!navigator.clipboard?.writeText) {
        showToast('Clipboard API is not available.', 'alert');
        return;
    }

    try {
        await navigator.clipboard.writeText(payload.text);
        showToast(`Row from "${payload.label}" copied as JSON.`, 'success');
    } catch (error) {
        showToast('Row JSON could not be copied.', 'alert');
    }
}

function exportRowEditorJson() {
    const payload = buildRowEditorJsonPayload(getState());

    if (!payload) {
        showToast('No row is selected.', 'alert');
        return;
    }

    downloadTextFile({
        text: payload.text,
        filename: payload.filename,
        mimeType: 'application/json;charset=utf-8',
    });
    showToast(`Row from "${payload.label}" exported as JSON.`, 'success');
}

async function insertRowEditorJsonIntoDocument() {
    const payload = buildRowEditorJsonPayload(getState());

    if (!payload) {
        showToast('No row is selected.', 'alert');
        return;
    }

    const markdown = ['```json', payload.text, '```'].join('\n');

    try {
        const result = await insertMarkdownIntoLastOpenDocument(markdown);

        if (!result.documentId) {
            showToast('Open a document before inserting row JSON.', 'alert');
            return;
        }

        if (!result.inserted) {
            showToast('Row JSON could not be inserted.', 'alert');
            return;
        }

        if (!result.saved) {
            scheduleDocumentAutosave(result.documentId);
        }

        showToast(`Row from "${payload.label}" inserted into document.`, 'success');
    } catch (error) {
        showToast('Open a document before inserting row JSON.', 'alert');
    }
}

function exportCurrentDocumentMarkdown() {
    const documents = getState().documents;

    if (!documents.selectedId) {
        showToast('No document is selected.', 'alert');
        return;
    }

    const filename = normalizeMarkdownDownloadFilename(documents.draftFilename || documents.selected?.filename);

    downloadTextFile({
        text: documents.draftContent ?? '',
        filename,
        mimeType: 'text/markdown;charset=utf-8',
    });
    showToast(`Document "${filename}" exported.`, 'success');
}

function getCurrentDocumentEditorInsertionRange() {
    const textarea = document.querySelector('.documents-editor-input');

    if (!(textarea instanceof HTMLTextAreaElement)) {
        return null;
    }

    return {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
    };
}

function preserveDataRowEditorSelectionForReload() {
    preserveCurrentDataRowSelectionForReload();
}

async function submitCopyColumnModal(formData) {
    const state = getState();
    const modal = state.modal;

    if (modal?.kind !== 'copy-column') {
        return;
    }

    const scope = String(formData.get('scope') ?? modal.scope ?? 'editor');
    const columnName = String(formData.get('columnName') ?? modal.columnName ?? '');
    const copyMode = normalizeCopyColumnMode(String(formData.get('copyMode') ?? modal.copyMode ?? 'column'));
    const separator = String(formData.get('separator') ?? ',');
    const wrapper = String(formData.get('wrapper') ?? '');
    const lineBreaks = formData.get('lineBreaks') === 'on';
    const outputSeparator = lineBreaks ? '\n' : separator;
    const intent = String(formData.get('intent') ?? 'copy');
    const isExportIntent = intent === 'export';
    const isDocumentIntent = intent === 'document';
    const isMarkdownTodo = isMarkdownTodoCopyColumnMode(copyMode);
    const editedText = formData.has('editedText') ? String(formData.get('editedText') ?? '') : null;
    const result = getCopyColumnResult(state, scope);
    const hasColumn = (result?.columns ?? []).some(column => String(column) === columnName);

    if (!hasColumn) {
        setCopyColumnModalError({
            code: 'COPY_COLUMN_UNAVAILABLE',
            message: 'Column is no longer available in the current result set.',
        });
        showToast('Column could not be copied.', 'alert');
        return;
    }

    if (!isMarkdownTodo) {
        storeCopyColumnPreferences({ separator, wrapper, lineBreaks });
    } else if (editedText !== null) {
        setCopyColumnModalEditedText(editedText);
    }
    setCopyColumnModalSubmitting(true);

    const generatedOutput = buildCopyColumnText({
        result,
        columnName,
        copyMode,
        separator: outputSeparator,
        wrapper,
    });
    const text = isMarkdownTodo && editedText !== null ? editedText : generatedOutput.text;
    const valueCount = isMarkdownTodo && editedText !== null
        ? countEditedMarkdownTodoItems(editedText)
        : generatedOutput.valueCount;

    try {
        if (isDocumentIntent) {
            if (!isMarkdownTodo) {
                throw new Error('Document export is only available for Markdown Todo columns.');
            }

            const document = await createDocumentFromMarkdownExport({
                filename: buildCopyColumnDocumentFilename(columnName),
                title: `${columnName || 'Column'} todos`,
                content: buildCopyColumnDocumentContent({
                    state,
                    columnName,
                    text,
                    valueCount,
                }),
            });

            if (!document) {
                throw new Error('Document could not be created.');
            }

            closeModal();
            showToast(
                `Document "${document.filename}" created · ${formatNumber(valueCount)} ${
                    valueCount === 1 ? 'item' : 'items'
                }`,
                'success',
            );
            router.navigate(`/documents/${encodeURIComponent(document.id)}`);
            return;
        }

        if (isExportIntent) {
            const metadata = getCopyColumnExportMetadata(copyMode);

            downloadTextFile({
                text,
                filename: buildCopyColumnExportFilename(columnName, copyMode),
                mimeType: metadata.mimeType,
            });
            closeModal();
            showToast(
                `Column "${columnName}" exported as ${metadata.label} · ${formatNumber(valueCount)} ${
                    valueCount === 1 ? 'value' : 'values'
                }`,
                'success',
            );
            return;
        }

        if (!navigator.clipboard?.writeText) {
            throw new Error('Clipboard API is not available.');
        }

        await navigator.clipboard.writeText(text);
        closeModal();
        showToast(
            `Column "${columnName}" copied · ${formatNumber(valueCount)} ${valueCount === 1 ? 'value' : 'values'}`,
            'success',
        );
    } catch (error) {
        setCopyColumnModalError({
            code: isDocumentIntent
                ? 'COPY_COLUMN_DOCUMENT_EXPORT_FAILED'
                : isExportIntent
                  ? 'COPY_COLUMN_EXPORT_FAILED'
                  : 'CLIPBOARD_ACCESS_FAILED',
            message:
                error?.message ||
                (isDocumentIntent
                    ? 'Document export failed.'
                    : isExportIntent
                      ? 'Column export failed.'
                      : 'Clipboard access failed.'),
        });
        showToast(
            isDocumentIntent ? 'Document export failed.' : isExportIntent ? 'Column export failed.' : 'Clipboard access failed.',
            'alert',
        );
    }
}

async function handleAction(actionNode) {
    const { action } = actionNode.dataset;

    switch (action) {
        case 'navigate':
            router.navigate(actionNode.dataset.to ?? '/');
            return;
        case 'refresh-view':
            await refreshCurrentRoute();
            return;
        case 'refresh-logs':
            await refreshLogs();
            return;
        case 'set-log-filter':
            await setLogFilter(actionNode.dataset.field, actionNode.dataset.value);
            return;
        case 'load-more-logs':
            await loadMoreLogs();
            return;
        case 'set-settings-section':
            setSettingsSection(actionNode.dataset.section);
            return;
        case 'check-app-version':
            await checkSettingsAppVersion();
            return;
        case 'open-delete-api-token-modal':
            openDeleteSettingsApiTokenModal(actionNode.dataset.tokenId);
            return;
        case 'copy-created-api-token': {
            const tokenInput = document.querySelector('[data-created-api-token]');
            const token = tokenInput instanceof HTMLInputElement ? tokenInput.value : '';

            if (token && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(token);
                showToast('API token copied.', 'success');
            }
            return;
        }
        case 'copy-database-id': {
            const databaseIdNode = document.querySelector('[data-database-id]');
            const databaseId = databaseIdNode?.textContent?.trim() ?? '';

            if (databaseId && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(databaseId);
                showToast('Database ID copied.', 'success');
            }
            return;
        }
        case 'copy-mcp-config': {
            const configNode = document.querySelector('[data-mcp-config]');
            const config = configNode instanceof HTMLTextAreaElement ? configNode.value : '';

            if (config && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(config);
                showToast('MCP config copied.', 'success');
            }
            return;
        }
        case 'open-row-editor-url':
            openRowEditorUrl(actionNode);
            return;
        case 'copy-row-editor-json':
            await copyRowEditorJson();
            return;
        case 'export-row-editor-json':
            exportRowEditorJson();
            return;
        case 'insert-row-editor-json-into-document':
            await insertRowEditorJsonIntoDocument();
            return;
        case 'open-modal':
            openModal(actionNode.dataset.modal, {
                columnId: actionNode.dataset.columnId,
                columnName: actionNode.dataset.columnName,
            });
            return;
        case 'open-copy-column-modal':
            closeCopyColumnMenus();
            openCopyColumnModal({
                scope: actionNode.dataset.resultScope,
                columnName: actionNode.dataset.columnName ?? '',
                mode: actionNode.dataset.copyMode,
            });
            return;
        case 'create-document': {
            const document = await createDocument();

            if (document?.id) {
                router.navigate(`/documents/${encodeURIComponent(document.id)}`);
            }
            return;
        }
        case 'select-document': {
            const documentId = String(actionNode.dataset.documentId ?? '').trim();

            if (documentId) {
                clearDocumentAutosaveTimer();
                router.navigate(`/documents/${encodeURIComponent(documentId)}`);
            }
            return;
        }
        case 'save-document':
            clearDocumentAutosaveTimer();
            await saveCurrentDocument();
            return;
        case 'export-document-markdown':
            exportCurrentDocumentMarkdown();
            return;
        case 'open-document-insert-table-modal':
            await openDocumentInsertTableModal(getCurrentDocumentEditorInsertionRange());
            return;
        case 'open-document-insert-note-modal':
            await openDocumentInsertNoteModal(getCurrentDocumentEditorInsertionRange());
            return;
        case 'import-document-markdown': {
            const fileInput = document.querySelector('[data-bind="document-import-file"]');

            if (!(fileInput instanceof HTMLInputElement)) {
                return;
            }

            fileInput.value = '';
            fileInput.click();
            return;
        }
        case 'delete-document':
            clearDocumentAutosaveTimer();
            openDeleteDocumentModal();
            return;
        case 'toggle-document-pane':
            toggleDocumentsPane(actionNode.dataset.pane);
            return;
        case 'toggle-document-todo':
            clearDocumentAutosaveTimer();
            await toggleCurrentDocumentTodo(actionNode.dataset.lineIndex);
            return;
        case 'open-create-query-chart-modal':
            openCreateQueryChartModal();
            return;
        case 'open-edit-query-chart-modal':
            openEditQueryChartModal(actionNode.dataset.chartId);
            return;
        case 'open-delete-query-chart-modal':
            openDeleteQueryChartModal(actionNode.dataset.chartId);
            return;
        case 'open-delete-query-history-modal':
            openDeleteQueryHistoryModal(actionNode.dataset.historyId);
            return;
        case 'edit-connection':
            openEditConnectionModal(actionNode.dataset.connectionId);
            return;
        case 'clear-connection-tag-filters':
            clearConnectionTagFilters();
            return;
        case 'add-edit-connection-tag':
        case 'create-edit-connection-tag':
            addEditConnectionTag(actionNode.dataset.tagName);
            return;
        case 'remove-edit-connection-tag':
            removeEditConnectionTag(actionNode.dataset.tagName);
            return;
        case 'choose-open-database-path': {
            const labelNode = actionNode.querySelector('[data-open-database-path-button-label]');

            actionNode.setAttribute('disabled', '');
            if (labelNode) {
                labelNode.textContent = 'Choosing...';
            }

            const selectedPath = await chooseOpenDatabasePath();
            const pathInput = document.querySelector(
                '[data-form="open-connection"] [data-open-database-path]',
            );

            if (selectedPath && pathInput instanceof HTMLInputElement) {
                pathInput.value = selectedPath;
                pathInput.focus({ preventScroll: true });
                pathInput.setSelectionRange(pathInput.value.length, pathInput.value.length);
            }

            if (actionNode.isConnected) {
                actionNode.removeAttribute('disabled');
                if (labelNode) {
                    labelNode.textContent = 'Browse...';
                }
            }
            return;
        }
        case 'choose-create-database-path': {
            const labelNode = actionNode.querySelector('[data-create-database-path-button-label]');

            actionNode.setAttribute('disabled', '');
            if (labelNode) {
                labelNode.textContent = 'Choosing...';
            }

            const selectedPath = await chooseCreateDatabasePath();
            const pathInput = document.querySelector(
                '[data-form="create-connection"] [data-create-database-path]',
            );

            if (selectedPath && pathInput instanceof HTMLInputElement) {
                pathInput.value = selectedPath;
                pathInput.focus({ preventScroll: true });
                pathInput.setSelectionRange(pathInput.value.length, pathInput.value.length);
            }

            if (actionNode.isConnected) {
                actionNode.removeAttribute('disabled');
                if (labelNode) {
                    labelNode.textContent = 'Browse...';
                }
            }
            return;
        }
        case 'close-modal':
            closeModal();
            return;
        case 'dismiss-toast':
            dismissToast(actionNode.dataset.toastId);
            return;
        case 'select-connection': {
            closeSidebarDatabasePickers();
            resetStructureGraphForDatabaseChange();
            const next = await selectConnection(actionNode.dataset.connectionId);
            if (next) {
                router.navigate('/overview');
            }
            return;
        }
        case 'remove-connection': {
            const isActiveConnection = getState().connections.active?.id === actionNode.dataset.connectionId;

            if (isActiveConnection) {
                resetStructureGraphForDatabaseChange();
            }

            const removed = await removeConnection(actionNode.dataset.connectionId);
            if (removed) {
                const nextState = getState();
                if (!nextState.connections.active && nextState.route.name !== 'connections') {
                    router.navigate('/connections');
                } else {
                    await refreshCurrentRoute();
                }
            }
            return;
        }
        case 'create-backup':
            await createActiveConnectionBackup();
            return;
        case 'open-create-backup-modal':
            openCreateBackupModal();
            return;
        case 'refresh-backups':
            await refreshBackups();
            return;
        case 'open-table-in-sql-editor':
            await openTableInSqlEditor(actionNode.dataset.tableName);
            return;
        case 'open-generate-types-modal':
            await openGenerateTypesModal(actionNode.dataset.tableName, actionNode.dataset.typeTarget, actionNode.dataset.typeScope);
            return;
        case 'copy-generated-types':
            await copyGeneratedTypes();
            return;
        case 'download-generated-types':
            downloadGeneratedTypes();
            return;
        case 'open-restore-backup-modal':
            openRestoreBackupModal(actionNode.dataset.backupId);
            return;
        case 'open-compare-backup-drawer':
            await openBackupDiffDrawer(actionNode.dataset.backupId);
            return;
        case 'set-backup-diff-tab':
            setBackupDiffTab(actionNode.dataset.tab);
            return;
        case 'close-backup-diff-drawer':
            closeBackupDiffDrawer();
            return;
        case 'open-edit-backup-modal':
            openEditBackupModal(actionNode.dataset.backupId);
            return;
        case 'open-delete-backup-modal':
            openDeleteBackupModal(actionNode.dataset.backupId);
            return;
        case 'download-backup':
            await downloadBackup(actionNode.dataset.backupId);
            return;
        case 'backup-safety-create':
            await submitBackupSafetyChoice('create');
            return;
        case 'backup-safety-continue':
            await submitBackupSafetyChoice('continue');
            return;
        case 'backup-safety-cancel':
            await submitBackupSafetyChoice('cancel');
            return;
        case 'copy-media-tags': {
            const tags = getState().mediaTagging.tags ?? [];
            const formattedTags = tags
                .map(tag => `${String(tag.label ?? '').trim()}${tag.isParentTag ? ' (parent)' : ''}`)
                .filter(Boolean)
                .join(', ');

            if (!formattedTags) {
                showToast('No tags available to copy.', 'alert');
                return;
            }

            try {
                await navigator.clipboard.writeText(formattedTags);
                showToast('Tags copied.', 'success');
            } catch (error) {
                showToast('Tags could not be copied.', 'alert');
            }
            return;
        }
        case 'open-overview-in-finder':
            await openOverviewInFinder();
            return;
        case 'execute-query': {
            await executeEditorQueryAndNavigate();
            return;
        }
        case 'format-current-query':
            formatCurrentQuery();
            return;
        case 'copy-current-query':
            await copyCurrentQueryToClipboard();
            return;
        case 'delete-data-row':
            openDeleteDataRowModal(actionNode.dataset.rowIndex);
            return;
        case 'delete-editor-row':
            openDeleteEditorRowModal(actionNode.dataset.rowIndex);
            return;
        case 'clear-query':
            pendingQueryEditorFocus = true;
            clearCurrentQuery();
            if (getState().route.name === 'editorResults') {
                router.navigate('/editor');
            }
            return;
        case 'clear-results':
            clearEditorResults();
            router.navigate('/editor');
            return;
        case 'select-query-history-item':
            if (actionNode.dataset.historyId) {
                const pendingSelection = selectQueryHistoryItem(actionNode.dataset.historyId, { notify: false });
                syncQueryHistorySelectionUi(actionNode.dataset.historyId);
                syncQueryHistoryUi(actionNode.dataset.historyId);
                await pendingSelection;
                syncQueryHistoryUi(actionNode.dataset.historyId);
            }
            return;
        case 'clear-query-history-selection':
            clearQueryHistorySelection({ notify: false });
            syncQueryHistorySelectionUi(null);
            return;
        case 'set-query-history-tab':
            if (actionNode.dataset.tab) {
                await setQueryHistoryTab(actionNode.dataset.tab);
            }
            return;
        case 'toggle-query-history-panel':
            if (getState().route.name === 'charts') {
                setChartsHistoryPanelVisibility(
                    actionNode.dataset.nextValue ? actionNode.dataset.nextValue === 'true' : undefined,
                );
            } else {
                setQueryHistoryPanelVisibility(
                    actionNode.dataset.nextValue ? actionNode.dataset.nextValue === 'true' : undefined,
                );
            }
            return;
        case 'toggle-editor-panel':
            setEditorPanelVisibility(
                actionNode.dataset.nextValue ? actionNode.dataset.nextValue === 'true' : undefined,
            );
            return;
        case 'load-more-query-history':
            await loadMoreQueryHistory();
            return;
        case 'open-query-history':
            if (
                actionNode.dataset.historyId &&
                openQueryHistoryInEditor(actionNode.dataset.historyId, {
                    notify: getState().route.name !== 'charts',
                })
            ) {
                router.navigate('/editor');
            }
            return;
        case 'run-query-history':
            if (actionNode.dataset.historyId) {
                const success = await runQueryHistoryItem(actionNode.dataset.historyId);
                const activeTab = getState().editor.activeTab;
                router.navigate(success && activeTab === 'results' ? '/editor/results' : '/editor');
            }
            return;
        case 'toggle-query-history-saved':
            if (actionNode.dataset.historyId) {
                await toggleQueryHistorySavedState(
                    actionNode.dataset.historyId,
                    actionNode.dataset.nextValue === 'true',
                );
            }
            return;
        case 'toggle-charts-query-history-saved':
            if (actionNode.dataset.historyId) {
                const nextValue = actionNode.dataset.nextValue === 'true';
                const updated = await toggleQueryHistorySavedState(actionNode.dataset.historyId, nextValue, {
                    notify: false,
                    refresh: false,
                    toast: false,
                });

                if (updated) {
                    syncChartsSavedToggleUi(actionNode, nextValue);
                }
            }
            return;
        case 'open-charts-query-detail':
            if (actionNode.dataset.historyId) {
                setChartsDetailPanelVisibility(true);
                if (getState().route.params?.historyId !== actionNode.dataset.historyId) {
                    router.navigate(`/charts/${encodeURIComponent(actionNode.dataset.historyId)}`);
                }
            }
            return;
        case 'close-charts-query-detail':
            setChartsDetailPanelVisibility(false);
            return;
        case 'toggle-charts-sql-panel':
            toggleChartsSqlPanel();
            return;
        case 'toggle-charts-results-panel':
            toggleChartsResultsPanel();
            return;
        case 'set-charts-height-preset':
            if (actionNode.dataset.preset) {
                setChartsHeightPreset(actionNode.dataset.preset);
            }
            return;
        case 'set-charts-history-tab':
            if (actionNode.dataset.tab) {
                setChartsHistoryTab(actionNode.dataset.tab);
            }
            return;
        case 'export-query-chart-png':
            if (actionNode.dataset.chartId && !exportQueryChartAsPng(actionNode.dataset.chartId)) {
                showToast('The selected chart is not ready for PNG export.', 'alert');
            }
            return;
        case 'set-editor-tab': {
            const tab = actionNode.dataset.tab;
            if (!tab) {
                return;
            }
            setEditorTab(tab);
            router.navigate(tab === 'results' ? '/editor/results' : '/editor');
            return;
        }
        case 'open-query-export-modal':
            openQueryExportModal();
            return;
        case 'export-query-format': {
            const format = actionNode.dataset.exportFormat;
            const filename = getExportFilenameFromAction(actionNode);

            if (format === 'table') {
                const imported = await duplicateCurrentQueryAsTable(filename);

                if (imported) {
                    router.navigate('/table-designer/new');
                }

                return;
            }

            await exportCurrentQueryFormat(format, filename);
            return;
        }
        case 'open-data-export-modal':
            openDataExportModal();
            return;
        case 'open-generate-data-modal':
            openGenerateDataModal();
            return;
        case 'preview-generate-data':
            await previewGenerateDataRows();
            return;
        case 'export-data-format': {
            const format = actionNode.dataset.exportFormat;
            const filename = getExportFilenameFromAction(actionNode);

            if (format === 'table') {
                const imported = await duplicateCurrentDataTableAsTable(filename);

                if (imported) {
                    router.navigate('/table-designer/new');
                }

                return;
            }

            await exportCurrentDataTableFormat(format, filename);
            return;
        }
        case 'toggle-data-tables':
            toggleDataTablesPanel();
            return;
        case 'toggle-structure-tables':
            toggleStructureTablesPanel();
            return;
        case 'toggle-table-designer-tables':
            toggleTableDesignerTablesPanel();
            return;
        case 'toggle-documents-panel':
            toggleDocumentsPanel();
            return;
        case 'select-structure-entry':
            if (actionNode.dataset.entryName) {
                await selectStructureEntry(actionNode.dataset.entryName);
            }
            return;
        case 'add-table-designer-column':
            {
                const columnId = addCurrentTableDesignerColumn();
                if (columnId) {
                    window.requestAnimationFrame(() => {
                        focusTableDesignerColumnNameField(columnId);
                    });
                }
            }
            return;
        case 'remove-table-designer-column':
            if (actionNode.dataset.columnId) {
                removeCurrentTableDesignerColumn(actionNode.dataset.columnId);
            }
            return;
        case 'save-table-designer': {
            const savedTableName = await saveCurrentTableDesignerDraft();
            if (savedTableName) {
                router.navigate(`/table-designer/${encodeURIComponent(savedTableName)}`);
            }
            return;
        }
        case 'copy-table-designer-sql': {
            const sqlPreview = getState().tableDesigner.draft?.sqlPreview ?? '';
            if (!sqlPreview.trim()) {
                return;
            }

            try {
                await navigator.clipboard.writeText(sqlPreview);
                showToast('SQL preview copied.', 'success');
            } catch (error) {
                showToast('Clipboard access failed.', 'alert');
            }
            return;
        }
        case 'copy-table-advisor-sql': {
            const issueId = actionNode.dataset.issueId;
            const advisor = getState().tableAdvisor;
            const issue = (advisor.result?.issues ?? []).find(item => item.id === issueId);
            const sql = String(issue?.sql ?? '');

            if (!sql.trim()) {
                showToast('No advisor SQL to copy.', 'alert');
                return;
            }

            if (!navigator.clipboard?.writeText) {
                showToast('Clipboard API is not available.', 'alert');
                return;
            }

            try {
                await navigator.clipboard.writeText(sql);
                showToast('Advisor SQL copied.', 'success');
            } catch (error) {
                showToast('Advisor SQL could not be copied.', 'alert');
            }
            return;
        }
        case 'toggle-table-designer-sql-preview':
            setTableDesignerSqlPreviewVisibility(
                actionNode.dataset.nextValue ? actionNode.dataset.nextValue === 'true' : undefined,
            );
            return;
        case 'refresh-media-tagging-preview':
            await refreshMediaTaggingPreview();
            return;
        case 'dismiss-media-tagging-issue':
            dismissMediaTaggingIssue(actionNode.dataset.issueKey);
            return;
        case 'reset-media-tagging-queries':
            await resetMediaTaggingQueriesToDefault();
            return;
        case 'save-media-tagging':
            await saveCurrentMediaTaggingConfig();
            return;
        case 'create-media-tag':
            await createCurrentMediaTag();
            // Refocus the name field after creating a tag
            const nameInput = document.querySelector('[data-bind="media-tagging-tag-form-field"][data-field="name"]');
            if (nameInput instanceof HTMLInputElement) {
                nameInput.focus();
            }
            return;
        case 'remove-media-tag':
            await removeCurrentMediaTag(actionNode.dataset.tagKey);
            return;
        case 'skip-media-tagging-item':
            await skipCurrentMediaTaggingItem();
            return;
        case 'reset-skipped-media-tagging':
            await resetSkippedMediaTaggingItems();
            return;
        case 'apply-media-tagging':
            await applyMediaTaggingAndFocusSearch();
            return;
        case 'toggle-media-tagging-current-media':
            if (actionNode instanceof HTMLButtonElement) {
                const nextValue = actionNode.dataset.nextValue !== 'false';
                syncMediaTaggingCurrentMediaUi(actionNode, nextValue);
                setMediaTaggingWorkflowMediaDetailsVisible(nextValue, { notify: false });
            }
            return;
        case 'rotate-media-tagging-current-media': {
            const currentRotation = getState().mediaTagging.workflowMediaRotationDegrees ?? 0;
            const command = actionNode.dataset.rotationCommand;
            const nextRotation =
                command === 'left' ? currentRotation - 90 : command === 'right' ? currentRotation + 90 : 0;

            syncMediaTaggingMediaRotationUi(actionNode, nextRotation);
            setMediaTaggingWorkflowMediaRotationDegrees(nextRotation, { notify: false });
            return;
        }
        case 'open-media-tagging-current-in-data': {
            const currentState = getState();
            const mediaTableName = currentState.mediaTagging.draft?.mediaTable ?? '';
            const identity = currentState.mediaTagging.workflow?.currentItem?.identity ?? null;

            if (!openDataRowByIdentity(mediaTableName, identity)) {
                showToast('The current media row could not be opened in Data.', 'alert');
                return;
            }

            router.navigate(`/data/${encodeURIComponent(mediaTableName)}`);
            return;
        }
        case 'open-media-tagging-current-in-structure': {
            const mediaTableName = String(getState().mediaTagging.draft?.mediaTable ?? '').trim();

            if (!mediaTableName) {
                showToast('The current media table could not be opened in Structure.', 'alert');
                return;
            }

            router.navigate(`/structure/${encodeURIComponent(mediaTableName)}`);
            return;
        }
        case 'import-table-designer-csv': {
            const fileInput = document.querySelector('[data-bind="table-designer-import-file"]');

            if (!(fileInput instanceof HTMLInputElement)) {
                return;
            }

            fileInput.value = '';
            fileInput.click();
            return;
        }
        case 'select-data-row':
            if (actionNode.dataset.rowIndex) {
                selectDataRow(actionNode.dataset.rowIndex, { notify: false });
                syncDataRowSelectionUi(actionNode.dataset.rowIndex);
            }
            return;
        case 'select-editor-row':
            if (actionNode.dataset.rowIndex) {
                selectEditorRow(actionNode.dataset.rowIndex);
            }
            return;
        case 'clear-data-row-selection':
            clearDataRowSelection({ notify: false });
            syncDataRowSelectionUi(null);
            return;
        case 'clear-editor-row-selection':
            clearEditorRowSelection();
            return;
        case 'set-data-page':
            if (actionNode.dataset.page) {
                await setDataPage(actionNode.dataset.page);
            }
            return;
        case 'sort-data-column':
            if (actionNode.dataset.columnName) {
                await sortDataTableByColumn(actionNode.dataset.columnName);
            }
            return;
        case 'sort-editor-results-column':
            if (actionNode.dataset.columnName) {
                sortEditorResultsByColumn(actionNode.dataset.columnName);
            }
            return;
        case 'set-data-page-size':
            if (actionNode.dataset.pageSize) {
                await setDataPageSize(actionNode.dataset.pageSize);
            }
            return;
        case 'reload-data-route':
            preserveDataRowEditorSelectionForReload();
            await refreshCurrentRoute();
            return;
        default:
    }
}

function isMediaTaggingMenuActive(routeName) {
    return routeName === 'mediaTaggingSetup' || routeName === 'mediaTaggingQueue';
}

function canApplyMediaTaggingShortcut(state) {
    return (
        isMediaTaggingMenuActive(state.route.name) &&
        Boolean(state.mediaTagging.workflow?.currentItem) &&
        !state.mediaTagging.applying &&
        (state.mediaTagging.selectedTagKeys?.length ?? 0) > 0
    );
}

function isEditableShortcutTarget(target) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
    ) {
        return true;
    }

    if (target.isContentEditable) {
        return true;
    }

    if (
        target.closest(
            '[contenteditable="true"], [data-bind="current-query"], [data-sql-highlight="true"], .query-editor-input',
        )
    ) {
        return true;
    }

    const role = String(target.getAttribute('role') ?? '').trim().toLowerCase();
    return role === 'textbox' || role === 'searchbox' || role === 'combobox';
}

document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;

    if (!target) {
        return;
    }

    const copyColumnMenu = target.closest('[data-copy-column-menu]');

    if (!copyColumnMenu) {
        closeCopyColumnMenus();
    } else if (target.closest('.query-result-column-menu__toggle')) {
        window.requestAnimationFrame(() => {
            if (copyColumnMenu instanceof HTMLDetailsElement && copyColumnMenu.open) {
                closeCopyColumnMenus(copyColumnMenu);
            }
        });
    }

    const dropdownButton = target.closest('[data-dropdown-button]');

    if (!dropdownButton) {
        closeDropdownButtons();
    } else if (target.closest('.dropdown-button__toggle')) {
        window.requestAnimationFrame(() => {
            if (dropdownButton instanceof HTMLDetailsElement && dropdownButton.open) {
                closeDropdownButtons(dropdownButton);
            }
        });
    } else if (target.closest('.dropdown-button__item')) {
        closeDropdownButtons();
    }

    const sidebarDatabasePicker = target.closest('.sidebar-db-picker');

    if (!sidebarDatabasePicker) {
        closeSidebarDatabasePickers();
    } else if (target.closest('.sidebar-footer-card')) {
        window.requestAnimationFrame(() => {
            if (sidebarDatabasePicker instanceof HTMLDetailsElement && sidebarDatabasePicker.open) {
                closeSidebarDatabasePickers(sidebarDatabasePicker);
            }
        });
    }

    const actionNode = target.closest('[data-action]');

    if (!actionNode) {
        return;
    }

    handleAction(actionNode);
});

document.addEventListener('contextmenu', event => {
    const target = event.target instanceof Element ? event.target : null;
    const headerNode = target?.closest('[data-result-column-header]');

    if (!headerNode) {
        return;
    }

    event.preventDefault();
    openCopyColumnMenu(headerNode);
});

document.addEventListener('keydown', event => {
    const target = event.target;
    const state = getState();

    if (
        (event.key === 's' || event.key === 'S') &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        !event.defaultPrevented &&
        state.route.name === 'documents'
    ) {
        event.preventDefault();
        clearDocumentAutosaveTimer();
        void saveCurrentDocument();
        return;
    }

    if (
        event.key === '/' &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.defaultPrevented &&
        state.route.name === 'connections' &&
        !isEditableShortcutTarget(target)
    ) {
        const searchInput = document.querySelector('[data-connections-search-input]');

        if (searchInput instanceof HTMLInputElement) {
            event.preventDefault();
            searchInput.focus({ preventScroll: true });
            searchInput.select();
        }

        return;
    }

    // Handle Enter key in tag form fields to trigger create tag
    if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.defaultPrevented &&
        target instanceof HTMLElement &&
        target.dataset.bind === 'media-tagging-tag-form-field'
    ) {
        event.preventDefault();
        const createButton = document.querySelector('[data-action="create-media-tag"]');
        if (createButton && !(createButton instanceof HTMLButtonElement && createButton.disabled)) {
            createButton?.click();
        }
        return;
    }

    if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.defaultPrevented &&
        target instanceof HTMLElement &&
        target.dataset.bind === 'edit-connection-tag-query'
    ) {
        event.preventDefault();
        const tagQuery = target instanceof HTMLInputElement ? target.value.trim() : '';

        if (!tagQuery) {
            return;
        }

        const primaryTagAction =
            document.querySelector('[data-edit-connection-tag-primary]') ??
            document.querySelector('[data-action="add-edit-connection-tag"]');

        if (primaryTagAction instanceof HTMLElement) {
            primaryTagAction.click();
        }

        return;
    }

    if (
        (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter') &&
        event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.defaultPrevented &&
        canApplyMediaTaggingShortcut(state)
    ) {
        event.preventDefault();
        void applyMediaTaggingAndFocusSearch();
        return;
    }

    if (
        event.key === 'Enter' &&
        event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.defaultPrevented &&
        target instanceof HTMLTextAreaElement &&
        target.dataset.bind === 'current-query'
    ) {
        event.preventDefault();

        if (!getState().editor.executing) {
            void executeEditorQueryAndNavigate();
        }

        return;
    }

    if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
    }

    if (target instanceof HTMLInputElement && target.dataset.bind === 'connections-search') {
        event.preventDefault();

        if (!clearInputForEscape(target)) {
            target.blur();
        }

        return;
    }

    if (target instanceof HTMLInputElement && clearInputForEscape(target)) {
        event.preventDefault();
        return;
    }

    if (state.modal) {
        event.preventDefault();
        closeModal();
        return;
    }

    if (document.querySelector('[data-copy-column-menu][open]')) {
        event.preventDefault();
        closeCopyColumnMenus();
        return;
    }

    if (document.querySelector('[data-dropdown-button][open]')) {
        event.preventDefault();
        closeDropdownButtons();
        return;
    }

    if (document.querySelector('.sidebar-db-picker[open]')) {
        event.preventDefault();
        closeSidebarDatabasePickers();
        return;
    }

    if (state.route.name === 'charts' && state.charts.detailPanelVisible) {
        event.preventDefault();
        setChartsDetailPanelVisibility(false);
        return;
    }

    if (state.route.name === 'backups' && state.backups.diff?.visible) {
        event.preventDefault();
        closeBackupDiffDrawer();
        return;
    }

    if (state.editor.historySelectedId !== null || state.editor.historyDetail) {
        event.preventDefault();
        clearQueryHistorySelection();
        return;
    }

    if (
        state.route.name === 'data' &&
        (typeof state.dataBrowser.selectedRowIndex === 'number' || Boolean(state.dataBrowser.selectedRow))
    ) {
        event.preventDefault();
        clearDataRowSelection();
        return;
    }

    if (state.route.name === 'editorResults' && typeof state.editor.selectedRowIndex === 'number') {
        event.preventDefault();
        clearEditorRowSelection();
    }
});

document.addEventListener('input', event => {
    const target = event.target instanceof Element ? event.target : null;
    const valueInput = target?.closest('[data-row-editor-value-source]');
    const timestampInput = target?.closest('[data-row-editor-timestamp-source]');
    const textCellInput = target?.closest('[data-row-editor-text-source]');

    if (timestampInput) {
        syncRowEditorTimestampPreview(timestampInput);
        syncRowEditorFilePathPreview(timestampInput);
    }

    if (textCellInput) {
        syncRowEditorCharacterCount(textCellInput);
    }

    if (valueInput) {
        syncRowEditorValueState(valueInput);
    }

    const bindNode = event.target.closest('[data-bind]');

    if (!bindNode) {
        return;
    }

    if (bindNode.dataset.bind === 'type-generation-field') {
        if (bindNode instanceof HTMLInputElement && bindNode.type === 'checkbox') {
            return;
        }

        void updateGenerateTypesModal(bindNode.dataset.typeGenerationField, bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'generate-data-field') {
        updateGenerateDataModal(bindNode.dataset.field, bindNode.value, { notify: false });
        return;
    }

    if (bindNode.dataset.bind === 'generate-data-mapping') {
        if (bindNode instanceof HTMLSelectElement) {
            return;
        }

        updateGenerateDataMapping(bindNode.dataset.columnName, bindNode.dataset.field, bindNode.value, { notify: false });
        return;
    }

    if (bindNode.dataset.bind === 'copy-column-format-field') {
        updateCopyColumnModalFormatField(
            bindNode.dataset.field,
            bindNode instanceof HTMLInputElement && bindNode.type === 'checkbox' ? bindNode.checked : bindNode.value,
        );
        return;
    }

    if (bindNode.dataset.bind === 'current-query') {
        invalidateMainRenderCache();
        syncQueryEditorHighlight(bindNode);
        syncQueryEditorScroll(bindNode);
        setCurrentQuery(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'document-field') {
        updateCurrentDocumentDraftField(bindNode.dataset.field, bindNode.value);
        scheduleDocumentAutosave(getState().documents.selectedId);
        return;
    }

    if (bindNode.dataset.bind === 'documents-search') {
        setDocumentsSearchQuery(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'logs-search') {
        setLogSearchInput(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'connections-search') {
        setConnectionSearchQuery(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'edit-connection-tag-query') {
        updateEditConnectionTagQuery(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'data-search-query') {
        void setDataSearchQuery(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'data-table-search') {
        setDataTableSearchQuery(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'structure-table-search') {
        setStructureTableSearchQuery(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'table-designer-search') {
        setTableDesignerSearchQuery(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'media-tagging-tag-search') {
        syncMediaTaggingTagSearchUi(bindNode);
        return;
    }

    if (bindNode.dataset.bind === 'table-designer-field') {
        if (
            (bindNode instanceof HTMLInputElement && bindNode.type === 'checkbox') ||
            bindNode instanceof HTMLSelectElement
        ) {
            return;
        }

        updateCurrentTableDesignerField(bindNode.dataset.field, bindNode.value, { notify: false });

        if (!syncTableDesignerDraftUi(bindNode)) {
            renderApp(getState());
        }

        return;
    }

    if (bindNode.dataset.bind === 'table-designer-column-field') {
        if (bindNode instanceof HTMLSelectElement) {
            return;
        }

        updateCurrentTableDesignerColumnField(bindNode.dataset.columnId, bindNode.dataset.field, bindNode.value, {
            notify: false,
        });

        if (!syncTableDesignerDraftUi(bindNode)) {
            renderApp(getState());
        }

        return;
    }

    if (bindNode.dataset.bind === 'media-tagging-field') {
        if (bindNode instanceof HTMLInputElement && bindNode.type === 'checkbox') {
            return;
        }

        // Skip select elements - they're handled in the change event with preview refresh
        if (bindNode instanceof HTMLSelectElement) {
            return;
        }

        if (bindNode instanceof HTMLTextAreaElement && bindNode.dataset.sqlHighlight === 'true') {
            syncQueryEditorHighlight(bindNode);
            syncQueryEditorScroll(bindNode);
        }

        updateCurrentMediaTaggingField(bindNode.dataset.field, bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'media-tagging-tag-form-field') {
        if (bindNode instanceof HTMLInputElement && bindNode.type === 'checkbox') {
            return;
        }

        updateCurrentMediaTaggingTagFormField(bindNode.dataset.field, bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'query-history-search') {
        setQueryHistorySearchInput(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'charts-history-search') {
        setChartsHistorySearchInput(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'query-chart-draft:name') {
        updateCurrentQueryChartDraftField('name', bindNode.value);
    }
});

document.addEventListener(
    'scroll',
    event => {
        const target = event.target;

        if (!(target instanceof HTMLTextAreaElement)) {
            return;
        }

        if (target.dataset.bind !== 'current-query' && target.dataset.sqlHighlight !== 'true') {
            return;
        }

        syncQueryEditorScroll(target);
    },
    true,
);

document.addEventListener('change', event => {
    const target = event.target instanceof Element ? event.target : null;
    const valueControl = target?.closest('[data-row-editor-value-source]');
    const timestampInput = target?.closest('[data-row-editor-timestamp-source]');
    const textCellInput = target?.closest('[data-row-editor-text-source]');

    if (timestampInput) {
        syncRowEditorTimestampPreview(timestampInput);
        syncRowEditorFilePathPreview(timestampInput);
    }

    if (textCellInput) {
        syncRowEditorCharacterCount(textCellInput);
    }

    if (valueControl) {
        syncRowEditorValueState(valueControl);
    }

    const bindNode = event.target.closest('[data-bind]');

    if (!bindNode) {
        return;
    }

    if (bindNode.dataset.bind === 'type-generation-field') {
        const nextValue =
            bindNode instanceof HTMLInputElement && bindNode.type === 'checkbox' ? bindNode.checked : bindNode.value;
        void updateGenerateTypesModal(bindNode.dataset.typeGenerationField, nextValue);
        return;
    }

    if (bindNode.dataset.bind === 'generate-data-field') {
        updateGenerateDataModal(bindNode.dataset.field, bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'generate-data-mapping') {
        updateGenerateDataMapping(bindNode.dataset.columnName, bindNode.dataset.field, bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'data-search-column') {
        void setDataSearchColumn(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'data-filter-operator') {
        void setDataFilterOperator(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'connection-tag-filter') {
        const nextValue = bindNode instanceof HTMLInputElement && bindNode.type === 'checkbox' ? bindNode.checked : false;
        toggleConnectionTagFilter(bindNode.dataset.tagId, nextValue);
        return;
    }

    if (bindNode.dataset.bind === 'media-tagging-field') {
        updateCurrentMediaTaggingField(bindNode.dataset.field, bindNode.value);
        void refreshMediaTaggingPreview();
        return;
    }

    if (bindNode.dataset.bind === 'media-tagging-tag-form-field') {
        const nextValue =
            bindNode instanceof HTMLInputElement && bindNode.type === 'checkbox' ? bindNode.checked : bindNode.value;
        updateCurrentMediaTaggingTagFormField(bindNode.dataset.field, nextValue);
        return;
    }

    if (bindNode.dataset.bind === 'media-tagging-tag-selection') {
        const nextValue =
            bindNode instanceof HTMLInputElement && bindNode.type === 'checkbox' ? bindNode.checked : false;
        toggleCurrentMediaTagSelection(bindNode.dataset.tagKey, nextValue, { notify: false });
        syncMediaTagSelectionUi(bindNode, nextValue);
        return;
    }

    if (bindNode.dataset.bind === 'table-designer-import-file') {
        void handleTableDesignerCsvImport(bindNode);
        return;
    }

    if (bindNode.dataset.bind === 'document-import-file') {
        void handleDocumentMarkdownImport(bindNode);
        return;
    }

    if (bindNode.dataset.bind === 'document-insert-query-select') {
        updateDocumentInsertQuerySelection(bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'table-designer-field') {
        if (bindNode instanceof HTMLInputElement && bindNode.type === 'checkbox') {
            updateCurrentTableDesignerField(bindNode.dataset.field, bindNode.checked);
            return;
        }

        if (bindNode instanceof HTMLSelectElement) {
            updateCurrentTableDesignerField(bindNode.dataset.field, bindNode.value, { notify: false });

            if (!syncTableDesignerDraftUi(bindNode)) {
                renderApp(getState());
            }

            return;
        }

        updateCurrentTableDesignerField(bindNode.dataset.field, bindNode.value, { notify: false });

        if (!syncTableDesignerDraftUi(bindNode)) {
            renderApp(getState());
        }

        return;
    }

    if (bindNode.dataset.bind === 'table-designer-column-field') {
        if (bindNode instanceof HTMLSelectElement) {
            updateCurrentTableDesignerColumnField(bindNode.dataset.columnId, bindNode.dataset.field, bindNode.value, {
                notify: false,
            });

            if (!syncTableDesignerDraftUi(bindNode)) {
                renderApp(getState());
            }

            return;
        }

        updateCurrentTableDesignerColumnField(bindNode.dataset.columnId, bindNode.dataset.field, bindNode.value, {
            notify: false,
        });

        if (!syncTableDesignerDraftUi(bindNode)) {
            renderApp(getState());
        }

        return;
    }

    if (bindNode.dataset.bind === 'table-designer-column-flag') {
        updateCurrentTableDesignerColumnField(bindNode.dataset.columnId, bindNode.dataset.field, bindNode.checked);
        return;
    }

    if (bindNode.dataset.bind === 'table-designer-constraint-field') {
        updateCurrentTableDesignerConstraintField(
            bindNode.dataset.constraintKind,
            bindNode.dataset.constraintId,
            bindNode.dataset.field,
            bindNode.value,
        );
        return;
    }

    if (bindNode.dataset.bind === 'query-chart-draft:chartType') {
        updateCurrentQueryChartDraftField('chartType', bindNode.value);
        return;
    }

    if (bindNode.dataset.bind === 'query-chart-draft:tableVisible') {
        updateCurrentQueryChartDraftField('tableVisible', bindNode.checked);
        return;
    }

    if (bindNode.dataset.bind?.startsWith('query-chart-draft-config:')) {
        const field = bindNode.dataset.bind.slice('query-chart-draft-config:'.length);
        const value =
            bindNode instanceof HTMLInputElement && bindNode.type === 'checkbox'
                ? bindNode.checked
                : bindNode.value === ''
                  ? null
                  : bindNode.value;
        updateCurrentQueryChartDraftConfigField(field, value);
    }
});

document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-form]');

    if (!form) {
        return;
    }

    event.preventDefault();
    const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
    const formData = submitter ? new FormData(form, submitter) : new FormData(form);

    switch (form.dataset.form) {
        case 'logs-search':
            await applyLogSearch(String(formData.get('search') ?? ''));
            return;
        case 'create-api-token':
            await createSettingsApiToken(String(formData.get('name') ?? ''));
            return;
        case 'open-connection': {
            resetStructureGraphForDatabaseChange();
            const connection = await submitOpenConnection({
                path: String(formData.get('path') ?? ''),
                label: String(formData.get('label') ?? ''),
                readOnly: formData.get('readOnly') === 'on',
            });

            if (connection) {
                router.navigate('/overview');
            }
            return;
        }
        case 'create-connection': {
            resetStructureGraphForDatabaseChange();
            const connection = await submitCreateConnection({
                path: String(formData.get('path') ?? ''),
                label: String(formData.get('label') ?? ''),
            });

            if (connection) {
                router.navigate('/overview');
            }
            return;
        }
        case 'import-sql': {
            resetStructureGraphForDatabaseChange();
            const targetMode = String(formData.get('targetMode') ?? 'active');
            const payload = {
                sqlFilePath: String(formData.get('sqlFilePath') ?? ''),
                label: String(formData.get('label') ?? ''),
            };

            if (targetMode === 'recent') {
                payload.targetConnectionId = String(formData.get('targetConnectionId') ?? '');
            } else if (targetMode === 'create') {
                payload.createNew = true;
                payload.targetPath = String(formData.get('targetPath') ?? '');
            } else if (targetMode === 'path') {
                payload.targetPath = String(formData.get('targetPath') ?? '');
            }

            const result = await submitImportSql(payload);
            if (result) {
                router.navigate('/overview');
            }
            return;
        }
        case 'edit-connection': {
            const connectionId = String(formData.get('connectionId') ?? '');
            const isActiveConnection = getState().connections.active?.id === connectionId;
            const logoFile = formData.get('logoFile');
            const logoUpload = await buildConnectionLogoUpload(logoFile);

            if (isActiveConnection) {
                resetStructureGraphForDatabaseChange();
            }

            await submitEditConnection(connectionId, {
                path: String(formData.get('path') ?? ''),
                label: String(formData.get('label') ?? ''),
                readOnly: formData.get('readOnly') === 'on',
                clearLogo: formData.get('clearLogo') === 'on' && !logoUpload,
                logoUpload,
                tags: formData.getAll('tags').map(value => String(value ?? '')),
            });

            return;
        }
        case 'delete-row-confirm':
            await submitDeleteRowConfirmation();
            return;
        case 'create-backup':
            await submitCreateBackupConfirmation({
                name: String(formData.get('name') ?? ''),
                notes: String(formData.get('notes') ?? ''),
                type: String(formData.get('type') ?? 'manual'),
            });
            return;
        case 'edit-backup':
            await submitEditBackupConfirmation({
                name: String(formData.get('name') ?? ''),
                notes: String(formData.get('notes') ?? ''),
            });
            return;
        case 'delete-backup-confirm':
            await submitDeleteBackupConfirmation();
            return;
        case 'save-query-chart':
            await saveCurrentQueryChartDraft();
            return;
        case 'delete-query-chart':
            await submitDeleteChartConfirmation();
            return;
        case 'delete-query-history-confirm':
            await submitDeleteQueryHistoryConfirmation();
            return;
        case 'delete-document-confirm': {
            const result = await submitDeleteDocumentConfirmation();

            if (result.deleted) {
                router.navigate(
                    result.nextDocumentId ? `/documents/${encodeURIComponent(result.nextDocumentId)}` : '/documents',
                );
            }
            return;
        }
        case 'delete-api-token-confirm':
            await submitDeleteSettingsApiTokenConfirmation();
            return;
        case 'document-insert-table': {
            const inserted = await submitDocumentInsertTable();

            if (inserted) {
                scheduleDocumentAutosave(getState().documents.selectedId);
            }
            return;
        }
        case 'document-insert-note': {
            const inserted = submitDocumentInsertNote();

            if (inserted) {
                scheduleDocumentAutosave(getState().documents.selectedId);
            }
            return;
        }
        case 'apply-row-update-preview':
            await submitRowUpdatePreviewConfirmation();
            return;
        case 'generate-data':
            await submitGenerateDataRows();
            return;
        case 'create-media-tagging-tag-table':
            await submitCreateMediaTaggingTagTable();
            return;
        case 'create-media-tagging-mapping-table':
            await submitCreateMediaTaggingMappingTable();
            return;
        case 'copy-column':
            await submitCopyColumnModal(formData);
            return;
        case 'save-data-row': {
            const values = buildRowEditorSubmittedValues(formData, getRowEditorFieldMetadata(form));

            let rowIdentity = null;
            const rawRowIdentity = String(formData.get('rowIdentity') ?? '').trim();

            if (rawRowIdentity) {
                try {
                    rowIdentity = JSON.parse(rawRowIdentity);
                } catch (error) {
                    rowIdentity = null;
                }
            }

            await openDataRowUpdatePreview(String(formData.get('rowIndex') ?? ''), values, rowIdentity);
            return;
        }
        case 'save-editor-row': {
            const values = buildRowEditorSubmittedValues(formData, getRowEditorFieldMetadata(form));

            await openEditorRowUpdatePreview(String(formData.get('rowIndex') ?? ''), values);
            return;
        }
        case 'save-query-history-title': {
            const historyId = String(formData.get('historyId') ?? '');
            const updatedItem = await saveQueryHistoryTitle(historyId, String(formData.get('title') ?? ''));

            if (updatedItem) {
                syncQueryHistoryUi(historyId);
            }
            return;
        }
        case 'save-query-history-notes': {
            const historyId = String(formData.get('historyId') ?? '');
            const updatedItem = await saveQueryHistoryNotes(historyId, String(formData.get('notes') ?? ''));

            if (updatedItem) {
                syncQueryHistoryUi(historyId);
            }
            return;
        }
        default:
    }
});

subscribe(renderApp);
renderApp(getState());
initializeApp().then(() => {
    router.start();
});
