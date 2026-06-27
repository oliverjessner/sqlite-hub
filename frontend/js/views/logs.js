import { renderStatusBadge } from '../components/badges.js';
import { renderTextInput } from '../components/formControls.js';
import { escapeHtml, formatCompactDateTime, formatDurationMs, formatNumber, truncateMiddle } from '../utils/format.js';

const FILTERS = {
    range: [
        ['1h', '1H'],
        ['24h', '24H'],
        ['7d', '7D'],
        ['30d', '30D'],
        ['all', 'ALL'],
    ],
    kind: [
        ['all', 'All'],
        ['query', 'Query'],
        ['access', 'Access'],
    ],
    actor: [
        ['all', 'All'],
        ['user', 'User'],
        ['cli', 'CLI'],
        ['api', 'API'],
        ['mcp', 'MCP'],
    ],
    status: [
        ['all', 'All'],
        ['success', 'Success'],
        ['error', 'Error'],
    ],
    queryType: [
        ['all', 'All'],
        ['select', 'Select'],
        ['insert', 'Insert'],
        ['update', 'Update'],
        ['delete', 'Delete'],
        ['pragma', 'Pragma'],
        ['create', 'Create'],
        ['alter', 'Alter'],
        ['drop', 'Drop'],
        ['other', 'Other'],
    ],
};

function renderFilterGroup({ label, field, value, items, className = '' }) {
    return `
      <div class="${escapeHtml(['min-w-0', className].filter(Boolean).join(' '))}">
        <div class="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/55">
          ${escapeHtml(label)}
        </div>
        <div class="custom-scrollbar max-w-full overflow-x-auto pb-1">
          <div class="charts-height-toggle" role="group" aria-label="${escapeHtml(label)}">
            ${items
                .map(
                    ([itemValue, itemLabel]) => `
                      <button
                        class="standard-button charts-height-toggle__button ${value === itemValue ? 'is-active' : ''}"
                        aria-pressed="${value === itemValue ? 'true' : 'false'}"
                        data-action="set-log-filter"
                        data-field="${escapeHtml(field)}"
                        data-value="${escapeHtml(itemValue)}"
                        type="button"
                      >
                        ${escapeHtml(itemLabel)}
                      </button>
                    `,
                )
                .join('')}
          </div>
        </div>
      </div>
    `;
}

function renderLogMetaStrip(logs) {
    const total = formatNumber(logs.total ?? 0);
    const visible = formatNumber((logs.items ?? []).length);
    const activeDatabase = logs.metadata?.activeDatabase?.label ?? null;
    const scope = activeDatabase || 'Active Database';
    const items = [
        ['Visible', visible],
        ['Matched', total],
        ['Scope', scope],
    ];

    return `
      <div class="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-outline-variant/10 pt-4">
        ${items
            .map(
                ([label, value]) => `
                  <div class="min-w-0">
                    <div class="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/50">
                      ${escapeHtml(label)}
                    </div>
                    <div class="mt-1 max-w-[18rem] truncate font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-on-surface" data-logs-meta="${escapeHtml(
                        label.toLowerCase(),
                    )}" title="${escapeHtml(value)}">
                      ${escapeHtml(value)}
                    </div>
                  </div>
                `,
            )
            .join('')}
      </div>
    `;
}

