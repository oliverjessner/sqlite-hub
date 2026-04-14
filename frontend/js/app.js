import { renderAppShell } from "./components/appShell.js";
import { renderModal } from "./components/modal.js";
import { renderSidebar } from "./components/sidebar.js";
import { renderStatusBar } from "./components/statusBar.js";
import {
  mountStructureGraph,
  teardownStructureGraph,
  resetPersistedStructureGraphState,
} from "./components/structureGraph.js";
import {
  exportQueryChartAsPng,
  mountQueryChartRenderer,
  teardownQueryChartRenderer,
} from "./components/queryChartRenderer.js";
import { renderToasts } from "./components/toast.js";
import { renderTopNav } from "./components/topNav.js";
import { createRouter } from "./router.js";
import {
  createActiveConnectionBackup,
  clearCurrentQuery,
  clearDataRowSelection,
  clearEditorRowSelection,
  clearEditorResults,
  clearQueryHistorySelection,
  closeModal,
  deleteQueryHistoryStateItem,
  dismissToast,
  executeCurrentQuery,
  exportCurrentDataTableCsv,
  exportCurrentQueryCsv,
  getState,
  initializeApp,
  loadMoreQueryHistory,
  openModal,
  openOverviewInFinder,
  openQueryHistoryInEditor,
  openDeleteDataRowModal,
  openDeleteEditorRowModal,
  openDeleteQueryChartModal,
  openEditConnectionModal,
  openCreateQueryChartModal,
  openEditQueryChartModal,
  refreshCurrentRoute,
  removeConnection,
  runQueryHistoryItem,
  saveCurrentQueryChartDraft,
  selectDataRow,
  selectEditorRow,
  selectConnection,
  selectQueryHistoryItem,
  selectStructureEntry,
  setTableDesignerSearchQuery,
  setTableDesignerSqlPreviewVisibility,
  toggleStructureTablesPanel,
  setDataPage,
  setDataPageSize,
  setDataSearchColumn,
  setDataSearchQuery,
  toggleDataTablesPanel,
  setCurrentQuery,
  setChartsHeightPreset,
  setEditorPanelVisibility,
  setEditorTab,
  submitDeleteChartConfirmation,
  setQueryHistoryPanelVisibility,
  sortDataTableByColumn,
  sortEditorResultsByColumn,
  setQueryHistorySearchInput,
  setQueryHistoryTab,
  setRoute,
  saveQueryHistoryNotes,
  saveQueryHistoryTitle,
  saveCurrentTableDesignerDraft,
  toggleChartsResultsPanel,
  toggleChartsSqlPanel,
  queueTableDesignerCsvImport,
  showToast,
  submitCreateConnection,
  submitDeleteRowConfirmation,
  submitDataRowUpdate,
  submitEditorRowUpdate,
  submitEditConnection,
  submitImportSql,
  submitOpenConnection,
  subscribe,
  toggleQueryHistorySavedState,
  updateCurrentQueryChartDraftConfigField,
  updateCurrentQueryChartDraftField,
  updateCurrentTableDesignerColumnField,
  updateCurrentTableDesignerField,
  addCurrentTableDesignerColumn,
  removeCurrentTableDesignerColumn,
} from "./store.js";
import { renderChartsView } from "./views/charts.js";
import { renderConnectionsView } from "./views/connections.js";
import { renderDataView } from "./views/data.js";
import { renderEditorView } from "./views/editor.js";
import { renderLandingView } from "./views/landing.js";
import { renderOverviewView } from "./views/overview.js";
import { renderSettingsView } from "./views/settings.js";
import { renderStructureView } from "./views/structure.js";
import { renderTableDesignerView } from "./views/tableDesigner.js";
import { highlightSql } from "./utils/format.js";

const appRoot = document.querySelector("#app");

appRoot.innerHTML = renderAppShell();

