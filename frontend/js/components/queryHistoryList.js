import { escapeHtml, formatNumber } from '../utils/format.js';

export function getQueryTypeTone(queryType) {
    if (queryType === 'select' || queryType === 'update') {
        return 'success';
    }

    if (queryType === 'pragma') {
        return 'primary';
    }

    return 'muted';
}

export function renderQueryHistoryBadgeRow(markup, { compact = true, className = '' } = {}) {
    const rowClasses = ['query-history-badge-row', compact ? 'query-history-badge-row--compact' : '', className]
        .filter(Boolean)
        .join(' ');

    return `<div class="${rowClasses}">${markup}</div>`;
}

export function renderQueryHistoryTabs({ tabs = [], activeTab = 'recent', action, count = null, countAttr = '' }) {
    const activeCount = count ?? tabs.find(tab => tab.id === activeTab)?.count ?? 0;

    return [
        '<div class="query-history-tabs">',
        tabs
            .map(tab =>
                [
                    '<button class="query-history-tab ',
                    activeTab === tab.id ? 'is-active' : '',
                    '" data-action="',
                    escapeHtml(action),
                    '" data-tab="',
                    escapeHtml(tab.id),
                    '" type="button">',
                    escapeHtml(tab.label),
                    '</button>',
                ].join(''),
            )
            .join(''),
        '<span class="query-history-tabs__count" ',
        countAttr,
        '>',
        escapeHtml(formatNumber(activeCount)),
        '</span></div>',
    ].join('');
}

export function renderQueryHistoryIconButton({
    action,
    historyId = null,
    icon,
    title,
    active = false,
    nextValue = null,
    attrs = '',
}) {
    return [
        '<button class="query-history-icon-button ',
        active ? 'is-active' : '',
        '" data-action="',
        escapeHtml(action),
        '"',
        historyId === null || historyId === undefined ? '' : ` data-history-id="${escapeHtml(historyId)}"`,
        nextValue === null || nextValue === undefined ? '' : ` data-next-value="${escapeHtml(nextValue)}"`,
        attrs ? ` ${attrs}` : '',
        ' title="',
        escapeHtml(title),
        '" type="button"><span class="material-symbols-outlined text-[18px]">',
        escapeHtml(icon),
        '</span></button>',
    ].join('');
}

export function renderQueryHistoryActionGroup(actions = []) {
    return `<div class="query-history-item-actions">${actions.filter(Boolean).join('')}</div>`;
}

export function renderQueryHistoryListItem({
    title,
    preview,
    historyId,
    active = false,
    error = false,
    hitAction,
    hitAttrs = '',
    itemAttrs = '',
    titleAttrs = '',
    badgesMarkup = '',
    footerMetaMarkup = '',
    actionsMarkup = '',
}) {
    const itemClasses = ['query-history-item', active ? 'is-active' : '', error ? 'is-error' : '']
        .filter(Boolean)
        .join(' ');
    const footerMeta = String(footerMetaMarkup ?? '').trim()
        ? ['<div class="query-history-item-meta">', footerMetaMarkup, '</div>'].join('')
        : '';

    return [
        '<article class="',
        itemClasses,
        '"',
        itemAttrs ? ` ${itemAttrs}` : '',
        '><button class="query-history-item-hit ',
        active ? 'is-active' : '',
        '" data-action="',
        escapeHtml(hitAction),
        '" data-history-id="',
        escapeHtml(historyId),
        '"',
        hitAttrs ? ` ${hitAttrs}` : '',
        ' type="button">',
        '<div class="query-history-item-main">',
        '<span class="query-history-item-title"',
        titleAttrs ? ` ${titleAttrs}` : '',
        '>',
        escapeHtml(title),
        '</span>',
        badgesMarkup,
        '</div>',
        '<p class="query-history-sql-preview">',
        escapeHtml(preview),
        '</p></button>',
        '<div class="query-history-item-footer">',
        footerMeta,
        actionsMarkup,
        '</div></article>',
    ].join('');
}
