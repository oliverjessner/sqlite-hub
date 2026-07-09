import { renderConnectionCard } from '../components/connectionCard.js';
import { renderPageHeader } from '../components/pageHeader.js';
import { escapeHtml } from '../utils/format.js';
import { filterConnections, getConnectionTagCounts } from '../utils/connectionRegistry.js';

function renderConnectionsActionButton({
    label,
    icon,
    action = 'open-modal',
    modal,
    tone = 'secondary',
    disabled = false,
}) {
    const toneClassName = tone === 'primary' ? 'signature-button' : 'standard-button';
    const iconClassName = '';
    const modalAttribute = modal ? `data-modal="${modal}"` : '';

    return `
    <button
      class="${toneClassName}"
      data-action="${escapeHtml(action)}"
      ${modalAttribute}
      type="button"
      ${disabled ? 'disabled' : ''}
    >
      <span>${label}</span>
      <span class="material-symbols-outlined${iconClassName ? ` ${iconClassName}` : ''}">${icon}</span>
    </button>
  `;
}

function renderConnectionsToolbar(state, visibleCount) {
    if (!state.connections.recent.length) {
        return '';
    }

    const searchQuery = state.connections.searchQuery ?? '';
    const selectedTagIds = new Set((state.connections.selectedTagIds ?? []).map(tagId => String(tagId)));
    const selectedTags = (state.connections.tags ?? []).filter(tag => selectedTagIds.has(String(tag.id)));
    const tagCounts = getConnectionTagCounts(state.connections.recent);
    const filterLabel =
        selectedTags.length === 0
            ? 'TAGS: ALL'
            : selectedTags.length === 1
              ? `TAGS: ${selectedTags[0].name}`
              : `TAGS: ${selectedTags.length}`;
    const tagRows = (state.connections.tags ?? [])
        .map(tag => {
            const tagId = String(tag.id);
            const isSelected = selectedTagIds.has(tagId);

            return `
              <label class="connection-tag-filter-row">
                <input
                  ${isSelected ? 'checked' : ''}
                  data-bind="connection-tag-filter"
                  data-tag-id="${escapeHtml(tagId)}"
                  type="checkbox"
                />
                <span class="connection-tag-filter-row__name">${escapeHtml(tag.name)}</span>
                <span class="connection-tag-filter-row__count">${escapeHtml(String(tagCounts.get(tagId) ?? tag.connectionCount ?? 0))}</span>
              </label>
            `;
        })
        .join('');

    return `
    <div class="connection-registry-toolbar" data-connection-registry-toolbar>
      <label class="connection-registry-search">
        <span class="sr-only">Search connections</span>
        <span class="material-symbols-outlined connection-registry-search__icon" aria-hidden="true">search</span>
        <input
          autocomplete="off"
          class="connection-registry-search__input"
          data-bind="connections-search"
          data-connections-search-input
          placeholder="SEARCH_CONNECTIONS..."
          spellcheck="false"
          type="search"
          value="${escapeHtml(searchQuery)}"
        />
        <span class="connection-registry-search__shortcut" aria-hidden="true">/</span>
      </label>
      <details class="dropdown-button dropdown-button--align-right connection-tag-filter" data-dropdown-button>
        <summary class="standard-button dropdown-button__toggle connection-tag-filter__toggle" title="${escapeHtml(filterLabel)}">
          <span class="connection-tag-filter__toggle-label">${escapeHtml(filterLabel)}</span>
          <span class="material-symbols-outlined dropdown-button__chevron" aria-hidden="true">expand_more</span>
        </summary>
        <div class="dropdown-button__panel connection-tag-filter__panel">
          <div class="connection-tag-filter__header">
            <span>FILTER_BY_TAG</span>
            <span>${escapeHtml(String(visibleCount))}</span>
          </div>
          ${
              tagRows
                  ? `<div class="connection-tag-filter__list custom-scrollbar">${tagRows}</div>`
                  : '<div class="connection-tag-filter__empty">NO_TAGS_AVAILABLE</div>'
          }
          <button
            class="standard-button connection-tag-filter__reset"
            data-action="clear-connection-tag-filters"
            type="button"
            ${selectedTagIds.size ? '' : 'disabled'}
          >
            RESET_FILTER
          </button>
        </div>
      </details>
    </div>
  `;
}