const shellRefs = {
  shell: document.querySelector(".app-shell"),
  topNav: document.querySelector("#top-nav"),
  sidebar: document.querySelector("#sidebar"),
  view: document.querySelector("#app-view"),
  panel: document.querySelector("#app-panel"),
  statusBar: document.querySelector("#status-bar"),
  modal: document.querySelector("#modal-root"),
  toast: document.querySelector("#toast-root"),
};
let lastRenderedRoutePath = null;
let lastRenderedTopNavMarkup = "";
let lastRenderedSidebarMarkup = "";
let lastRenderedStatusBarMarkup = "";
let lastRenderedMainMarkup = "";
let lastRenderedPanelMarkup = "";
let lastRenderedModalMarkup = "";
let lastRenderedToastMarkup = "";
let lastRenderedPanelOpen = false;
let lastRenderedLockedRoute = false;
let pendingNewTableDesignerAutofocus = false;
let pendingQueryEditorFocus = false;

function invalidateMainRenderCache() {
  lastRenderedMainMarkup = null;
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

  const layer = textarea.closest(".query-editor-layer");
  const highlightNode = layer?.querySelector("[data-query-editor-highlight]");

  if (!(highlightNode instanceof HTMLElement)) {
    return;
  }

  highlightNode.innerHTML = renderQueryHighlightMarkup(textarea.value);
}

