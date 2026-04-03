import { renderDataGrid } from "./dataGrid.js";
import { escapeHtml, formatCellValue, formatNumber } from "../utils/format.js";

export function renderQueryResultsPane(result, { exporting = false } = {}) {
  if (!result) {
    return `
      <div class="flex h-full flex-col items-center justify-center bg-surface-container-lowest text-on-surface-variant/30">
        <span class="material-symbols-outlined mb-3 text-5xl">database_off</span>
        <p class="font-mono text-[10px] uppercase tracking-[0.22em]">
          NO_QUERY_RESULTS_AVAILABLE
        </p>
      </div>
    `;
  }

  const columns = (result.columns ?? []).map((columnName) => ({
    label: escapeHtml(columnName),
    headerClassName:
      "border-b-2 border-primary-container px-4 py-3 text-[10px] font-bold uppercase tracking-widest",
    cellClassName: "px-4 py-3 align-top text-on-surface",
    render: (row) => {
      const value = formatCellValue(row[columnName]);
      const isNull = value === "NULL";
      return `<span class="${
        isNull ? "text-on-surface-variant/40" : "text-on-surface"
      }">${escapeHtml(value)}</span>`;
    },
  }));

  return `
    <div class="relative flex h-full min-h-0 flex-col overflow-hidden bg-surface-container">
      <div class="flex items-center justify-between gap-4 bg-surface-container-high px-4 py-2">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 text-primary-container">
            <span class="material-symbols-outlined text-sm">database</span>
            <span class="text-[10px] font-bold uppercase tracking-widest">Query Results</span>
          </div>
          <div class="h-3 w-px bg-outline-variant/30"></div>
          <div class="text-[10px] font-mono text-on-surface-variant/60">
            ROWS_RETURNED: ${escapeHtml(formatNumber(result.rows?.length ?? 0))}
          </div>
          <div class="text-[10px] font-mono text-on-surface-variant/60">
            AFFECTED: ${escapeHtml(formatNumber(result.affectedRowCount ?? 0))}
          </div>
          <div class="text-[10px] font-mono text-on-surface-variant/60">
            EXEC: ${escapeHtml(String(result.timingMs ?? 0))}ms
          </div>
        </div>
        <div class="flex gap-4 text-[10px] font-mono uppercase">
          <button
            class="text-on-surface-variant transition-colors hover:text-primary-container"
            data-action="export-query-csv"
            type="button"
          >
            ${exporting ? "Exporting..." : "Export CSV"}
          </button>
          <button
            class="text-on-surface-variant transition-colors hover:text-primary-container"
            data-action="clear-results"
            type="button"
          >
            Clear Results
          </button>
        </div>
      </div>
      <div class="custom-scrollbar min-h-0 flex-1 overflow-auto bg-surface-container-lowest">
        ${
          result.columns?.length
            ? renderDataGrid({
                columns,
                rows: result.rows ?? [],
                tableClass: "min-w-full border-collapse text-left font-mono text-xs",
                theadClass: "sticky top-0 z-10 bg-surface-container-highest text-on-surface",
                tbodyClass: "divide-y divide-outline-variant/5",
                getRowClass: (_, index) =>
                  `${
                    index % 2 === 0 ? "bg-surface-container-low" : "bg-surface-container-lowest"
                  } transition-colors hover:bg-surface-bright`,
              })
            : `
                <div class="flex h-full flex-col items-center justify-center text-center text-on-surface-variant/35">
                  <span class="material-symbols-outlined mb-3 text-4xl">rule</span>
                  <p class="font-mono text-[10px] uppercase tracking-[0.22em]">
                    STATEMENT_RETURNED_NO_RESULT_SET
                  </p>
                </div>
              `
        }
      </div>
    </div>
  `;
}