function renderConnectionsBody(state, visibleConnections) {
    if (state.connections.loading && !state.connections.recent.length) {
        return `
      <div class="flex min-h-[280px] items-center justify-center border border-outline-variant/10 bg-surface-container-low">
        <div class="text-center text-on-surface-variant/40">
          <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
          <p class="font-mono text-[10px] uppercase tracking-[0.22em]">LOADING_CONNECTIONS</p>
        </div>
      </div>
    `;
    }

    if (state.connections.error) {
        return `
      <div class="border border-error/20 bg-error-container/10 px-6 py-5 text-sm text-on-surface">
        <div class="font-body text-xs font-bold uppercase tracking-[0.18em] text-error">
          ${escapeHtml(state.connections.error.code)}
        </div>
        <div class="mt-2">${escapeHtml(state.connections.error.message)}</div>
      </div>
    `;
    }

    if (!state.connections.recent.length) {
        return `
      <div class="border border-dashed border-outline-variant/20 bg-surface-container-low px-8 py-10 text-center">
        <span class="material-symbols-outlined mb-3 text-5xl text-on-surface-variant/25">database_off</span>
        <p class="font-body text-xl font-black uppercase tracking-tight text-primary-container">
          No Recorded SQLite Connections
        </p>
        <p class="mx-auto mt-3 max-w-xl text-sm leading-7 text-on-surface-variant/65">
          Open an existing SQLite database or create a new one to add your first connection.
        </p>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          ${renderConnectionsActionButton({
              label: 'Create Database',
              icon: 'note_add',
              modal: 'create-connection',
          })}
          ${renderConnectionsActionButton({
              label: 'Open Database',
              icon: 'folder_open',
              modal: 'open-connection',
              tone: 'primary',
          })}
        </div>
      </div>
    `;
    }

    if (!visibleConnections.length) {
        return `
      <div class="connection-filter-empty">
        <span class="material-symbols-outlined connection-filter-empty__icon">search_off</span>
        <p class="connection-filter-empty__title">NO_CONNECTIONS_FOUND</p>
        <p class="connection-filter-empty__hint">TRY_ANOTHER_SEARCH_OR_FILTER</p>
      </div>
    `;
    }

    return `
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      ${visibleConnections.map(connection => renderConnectionCard(connection, state.connections.active?.id)).join('')}
    </div>
  `;
}

export function renderConnectionsView(state) {
    const visibleConnections = filterConnections(state.connections.recent, {
        searchQuery: state.connections.searchQuery,
        selectedTagIds: state.connections.selectedTagIds,
    });
    const actions = `
    ${
        state.connections.active
            ? renderConnectionsActionButton({
                  label: state.connections.backupLoading ? 'Create Backup...' : 'CreateBackup',
                  icon: 'inventory_2',
                  action: 'create-backup',
                  disabled: state.connections.backupLoading,
              })
            : ''
    }
    ${renderConnectionsActionButton({
        label: 'Create Database',
        icon: 'note_add',
        modal: 'create-connection',
    })}
    ${renderConnectionsActionButton({
        label: 'Open Database',
        icon: 'folder_open',
        modal: 'open-connection',
        tone: 'primary',
    })}
  `;

    return {
        main: `
      <section class="view-surface relative min-h-full overflow-hidden">
        <div class="data-grid-texture pointer-events-none absolute inset-0"></div>
        <div class="view-frame relative z-10">
          ${renderPageHeader({
              title: 'Connections',
              subtitle: `Registry // Recent_Targets: ${String(state.connections.recent.length).padStart(2, '0')}`,
              actions,
          })}
          ${renderConnectionsToolbar(state, visibleConnections.length)}
          ${renderConnectionsBody(state, visibleConnections)}
        </div>
      </section>
    `,
        panel: '',
    };
}
