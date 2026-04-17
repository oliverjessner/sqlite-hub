import {
  escapeHtml,
  formatCompactDateTime,
  formatDateTime,
  formatDurationMs,
  formatNumber,
  highlightSql,
} from "../utils/format.js";
import { renderStatusBadge } from "./badges.js";

function renderDetailMetaItem(label, value) {
  return `
    <div class="border border-outline-variant/10 bg-surface-container px-3 py-3">
      <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
        ${escapeHtml(label)}
      </div>
      <div class="mt-2 text-sm text-on-surface">${escapeHtml(value)}</div>
    </div>
  `;
}

function canOpenQueryHistoryInCharts(item) {
  return Boolean(item?.chartsEligible);
}

function renderRunItem(run) {
  return `
    <div class="border border-outline-variant/10 bg-surface-container px-3 py-3">
      <div class="flex flex-wrap items-center gap-2">
        ${renderStatusBadge(run.status, run.status === "error" ? "alert" : "success")}
        <span class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
          ${escapeHtml(formatCompactDateTime(run.executedAt))}
        </span>
        <span class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
          ${escapeHtml(formatDurationMs(run.durationMs))}
        </span>
        <span class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
          rows ${escapeHtml(formatNumber(run.rowCount ?? 0))}
        </span>
        <span class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
          affected ${escapeHtml(formatNumber(run.affectedRows ?? 0))}
        </span>
      </div>
      ${
        run.errorMessage
          ? `
            <div class="mt-3 border border-error/20 bg-error-container/20 px-3 py-3 text-sm leading-6 text-error">
              ${escapeHtml(run.errorMessage)}
            </div>
          `
          : ""
      }
    </div>
  `;
}

