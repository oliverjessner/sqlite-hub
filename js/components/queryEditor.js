import { escapeHtml, highlightSql } from "../utils/format.js";
import { renderActionBar } from "./actionBar.js";

function renderLineNumbers(query) {
  const lineCount = Math.max(1, String(query || "").split("\n").length);

  return Array.from({ length: lineCount }, (_, index) => index + 1)
    .map((value) => `<span>${String(value).padStart(2, "0")}</span>`)
    .join("");
}

function renderHistoryOptions(history) {
  if (!history.length) {
    return '<option value="">No recent statements</option>';
  }

  return [
    '<option value="">Load recent statement...</option>',
    ...history.map(
      (entry) => `
        <option value="${escapeHtml(entry.id)}">
          ${escapeHtml(entry.sql.replace(/\s+/g, " ").slice(0, 96))}
        </option>
      `
    ),
  ].join("");
}

function renderHighlightedQuery(query) {
  if (query) {
    return highlightSql(query);
  }

  return '<span class="text-on-surface-variant/35">SELECT name FROM sqlite_master WHERE type = \'table\';</span>';
}

export function renderQueryEditor({
  query,
  title,
  executing = false,
  history = [],
  historyLoading = false,
}) {
  const left = `
    <div class="flex items-center gap-2 bg-surface-container-lowest px-3 py-1">
      <span class="material-symbols-outlined text-xs text-[#FCE300]">database</span>
      <span class="text-[10px] font-mono uppercase tracking-widest text-on-surface-variant">${escapeHtml(
        title
      )}</span>
    </div>
    <div class="hidden items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-on-surface-variant/40 md:flex">
      <span class="material-symbols-outlined text-xs">history</span>
      ${historyLoading ? "Loading history..." : `${history.length} statements in history`}
    </div>
  `;

  const right = `
    <select
      class="min-w-[220px] border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-[10px] font-mono uppercase tracking-[0.14em] text-on-surface-variant outline-none"
      data-bind="history-entry"
    >
      ${renderHistoryOptions(history)}
    </select>
    <button
      class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-on-surface hover:bg-surface-container-highest transition-colors"
      data-action="clear-sql-history"
      type="button"
    >
      Clear History
    </button>
    <button
      class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-on-surface hover:bg-surface-container-highest transition-colors"
      data-action="clear-query"
      type="button"
    >
      Clear
    </button>
    <button
      class="bg-primary-container px-6 py-1.5 text-xs font-black uppercase tracking-tighter text-on-primary shadow-[0_0_15px_-5px_rgba(252,227,0,0.4)] transition-all hover:brightness-110"
      data-action="execute-query"
      type="button"
    >
      ${executing ? "RUNNING..." : "EXECUTE"}
    </button>
  `;

  return `
    <div class="flex h-full flex-col">
      <div class="bg-surface-container-low px-6 py-3">
        ${renderActionBar({
          left,
          right,
          className: "flex-wrap",
        })}
      </div>
      <div class="flex flex-1 overflow-hidden">
        <div class="flex w-12 flex-col items-center bg-surface-container-lowest py-4 font-mono text-xs select-none text-outline-variant/30">
          ${renderLineNumbers(query)}
        </div>
        <div class="relative flex-1 overflow-hidden bg-surface-container p-6 font-mono text-sm leading-relaxed">
          <div class="pointer-events-none absolute right-0 top-0 p-4 opacity-5">
            <span class="material-symbols-outlined text-[120px] font-thin">terminal</span>
          </div>
          <div class="query-editor-layer relative z-10 h-full min-h-[140px]">
            <pre
              aria-hidden="true"
              class="query-editor-highlight"
              data-query-editor-highlight
            >${renderHighlightedQuery(query)}</pre>
            <textarea
              class="query-editor-input custom-scrollbar relative z-10 h-full min-h-[140px] w-full resize-none border-none focus:ring-0"
              data-bind="current-query"
              placeholder="SELECT name FROM sqlite_master WHERE type = 'table';"
              spellcheck="false"
            >${escapeHtml(query)}</textarea>
          </div>
        </div>
      </div>
    </div>
  `;
}
