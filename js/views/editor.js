import { renderBottomTabs } from "../components/bottomTabs.js";
import { renderQueryEditor } from "../components/queryEditor.js";
import { renderQueryResultsPane } from "../components/queryResults.js";
import { getCurrentConnection, getQueryMessages, getQueryPerformance } from "../store.js";
import { escapeHtml, formatNumber } from "../utils/format.js";

function renderMissingDatabase() {
  return `
    <div class="flex flex-1 flex-col items-center justify-center bg-surface-container-lowest px-8 text-center">
      <span class="material-symbols-outlined mb-3 text-5xl text-on-surface-variant/25">database_off</span>
      <p class="font-headline text-xl font-black uppercase tracking-tight text-primary-container">
        No Active SQLite Database
      </p>
      <p class="mt-3 max-w-xl text-sm leading-7 text-on-surface-variant/65">
        Connect a local SQLite database before executing statements or exporting query results.
      </p>
    </div>
  `;
}

function renderMessagesPane(state) {
  const items = getQueryMessages(state);

  return `
    <div class="custom-scrollbar h-full overflow-auto bg-surface-container-lowest px-6 py-6">
      <div class="space-y-4">
        ${items
          .map(
            (item) => `
              <div class="border border-outline-variant/10 bg-surface-container-low px-4 py-4">
                <div class="text-[10px] font-mono uppercase tracking-[0.2em] ${
                  item.tone === "alert" ? "text-error" : "text-primary-container"
                }">
                  ${escapeHtml(item.label)}
                </div>
                <div class="mt-2 text-sm text-on-surface">${escapeHtml(item.value)}</div>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderPerformancePane(state) {
  const metrics = getQueryPerformance(state);

  return `
    <div class="grid flex-1 grid-cols-1 gap-4 bg-surface-container-lowest p-6 md:grid-cols-4">
      <div class="metric-card">
        <span class="text-[10px] font-mono uppercase text-on-surface/40">Exec_Time</span>
        <span class="font-headline text-3xl font-bold text-on-surface">${escapeHtml(
          String(metrics.timingMs ?? 0)
        )}ms</span>
        <span class="text-[10px] text-primary-container">Measured backend execution time</span>
      </div>
      <div class="metric-card">
        <span class="text-[10px] font-mono uppercase text-on-surface/40">Statements</span>
        <span class="font-headline text-3xl font-bold text-on-surface">${escapeHtml(
          formatNumber(metrics.statementCount)
        )}</span>
        <span class="text-[10px] text-on-surface/40">Split and executed by SQLite</span>
      </div>
      <div class="metric-card">
        <span class="text-[10px] font-mono uppercase text-on-surface/40">Rows_Returned</span>
        <span class="font-headline text-3xl font-bold text-on-surface">${escapeHtml(
          formatNumber(metrics.rowCount)
        )}</span>
        <span class="text-[10px] text-on-surface/40">Visible result set size</span>
      </div>
      <div class="metric-card metric-card--accent">
        <span class="text-[10px] font-mono uppercase text-on-surface/40">Rows_Affected</span>
        <span class="font-headline text-3xl font-bold text-on-surface">${escapeHtml(
          formatNumber(metrics.affectedRowCount)
        )}</span>
        <span class="text-[10px] text-primary-container">INSERT / UPDATE / DELETE impact</span>
      </div>
    </div>
  `;
}

function renderResultsSurface(state, isResultsRoute) {
  const activeTab = state.editor.activeTab;
  const counts = {
    resultRows: state.editor.result?.rows?.length ?? 0,
    messages: getQueryMessages(state).length,
    statementCount: state.editor.result?.statementCount ?? 0,
  };

  let content = renderMessagesPane(state);

  if (activeTab === "performance") {
    content = renderPerformancePane(state);
  } else if (activeTab === "results") {
    content = state.connections.active
      ? renderQueryResultsPane(state.editor.result, {
          exporting: state.editor.exportLoading,
        })
      : renderMissingDatabase();
  }

  return `
    <div class="flex h-full min-h-0 flex-col border-t border-outline-variant/10 bg-surface-container-lowest">
      ${renderBottomTabs(activeTab, counts)}
      <div class="min-h-0 flex-1">${content}</div>
    </div>
  `;
}

export function renderEditorView(state, { isResultsRoute = false } = {}) {
  const connection = getCurrentConnection(state);
  const editorSectionClass = isResultsRoute ? "h-1/4" : "min-h-[27.5%]";
  const resultsSectionClass = isResultsRoute ? "h-3/4" : "flex-1";

  return {
    main: `
      <section class="view-surface flex h-full min-h-0 flex-col overflow-hidden">
        <div class="flex h-full min-h-0 flex-1 flex-col">
          <section class="${editorSectionClass} flex min-h-0 flex-col ${
            isResultsRoute ? "border-b-4 border-background" : ""
          }">
            ${renderQueryEditor({
              query: state.editor.sqlText,
              executing: state.editor.executing,
              history: state.editor.history,
              historyLoading: state.editor.historyLoading,
              title: connection?.label ?? "SQLite Query Workspace",
            })}
          </section>
          <section class="${resultsSectionClass} flex min-h-0 flex-col overflow-hidden">
            ${renderResultsSurface(state, isResultsRoute)}
          </section>
        </div>
      </section>
    `,
    panel: "",
  };
}