function renderLogFilters(logs) {
    const filters = logs.filters ?? {};

    return `
      <section class="shell-section p-5">
        <div class="flex flex-col gap-5">
          <form class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]" data-form="logs-search">
            ${renderTextInput({
                dataAttributes: { bind: 'logs-search' },
                name: 'search',
                placeholder: 'Search action, target, SQL, table, error...',
                value: filters.searchInput ?? '',
            })}
            <button class="standard-button justify-center" type="submit">
              <span class="material-symbols-outlined text-sm">search</span>
              Apply
            </button>
          </form>
          ${renderLogMetaStrip(logs)}
          <div class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            ${renderFilterGroup({
                label: 'Time Window',
                field: 'range',
                value: filters.range ?? 'all',
                items: FILTERS.range,
            })}
            ${renderFilterGroup({
                label: 'Log Type',
                field: 'kind',
                value: filters.kind ?? 'all',
                items: FILTERS.kind,
            })}
            ${renderFilterGroup({
                label: 'Executed By',
                field: 'actor',
                value: filters.actor ?? 'all',
                items: FILTERS.actor,
            })}
            ${renderFilterGroup({
                label: 'Status',
                field: 'status',
                value: filters.status ?? 'all',
                items: FILTERS.status,
            })}
            ${renderFilterGroup({
                label: 'Query Type',
                field: 'queryType',
                value: filters.queryType ?? 'all',
                items: FILTERS.queryType,
                className: 'xl:col-span-2',
            })}
          </div>
        </div>
      </section>
    `;
}

function renderLogPreview(item) {
    if (item.kind === 'query') {
        return `
          <div class="mt-2 max-w-2xl truncate font-mono text-[11px] text-on-surface-variant/60" title="${escapeHtml(
              item.rawSql ?? '',
          )}">
            ${escapeHtml(item.preview || item.rawSql || 'SQL query')}
          </div>
        `;
    }

    const metadata = item.metadata ?? {};
    const method = metadata.method ? `${metadata.method} ` : '';
    const path = metadata.path ?? '';

    return `
      <div class="mt-2 max-w-4xl truncate font-mono text-[11px] text-on-surface-variant/60" title="${escapeHtml(path)}">
        ${escapeHtml(`${method}${path || item.action || 'access'}`)}
      </div>
    `;
}

function getActorTextClass(actor) {
    return ['api', 'cli', 'mcp'].includes(
        String(actor ?? '')
            .trim()
            .toLowerCase(),
    )
        ? 'text-primary-container'
        : 'text-on-surface-variant/70';
}

function renderLogRow(item) {
    const actor = item.executedBy || item.source || 'n/a';
    const source = item.kind || 'log';
    const status = item.status || 'unknown';
    const target = [item.targetType, item.targetName].filter(Boolean).join(' // ') || 'n/a';
    const detailBadges = [
        item.queryType && renderStatusBadge(item.queryType, 'muted'),
        item.destructive === true && renderStatusBadge('destructive', 'alert'),
        item.kind === 'query' && item.rowCount !== null && item.rowCount !== undefined
            ? renderStatusBadge(`${formatNumber(item.rowCount)} rows`, 'muted')
            : '',
        item.kind === 'query' && item.affectedRows
            ? renderStatusBadge(`${formatNumber(item.affectedRows)} affected`, 'muted')
            : '',
    ]
        .filter(Boolean)
        .join('');

    return `
      <tr class="border-b border-outline-variant/5 bg-surface-container-lowest/60 align-top">
        <td class="px-4 py-4 font-mono text-[11px] text-on-surface-variant/75">
          ${escapeHtml(formatCompactDateTime(item.occurredAt))}
        </td>
        <td class="px-4 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-on-surface-variant/70">
          ${escapeHtml(source)}
        </td>
        <td class="px-4 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.12em] ${getActorTextClass(actor)}">
          ${escapeHtml(actor)}
        </td>
        <td class="px-4 py-4">
          <div class="font-body text-sm font-black uppercase text-on-surface">
            ${escapeHtml(truncateMiddle(item.action ?? 'log', 44))}
          </div>
          ${renderLogPreview(item)}
          ${
              detailBadges
                  ? `<div class="query-history-badge-row query-history-badge-row--compact logs-detail-badge-row mt-3">${detailBadges}</div>`
                  : ''
          }
          ${item.errorMessage ? `<div class="mt-2 text-xs text-error">${escapeHtml(item.errorMessage)}</div>` : ''}
        </td>
        <td class="px-4 py-4 font-mono text-[11px] text-on-surface-variant/70" title="${escapeHtml(target)}">
          ${escapeHtml(truncateMiddle(target, 42))}
        </td>
        <td class="px-4 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.12em] ${
            status === 'error' ? 'text-error' : 'text-on-surface-variant/70'
        }">
          ${escapeHtml(status)}
        </td>
        <td class="px-4 py-4 font-mono text-[11px] text-on-surface-variant/70">
          ${escapeHtml(formatDurationMs(item.durationMs))}
        </td>
      </tr>
    `;
}

