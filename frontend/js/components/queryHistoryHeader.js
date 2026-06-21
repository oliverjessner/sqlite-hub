import { escapeHtml } from '../utils/format.js';

export function renderQueryHistoryHeader({
    title = 'Query History',
    icon = 'history',
    closeAction = 'toggle-query-history-panel',
    closeTitle = 'Hide query history',
    nextValue = 'false',
} = {}) {
    return `
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px] text-primary-container">${escapeHtml(icon)}</span>
          <span class="font-headline text-xs font-black uppercase tracking-[0.18em] text-primary-container">
            ${escapeHtml(title)}
          </span>
        </div>
        <button
          class="query-history-icon-button"
          data-action="${escapeHtml(closeAction)}"
          data-next-value="${escapeHtml(nextValue)}"
          title="${escapeHtml(closeTitle)}"
          type="button"
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    `;
}

export function renderQueryHistorySearch({
    bind = 'query-history-search',
    value = '',
    placeholder = 'Search SQL, titles, notes...',
} = {}) {
    return `
      <label class="query-history-search">
        <span class="sr-only">Search query history</span>
        <span class="material-symbols-outlined query-history-search__icon" aria-hidden="true">search</span>
        <input
          class="control-input query-history-search__input w-full border border-outline-variant/20 bg-surface-container text-sm text-on-surface outline-none placeholder:text-on-surface-variant/35 focus:border-primary-container"
          data-bind="${escapeHtml(bind)}"
          placeholder="${escapeHtml(placeholder)}"
          type="search"
          value="${escapeHtml(value)}"
        />
      </label>
    `;
}
