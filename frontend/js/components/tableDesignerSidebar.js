import { escapeHtml, formatNumber } from '../utils/format.js';

function getFilteredTables(tables, searchQuery) {
    const normalizedSearch = String(searchQuery ?? '')
        .trim()
        .toLowerCase();

    if (!normalizedSearch) {
        return tables;
    }

    return tables.filter(table => table.name.toLowerCase().includes(normalizedSearch));
}

export function renderTableDesignerSidebar(state) {
    const tables = state.tableDesigner.tables ?? [];
    const filteredTables = getFilteredTables(tables, state.tableDesigner.searchQuery);
    const isNewDraft = state.tableDesigner.draft?.mode === 'create';

    return `
    <aside class="table-designer-sidebar subnavi-panel">
      <div class="table-designer-sidebar__header subnavi-header">
        <div>
          <div class="subnavi-header-title">Table Designer</div>
          <div class="subnavi-header-details">
            ${escapeHtml(formatNumber(tables.length))} table${tables.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <label class="table-designer-sidebar__search">
        <span class="material-symbols-outlined text-sm text-on-surface-variant/55">search</span>
        <input
          class="table-designer-sidebar__search-input"
          data-bind="table-designer-search"
          placeholder="Search tables..."
          spellcheck="false"
          type="search"
          value="${escapeHtml(state.tableDesigner.searchQuery ?? '')}"
        />
      </label>

      <div class="table-designer-sidebar__list subnavi-list custom-scrollbar">
        ${
            state.tableDesigner.loading && !tables.length
                ? `
                <div class="table-designer-sidebar__empty">
                  <span class="material-symbols-outlined mb-2 text-3xl">progress_activity</span>
                  <div>Loading SQLite schema...</div>
                </div>
              `
                : isNewDraft
                  ? `
                  <button
                    class="table-designer-sidebar__item subnavi-item is-active border border-primary-container/30 bg-surface-container-high px-4 py-3 text-left transition-colors"
                    data-action="navigate"
                    data-to="/table-designer/new"
                    type="button"
                  >
                    <div class="table-designer-sidebar__item-name">New Table Draft</div>
                    <div class="table-designer-sidebar__item-meta">unsaved schema</div>
                  </button>
                `
                  : ''
        }
        ${
            !filteredTables.length && !state.tableDesigner.loading
                ? `
                <div class="table-designer-sidebar__empty">
                  ${
                      tables.length
                          ? 'No tables match the current search.'
                          : 'No tables found. Create the first table in this database.'
                  }
                </div>
              `
                : filteredTables
                      .map(
                          table => `
                    <button
                      class="table-designer-sidebar__item subnavi-item border px-4 py-3 text-left transition-colors ${
                          !isNewDraft && table.name === state.tableDesigner.selectedTableName
                              ? 'is-active border-primary-container/30 bg-surface-container-high'
                              : 'border-outline-variant/10 bg-surface-container-lowest hover:bg-surface-container-high'
                      }"
                      data-action="navigate"
                      data-to="/table-designer/${encodeURIComponent(table.name)}"
                      type="button"
                    >
                      <div class="table-designer-sidebar__item-name ${
                          !isNewDraft && table.name === state.tableDesigner.selectedTableName ? 'is-active' : ''
                      }">${escapeHtml(table.name)}</div>
                      <div class="mt-1 truncate text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/45">
                        ${escapeHtml(formatNumber(table.columnCount ?? 0))} column${
                            Number(table.columnCount ?? 0) === 1 ? '' : 's'
                        }
                      </div>
                    </button>
                  `,
                      )
                      .join('')
        }
      </div>
    </aside>
  `;
}