export function renderQueryHistoryDetail({
  item = null,
  runs = [],
  loading = false,
  error = null,
}) {
  if (!item && !loading && !error) {
    return "";
  }

  if (loading) {
    return `
      <section class="flex h-full min-h-0 flex-col bg-surface-low">
        <div class="border-b border-outline-variant/10 px-5 py-4">
          <div class="flex items-center justify-between gap-3">
            <span class="font-headline text-sm font-black uppercase tracking-[0.18em] text-primary-container">
              Query Detail
            </span>
            <button
              class="query-history-icon-button"
              data-action="clear-query-history-selection"
              type="button"
            >
              <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
        <div class="flex flex-1 items-center justify-center px-6 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
          Loading query detail...
        </div>
      </section>
    `;
  }

  if (error) {
    return `
      <section class="flex h-full min-h-0 flex-col bg-surface-low">
        <div class="border-b border-outline-variant/10 px-5 py-4">
          <div class="flex items-center justify-between gap-3">
            <span class="font-headline text-sm font-black uppercase tracking-[0.18em] text-primary-container">
              Query Detail
            </span>
            <button
              class="query-history-icon-button"
              data-action="clear-query-history-selection"
              type="button"
            >
              <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
        <div class="p-5">
          <div class="border border-error/30 bg-error-container/20 px-4 py-4 text-sm text-error">
            ${escapeHtml(error.message)}
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="flex h-full min-h-0 flex-col bg-surface-low">
      <div class="border-b border-outline-variant/10 px-5 py-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-primary-container/70">
              Query Detail
            </div>
            <h2 class="mt-1 font-headline text-lg font-black uppercase tracking-tight text-on-surface">
              ${escapeHtml(item.displayTitle)}
            </h2>
          </div>
          <button
            class="query-history-icon-button"
            data-action="clear-query-history-selection"
            type="button"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          ${renderStatusBadge(item.queryType, item.isDestructive ? "alert" : "primary")}
          ${item.isSaved ? renderStatusBadge("saved", "primary") : ""}
          ${item.isDestructive ? renderStatusBadge("destructive", "alert") : ""}
          ${item.lastRun ? renderStatusBadge(item.lastRun.status, item.lastRun.status === "error" ? "alert" : "success") : ""}
        </div>
      </div>
      <div class="custom-scrollbar min-h-0 flex-1 overflow-auto px-5 py-5">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          ${renderDetailMetaItem("Last Used", formatDateTime(item.lastUsedAt))}
          ${renderDetailMetaItem("First Executed", formatDateTime(item.firstExecutedAt))}
          ${renderDetailMetaItem("Use Count", formatNumber(item.useCount))}
          ${renderDetailMetaItem(
            "Tables",
            item.tablesDetected?.length ? item.tablesDetected.join(", ") : "None detected"
          )}
        </div>

        <form class="mt-5" data-form="save-query-history-title">
          <input name="historyId" type="hidden" value="${escapeHtml(item.id)}" />
          <label class="block text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
            Custom Title
          </label>
          <div class="mt-2 flex gap-2">
            <input
              class="control-input flex-1 border border-outline-variant/20 bg-surface-container text-sm text-on-surface outline-none placeholder:text-on-surface-variant/35 focus:border-primary-container"
              name="title"
              placeholder="${escapeHtml(item.displayTitle)}"
              type="text"
              value="${escapeHtml(item.title ?? "")}"
            />
            <button
              class="standard-button"
              type="submit"
            >
              Save
            </button>
          </div>
          <p class="mt-2 text-xs text-on-surface-variant/60">
            Leave empty to fall back to the auto title generated from the query.
          </p>
        </form>

        <div class="mt-5 flex flex-wrap gap-2">
          <button
            class="standard-button"
            data-action="open-query-history"
            data-history-id="${escapeHtml(item.id)}"
            type="button"
          >
            Open In Editor
          </button>
          ${
            canOpenQueryHistoryInCharts(item)
              ? `
                <button
                  class="standard-button"
                  data-action="navigate"
                  data-to="/charts/${encodeURIComponent(item.id)}"
                  type="button"
                >
                  <span class="material-symbols-outlined text-sm">bar_chart</span>
                  Open In Charts
                </button>
              `
              : ""
          }
          <button
            class="standard-button"
            data-action="run-query-history"
            data-history-id="${escapeHtml(item.id)}"
            type="button"
          >
            Run Now
          </button>
          <button
            class="standard-button"
            data-action="toggle-query-history-saved"
            data-history-id="${escapeHtml(item.id)}"
            data-next-value="${item.isSaved ? "false" : "true"}"
            type="button"
          >
            ${item.isSaved ? "Unsave" : "Save"}
          </button>
          <button
            class="delete-button"
            data-action="open-delete-query-history-modal"
            data-history-id="${escapeHtml(item.id)}"
            type="button"
          >
            Delete
          </button>
        </div>

        <div class="mt-6">
          <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
            SQL
          </div>
          <pre class="query-history-detail-sql custom-scrollbar mt-2 overflow-auto border border-outline-variant/10 bg-surface-container-lowest p-4 font-mono text-sm leading-6 text-on-surface"><code>${highlightSql(
            item.rawSql
          )}</code></pre>
        </div>

        <form class="mt-6" data-form="save-query-history-notes">
          <input name="historyId" type="hidden" value="${escapeHtml(item.id)}" />
          <label class="block text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
            Notes
          </label>
          <textarea class="custom-scrollbar mt-2 min-h-[120px] w-full resize-y border border-outline-variant/20 bg-surface-container px-3 py-3 text-sm leading-6 text-on-surface outline-none placeholder:text-on-surface-variant/35 focus:border-primary-container" name="notes" placeholder="Add context, caveats, or why this query matters...">${escapeHtml(
            item.notes ?? ""
          )}</textarea>
          <div class="mt-2 flex justify-end">
            <button
              class="standard-button"
              type="submit"
            >
              Save Notes
            </button>
          </div>
        </form>

        <div class="mt-6">
          <div class="flex items-center justify-between gap-3">
            <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
              Latest Runs
            </div>
            <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/40">
              ${escapeHtml(formatNumber(runs.length))}
            </div>
          </div>
          <div class="mt-3 space-y-3">
            ${
              runs.length
                ? runs.map((run) => renderRunItem(run)).join("")
                : `
                    <div class="border border-outline-variant/10 bg-surface-container px-3 py-4 text-sm text-on-surface-variant/65">
                      No execution runs recorded yet.
                    </div>
                  `
            }
          </div>
        </div>
      </div>
    </section>
  `;
}
