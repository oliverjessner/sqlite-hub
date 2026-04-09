import { renderAppShell } from "./components/appShell.js";
import { renderModal } from "./components/modal.js";
import { renderSidebar } from "./components/sidebar.js";
import { renderStatusBar } from "./components/statusBar.js";
import {
  mountStructureGraph,
  resetPersistedStructureGraphState,
  teardownStructureGraph,
} from "./components/structureGraph.js";
import { renderToasts } from "./components/toast.js";
import { renderTopNav } from "./components/topNav.js";
import { createRouter } from "./router.js";
import {
  createActiveConnectionBackup,
  clearCurrentQuery,
  clearDataRowSelection,
  clearEditorRowSelection,
  clearEditorResults,
  clearSqlHistoryStateAndData,
  closeModal,
  dismissToast,
  executeCurrentQuery,
  exportCurrentDataTableCsv,
  exportCurrentQueryCsv,
  getState,
  initializeApp,
  loadQueryFromHistory,
  openModal,
  openDeleteDataRowModal,
  openDeleteEditorRowModal,
  openEditConnectionModal,
  refreshCurrentRoute,
  removeConnection,
  selectDataRow,
  selectEditorRow,
  selectConnection,
  selectStructureEntry,
  setDataPage,
  setDataPageSize,
  setCurrentQuery,
  setEditorTab,
  setRoute,
  submitCreateConnection,
  submitDeleteRowConfirmation,
  submitDataRowUpdate,
  submitEditorRowUpdate,
  submitEditConnection,
  submitImportSql,
  submitOpenConnection,
  subscribe,
} from "./store.js";
import { renderConnectionsView } from "./views/connections.js";
import { renderDataView } from "./views/data.js";
import { renderEditorView } from "./views/editor.js";
import { renderLandingView } from "./views/landing.js";
import { renderOverviewView } from "./views/overview.js";
import { renderSettingsView } from "./views/settings.js";
import { renderStructureView } from "./views/structure.js";
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
            class="mt-8 bg-primary-container px-6 py-3 font-headline text-sm font-bold uppercase tracking-[0.2em] text-on-primary"
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
    case "data":
      return renderDataView(state);
    case "editor":
      return renderEditorView(state, { isResultsRoute: false });
    case "editorResults":
      return renderEditorView(state, { isResultsRoute: true });
    case "structure":
      return renderStructureView(state);
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
    !(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
  ) {
    return null;
  }

  const { bind } = activeElement.dataset;
  if (!bind) {
    return null;
  }

  return {
    bind,
    selectionStart: activeElement.selectionStart,
    selectionEnd: activeElement.selectionEnd,
    selectionDirection: activeElement.selectionDirection,
    scrollTop: activeElement.scrollTop,
    scrollLeft: activeElement.scrollLeft,
  };
}

function restoreFocusedInputState(snapshot) {
  if (!snapshot) {
    return;
  }

  const selector = `[data-bind="${CSS.escape(snapshot.bind)}"]`;
  const nextElement = document.querySelector(selector);

  if (
    !nextElement ||
    !(nextElement instanceof HTMLInputElement || nextElement instanceof HTMLTextAreaElement)
  ) {
    return;
  }

  nextElement.focus({ preventScroll: true });

  if (
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
}

function renderApp(state) {
  const focusedInput = captureFocusedInputState();
  const { main, panel } = resolveView(state);
  const isLockedRoute = ["editor", "editorResults", "data"].includes(state.route.name);

  teardownStructureGraph();
  shellRefs.topNav.innerHTML = renderTopNav(state);
  shellRefs.sidebar.innerHTML = renderSidebar(state);
  shellRefs.statusBar.innerHTML = renderStatusBar(state);
  shellRefs.view.innerHTML = main;
  shellRefs.view.classList.toggle("app-main-scroll--locked", isLockedRoute);
  shellRefs.panel.innerHTML = panel;
  shellRefs.modal.innerHTML = renderModal(state);
  shellRefs.toast.innerHTML = renderToasts(state.toasts);
  shellRefs.shell.classList.toggle("panel-open", Boolean(panel));
  restoreFocusedInputState(focusedInput);

  if (state.route.name === "structure") {
    mountStructureGraph(state).catch((error) => {
      console.error("Failed to mount structure graph.", error);
    });
  }
}

const router = createRouter((route) => {
  setRoute(route);
});

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
    case "execute-query": {
      const success = await executeCurrentQuery();
      router.navigate(success ? "/editor/results" : "/editor");
      return;
    }
    case "delete-data-row":
      openDeleteDataRowModal(actionNode.dataset.rowIndex);
      return;
    case "delete-editor-row":
      openDeleteEditorRowModal(actionNode.dataset.rowIndex);
      return;
    case "clear-query":
      clearCurrentQuery();
      return;
    case "clear-results":
      clearEditorResults();
      router.navigate("/editor");
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
    case "clear-sql-history":
      await clearSqlHistoryStateAndData();
      return;
    case "export-query-csv":
      await exportCurrentQueryCsv();
      return;
    case "export-data-csv":
      await exportCurrentDataTableCsv();
      return;
    case "select-structure-entry":
      if (actionNode.dataset.entryName) {
        await selectStructureEntry(actionNode.dataset.entryName);
      }
      return;
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
    syncQueryEditorHighlight(bindNode);
    syncQueryEditorScroll(bindNode);
    setCurrentQuery(bindNode.value);
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

  if (bindNode.dataset.bind === "history-entry" && bindNode.value) {
    loadQueryFromHistory(bindNode.value);
    bindNode.value = "";
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

      if (isActiveConnection) {
        resetStructureGraphForDatabaseChange();
      }

      await submitEditConnection(connectionId, {
        path: String(formData.get("path") ?? ""),
        label: String(formData.get("label") ?? ""),
        readOnly: formData.get("readOnly") === "on",
      });

      return;
    }
    case "delete-row-confirm":
      await submitDeleteRowConfirmation();
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
    default:
  }
});

subscribe(renderApp);
renderApp(getState());
initializeApp().then(() => {
  router.start();
});
