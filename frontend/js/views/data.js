import { renderDataGrid } from '../components/dataGrid.js';
import { renderRowEditorPanel } from '../components/rowEditorPanel.js';
import { escapeHtml, formatCellValue, formatNumber, isBlobPreview, truncateMiddle } from '../utils/format.js';

function getSelectedRow(state) {
    if (state.dataBrowser.selectedRow) {
        return state.dataBrowser.selectedRow;
    }

    const rowIndex = state.dataBrowser.selectedRowIndex;

    if (typeof rowIndex !== 'number') {
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
                table => `
              <button
                class="w-full border px-4 py-3 text-left transition-colors ${
                    table.name === activeName
                        ? 'border-primary-container/30 bg-surface-container-high'
                        : 'border-outline-variant/10 bg-surface-container-lowest hover:bg-surface-container-high'
                }"
                data-action="navigate"
                data-to="/data/${encodeURIComponent(table.name)}"
                type="button"
              >
                <div class="truncate font-mono text-xs ${
                    table.name === activeName ? 'text-primary-container' : 'text-on-surface'
                }">
                  ${escapeHtml(table.name)}
                </div>
              </button>
            `,
            )
            .join('')}
      </div>
    </div>
  `;
}

function renderWorkspaceHeader(state) {
    const table = state.dataBrowser.table;
    const tablesVisible = state.dataBrowser.tablesVisible !== false;

    return `
    <header class="border-b border-outline-variant/10 bg-surface-container px-6 py-5">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="data-headline-container">
          <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">
            Data Browser
          </div>
          <h1 class="mt-2 font-headline text-4xl font-black uppercase tracking-tight text-primary-container">
            ${escapeHtml(table?.name ?? 'Table Data')}
          </h1>
          <div class="mt-2 text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
            ${
                table
                    ? `rows ${escapeHtml(formatNumber(table.rowCount ?? 0))} // columns ${escapeHtml(
                          formatNumber(table.columns?.length ?? 0),
                      )}`
                    : `tables ${escapeHtml(formatNumber(state.dataBrowser.tables.length))}`
            }
          </div>
        </div>
        <div class="flex items-center gap-3">
          ${
              table
                  ? `<button
                    class="standard-button"
                    data-action="toggle-data-tables"
                    type="button"
                  >
                    ${tablesVisible ? '<span class="material-symbols-outlined text-sm">visibility_off</span> Hide Tables' : 'Show Tables'}
                  </button>
                  <button
                    class="standard-button"
                    data-action="export-data-csv"
                    type="button"
                  >
                    ${state.dataBrowser.exportLoading ? 'Exporting...' : 'Export CSV'}
                  </button>`
                  : ''
          }
          <button
            class="standard-button"
            data-action="refresh-view"
            type="button"
          >
            Reload Data
          </button>
          ${
              table
                  ? `
                  <button
                    class="standard-button"
                    data-action="navigate"
                    data-to="/structure/${encodeURIComponent(table.name)}"
                    type="button"
                  >
                  <span class="material-symbols-outlined">account_tree</span>
                    Open Structure
                  </button>
                `
                  : ''
          }
        </div>
      </div>
    </header>
  `;
}

function renderWorkspaceError(state) {
    if (!state.dataBrowser.error) {
        return '';
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
    const normalized = String(columnName ?? '').toLowerCase();

    if (/(path|url|hash|sql|query|content|description|message|title|name)/.test(normalized)) {
        return 'max-w-[18rem]';
    }

    if (/(date|time|modified|created|updated|timestamp)/.test(normalized)) {
        return 'max-w-[11rem]';
    }

    if (/(id|uuid|token|key)/.test(normalized)) {
        return 'max-w-[10rem]';
    }

    return 'max-w-[12rem]';
}

function getSortIcon(columnName, sortColumn, sortDirection) {
    if (columnName !== sortColumn) {
        return 'unfold_more';
    }

    return sortDirection === 'desc' ? 'south' : 'north';
}

function renderSortableHeader(columnName, sortColumn, sortDirection, action) {
    const isActive = columnName === sortColumn;

    return `
    <button
      class="flex w-full items-center justify-between gap-2 text-left transition-colors ${
          isActive ? 'text-primary-container' : 'text-on-surface-variant hover:text-primary-container'
      }"
      data-action="${action}"
      data-column-name="${escapeHtml(columnName)}"
      type="button"
    >
      <span class="truncate">${escapeHtml(columnName)}</span>
      <span class="material-symbols-outlined text-sm leading-none">${getSortIcon(
          columnName,
          sortColumn,
          sortDirection,
      )}</span>
    </button>
  `;
}

function getFilteredTableRows(table, state) {
    const allRows = table?.rows ?? [];
    const availableColumns = table?.columns ?? [];
    const searchQuery = String(state.dataBrowser.searchQuery ?? '')
        .trim()
        .toLowerCase();
    const activeColumn = availableColumns.includes(state.dataBrowser.searchColumn)
        ? state.dataBrowser.searchColumn
        : (availableColumns[0] ?? '');

    const indexedRows = allRows.map((row, index) => ({
        row,
        index,
    }));

    if (!searchQuery || !activeColumn) {
        return {
            activeColumn,
            filteredRows: indexedRows,
            searchQuery,
        };
    }

    return {
        activeColumn,
        searchQuery,
        filteredRows: indexedRows.filter(({ row }) =>
            formatCellValue(row[activeColumn]).toLowerCase().includes(searchQuery),
        ),
    };
}

function renderTableSearchBar(table, state, activeColumn, filteredRowCount) {
    const columns = table?.columns ?? [];

    if (!table || !columns.length) {
        return '';
    }

    return `
    <div class="flex flex-wrap items-center gap-3 border-b border-outline-variant/10 bg-surface-container-low px-6 py-4">
      <label class="control-shell flex min-w-[18rem] flex-1 items-center gap-3 border border-outline-variant/20 bg-surface-container-lowest px-3">
        <span class="material-symbols-outlined text-base text-on-surface-variant/55">search</span>
        <input
          class="control-input control-input--ghost min-w-0 flex-1 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/40"
          data-bind="data-search-query"
          placeholder="Filter current page..."
          type="search"
          value="${escapeHtml(state.dataBrowser.searchQuery ?? '')}"
        />
      </label>
      <select
        class="control-select min-w-[14rem] border border-outline-variant/20 bg-surface-container-lowest font-mono text-xs tracking-[0.04em] text-on-surface outline-none"
        data-bind="data-search-column"
      >
        ${columns
            .map(
                columnName => `
              <option value="${escapeHtml(columnName)}" ${columnName === activeColumn ? 'selected' : ''}>
                ${escapeHtml(columnName)}
              </option>
            `,
            )
            .join('')}
      </select>
      <div class="text-[10px] font-mono tracking-[0.14em] text-on-surface-variant/55">
        ${escapeHtml(formatNumber(filteredRowCount))} match${filteredRowCount === 1 ? '' : 'es'} on this page
      </div>
    </div>
  `;
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

    const { activeColumn, filteredRows, searchQuery } = getFilteredTableRows(table, state);
    const sortColumn = state.dataBrowser.sortColumn;
    const sortDirection = state.dataBrowser.sortDirection;
    const columns = (table.columns ?? []).map(columnName => ({
        headerClassName:
            'border-b border-primary-container/20 px-4 py-3 text-[10px] font-bold tracking-[0.08em] text-primary-container',
        renderHeader: () => renderSortableHeader(columnName, sortColumn, sortDirection, 'sort-data-column'),
        cellClassName: 'px-4 py-2 align-top text-[11px] text-on-surface',
        render: row => {
            const value = formatCellValue(row[columnName]);
            const isNull = value === 'NULL';
            const widthClass = getCellWidthClass(columnName);
            const displayValue = isNull ? value : truncateMiddle(value, 48);

            return `<span class="block ${widthClass} overflow-hidden text-ellipsis whitespace-nowrap ${
                isNull ? 'text-on-surface-variant/45' : 'text-on-surface'
            }" title="${escapeHtml(value)}">${escapeHtml(displayValue)}</span>`;
        },
    }));
    const totalRows = table.rowCount ?? 0;
    const page = table.page ?? state.dataBrowser.page ?? 1;
    const pageCount = table.pageCount ?? Math.max(1, Math.ceil(totalRows / (table.limit ?? 50)));
    const fromRow = totalRows === 0 ? 0 : (table.offset ?? 0) + 1;
    const toRow = totalRows === 0 ? 0 : Math.min((table.offset ?? 0) + (table.rows?.length ?? 0), totalRows);
    const pageSizes = [25, 50, 100];
    const filteredRowCount = filteredRows.length;
    const hasActiveSearch = Boolean(searchQuery);

    return `
    <div class="flex flex-1 min-h-0 flex-col bg-surface-container-lowest">
      ${renderTableSearchBar(table, state, activeColumn, filteredRowCount)}
      <div class="custom-scrollbar flex-1 overflow-auto">
        ${renderDataGrid({
            columns,
            rows: filteredRows.map(({ row }) => row),
            tableClass: 'min-w-full border-collapse text-left font-mono text-xs',
            theadClass: 'sticky top-0 z-10 bg-surface-container-highest',
            tbodyClass: 'divide-y divide-outline-variant/5',
            getRowClass: (_, filteredIndex) => {
                const rowIndex = filteredRows[filteredIndex]?.index ?? filteredIndex;

                return `data-browser-row ${
                    filteredIndex % 2 === 0 ? 'data-browser-row--even' : 'data-browser-row--odd'
                } ${state.dataBrowser.selectedRowIndex === rowIndex ? 'is-selected' : ''} cursor-pointer transition-colors`;
            },
            getRowAttrs: (_, filteredIndex) => {
                const rowIndex = filteredRows[filteredIndex]?.index ?? filteredIndex;

                return `data-action="select-data-row" data-row-index="${rowIndex}"`;
            },
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
                : !filteredRowCount
                  ? `
                  <div class="flex min-h-[180px] items-center justify-center border-t border-outline-variant/10">
                    <p class="font-mono text-[10px] tracking-[0.18em] text-on-surface-variant/40">
                      ${hasActiveSearch ? 'No matching rows on this page.' : 'No rows available.'}
                    </p>
                  </div>
                `
                  : ''
        }
      </div>
      <footer class="flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant/10 bg-surface-container px-6 py-4">
        <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
          showing ${escapeHtml(formatNumber(fromRow))}-${escapeHtml(formatNumber(toRow))} of ${escapeHtml(
              formatNumber(totalRows),
          )} rows${hasActiveSearch ? ` // ${escapeHtml(formatNumber(filteredRowCount))} visible on this page` : ''}
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
              rows
            </span>
            <div class="flex items-center gap-2">
              ${pageSizes
                  .map(
                      pageSize => `
                    <button
                      class="standard-button ${
                          pageSize === (table.limit ?? state.dataBrowser.pageSize) ? 'is-active' : ''
                      }"
                      data-action="set-data-page-size"
                      data-page-size="${pageSize}"
                      type="button"
                    >
                      ${pageSize}
                    </button>
                  `,
                  )
                  .join('')}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="standard-button"
              data-action="set-data-page"
              data-page="${page - 1}"
              type="button"
              ${page <= 1 ? 'disabled' : ''}
            >
              Prev
            </button>
            <div class="min-w-[7rem] text-center text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
              page ${escapeHtml(formatNumber(page))} / ${escapeHtml(formatNumber(pageCount))}
            </div>
            <button
              class="standard-button"
              data-action="set-data-page"
              data-page="${page + 1}"
              type="button"
              ${page >= pageCount ? 'disabled' : ''}
            >
              Next
            </button>
          </div>
        </div>
      </footer>
    </div>
  `;
}

export function renderDataRowEditorPanel(state) {
    const table = state.dataBrowser.table;
    const rowIndex = state.dataBrowser.selectedRowIndex;
    const row = getSelectedRow(state);
    const isIndexedRow = typeof rowIndex === 'number';

    if (!table || !row) {
        return '';
    }

    const identityColumns = table.identityStrategy?.type === 'primaryKey' ? (table.identityStrategy.columns ?? []) : [];
    const editableColumns = (table.columnMeta ?? []).filter(column => {
        if (!column.visible || column.generated) {
            return false;
        }

        if (identityColumns.includes(column.name)) {
            return false;
        }

        const value = row[column.name];
        if (isBlobPreview(value) || (value && typeof value === 'object')) {
            return false;
        }

        return true;
    });
    const readonlyColumns = (table.columnMeta ?? []).filter(column => {
        if (!column.visible) {
            return false;
        }

        if (identityColumns.includes(column.name) || column.generated) {
            return true;
        }

        const value = row[column.name];
        return isBlobPreview(value) || (value && typeof value === 'object');
    });

    return renderRowEditorPanel({
        title: table.name,
        sectionLabel: 'Row Editor',
        subtitle: isIndexedRow ? `row ${rowIndex + 1}` : 'targeted row',
        closeAction: 'clear-data-row-selection',
        formName: 'save-data-row',
        hiddenFields: isIndexedRow
            ? [{ name: 'rowIndex', value: String(rowIndex) }]
            : [{ name: 'rowIdentity', value: JSON.stringify(row.__identity ?? null) }],
        disabledMessage: state.connections.active?.readOnly
            ? 'The active database is opened read-only, so row editing is disabled.'
            : table.notSafelyUpdatable
              ? 'This table has no stable identity column, so SQLite Hub cannot safely update rows.'
              : '',
        editableFields: editableColumns.map(column => {
            const value = row[column.name];

            return {
                name: column.name,
                label: column.name,
                value: value === null || value === undefined ? '' : String(value),
            };
        }),
        readonlyFields: readonlyColumns.map(column => ({
            name: column.name,
            label: column.name,
            value: formatCellValue(row[column.name]),
        })),
        saveError: state.dataBrowser.saveError,
        saving: state.dataBrowser.saving,
        deleting: state.dataBrowser.deleting,
        deleteAction: 'delete-data-row',
        deleteRowIndex: isIndexedRow ? rowIndex : null,
        deleteEnabled: Boolean(row.__identity),
        reloadAction: 'reload-data-route',
    });
}

export function renderDataView(state) {
    const tablesVisible = state.dataBrowser.tablesVisible !== false;

    return {
        main: `
      <section class="view-surface min-h-full bg-surface-container flex h-full min-h-0 flex-col overflow-hidden">
        <div class="grid h-full min-h-0 grid-cols-1 ${tablesVisible ? 'md:grid-cols-[18rem_minmax(0,1fr)]' : ''}">
          ${
              tablesVisible
                  ? `
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
                  `
                  : ''
          }
          <section class="flex min-h-0 flex-col overflow-hidden">
            ${renderWorkspaceHeader(state)}
            ${renderWorkspaceError(state)}
            ${renderTableSurface(state)}
          </section>
        </div>
      </section>
    `,
        panel: renderDataRowEditorPanel(state),
    };
}
