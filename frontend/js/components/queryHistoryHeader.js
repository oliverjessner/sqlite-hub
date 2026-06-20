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