export function renderLogTable(logs) {
    if (logs.loading && !(logs.items ?? []).length) {
        return `
          <section class="shell-section flex min-h-0 flex-1 items-center justify-center overflow-hidden" data-logs-table>
            <div class="text-center text-on-surface-variant/45">
              <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
              <div class="font-mono text-[10px] uppercase tracking-[0.2em]">Loading Logs</div>
            </div>
          </section>
        `;
    }

    if (logs.error) {
        return `
          <section class="shell-section custom-scrollbar min-h-0 flex-1 overflow-auto border-error/20 bg-error-container/10 px-6 py-5" data-logs-table>
            <div class="font-body text-xs font-bold uppercase tracking-[0.18em] text-error">
              ${escapeHtml(logs.error.code)}
            </div>
            <div class="mt-2 text-sm text-on-surface">${escapeHtml(logs.error.message)}</div>
          </section>
        `;
    }

    if (!(logs.items ?? []).length) {
        return `
          <section class="shell-section flex min-h-0 flex-1 items-center justify-center overflow-hidden" data-logs-table>
            <div class="text-center text-on-surface-variant/45">
              <span class="material-symbols-outlined mb-3 text-5xl">receipt_long</span>
              <div class="font-body text-xl font-black uppercase text-on-surface">No Logs Found</div>
              <div class="mt-2 font-mono text-[10px] uppercase tracking-[0.18em]">Adjust filters or time window</div>
            </div>
          </section>
        `;
    }

    return `
      <section class="shell-section flex min-h-0 flex-1 flex-col overflow-hidden" data-logs-table>
        <div class="custom-scrollbar min-h-0 flex-1 overflow-auto" data-logs-table-scroll>
          <table class="w-full min-w-[1080px] text-left">
            <thead class="sticky top-0 z-10 bg-surface-container-highest">
              <tr class="border-b border-outline-variant/10 font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/60">
                <th class="px-4 py-3 font-normal">Time</th>
                <th class="px-4 py-3 font-normal">Source</th>
                <th class="px-4 py-3 font-normal">Executed By</th>
                <th class="px-4 py-3 font-normal">Action</th>
                <th class="px-4 py-3 font-normal">Target</th>
                <th class="px-4 py-3 font-normal">Status</th>
                <th class="px-4 py-3 font-normal">Duration</th>
              </tr>
            </thead>
            <tbody>
              ${(logs.items ?? []).map(renderLogRow).join('')}
            </tbody>
          </table>
        </div>
        ${
            logs.hasMore
                ? `
                  <div class="border-t border-outline-variant/10 px-4 py-3">
                    <button class="standard-button" data-action="load-more-logs" type="button" ${
                        logs.loadingMore ? 'disabled' : ''
                    }>
                      ${logs.loadingMore ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                `
                : ''
        }
      </section>
    `;
}

export function renderLogsView(state) {
    const logs = state.logs ?? {};
    const activeDatabaseId = state.connections?.active?.id ?? logs.metadata?.activeDatabase?.id ?? '';

    return {
        main: `
          <main class="view-surface flex h-full min-h-0 flex-col" data-logs-view data-logs-active-database-id="${escapeHtml(activeDatabaseId)}">
            <div class="view-frame flex h-full min-h-0 flex-col gap-6">
              ${renderLogFilters(logs)}
              ${renderLogTable(logs)}
            </div>
          </main>
        `,
        panel: '',
    };
}
