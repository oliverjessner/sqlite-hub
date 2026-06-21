import { escapeHtml } from '../utils/format.js';
import { renderStatusBadge } from './badges.js';
import { renderQueryHistoryHeader, renderQueryHistorySearch } from './queryHistoryHeader.js';
import {
    getQueryTypeTone,
    renderQueryHistoryActionGroup,
    renderQueryHistoryBadgeRow,
    renderQueryHistoryIconButton,
    renderQueryHistoryListItem as renderSharedQueryHistoryListItem,
    renderQueryHistoryTabs,
} from './queryHistoryList.js';

export function renderQueryHistoryListItem(item, activeHistoryId, selectedHistoryId) {
    const isActive = Number(activeHistoryId) === Number(item.id);
    const isSelected = Number(selectedHistoryId) === Number(item.id);
    const badgesMarkup = renderQueryHistoryBadgeRow(
        [
            renderStatusBadge(item.queryType, getQueryTypeTone(item.queryType)),
            item.isSaved ? renderStatusBadge('saved', 'primary') : '',
            item.isDestructive ? renderStatusBadge('destructive', 'warning') : '',
        ].join(''),
    );
    const actionsMarkup = renderQueryHistoryActionGroup([
        renderQueryHistoryIconButton({
            action: 'open-query-history',
            historyId: item.id,
            icon: 'edit_note',
            title: 'Open in editor',
        }),
        renderQueryHistoryIconButton({
            action: 'run-query-history',
            historyId: item.id,
            icon: 'play_arrow',
            title: 'Run query',
        }),
        renderQueryHistoryIconButton({
            action: 'select-query-history-item',
            historyId: item.id,
            icon: 'info',
            title: 'Open query detail',
            active: isSelected,
        }),
        renderQueryHistoryIconButton({
            action: 'toggle-query-history-saved',
            historyId: item.id,
            icon: item.isSaved ? 'bookmark' : 'bookmark_add',
            title: item.isSaved ? 'Remove from saved' : 'Save query',
            active: item.isSaved,
            nextValue: item.isSaved ? 'false' : 'true',
        }),
    ]);

    return renderSharedQueryHistoryListItem({
        title: item.displayTitle,
        preview: item.previewSql,
        historyId: item.id,
        active: isActive,
        error: item.lastRun?.status === 'error',
        hitAction: 'select-query-history-item',
        badgesMarkup,
        actionsMarkup,
    });
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
      <div class="query-history-panel__header">
        ${renderQueryHistoryHeader()}
        ${renderQueryHistoryTabs({
            tabs: [
                { id: 'recent', label: 'Recent' },
                { id: 'saved', label: 'Saved' },
                { id: 'unsaved', label: 'Unsaved' },
                { id: 'failed', label: 'Failed' },
            ],
            activeTab,
            action: 'set-query-history-tab',
            count: total,
        })}
        ${renderQueryHistorySearch({ value: search })}
      </div>
      <div
        class="query-history-list-scroll custom-scrollbar"
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
                <p class="mt-4 font-body text-lg font-bold uppercase tracking-tight text-on-surface">
                  No Matching Queries
                </p>
                <p class="mt-2 max-w-xs text-sm leading-6 text-on-surface-variant/65">
                  Executed statements will appear here once they run against the active database.
                </p>
              </div>
            `
                : ''
        }
          <div class="query-history-list">
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
