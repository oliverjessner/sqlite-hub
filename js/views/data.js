import { renderDataGrid } from "../components/dataGrid.js";
import {
  escapeHtml,
  formatCellValue,
  formatNumber,
  isBlobPreview,
  truncateMiddle,
} from "../utils/format.js";

function getSelectedRow(state) {
  const rowIndex = state.dataBrowser.selectedRowIndex;

  if (typeof rowIndex !== "number") {
    return null;
  }

  return state.dataBrowser.table?.rows?.[rowIndex] ?? null;
}

function renderTableList(state) {
  const tables = state.dataBrowser.tables ?? [];
  const activeName = state.dataBrowser.selectedTable;

  if (state.dataBrowser.loading && !tables.length) {
    return `
      <div class="flex flex-1 items-center justify-center px-6">
        <div class="text-center text-on-surface-variant/40">
          <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
          <p class="font-mono text-[10px] uppercase tracking-[0.22em]">LOADING_TABLES</p>
        </div>
      </div>
    `;
  }

  if (!tables.length) {
    return `
      <div class="px-6 py-6 text-sm text-on-surface-variant/55">
        No tables found in the active SQLite database.
      </div>
    `;
  }

  return `
    <div class="custom-scrollbar flex-1 overflow-auto px-4 py-4">
      <div class="space-y-2">
        ${tables
          .map(
            (table) => `
              <button
                class="w-full border px-4 py-3 text-left transition-colors ${
                  table.name === activeName
                    ? "border-primary-container/30 bg-surface-container-high"
                    : "border-outline-variant/10 bg-surface-container-lowest hover:bg-surface-container-high"
                }"
                data-action="navigate"
                data-to="/data/${encodeURIComponent(table.name)}"
                type="button"
              >
                <div class="truncate font-mono text-xs ${
                  table.name === activeName ? "text-primary-container" : "text-on-surface"
                }">
                  ${escapeHtml(table.name)}
                </div>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderWorkspaceHeader(state) {
  const table = state.dataBrowser.table;

  return `
    <header class="border-b border-outline-variant/10 bg-surface-container px-6 py-5">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">
            Data Browser
          </div>
          <h1 class="mt-2 font-headline text-4xl font-black uppercase tracking-tight text-primary-container">
            ${escapeHtml(table?.name ?? "Table Data")}
          </h1>
          <div class="mt-2 text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
            ${
              table
                ? `rows ${escapeHtml(formatNumber(table.rowCount ?? 0))} // columns ${escapeHtml(
                    formatNumber(table.columns?.length ?? 0)
                  )}`
                : `tables ${escapeHtml(formatNumber(state.dataBrowser.tables.length))}`
            }
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="border border-outline-variant/20 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface hover:bg-surface-container-highest"
            data-action="refresh-view"
            type="button"
          >
            Reload Data
          </button>
          ${
            table
              ? `
                  <button
                    class="border border-outline-variant/20 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface hover:bg-surface-container-highest"
                    data-action="navigate"
                    data-to="/structure"
                    type="button"
                  >
                    Open Structure
                  </button>
                `
              : ""
          }
        </div>
      </div>
    </header>
  `;
}

function renderWorkspaceError(state) {
  if (!state.dataBrowser.error) {
    return "";
  }

  return `
    <div class="border-b border-error/20 bg-error-container/10 px-6 py-4 text-sm text-on-surface">
      <div class="font-headline text-xs font-bold uppercase tracking-[0.18em] text-error">
        ${escapeHtml(state.dataBrowser.error.code)}
      </div>
      <div class="mt-2">${escapeHtml(state.dataBrowser.error.message)}</div>
    </div>
  `;
}

function getCellWidthClass(columnName) {
  const normalized = String(columnName ?? "").toLowerCase();

  if (/(path|url|hash|sql|query|content|description|message|title|name)/.test(normalized)) {
    return "max-w-[18rem]";
  }

  if (/(date|time|modified|created|updated|timestamp)/.test(normalized)) {
    return "max-w-[11rem]";
  }

  if (/(id|uuid|token|key)/.test(normalized)) {
    return "max-w-[10rem]";
  }

  return "max-w-[12rem]";
}

