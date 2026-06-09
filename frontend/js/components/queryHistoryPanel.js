import { escapeHtml, formatNumber } from '../utils/format.js';
import { renderStatusBadge } from './badges.js';

function getQueryTypeTone(queryType) {
    if (queryType === 'select' || queryType === 'update') {
        return 'success';
    }

    if (queryType === 'pragma') {
        return 'primary';
    }

    return 'muted';
}

export function renderQueryHistoryListItem(item, activeHistoryId, selectedHistoryId) {
    const isActive = Number(activeHistoryId) === Number(item.id);
    const isSelected = Number(selectedHistoryId) === Number(item.id);
    const visibleTables = (item.tablesDetected ?? []).slice(0, 3);
    const itemClasses = [
        'query-history-item',
        isActive ? 'is-active' : '',
        item.lastRun?.status === 'error' ? 'is-error' : '',
    ]
        .filter(Boolean)
        .join(' ');
    const tableMarkup = visibleTables
        .map(tableName =>
            [
                '<span class="border border-outline-variant/20 bg-surface-highest px-2 py-1">',
                escapeHtml(tableName),
                '</span>',
            ].join(''),
        )
        .join('');

    return [
        '<article class="',
        itemClasses,
        '"><button class="query-history-item-hit ',
        isActive ? 'is-active' : '',
        '" data-action="select-query-history-item" data-history-id="',
        escapeHtml(item.id),
        '" type="button">',
        '<div class="flex flex-wrap items-center gap-2"><span class="truncate font-headline text-sm font-bold uppercase tracking-tight text-on-surface w-full">',
        escapeHtml(item.displayTitle),
        '</span>',
        renderStatusBadge(item.queryType, getQueryTypeTone(item.queryType)),
        item.isSaved ? renderStatusBadge('saved', 'primary') : '',
        item.isDestructive ? renderStatusBadge('destructive', 'warning') : '',
        '</div>',
        '<p class="query-history-sql-preview mt-2 text-left font-mono text-xs leading-5 text-on-surface-variant/75">',
        escapeHtml(item.previewSql),
        '</p></button>',
        '<div class="flex items-center justify-between gap-3 border-t border-outline-variant/10 px-3 pb-3 pt-2">',
        '<div class="min-w-0 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-[0.14em] text-on-surface-variant/55">',
        tableMarkup,
        '</div><div class="flex items-center gap-1">',
        '<button class="query-history-icon-button" data-action="open-query-history" data-history-id="',
        escapeHtml(item.id),
        '" title="Open in editor" type="button"><span class="material-symbols-outlined text-[18px]">edit_note</span></button>',
        '<button class="query-history-icon-button" data-action="run-query-history" data-history-id="',
        escapeHtml(item.id),
        '" title="Run query" type="button"><span class="material-symbols-outlined text-[18px]">play_arrow</span></button>',
        '<button class="query-history-icon-button ',
        item.isSaved ? 'is-active' : '',
        '" data-action="toggle-query-history-saved" data-history-id="',
        escapeHtml(item.id),
        '" data-next-value="',
        item.isSaved ? 'false' : 'true',
        '" title="',
        item.isSaved ? 'Remove from saved' : 'Save query',
        '" type="button"><span class="material-symbols-outlined text-[18px]">',
        item.isSaved ? 'bookmark' : 'bookmark_add',
        '</span></button>',
        '<button class="query-history-icon-button ',
        isSelected ? 'is-active' : '',
        '" data-action="select-query-history-item" data-history-id="',
        escapeHtml(item.id),
        '" title="Open query detail" type="button"><span class="material-symbols-outlined text-[18px]">info</span></button>',
        '</div></div></article>',
    ].join('');
}

function renderQueryHistoryTabs(activeTab, historyTotal) {
    const tabs = [
        { id: 'recent', label: 'Recent' },
        { id: 'saved', label: 'Saved' },
        { id: 'unsaved', label: 'Unsaved' },
        { id: 'failed', label: 'Failed' },
    ];

    return [
        '<div class="flex items-center gap-2">',
        tabs
            .map(tab =>
                [
                    '<button class="query-history-tab ',
                    activeTab === tab.id ? 'is-active' : '',
                    '" data-action="set-query-history-tab" data-tab="',
                    tab.id,
                    '" type="button">',
                    escapeHtml(tab.label),
                    '</button>',
                ].join(''),
            )
            .join(''),
        '<span class="ml-auto text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/50">',
        escapeHtml(formatNumber(historyTotal)),
        '</span></div>',
    ].join('');
}

export function renderQueryHistoryPanel({
    items = [],
    loading = false,
    loadingMore = false,
    error = null,
    activeTab = 'recent',
    search = '',
    committedSearch = '',
    total = 0,
    hasMore = false,
    activeHistoryId = null,
    selectedHistoryId = null,
}) {
    return `
    <aside class="query-history-panel border-l border-outline-variant/10 bg-surface-container-lowest">
      <div class="border-b border-outline-variant/10 px-4 py-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] text-primary-container">history</span>
            <span class="font-headline text-xs font-black uppercase tracking-[0.18em] text-primary-container">
              Query History
            </span>
          </div>
          <button
            class="query-history-icon-button"
            data-action="toggle-query-history-panel"
            data-next-value="false"
            title="Hide query history"
            type="button"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div class="mt-4">${renderQueryHistoryTabs(activeTab, total)}</div>
        <label class="mt-4 block">
          <span class="sr-only">Search query history</span>
          <input
            class="control-input w-full border border-outline-variant/20 bg-surface-container text-sm text-on-surface outline-none placeholder:text-on-surface-variant/35 focus:border-primary-container"
            data-bind="query-history-search"
            placeholder="Search SQL, titles, notes..."
            type="search"
            value="${escapeHtml(search)}"
          />
        </label>
      </div>
      <div
        class="custom-scrollbar min-h-0 flex-1 overflow-auto px-3 py-3"
        data-query-history-committed-search="${escapeHtml(committedSearch)}"
        data-query-history-loading-more="${loadingMore ? 'true' : 'false'}"
        data-query-history-search="${escapeHtml(search)}"
        data-query-history-scroll
        data-query-history-tab="${escapeHtml(activeTab)}"
      >
        ${
            error
                ? `
              <div class="border border-error/30 bg-error-container/20 px-4 py-3 text-sm text-error">
                ${escapeHtml(error.message)}
              </div>
            `
                : ''
        }
        ${
            !loading && !items.length
                ? `
              <div class="flex h-full min-h-[240px] flex-col items-center justify-center px-6 text-center">
                <span class="material-symbols-outlined text-4xl text-on-surface-variant/25">manage_search</span>
                <p class="mt-4 font-headline text-lg font-bold uppercase tracking-tight text-on-surface">
                  No Matching Queries
                </p>
                <p class="mt-2 max-w-xs text-sm leading-6 text-on-surface-variant/65">
                  Executed statements will appear here once they run against the active database.
                </p>
              </div>
            `
                : ''
        }
          <div class="space-y-3">
          ${items.map(item => renderQueryHistoryListItem(item, activeHistoryId, selectedHistoryId)).join('')}
        </div>
        ${
            loading
                ? `
              <div class="mt-4 text-center text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/50">
                Loading query history...
              </div>
            `
                : ''
        }
        ${
            hasMore
                ? `
              <div class="mt-4 flex justify-center">
                <button
                  class="standard-button"
                  data-action="load-more-query-history"
                  type="button"
                >
                  ${loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            `
                : ''
        }
      </div>
    </aside>
  `;
}
