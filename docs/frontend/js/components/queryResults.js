import { renderDataGrid } from "./dataGrid.js";
import { escapeHtml, formatCellValue, formatNumber } from "../utils/format.js";

function getSortIcon(columnName, sortColumn, sortDirection) {
  if (columnName !== sortColumn) {
    return "unfold_more";
  }

  return sortDirection === "desc" ? "south" : "north";
}

function renderSortableHeader(columnName, sortColumn, sortDirection) {
  const isActive = columnName === sortColumn;

  return `
    <button
      class="flex w-full items-center justify-between gap-2 text-left transition-colors ${
        isActive ? "text-primary-container" : "text-on-surface-variant hover:text-primary-container"
      }"
      data-action="sort-editor-results-column"
      data-column-name="${escapeHtml(columnName)}"
      type="button"
    >
      <span class="truncate">${escapeHtml(columnName)}</span>
      <span class="material-symbols-outlined text-sm leading-none">${getSortIcon(
        columnName,
        sortColumn,
        sortDirection
      )}</span>
    </button>
  `;
}

export function renderQueryResultsPane(
  result,
  { selectedRowIndex = null, editable = false, sortColumn = null, sortDirection = null } = {}
) {
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
    headerClassName:
      "border-b-2 border-primary-container px-4 py-3 text-[10px] font-bold uppercase tracking-widest",
    renderHeader: () => renderSortableHeader(columnName, sortColumn, sortDirection),
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
                    `${selectedRowIndex === index ? "bg-surface-bright" : index % 2 === 0 ? "bg-surface-container-low" : "bg-surface-container-lowest"} transition-colors ${
                      editable ? "cursor-pointer hover:bg-surface-bright" : "hover:bg-surface-bright"
                    }`,
                  getRowAttrs: (_, index) =>
                    editable
                      ? ['data-action="select-editor-row" data-row-index="', index, '"'].join("")
                      : "",
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
