import { renderDataGrid } from "./dataGrid.js";
import { escapeHtml, formatCellValue, formatNumber } from "../utils/format.js";

function getSortIcon(columnName, sortColumn, sortDirection) {
  if (columnName !== sortColumn) {
    return "unfold_more";
  }

  return sortDirection === "desc" ? "south" : "north";
}

const COPY_COLUMN_ACTIONS = [
  { mode: "column", label: "Copy column" },
  { mode: "column-with-header", label: "Copy column with header" },
  { mode: "first-10", label: "Copy first 10" },
  { mode: "markdown-todo", label: "Export as Markdown Todo" },
];

function renderColumnActionMenu(columnName, resultScope) {
  return `
    <details class="query-result-column-menu" data-copy-column-menu>
      <summary
        aria-label="Column actions for ${escapeHtml(columnName)}"
        class="query-result-column-menu__toggle"
        title="Column actions"
      >
        <span class="material-symbols-outlined" aria-hidden="true">more_vert</span>
      </summary>
      <div class="query-result-column-menu__panel" role="menu">
        ${COPY_COLUMN_ACTIONS.map(
          (item) => `
            <button
              class="query-result-column-menu__item"
              data-action="open-copy-column-modal"
              data-column-name="${escapeHtml(columnName)}"
              data-copy-mode="${escapeHtml(item.mode)}"
              data-result-scope="${escapeHtml(resultScope)}"
              role="menuitem"
              type="button"
            >
              ${escapeHtml(item.label)}
            </button>
          `
        ).join("")}
      </div>
    </details>
  `;
}

function renderSortableHeader(columnName, sortColumn, sortDirection, { resultScope, sortAction }) {
  const isActive = columnName === sortColumn;
  const labelMarkup = `<span class="query-result-column-label truncate" title="${escapeHtml(columnName)}">${escapeHtml(
    columnName
  )}</span>`;

  return `
    <div
      class="query-result-column-header"
      data-column-name="${escapeHtml(columnName)}"
      data-result-column-header
      data-result-scope="${escapeHtml(resultScope)}"
    >
      ${
        sortAction
          ? `
            <button
              class="query-result-column-sort ${
                isActive ? "text-primary-container" : "text-on-surface-variant hover:text-primary-container"
              }"
              data-action="${escapeHtml(sortAction)}"
              data-column-name="${escapeHtml(columnName)}"
              type="button"
            >
              ${labelMarkup}
              <span class="material-symbols-outlined text-sm leading-none">${getSortIcon(
                columnName,
                sortColumn,
                sortDirection
              )}</span>
            </button>
          `
          : `<span class="query-result-column-static text-on-surface-variant">${labelMarkup}</span>`
      }
      ${renderColumnActionMenu(columnName, resultScope)}
    </div>
  `;
}

export function renderQueryResultsPane(
  result,
  {
    selectedRowIndex = null,
    editable = false,
    sortColumn = null,
    sortDirection = null,
    resultScope = "editor",
    sortAction = "sort-editor-results-column",
    scrollKey = "",
  } = {}
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
      "query-result-header-cell border-b-2 border-primary-container px-4 py-3 text-[10px] font-bold uppercase tracking-widest",
    renderHeader: () => renderSortableHeader(columnName, sortColumn, sortDirection, { resultScope, sortAction }),
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
      ${
        result.truncated
          ? `
              <div class="border-b border-primary-container/20 bg-primary-container/10 px-4 py-2 text-xs text-on-surface">
                Showing the first ${escapeHtml(String(result.rowLimit ?? result.rows?.length ?? 0))} rows. Refine the query or export it to process the complete result set.
              </div>
            `
          : ""
      }
      <div
        class="custom-scrollbar min-h-0 flex-1 overflow-auto bg-surface-container-lowest"
        ${
          scrollKey
            ? `data-table-horizontal-scroll data-table-scroll-key="${escapeHtml(scrollKey)}"`
            : ""
        }
      >
        ${
          result.columns?.length
              ? renderDataGrid({
                  columns,
                  rows: result.rows ?? [],
                  tableClass: "data-table min-w-full border-collapse text-left font-mono text-xs",
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
