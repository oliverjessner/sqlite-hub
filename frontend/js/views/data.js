import { renderDataGrid } from '../components/dataGrid.js';
import { renderRowEditorPanel } from '../components/rowEditorPanel.js';
import { escapeHtml, formatCellValue, formatNumber, isBlobPreview, truncateMiddle } from '../utils/format.js';
import { compactPathForDisplay, detectFilePathValue } from '../utils/filePathPreview.js';

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

function getFilteredTables(tables, searchQuery) {
    const normalizedSearch = String(searchQuery ?? '')
        .trim()
        .toLowerCase();

    if (!normalizedSearch) {
        return tables;
    }

    return tables.filter(table => table.name.toLowerCase().includes(normalizedSearch));
}

function renderDataTableSearch(state) {
    return `
      <label class="table-designer-sidebar__search">
        <span class="material-symbols-outlined text-sm text-on-surface-variant/55">search</span>
        <input
          class="table-designer-sidebar__search-input"
          data-bind="data-table-search"
          placeholder="Search tables..."
          spellcheck="false"
          type="search"
          value="${escapeHtml(state.dataBrowser.tableSearchQuery ?? '')}"
        />
      </label>
    `;
}

function renderTableList(state) {
    const tables = state.dataBrowser.tables ?? [];
    const filteredTables = getFilteredTables(tables, state.dataBrowser.tableSearchQuery);
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

    if (!filteredTables.length) {
        return `
      <div class="px-6 py-6 text-sm text-on-surface-variant/55">
        No tables match the current search.
      </div>
    `;
    }

    return `
    <div class="custom-scrollbar flex-1 overflow-auto px-4 py-4">
      <div class="space-y-2">
        ${filteredTables
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
    <header class="border-b border-outline-variant/10 bg-surface-container px-6 py-3">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          ${
              table
                  ? `<button
                    class="standard-button"
                    data-action="toggle-data-tables"
                    type="button"
                  >
                    ${
                        tablesVisible
                            ? '<span class="material-symbols-outlined text-sm">visibility_off</span> Hide Tables'
                            : '<span class="material-symbols-outlined text-sm">visibility</span> Show Tables'
                    }
                  </button>
                  `
                  : ''
          }
        </div>
        <div class="flex flex-wrap items-center justify-end gap-3">
          ${
              table
                  ? `<button
                    class="standard-button"
                    data-action="open-data-export-modal"
                    type="button"
                  >
                    <span class="material-symbols-outlined text-sm">download</span>
                    ${state.dataBrowser.exportLoading ? 'Exporting...' : 'Export'}
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

function getActiveFilterColumn(table, state) {
    const availableColumns = table?.columns ?? [];

    return availableColumns.includes(state.dataBrowser.searchColumn)
        ? state.dataBrowser.searchColumn
        : (availableColumns[0] ?? '');
}

function isTextFilterColumn(table, columnName) {
    const column = (table?.columnMeta ?? []).find(item => item.name === columnName);

    return String(column?.affinity ?? '').toUpperCase() === 'TEXT';
}

function getFilterOperatorLabel(operator, textColumn) {
    if (textColumn && operator === '=') {
        return 'contains';
    }

    if (textColumn && operator === 'equals') {
        return 'equals';
    }

    if (textColumn && operator === '!=') {
        return 'not contains';
    }

    return operator;
}

function renderTableFilterBar(table, state, activeColumn) {
    const columns = table?.columns ?? [];

    if (!table || !columns.length) {
        return '';
    }

    const columnOptions = columns
        .map(columnName =>
            [
                '<option value="',
                escapeHtml(columnName),
                '" ',
                columnName === activeColumn ? 'selected' : '',
                '>',
                escapeHtml(columnName),
                '</option>',
            ].join(''),
        )
        .join('');
    const activeColumnIsText = isTextFilterColumn(table, activeColumn);
    const operators = activeColumnIsText ? ['=', 'equals', '!=', '<', '>', '<=', '>='] : ['=', '!=', '<', '>', '<=', '>='];
    const activeOperator = operators.includes(state.dataBrowser.filterOperator) ? state.dataBrowser.filterOperator : '=';
    const operatorOptions = operators
        .map(operator =>
            [
                '<option value="',
                escapeHtml(operator),
                '" ',
                operator === activeOperator ? 'selected' : '',
                '>',
                escapeHtml(getFilterOperatorLabel(operator, activeColumnIsText)),
                '</option>',
            ].join(''),
        )
        .join('');
    const filterValue = String(state.dataBrowser.searchQuery ?? '');

    return [
        '<div class="flex flex-wrap items-center gap-3 border-b border-outline-variant/10 bg-surface-container-low px-6 py-4">',
        '<span class="material-symbols-outlined text-base text-on-surface-variant/55">filter_alt</span>',
        '<select class="control-select min-w-[14rem] border border-outline-variant/20 bg-surface-container-lowest font-mono text-xs tracking-[0.04em] text-on-surface outline-none" data-bind="data-search-column">',
        columnOptions,
        '</select>',
        '<select class="control-select min-w-[7rem] border border-outline-variant/20 bg-surface-container-lowest font-mono text-xs tracking-[0.04em] text-on-surface outline-none" data-bind="data-filter-operator">',
        operatorOptions,
        '</select>',
        '<label class="control-shell flex min-w-[18rem] flex-1 items-center gap-3 border border-outline-variant/20 bg-surface-container-lowest px-3">',
        '<input class="control-input control-input--ghost min-w-0 flex-1 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/40" data-bind="data-search-query" placeholder="Value..." type="search" value="',
        escapeHtml(filterValue),
        '" /></label>',
        '</div>',
    ].join('');
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

    const activeColumn = getActiveFilterColumn(table, state);
    const indexedRows = (table.rows ?? []).map((row, index) => ({
        row,
        index,
    }));
    const sortColumn = state.dataBrowser.sortColumn;
    const sortDirection = state.dataBrowser.sortDirection;
    const tableMeta = {
        columns: table.columnMeta ?? [],
        foreignKeys: table.foreignKeys ?? [],
    };
    const columns = (table.columns ?? []).map(columnName => ({
        headerClassName:
            'border-b border-primary-container/20 px-4 py-3 text-[10px] font-bold tracking-[0.08em] text-primary-container',
        renderHeader: () => renderSortableHeader(columnName, sortColumn, sortDirection, 'sort-data-column'),
        cellClassName: 'px-4 py-2 align-top text-[11px] text-on-surface',
        render: row => {
            const rawValue = row[columnName];
            const filePath = detectFilePathValue(rawValue, columnName, tableMeta);
            const value = formatCellValue(rawValue);
            const isNull = value === 'NULL';
            const widthClass = getCellWidthClass(columnName);

            if (filePath) {
                return `
                  <span
                    class="inline-flex ${widthClass} items-center gap-2 overflow-hidden whitespace-nowrap text-on-surface"
                    title="${escapeHtml(filePath.rawValue)}"
                  >
                    <span class="material-symbols-outlined text-sm text-on-surface-variant/55">folder</span>
                    <span class="min-w-0 overflow-hidden text-ellipsis">${escapeHtml(
                        compactPathForDisplay(filePath.rawValue, 48),
                    )}</span>
                  </span>
                `;
            }

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
    const pageSizes = Object.freeze([25, 50, 100, 250]);
    const hasActiveFilter = Boolean(String(state.dataBrowser.searchQuery ?? '').trim() && activeColumn);
    const gridMarkup = renderDataGrid({
        columns,
        rows: indexedRows.map(({ row }) => row),
        tableClass: 'min-w-full border-collapse text-left font-mono text-xs',
        theadClass: 'sticky top-0 z-10 bg-surface-container-highest',
        tbodyClass: 'divide-y divide-outline-variant/5',
        getRowClass: (_, rowIndexOnPage) => {
            const rowIndex = indexedRows[rowIndexOnPage]?.index ?? rowIndexOnPage;

            return [
                'data-browser-row',
                rowIndexOnPage % 2 === 0 ? 'data-browser-row--even' : 'data-browser-row--odd',
                state.dataBrowser.selectedRowIndex === rowIndex ? 'is-selected' : '',
                'cursor-pointer transition-colors',
            ]
                .filter(Boolean)
                .join(' ');
        },
        getRowAttrs: (_, rowIndexOnPage) => {
            const rowIndex = indexedRows[rowIndexOnPage]?.index ?? rowIndexOnPage;

            return ['data-action="select-data-row" data-row-index="', rowIndex, '"'].join('');
        },
    });
    const emptyMarkup = !table.rows?.length
        ? [
              '<div class="flex min-h-[180px] items-center justify-center border-t border-outline-variant/10">',
              '<p class="font-mono text-[10px] uppercase tracking-[0.22em] text-on-surface-variant/40">',
              hasActiveFilter ? 'NO_ROWS_MATCH_FILTER' : 'TABLE_IS_EMPTY',
              '</p></div>',
          ].join('')
        : '';
    const filteredRowsText = hasActiveFilter ? ' filtered' : '';
    const pageSizeButtons = pageSizes
        .map(pageSize =>
            [
                '<button class="standard-button ',
                pageSize === (table.limit ?? state.dataBrowser.pageSize) ? 'is-active' : '',
                '" data-action="set-data-page-size" data-page-size="',
                pageSize,
                '" type="button">',
                pageSize,
                '</button>',
            ].join(''),
        )
        .join('');

    return [
        '<div class="flex flex-1 min-h-0 flex-col bg-surface-container-lowest">',
        renderTableFilterBar(table, state, activeColumn),
        '<div class="custom-scrollbar flex-1 overflow-auto" data-table-horizontal-scroll data-table-scroll-key="data:',
        escapeHtml(table.name),
        '">',
        gridMarkup,
        emptyMarkup,
        '</div>',
        '<footer class="flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant/10 bg-surface-container px-6 py-4">',
        '<div class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">showing ',
        escapeHtml(formatNumber(fromRow)),
        '-',
        escapeHtml(formatNumber(toRow)),
        ' of ',
        escapeHtml(formatNumber(totalRows)),
        filteredRowsText,
        ' rows',
        ' // columns ',
        escapeHtml(formatNumber(table.columns?.length ?? 0)),
        '</div>',
        '<div class="flex flex-wrap items-center gap-4"><div class="flex items-center gap-2">',
        '<span class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">rows</span>',
        '<div class="flex items-center gap-2">',
        pageSizeButtons,
        '</div></div>',
        '<div class="flex items-center gap-2">',
        '<button class="standard-button" data-action="set-data-page" data-page="',
        page - 1,
        '" type="button" ',
        page <= 1 ? 'disabled' : '',
        '>Prev</button>',
        '<div class="min-w-[7rem] text-center text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">page ',
        escapeHtml(formatNumber(page)),
        ' / ',
        escapeHtml(formatNumber(pageCount)),
        '</div>',
        '<button class="standard-button" data-action="set-data-page" data-page="',
        page + 1,
        '" type="button" ',
        page >= pageCount ? 'disabled' : '',
        '>Next</button>',
        '</div></div></footer></div>',
    ].join('');
}

export function renderDataRowEditorPanel(state) {
    const table = state.dataBrowser.table;
    const rowIndex = state.dataBrowser.selectedRowIndex;
    const row = getSelectedRow(state);
    const isIndexedRow = typeof rowIndex === 'number';

    if (!table || !row) {
        return '';
    }

    const foreignKeyColumnNames = new Set(
        (table.foreignKeys ?? []).flatMap(foreignKey =>
            (foreignKey.mappings ?? []).map(mapping => String(mapping.from ?? '').trim()).filter(Boolean),
        ),
    );
    const getColumnTypeBadge = column =>
        String(column.declaredType || column.affinity || 'BLOB')
            .trim()
            .toUpperCase();
    const getColumnNumberInputMeta = column => {
        const affinity = String(column.affinity ?? '').toUpperCase();

        if (affinity === 'INTEGER') {
            return { inputType: 'number', numberStep: '1' };
        }

        if (affinity === 'NUMERIC') {
            return { inputType: 'number', numberStep: 'any' };
        }

        return {};
    };
    const getColumnBadges = column => {
        const badges = [{ label: getColumnTypeBadge(column), tone: 'type' }];

        if (column.primaryKeyPosition > 0) {
            badges.push({
                label: column.primaryKeyPosition > 1 ? `PK ${column.primaryKeyPosition}` : 'PK',
                tone: 'primary-key',
            });
        }

        if (foreignKeyColumnNames.has(column.name)) {
            badges.push({ label: 'FK', tone: 'foreign-key' });
        }

        return badges;
    };

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
                badges: getColumnBadges(column),
                ...getColumnNumberInputMeta(column),
                allowedValues: column.allowedValues ?? [],
                notNull: Boolean(column.notNull),
                rawValue: value,
                value: value === null || value === undefined ? '' : String(value),
            };
        }),
        readonlyFields: readonlyColumns.map(column => ({
            name: column.name,
            label: {
                label: column.name,
                badges: getColumnBadges(column),
            },
            rawValue: row[column.name],
            value: formatCellValue(row[column.name]),
        })),
        tableMeta: {
            columns: table.columnMeta ?? [],
            foreignKeys: table.foreignKeys ?? [],
        },
        saveError: state.dataBrowser.saveError,
        saving: state.dataBrowser.saving,
        deleting: state.dataBrowser.deleting,
        deleteAction: 'delete-data-row',
        deleteRowIndex: isIndexedRow ? rowIndex : null,
        deleteEnabled: Boolean(row.__identity),
        reloadAction: 'reload-data-route',
        jsonActionsEnabled: true,
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
                      ${renderDataTableSearch(state)}
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