function renderTableSurface(state) {
  const table = state.dataBrowser.table;

  if (state.dataBrowser.tableLoading && !table) {
    return `
      <div class="flex flex-1 items-center justify-center">
        <div class="text-center text-on-surface-variant/40">
          <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
          <p class="font-mono text-[10px] uppercase tracking-[0.22em]">LOADING_TABLE_DATA</p>
        </div>
      </div>
    `;
  }

  if (!table) {
    return `
      <div class="flex flex-1 items-center justify-center px-8 text-center">
        <div>
          <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">
            Full Table
          </div>
          <p class="mt-3 text-sm text-on-surface-variant/55">
            Select a table to browse and edit its rows.
          </p>
        </div>
      </div>
    `;
  }

  const columns = (table.columns ?? []).map((columnName) => ({
    label: escapeHtml(columnName),
    headerClassName:
      "border-b border-primary-container/20 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-primary-container",
    cellClassName: "px-4 py-2 align-top text-[11px] text-on-surface",
    render: (row) => {
      const value = formatCellValue(row[columnName]);
      const isNull = value === "NULL";
      const widthClass = getCellWidthClass(columnName);
      const displayValue = isNull ? value : truncateMiddle(value, 48);

      return `<span class="block ${widthClass} overflow-hidden text-ellipsis whitespace-nowrap ${
        isNull ? "text-on-surface-variant/45" : "text-on-surface"
      }" title="${escapeHtml(value)}">${escapeHtml(displayValue)}</span>`;
    },
  }));
  const totalRows = table.rowCount ?? 0;
  const page = table.page ?? state.dataBrowser.page ?? 1;
  const pageCount = table.pageCount ?? Math.max(1, Math.ceil(totalRows / (table.limit ?? 50)));
  const fromRow = totalRows === 0 ? 0 : (table.offset ?? 0) + 1;
  const toRow = totalRows === 0 ? 0 : Math.min((table.offset ?? 0) + (table.rows?.length ?? 0), totalRows);
  const pageSizes = [25, 50, 100];

  return `
    <div class="flex flex-1 min-h-0 flex-col bg-surface-container-lowest">
      <div class="custom-scrollbar flex-1 overflow-auto">
        ${renderDataGrid({
          columns,
          rows: table.rows ?? [],
          tableClass: "min-w-full border-collapse text-left font-mono text-xs",
          theadClass: "sticky top-0 z-10 bg-surface-container-highest",
          tbodyClass: "divide-y divide-outline-variant/5",
          getRowClass: (_, index) =>
            `${
              state.dataBrowser.selectedRowIndex === index
                ? "bg-surface-bright"
                : index % 2 === 0
                  ? "bg-surface-container-low"
                  : "bg-surface-container-lowest"
            } cursor-pointer transition-colors hover:bg-surface-container-high`,
          getRowAttrs: (_, index) => `data-action="select-data-row" data-row-index="${index}"`,
        })}
        ${
          !table.rows?.length
            ? `
                <div class="flex min-h-[180px] items-center justify-center border-t border-outline-variant/10">
                  <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-on-surface-variant/40">
                    TABLE_IS_EMPTY
                  </p>
                </div>
              `
            : ""
        }
      </div>
      <footer class="flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant/10 bg-surface-container px-6 py-4">
        <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
          showing ${escapeHtml(formatNumber(fromRow))}-${escapeHtml(formatNumber(toRow))} of ${escapeHtml(
            formatNumber(totalRows)
          )} rows
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
              rows
            </span>
            <div class="flex items-center gap-2">
              ${pageSizes
                .map(
                  (pageSize) => `
                    <button
                      class="border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
                        pageSize === (table.limit ?? state.dataBrowser.pageSize)
                          ? "border-primary-container/30 bg-surface-container-high text-primary-container"
                          : "border-outline-variant/20 text-on-surface hover:bg-surface-container-highest"
                      }"
                      data-action="set-data-page-size"
                      data-page-size="${pageSize}"
                      type="button"
                    >
                      ${pageSize}
                    </button>
                  `
                )
                .join("")}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="border border-outline-variant/20 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface transition-colors hover:bg-surface-container-highest disabled:cursor-default disabled:opacity-30"
              data-action="set-data-page"
              data-page="${page - 1}"
              type="button"
              ${page <= 1 ? "disabled" : ""}
            >
              Prev
            </button>
            <div class="min-w-[7rem] text-center text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
              page ${escapeHtml(formatNumber(page))} / ${escapeHtml(formatNumber(pageCount))}
            </div>
            <button
              class="border border-outline-variant/20 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface transition-colors hover:bg-surface-container-highest disabled:cursor-default disabled:opacity-30"
              data-action="set-data-page"
              data-page="${page + 1}"
              type="button"
              ${page >= pageCount ? "disabled" : ""}
            >
              Next
            </button>
          </div>
        </div>
      </footer>
    </div>
  `;
}

