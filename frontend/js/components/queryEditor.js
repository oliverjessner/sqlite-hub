import { escapeHtml, highlightSql } from "../utils/format.js";
import { renderActionBar } from "./actionBar.js";

function renderLineNumbers(query) {
  const lineCount = Math.max(1, String(query || "").split("\n").length);

  return Array.from({ length: lineCount }, (_, index) => index + 1)
    .map((value) => `<span>${String(value).padStart(2, "0")}</span>`)
    .join("");
}

function renderHighlightedQuery(query) {
  if (query) {
    return highlightSql(query);
  }

  return '<span class="text-on-surface-variant/35">SELECT name FROM sqlite_master WHERE type = \'table\';</span>';
}

function renderEditorSurface({ query }) {
  return [
    '<div class="query-editor-shell flex min-h-0 flex-1 overflow-hidden">',
    '<div class="flex w-12 min-h-0 overflow-hidden bg-surface-container-lowest py-4 font-mono text-xs select-none text-outline-variant/30">',
    '<div class="query-editor-gutter-track flex w-full flex-col items-center" data-query-editor-gutter>',
    renderLineNumbers(query),
    "</div></div>",
    '<div class="relative min-h-0 flex-1 overflow-hidden bg-surface-container p-6 font-mono text-sm leading-relaxed">',
    '<div class="pointer-events-none absolute right-0 top-0 p-4 opacity-5"><span class="material-symbols-outlined text-[120px] font-thin">terminal</span></div>',
    '<div class="query-editor-layer relative z-10 h-full min-h-[140px]">',
    '<div aria-hidden="true" class="query-editor-highlight" data-query-editor-highlight>',
    renderHighlightedQuery(query),
    "</div>",
    '<textarea class="query-editor-input custom-scrollbar relative z-10 h-full min-h-[140px] w-full resize-none border-none focus:ring-0" data-bind="current-query" placeholder="SELECT name FROM sqlite_master WHERE type = \'table\';" spellcheck="false">',
    escapeHtml(query),
    "</textarea></div></div></div>",
  ].join("");
}

export function renderQueryEditor({
  query,
  executing = false,
  exporting = false,
  historyLoading = false,
  historyTotal = 0,
  editorVisible = true,
  historyVisible = true,
}) {
  const secondaryButtonClass = "standard-button";
  const left = `
    <div class="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-on-surface-variant/40">
      <span class="material-symbols-outlined text-xs">history</span>
      ${historyLoading ? "Loading history..." : `${historyTotal} queries tracked`}
    </div>
  `;

  const right = `
    <button
      class="${secondaryButtonClass}"
      data-action="toggle-editor-panel"
      data-next-value="${editorVisible ? "false" : "true"}"
      type="button"
    >
      <span class="material-symbols-outlined text-sm">${editorVisible ? "keyboard_arrow_down" : "terminal"}</span>
      ${editorVisible ? "Hide Editor" : "Show Editor"}
    </button>
    <button
      class="${secondaryButtonClass}"
      data-action="toggle-query-history-panel"
      data-next-value="${historyVisible ? "false" : "true"}"
      type="button"
    >
      <span class="material-symbols-outlined text-sm">${historyVisible ? "visibility_off" : "history"}</span>
      ${historyVisible ? "Hide History" : "Show History"}
    </button>
    <button
      class="${secondaryButtonClass}"
      data-action="clear-query"
      type="button"
    >
      Clear
    </button>
    <button
      class="${secondaryButtonClass}"
      data-action="export-query-csv"
      type="button"
    >
      ${exporting ? "Exporting..." : "Export CSV"}
    </button>
    <button
      class="signature-button"
      data-action="execute-query"
      type="button"
    >
      ${executing ? "RUNNING..." : "EXECUTE"}
    </button>
  `;

  return `
    <div class="flex h-full min-h-0 flex-col">
      <div class="bg-surface-container-low px-6 py-3">
        ${renderActionBar({
          left,
          right,
          className: "flex-wrap",
        })}
      </div>
      ${
        editorVisible
          ? `
            <div class="flex min-h-0 flex-1 flex-col">
              ${renderEditorSurface({ query })}
            </div>
          `
          : ""
      }
    </div>
  `;
}