function syncQueryEditorScroll(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) {
    return;
  }

  const layer = textarea.closest(".query-editor-layer");
  const highlightNode = layer?.querySelector("[data-query-editor-highlight]");

  if (!(highlightNode instanceof HTMLElement)) {
    return;
  }

  highlightNode.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result ?? "");
      const markerIndex = result.indexOf(",");
      resolve(markerIndex >= 0 ? result.slice(markerIndex + 1) : result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("The selected logo could not be read."));
    };

    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result ?? ""));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("The selected CSV file could not be read."));
    };

    reader.readAsText(file);
  });
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
          <h1 class="mt-4 font-headline text-6xl font-black uppercase tracking-tight text-primary-container">
            404_SIGNAL
          </h1>
          <button
            class="standard-button mt-8 px-6 font-headline text-sm"
            data-action="navigate"
            data-to="/"
            type="button"
          >
            Return_Home
          </button>
        </div>
      </section>
    `,
    panel: "",
  };
}

function resolveView(state) {
  switch (state.route.name) {
    case "landing":
      return renderLandingView(state);
    case "connections":
      return renderConnectionsView(state);
    case "overview":
      return renderOverviewView(state);
    case "charts":
      return renderChartsView(state);
    case "data":
      return renderDataView(state);
    case "editor":
      return renderEditorView(state, { isResultsRoute: false });
    case "editorResults":
      return renderEditorView(state, { isResultsRoute: true });
    case "structure":
      return renderStructureView(state);
    case "tableDesigner":
      return renderTableDesignerView(state);
    case "settings":
      return renderSettingsView(state);
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
      `${bindSelector}[data-column-id="${CSS.escape(snapshot.columnId)}"][data-field="${CSS.escape(snapshot.field)}"]`
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
    .map((selector) => document.querySelector(selector))
    .find(
      (candidate) =>
        candidate instanceof HTMLInputElement ||
        candidate instanceof HTMLTextAreaElement ||
        candidate instanceof HTMLSelectElement
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
    typeof snapshot.selectionStart === "number" &&
    typeof snapshot.selectionEnd === "number"
  ) {
    nextElement.setSelectionRange(
      snapshot.selectionStart,
      snapshot.selectionEnd,
      snapshot.selectionDirection || "none"
    );
  }

  nextElement.scrollTop = snapshot.scrollTop;
  nextElement.scrollLeft = snapshot.scrollLeft;
  return true;
}

function focusNewTableDesignerNameField() {
  const input = document.querySelector(
    '[data-bind="table-designer-field"][data-field="tableName"]'
  );

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
    `[data-bind="table-designer-column-field"][data-column-id="${CSS.escape(columnId)}"][data-field="name"]`
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

async function handleTableDesignerCsvImport(fileInput) {
  if (!(fileInput instanceof HTMLInputElement)) {
    return;
  }

  const file = fileInput.files?.[0];

  if (!(file instanceof File)) {
    return;
  }

  if (!file.size) {
    showToast("The selected CSV file is empty.", "alert");
    fileInput.value = "";
    return;
  }

  try {
    const csvText = await readFileAsText(file);
    const imported = queueTableDesignerCsvImport(file.name, csvText);

    if (!imported) {
      return;
    }

    router.navigate("/table-designer/new");
    showToast(
      `Imported ${imported.columnCount} columns and ${imported.importedRowCount} row${
        imported.importedRowCount === 1 ? "" : "s"
      } from ${file.name}.`,
      "success"
    );
  } catch (error) {
    showToast(error?.message || "CSV import failed.", "alert");
  } finally {
    fileInput.value = "";
  }
}

function renderApp(state) {
  const previousRoutePath = lastRenderedRoutePath;
  const { main, panel } = resolveView(state);
  const topNavMarkup = renderTopNav(state);
  const sidebarMarkup = renderSidebar(state);
  const statusBarMarkup = renderStatusBar(state);
  const modalMarkup = renderModal(state);
  const toastMarkup = renderToasts(state.toasts);
  const isLockedRoute = ["editor", "editorResults", "data", "charts", "structure", "tableDesigner"].includes(
    state.route.name
  );
  const panelOpen = Boolean(panel);
  const shellMarkupUnchanged =
    state.route.path === lastRenderedRoutePath &&
    topNavMarkup === lastRenderedTopNavMarkup &&
    sidebarMarkup === lastRenderedSidebarMarkup &&
    statusBarMarkup === lastRenderedStatusBarMarkup &&
    main === lastRenderedMainMarkup &&
    panel === lastRenderedPanelMarkup &&
    modalMarkup === lastRenderedModalMarkup &&
    panelOpen === lastRenderedPanelOpen &&
    isLockedRoute === lastRenderedLockedRoute;

  if (shellMarkupUnchanged && toastMarkup !== lastRenderedToastMarkup) {
    shellRefs.toast.innerHTML = toastMarkup;
    lastRenderedToastMarkup = toastMarkup;
    return;
  }

  if (shellMarkupUnchanged && toastMarkup === lastRenderedToastMarkup) {
    return;
  }

  const focusedInput = captureFocusedInputState();
  const isEnteringNewTableDesignerRoute =
    state.route.name === "tableDesigner" &&
    state.route.params?.isNew &&
    previousRoutePath !== state.route.path;

  if (isEnteringNewTableDesignerRoute) {
    pendingNewTableDesignerAutofocus = true;
  } else if (state.route.name !== "tableDesigner" || !state.route.params?.isNew) {
    pendingNewTableDesignerAutofocus = false;
  }

  teardownStructureGraph();
  teardownQueryChartRenderer();
  shellRefs.topNav.innerHTML = topNavMarkup;
  shellRefs.sidebar.innerHTML = sidebarMarkup;
  shellRefs.statusBar.innerHTML = statusBarMarkup;
  shellRefs.view.innerHTML = main;
  shellRefs.view.classList.toggle("app-main-scroll--locked", isLockedRoute);
  shellRefs.panel.innerHTML = panel;
  shellRefs.modal.innerHTML = modalMarkup;
  shellRefs.toast.innerHTML = toastMarkup;
  shellRefs.shell.classList.toggle("panel-open", panelOpen);

  if (
    pendingQueryEditorFocus &&
    (state.route.name === "editor" || state.route.name === "editorResults")
  ) {
    if (focusQueryEditorInput()) {
      pendingQueryEditorFocus = false;
    }
  } else if (
    pendingNewTableDesignerAutofocus &&
    state.route.name === "tableDesigner" &&
    state.route.params?.isNew &&
    state.tableDesigner.draft?.mode === "create"
  ) {
    if (focusNewTableDesignerNameField()) {
      pendingNewTableDesignerAutofocus = false;
    }
  } else {
    restoreFocusedInputState(focusedInput);
  }

  lastRenderedRoutePath = state.route.path;
  lastRenderedTopNavMarkup = topNavMarkup;
  lastRenderedSidebarMarkup = sidebarMarkup;
  lastRenderedStatusBarMarkup = statusBarMarkup;
  lastRenderedMainMarkup = main;
  lastRenderedPanelMarkup = panel;
  lastRenderedModalMarkup = modalMarkup;
  lastRenderedToastMarkup = toastMarkup;
  lastRenderedPanelOpen = panelOpen;
  lastRenderedLockedRoute = isLockedRoute;

  if (state.route.name === "structure") {
    mountStructureGraph(state).catch((error) => {
      console.error("Failed to mount structure graph.", error);
    });
  }

  if (state.route.name === "charts") {
    mountQueryChartRenderer(state);
  }
}

const router = createRouter((route) => {
  setRoute(route);
});

async function executeEditorQueryAndNavigate() {
  const success = await executeCurrentQuery();
  router.navigate(success ? "/editor/results" : "/editor");
}

async function handleAction(actionNode) {
  const { action } = actionNode.dataset;

  switch (action) {
    case "navigate":
      router.navigate(actionNode.dataset.to ?? "/");
      return;
    case "refresh-view":
      await refreshCurrentRoute();
      return;
    case "open-modal":
      openModal(actionNode.dataset.modal);
      return;
    case "open-create-query-chart-modal":
      openCreateQueryChartModal();
      return;
    case "open-edit-query-chart-modal":
      openEditQueryChartModal(actionNode.dataset.chartId);
      return;
    case "open-delete-query-chart-modal":
      openDeleteQueryChartModal(actionNode.dataset.chartId);
      return;
    case "edit-connection":
      openEditConnectionModal(actionNode.dataset.connectionId);
      return;
    case "close-modal":
      closeModal();
      return;
    case "dismiss-toast":
      dismissToast(actionNode.dataset.toastId);
      return;
    case "select-connection": {
      resetStructureGraphForDatabaseChange();
      const next = await selectConnection(actionNode.dataset.connectionId);
      if (next) {
        router.navigate("/overview");
      }
      return;
    }
    case "remove-connection": {
      const isActiveConnection = getState().connections.active?.id === actionNode.dataset.connectionId;

      if (isActiveConnection) {
        resetStructureGraphForDatabaseChange();
      }

      const removed = await removeConnection(actionNode.dataset.connectionId);
      if (removed) {
        const nextState = getState();
        if (!nextState.connections.active && nextState.route.name !== "connections") {
          router.navigate("/connections");
        } else {
          await refreshCurrentRoute();
        }
      }
      return;
    }
    case "create-backup":
      await createActiveConnectionBackup();
      return;
    case "open-overview-in-finder":
      await openOverviewInFinder();
      return;
    case "execute-query": {
      await executeEditorQueryAndNavigate();
      return;
    }
    case "delete-data-row":
      openDeleteDataRowModal(actionNode.dataset.rowIndex);
      return;
    case "delete-editor-row":
      openDeleteEditorRowModal(actionNode.dataset.rowIndex);
      return;
    case "clear-query":
      pendingQueryEditorFocus = true;
      clearCurrentQuery();
      if (getState().route.name === "editorResults") {
        router.navigate("/editor");
      }
      return;
    case "clear-results":
      clearEditorResults();
      router.navigate("/editor");
      return;
    case "select-query-history-item":
      if (actionNode.dataset.historyId) {
        await selectQueryHistoryItem(actionNode.dataset.historyId);
      }
      return;
    case "clear-query-history-selection":
      clearQueryHistorySelection();
      return;
    case "set-query-history-tab":
      if (actionNode.dataset.tab) {
        await setQueryHistoryTab(actionNode.dataset.tab);
      }
      return;
    case "toggle-query-history-panel":
      setQueryHistoryPanelVisibility(
        actionNode.dataset.nextValue ? actionNode.dataset.nextValue === "true" : undefined
      );
      return;
    case "toggle-editor-panel":
      setEditorPanelVisibility(
        actionNode.dataset.nextValue ? actionNode.dataset.nextValue === "true" : undefined
      );
      return;
    case "load-more-query-history":
      await loadMoreQueryHistory();
      return;
    case "open-query-history":
      if (actionNode.dataset.historyId && openQueryHistoryInEditor(actionNode.dataset.historyId)) {
        router.navigate("/editor");
      }
      return;
    case "run-query-history":
      if (actionNode.dataset.historyId) {
        const success = await runQueryHistoryItem(actionNode.dataset.historyId);
        router.navigate(success ? "/editor/results" : "/editor");
      }
      return;
    case "toggle-query-history-saved":
      if (actionNode.dataset.historyId) {
        await toggleQueryHistorySavedState(
          actionNode.dataset.historyId,
          actionNode.dataset.nextValue === "true"
        );
      }
      return;
    case "toggle-charts-sql-panel":
      toggleChartsSqlPanel();
      return;
    case "toggle-charts-results-panel":
      toggleChartsResultsPanel();
      return;
    case "set-charts-height-preset":
      if (actionNode.dataset.preset) {
        setChartsHeightPreset(actionNode.dataset.preset);
      }
      return;
    case "export-query-chart-png":
      if (actionNode.dataset.chartId && !exportQueryChartAsPng(actionNode.dataset.chartId)) {
        showToast("The selected chart is not ready for PNG export.", "alert");
      }
      return;
    case "delete-query-history":
      if (
        actionNode.dataset.historyId &&
        window.confirm("Delete this query history item and all recorded runs?")
      ) {
        await deleteQueryHistoryStateItem(actionNode.dataset.historyId);
      }
      return;
    case "set-editor-tab": {
      const tab = actionNode.dataset.tab;
      if (!tab) {
        return;
      }
      setEditorTab(tab);
      router.navigate(tab === "results" ? "/editor/results" : "/editor");
      return;
    }
    case "export-query-csv":
      await exportCurrentQueryCsv();
      return;
    case "export-data-csv":
      await exportCurrentDataTableCsv();
      return;
    case "toggle-data-tables":
      toggleDataTablesPanel();
      return;
    case "toggle-structure-tables":
      toggleStructureTablesPanel();
      return;
    case "select-structure-entry":
      if (actionNode.dataset.entryName) {
        await selectStructureEntry(actionNode.dataset.entryName);
      }
      return;
    case "add-table-designer-column":
      {
        const columnId = addCurrentTableDesignerColumn();
        if (columnId) {
          window.requestAnimationFrame(() => {
            focusTableDesignerColumnNameField(columnId);
          });
        }
      }
      return;
    case "remove-table-designer-column":
      if (actionNode.dataset.columnId) {
        removeCurrentTableDesignerColumn(actionNode.dataset.columnId);
      }
      return;
    case "save-table-designer": {
      const savedTableName = await saveCurrentTableDesignerDraft();
      if (savedTableName) {
        router.navigate(`/table-designer/${encodeURIComponent(savedTableName)}`);
      }
      return;
    }
    case "copy-table-designer-sql": {
      const sqlPreview = getState().tableDesigner.draft?.sqlPreview ?? "";
      if (!sqlPreview.trim()) {
        return;
      }

      try {
        await navigator.clipboard.writeText(sqlPreview);
        showToast("SQL preview copied.", "success");
      } catch (error) {
        showToast("Clipboard access failed.", "alert");
      }
      return;
    }
    case "toggle-table-designer-sql-preview":
      setTableDesignerSqlPreviewVisibility(
        actionNode.dataset.nextValue ? actionNode.dataset.nextValue === "true" : undefined
      );
      return;
    case "import-table-designer-csv": {
      const fileInput = document.querySelector('[data-bind="table-designer-import-file"]');

      if (!(fileInput instanceof HTMLInputElement)) {
        return;
      }

      fileInput.value = "";
      fileInput.click();
      return;
    }
    case "select-data-row":
      if (actionNode.dataset.rowIndex) {
        selectDataRow(actionNode.dataset.rowIndex);
      }
      return;
    case "select-editor-row":
      if (actionNode.dataset.rowIndex) {
        selectEditorRow(actionNode.dataset.rowIndex);
      }
      return;
    case "clear-data-row-selection":
      clearDataRowSelection();
      return;
    case "clear-editor-row-selection":
      clearEditorRowSelection();
      return;
    case "set-data-page":
      if (actionNode.dataset.page) {
        await setDataPage(actionNode.dataset.page);
      }
      return;
    case "sort-data-column":
      if (actionNode.dataset.columnName) {
        await sortDataTableByColumn(actionNode.dataset.columnName);
      }
      return;
    case "sort-editor-results-column":
      if (actionNode.dataset.columnName) {
        sortEditorResultsByColumn(actionNode.dataset.columnName);
      }
      return;
    case "set-data-page-size":
      if (actionNode.dataset.pageSize) {
        await setDataPageSize(actionNode.dataset.pageSize);
      }
      return;
    case "reload-data-route":
      await refreshCurrentRoute();
      return;
    default:
  }
}

document.addEventListener("click", (event) => {
  const actionNode = event.target.closest("[data-action]");

  if (!actionNode) {
    return;
  }

  handleAction(actionNode);
});

document.addEventListener("keydown", (event) => {
  const target = event.target;

  if (
    event.key === "Enter" &&
    event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.defaultPrevented &&
    target instanceof HTMLTextAreaElement &&
    target.dataset.bind === "current-query"
  ) {
    event.preventDefault();

    if (!getState().editor.executing) {
      void executeEditorQueryAndNavigate();
    }

    return;
  }

  if (event.key !== "Escape" || event.defaultPrevented) {
    return;
  }

  const state = getState();

  if (state.modal) {
    event.preventDefault();
    closeModal();
    return;
  }

  if (state.route.name === "data" && typeof state.dataBrowser.selectedRowIndex === "number") {
    event.preventDefault();
    clearDataRowSelection();
    return;
  }

  if (state.route.name === "editorResults" && typeof state.editor.selectedRowIndex === "number") {
    event.preventDefault();
    clearEditorRowSelection();
  }
});

document.addEventListener("input", (event) => {
  const bindNode = event.target.closest("[data-bind]");

  if (!bindNode) {
    return;
  }

  if (bindNode.dataset.bind === "current-query") {
    invalidateMainRenderCache();
    syncQueryEditorHighlight(bindNode);
    syncQueryEditorScroll(bindNode);
    setCurrentQuery(bindNode.value);
    return;
  }

  if (bindNode.dataset.bind === "data-search-query") {
    setDataSearchQuery(bindNode.value);
    return;
  }

  if (bindNode.dataset.bind === "table-designer-search") {
    setTableDesignerSearchQuery(bindNode.value);
    return;
  }

  if (bindNode.dataset.bind === "table-designer-field") {
    if (bindNode instanceof HTMLInputElement && bindNode.type === "checkbox") {
      return;
    }

    updateCurrentTableDesignerField(bindNode.dataset.field, bindNode.value);
    return;
  }

  if (bindNode.dataset.bind === "table-designer-column-field") {
    updateCurrentTableDesignerColumnField(
      bindNode.dataset.columnId,
      bindNode.dataset.field,
      bindNode.value
    );
    return;
  }

  if (bindNode.dataset.bind === "query-history-search") {
    setQueryHistorySearchInput(bindNode.value);
    return;
  }

  if (bindNode.dataset.bind === "query-chart-draft:name") {
    updateCurrentQueryChartDraftField("name", bindNode.value);
  }
});

document.addEventListener(
  "scroll",
  (event) => {
    const target = event.target;

    if (!(target instanceof HTMLTextAreaElement) || target.dataset.bind !== "current-query") {
      return;
    }

    syncQueryEditorScroll(target);
  },
  true
);

document.addEventListener("change", (event) => {
  const bindNode = event.target.closest("[data-bind]");

  if (!bindNode) {
    return;
  }

  if (bindNode.dataset.bind === "data-search-column") {
    setDataSearchColumn(bindNode.value);
    return;
  }

  if (bindNode.dataset.bind === "table-designer-import-file") {
    void handleTableDesignerCsvImport(bindNode);
    return;
  }

  if (bindNode.dataset.bind === "table-designer-field") {
    if (bindNode instanceof HTMLInputElement && bindNode.type === "checkbox") {
      updateCurrentTableDesignerField(bindNode.dataset.field, bindNode.checked);
      return;
    }

    updateCurrentTableDesignerField(bindNode.dataset.field, bindNode.value);
    return;
  }

  if (bindNode.dataset.bind === "table-designer-column-field") {
    updateCurrentTableDesignerColumnField(
      bindNode.dataset.columnId,
      bindNode.dataset.field,
      bindNode.value
    );
    return;
  }

  if (bindNode.dataset.bind === "table-designer-column-flag") {
    updateCurrentTableDesignerColumnField(
      bindNode.dataset.columnId,
      bindNode.dataset.field,
      bindNode.checked
    );
    return;
  }

  if (bindNode.dataset.bind === "query-chart-draft:chartType") {
    updateCurrentQueryChartDraftField("chartType", bindNode.value);
    return;
  }

  if (bindNode.dataset.bind === "query-chart-draft:tableVisible") {
    updateCurrentQueryChartDraftField("tableVisible", bindNode.checked);
    return;
  }

  if (bindNode.dataset.bind?.startsWith("query-chart-draft-config:")) {
    const field = bindNode.dataset.bind.slice("query-chart-draft-config:".length);
    const value =
      bindNode instanceof HTMLInputElement && bindNode.type === "checkbox"
        ? bindNode.checked
        : bindNode.value === ""
          ? null
          : bindNode.value;
    updateCurrentQueryChartDraftConfigField(field, value);
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-form]");

  if (!form) {
    return;
  }

  event.preventDefault();
  const formData = new FormData(form);

  switch (form.dataset.form) {
    case "open-connection": {
      resetStructureGraphForDatabaseChange();
      const connection = await submitOpenConnection({
        path: String(formData.get("path") ?? ""),
        label: String(formData.get("label") ?? ""),
        readOnly: formData.get("readOnly") === "on",
      });

      if (connection) {
        router.navigate("/overview");
      }
      return;
    }
    case "create-connection": {
      resetStructureGraphForDatabaseChange();
      const connection = await submitCreateConnection({
        path: String(formData.get("path") ?? ""),
        label: String(formData.get("label") ?? ""),
      });

      if (connection) {
        router.navigate("/overview");
      }
      return;
    }
    case "import-sql": {
      resetStructureGraphForDatabaseChange();
      const targetMode = String(formData.get("targetMode") ?? "active");
      const payload = {
        sqlFilePath: String(formData.get("sqlFilePath") ?? ""),
        label: String(formData.get("label") ?? ""),
      };

      if (targetMode === "recent") {
        payload.targetConnectionId = String(formData.get("targetConnectionId") ?? "");
      } else if (targetMode === "create") {
        payload.createNew = true;
        payload.targetPath = String(formData.get("targetPath") ?? "");
      } else if (targetMode === "path") {
        payload.targetPath = String(formData.get("targetPath") ?? "");
      }

      const result = await submitImportSql(payload);
      if (result) {
        router.navigate("/overview");
      }
      return;
    }
    case "edit-connection": {
      const connectionId = String(formData.get("connectionId") ?? "");
      const isActiveConnection = getState().connections.active?.id === connectionId;
      const logoFile = formData.get("logoFile");
      const logoUpload = await buildConnectionLogoUpload(logoFile);

      if (isActiveConnection) {
        resetStructureGraphForDatabaseChange();
      }

      await submitEditConnection(connectionId, {
        path: String(formData.get("path") ?? ""),
        label: String(formData.get("label") ?? ""),
        readOnly: formData.get("readOnly") === "on",
        clearLogo: formData.get("clearLogo") === "on" && !logoUpload,
        logoUpload,
      });

      return;
    }
    case "delete-row-confirm":
      await submitDeleteRowConfirmation();
      return;
    case "save-query-chart":
      await saveCurrentQueryChartDraft();
      return;
    case "delete-query-chart":
      await submitDeleteChartConfirmation();
      return;
    case "save-data-row": {
      const values = {};

      for (const [key, value] of formData.entries()) {
        if (!key.startsWith("field:")) {
          continue;
        }

        values[key.slice("field:".length)] = String(value ?? "");
      }

      await submitDataRowUpdate(
        String(formData.get("rowIndex") ?? ""),
        values
      );
      return;
    }
    case "save-editor-row": {
      const values = {};

      for (const [key, value] of formData.entries()) {
        if (!key.startsWith("field:")) {
          continue;
        }

        values[key.slice("field:".length)] = String(value ?? "");
      }

      await submitEditorRowUpdate(
        String(formData.get("rowIndex") ?? ""),
        values
      );
      return;
    }
    case "save-query-history-title":
      await saveQueryHistoryTitle(
        String(formData.get("historyId") ?? ""),
        String(formData.get("title") ?? "")
      );
      return;
    case "save-query-history-notes":
      await saveQueryHistoryNotes(
        String(formData.get("historyId") ?? ""),
        String(formData.get("notes") ?? "")
      );
      return;
    default:
  }
});

subscribe(renderApp);
renderApp(getState());
initializeApp().then(() => {
  router.start();
});