function renderReadonlyField(label, value) {
  return `
    <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">
      <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
        ${escapeHtml(label)}
      </div>
      <div class="mt-2 text-sm text-on-surface">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderRowEditorPanel(state) {
  const table = state.dataBrowser.table;
  const rowIndex = state.dataBrowser.selectedRowIndex;
  const row = getSelectedRow(state);

  if (!table || !row || typeof rowIndex !== "number") {
    return "";
  }

  const identityColumns =
    table.identityStrategy?.type === "primaryKey" ? table.identityStrategy.columns ?? [] : [];
  const editableColumns = (table.columnMeta ?? []).filter((column) => {
    if (!column.visible || column.generated) {
      return false;
    }

    if (identityColumns.includes(column.name)) {
      return false;
    }

    const value = row[column.name];
    if (isBlobPreview(value) || (value && typeof value === "object")) {
      return false;
    }

    return true;
  });
  const readonlyColumns = (table.columnMeta ?? []).filter((column) => {
    if (!column.visible) {
      return false;
    }

    if (identityColumns.includes(column.name) || column.generated) {
      return true;
    }

    const value = row[column.name];
    return isBlobPreview(value) || (value && typeof value === "object");
  });

  return `
    <section class="flex h-full min-h-0 flex-col bg-surface-low">
      <header class="border-b border-outline-variant/10 bg-surface-container px-6 py-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">
              Row Editor
            </div>
            <h2 class="mt-2 font-headline text-3xl font-black uppercase tracking-tight text-primary-container">
              ${escapeHtml(table.name)}
            </h2>
            <div class="mt-2 text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
              row ${escapeHtml(String(rowIndex + 1))}
            </div>
          </div>
          <button
            class="border border-outline-variant/20 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface hover:bg-surface-container-highest"
            data-action="clear-data-row-selection"
            type="button"
          >
            Close
          </button>
        </div>
      </header>
      <div class="custom-scrollbar flex-1 overflow-auto px-6 py-6">
        ${
          state.connections.active?.readOnly || table.notSafelyUpdatable
            ? `
                <div class="border border-error/20 bg-error-container/10 px-4 py-4 text-sm text-on-surface">
                  ${
                    state.connections.active?.readOnly
                      ? "The active database is opened read-only, so row editing is disabled."
                      : "This table has no stable identity column, so SQLite Hub cannot safely update rows."
                  }
                </div>
              `
            : `
                <form class="space-y-6" data-form="save-data-row">
                  <input name="rowIndex" type="hidden" value="${escapeHtml(String(rowIndex))}" />
                  ${
                    editableColumns.length
                      ? `
                          <div class="space-y-4">
                            ${editableColumns
                              .map((column) => {
                                const value = row[column.name];
                                const fieldValue =
                                  value === null || value === undefined ? "" : String(value);

                                return `
                                  <label class="block space-y-2">
                                    <span class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
                                      ${escapeHtml(column.name)}
                                    </span>
                                    <textarea
                                      class="min-h-[112px] w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
                                      name="field:${escapeHtml(column.name)}"
                                    >${escapeHtml(fieldValue)}</textarea>
                                  </label>
                                `;
                              })
                              .join("")}
                          </div>
                        `
                      : '<div class="text-sm text-on-surface-variant/55">This row has no editable scalar columns.</div>'
                  }
                  ${
                    state.dataBrowser.saveError
                      ? `
                          <div class="border border-error/20 bg-error-container/10 px-4 py-4 text-sm text-on-surface">
                            <div class="font-headline text-xs font-bold uppercase tracking-[0.18em] text-error">
                              ${escapeHtml(state.dataBrowser.saveError.code)}
                            </div>
                            <div class="mt-2">${escapeHtml(state.dataBrowser.saveError.message)}</div>
                          </div>
                        `
                      : ""
                  }
                  <div class="flex items-center justify-end gap-3 border-t border-outline-variant/10 pt-6">
                    <button
                      class="border border-outline-variant/20 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-on-surface hover:bg-surface-container-highest"
                      data-action="reload-data-route"
                      type="button"
                    >
                      Reload
                    </button>
                    <button
                      class="bg-primary-container px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-on-primary"
                      type="submit"
                    >
                      ${state.dataBrowser.saving ? "Saving..." : "Save Row"}
                    </button>
                  </div>
                </form>
              `
        }
        ${
          readonlyColumns.length
            ? `
                <div class="mt-8 space-y-3">
                  <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">
                    Locked Fields
                  </div>
                  <div class="space-y-3">
                    ${readonlyColumns
                      .map((column) =>
                        renderReadonlyField(column.name, formatCellValue(row[column.name]))
                      )
                      .join("")}
                  </div>
                </div>
              `
            : ""
        }
      </div>
    </section>
  `;
}

export function renderDataView(state) {
  return {
    main: `
      <section class="view-surface min-h-full bg-surface-container flex h-full min-h-0 flex-col overflow-hidden">
        <div class="grid h-full min-h-0 grid-cols-1 md:grid-cols-[18rem_minmax(0,1fr)]">
          <aside class="flex min-h-0 flex-col border-r border-outline-variant/10 bg-surface-low">
            <div class="border-b border-outline-variant/10 px-6 py-5">
              <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">
                Tables
              </div>
              <div class="mt-2 text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
                total ${escapeHtml(formatNumber(state.dataBrowser.tables.length))}
              </div>
            </div>
            ${renderTableList(state)}
          </aside>
          <section class="flex min-h-0 flex-col overflow-hidden">
            ${renderWorkspaceHeader(state)}
            ${renderWorkspaceError(state)}
            ${renderTableSurface(state)}
          </section>
        </div>
      </section>
    `,
    panel: renderRowEditorPanel(state),
  };
}
