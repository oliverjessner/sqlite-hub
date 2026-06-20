import { renderQueryResultsPane } from '../components/queryResults.js';
import { analyzeQueryChartResult, getQueryChartTypeLabel, validateQueryChartConfig } from '../lib/queryCharts.js';
import { escapeHtml, formatNumber, highlightSql } from '../utils/format.js';
import { renderStatusBadge } from '../components/badges.js';
import { renderQueryHistoryHeader, renderQueryHistorySearch } from '../components/queryHistoryHeader.js';
import {
    renderQueryHistoryActionGroup,
    renderQueryHistoryBadgeRow,
    renderQueryHistoryIconButton,
    renderQueryHistoryListItem,
    renderQueryHistoryTabs,
} from '../components/queryHistoryList.js';

function renderMissingDatabase() {
    return `
    <section class="flex flex-1 items-center justify-center px-8 text-center">
      <div class="max-w-xl">
        <span class="material-symbols-outlined mb-4 text-5xl text-on-surface-variant/20">database_off</span>
        <h1 class="font-headline text-3xl font-black uppercase tracking-tight text-primary-container">
          No Active SQLite Database
        </h1>
        <p class="mt-3 text-sm leading-7 text-on-surface-variant/65">
          Open a local SQLite database first. The Charts area only works against query-history entries from the active database.
        </p>
      </div>
    </section>
  `;
}

function normalizeChartsHistorySearchText(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase();
}

function getChartsHistorySearchHaystack(item) {
    return [
        item.displayTitle,
        item.title,
        item.previewSql,
        item.rawSql,
        item.chartTypes?.join(' '),
        item.isSaved ? 'saved' : '',
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function getFilteredChartsQueries(state) {
    const activeTab = ['recent', 'saved', 'unsaved'].includes(state.charts.historyTab)
        ? state.charts.historyTab
        : 'recent';
    const search = normalizeChartsHistorySearchText(state.charts.historySearch);
    const allQueries = state.charts.queries ?? [];
    const tabQueries =
        activeTab === 'saved'
            ? allQueries.filter(item => item.isSaved)
            : activeTab === 'unsaved'
              ? allQueries.filter(item => !item.isSaved)
              : allQueries;

    if (!search) {
        return tabQueries;
    }

    return tabQueries.filter(item => getChartsHistorySearchHaystack(item).includes(search));
}

function renderChartsHistoryListItem(item, state) {
    const selectedHistoryId = Number(state.charts.selectedHistoryId);
    const isActive = selectedHistoryId === Number(item.id);
    const savedBadgeMarkup = `
      <span
        data-charts-saved-badge
        data-history-id="${escapeHtml(item.id)}"
        ${item.isSaved ? '' : 'hidden'}
      >
        ${renderStatusBadge('saved', 'primary')}
      </span>
    `;
    const chartBadgesMarkup = item.chartTypes?.length
        ? item.chartTypes.map(chartType => renderStatusBadge(getQueryChartTypeLabel(chartType), 'primary')).join('')
        : renderStatusBadge('None', 'muted');
    const badgesMarkup = renderQueryHistoryBadgeRow([savedBadgeMarkup, chartBadgesMarkup].join(''));
    const actionsMarkup = renderQueryHistoryActionGroup([
        renderQueryHistoryIconButton({
            action: 'open-charts-query-detail',
            historyId: item.id,
            icon: 'info',
            title: 'Open chart detail',
            active: Boolean(state.charts.detailPanelVisible && isActive),
        }),
        renderQueryHistoryIconButton({
            action: 'toggle-charts-query-history-saved',
            historyId: item.id,
            icon: item.isSaved ? 'bookmark' : 'bookmark_add',
            title: item.isSaved ? 'Remove from saved' : 'Save query',
            active: item.isSaved,
            nextValue: item.isSaved ? 'false' : 'true',
        }),
    ]);

    return renderQueryHistoryListItem({
        title: item.displayTitle,
        preview: item.previewSql,
        historyId: item.id,
        active: isActive,
        hitAction: 'navigate',
        hitAttrs: `data-to="/charts/${encodeURIComponent(item.id)}"`,
        itemAttrs: 'data-charts-history-item',
        titleAttrs: 'data-charts-history-title',
        badgesMarkup,
        actionsMarkup,
    });
}

function renderChartsList(state) {
    const activeTab = ['recent', 'saved', 'unsaved'].includes(state.charts.historyTab)
        ? state.charts.historyTab
        : 'recent';
    const allQueries = state.charts.queries ?? [];
    const queries = getFilteredChartsQueries(state);
    const hasSearch = Boolean(normalizeChartsHistorySearchText(state.charts.historySearch));

    if (state.charts.loading && !allQueries.length) {
        return `
      <div class="flex h-full items-center justify-center px-6 text-center text-on-surface-variant/45">
        <div>
          <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
          <p class="font-mono text-[10px] uppercase tracking-[0.18em]">Loading Queries</p>
        </div>
      </div>
    `;
    }

    if (state.charts.error && !allQueries.length) {
        return `
      <div class="p-5">
        <div class="border border-error/30 bg-error-container/20 px-4 py-4 text-sm text-error">
          ${escapeHtml(state.charts.error.message)}
        </div>
      </div>
    `;
    }

    if (!queries.length) {
        const isSavedTab = activeTab === 'saved';
        const isUnsavedTab = activeTab === 'unsaved';

        return `
      <div class="flex h-full items-center justify-center px-6 text-center">
        <div>
          <span class="material-symbols-outlined mb-3 text-4xl text-on-surface-variant/25">${
              hasSearch ? 'manage_search' : isSavedTab ? 'bookmark' : isUnsavedTab ? 'bookmark_border' : 'query_stats'
          }</span>
          <p class="font-headline text-lg font-black uppercase tracking-tight text-on-surface">
            ${
                hasSearch
                    ? 'No Matching Queries'
                    : isSavedTab
                      ? 'No Saved Charts Queries'
                      : isUnsavedTab
                        ? 'No Unsaved Charts Queries'
                        : 'No Chartable Queries'
            }
          </p>
          <p class="mt-2 max-w-xs text-sm leading-6 text-on-surface-variant/60">
            ${
                hasSearch
                    ? 'Try another title, SQL fragment, chart type, or saved status.'
                    : isSavedTab
                      ? 'Save chartable queries from this list or from the SQL Editor to keep them here.'
                      : isUnsavedTab
                        ? 'Unsaved chartable queries will appear here until you bookmark them.'
                        : 'Run SELECT queries in the SQL Editor first. They will appear here automatically.'
            }
          </p>
        </div>
      </div>
    `;
    }

    return `
    <div class="query-history-list-scroll custom-scrollbar">
      <div class="query-history-list">
        ${queries.map(item => renderChartsHistoryListItem(item, state)).join('')}
      </div>
    </div>
  `;
}

function renderChartsHistoryTabs(state) {
    const activeTab = ['recent', 'saved', 'unsaved'].includes(state.charts.historyTab)
        ? state.charts.historyTab
        : 'recent';
    const search = normalizeChartsHistorySearchText(state.charts.historySearch);
    const countableQueries = search
        ? (state.charts.queries ?? []).filter(item => getChartsHistorySearchHaystack(item).includes(search))
        : (state.charts.queries ?? []);
    const savedCount = countableQueries.filter(item => item.isSaved).length;
    const unsavedCount = countableQueries.filter(item => !item.isSaved).length;
    const tabs = [
        { id: 'recent', label: 'Recent', count: countableQueries.length },
        { id: 'saved', label: 'Saved', count: savedCount },
        { id: 'unsaved', label: 'Unsaved', count: unsavedCount },
    ];

    return renderQueryHistoryTabs({
        tabs,
        activeTab,
        action: 'set-charts-history-tab',
        count: tabs.find(tab => tab.id === activeTab)?.count ?? 0,
        countAttr: 'data-charts-history-count',
    });
}

function renderEmptyChartDetail() {
    return `
    <div class="flex flex-1 items-center justify-center px-8 py-10 text-center">
      <div class="max-w-lg">
        <span class="material-symbols-outlined mb-4 text-5xl text-on-surface-variant/20">bar_chart</span>
        <h2 class="font-headline text-2xl font-black uppercase tracking-tight text-primary-container">
          Select A Query
        </h2>
        <p class="mt-3 text-sm leading-7 text-on-surface-variant/65">
          Choose a query-history entry on the right to load its charts, render the live result set, and manage chart definitions.
        </p>
      </div>
    </div>
  `;
}

function renderQueryResultState(state, result) {
    if (state.charts.resultLoading && !result) {
        return `
      <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-4 text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
        Loading live query result...
      </div>
    `;
    }

    if (state.charts.resultError) {
        return `
      <div class="border border-error/30 bg-error-container/15 px-4 py-4 text-sm text-error">
        <div class="font-mono text-[10px] uppercase tracking-[0.18em]">
          ${escapeHtml(state.charts.resultError.code ?? 'RESULT_ERROR')}
        </div>
        <div class="mt-2">${escapeHtml(state.charts.resultError.message)}</div>
      </div>
    `;
    }

    if (!result) {
        return `
      <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-4 text-sm text-on-surface-variant/60">
        No live result set is available for this query.
      </div>
    `;
    }

    if (result.truncated) {
        return `
      <div class="border-b border-primary-container/20 bg-primary-container/10 px-4 py-3 text-sm text-on-surface">
        Charts use the first ${escapeHtml(String(result.rowLimit ?? result.rows?.length ?? 0))} rows. Refine the query for a complete visualization.
      </div>
    `;
    }

    return '';
}

function renderChartsDetailDrawerMetaItem(label, value) {
    return `
    <div class="border border-outline-variant/10 bg-surface-container px-3 py-3">
      <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
        ${escapeHtml(label)}
      </div>
      <div class="mt-2 text-sm text-on-surface">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderChartsDetailDrawerQuerySection(rawSql) {
    return `
    <section class="mt-5 border border-outline-variant/10 bg-surface-container-lowest">
      <div class="border-b border-outline-variant/10 px-4 py-3">
        <span class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
          Query
        </span>
      </div>
      <pre class="query-history-detail-sql custom-scrollbar max-h-[22rem] overflow-auto p-4 font-mono text-sm leading-6 text-on-surface"><code>${highlightSql(
          rawSql ?? '',
      )}</code></pre>
    </section>
  `;
}

function renderChartsDetailDrawerResultsSection(state) {
    const statusMarkup = renderQueryResultState(state, state.charts.result);

    return `
    <section class="mt-5 border border-outline-variant/10 bg-surface-container-lowest">
      <div class="border-b border-outline-variant/10 px-4 py-3">
        <span class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
          Results
        </span>
      </div>
      ${statusMarkup}
      ${
          state.charts.result && !state.charts.resultLoading && !state.charts.resultError
              ? `
            <div class="h-[18rem] overflow-hidden">
              ${renderQueryResultsPane(state.charts.result, {
                  selectedRowIndex: null,
                  editable: false,
                  sortColumn: null,
                  sortDirection: null,
                  resultScope: 'charts',
                  sortAction: null,
              })}
            </div>
          `
              : ''
      }
    </section>
  `;
}

export function renderChartsDetailDrawer(state) {
    if (!state.charts.detailPanelVisible) {
        return '';
    }

    const detail = state.charts.detail;

    if (state.charts.detailLoading && !detail) {
        return `
      <section class="flex h-full min-h-0 flex-col bg-surface-low">
        <div class="border-b border-outline-variant/10 px-5 py-4">
          <div class="flex items-center justify-between gap-3">
            <span class="font-headline text-sm font-black uppercase tracking-[0.18em] text-primary-container">
              Chart Detail
            </span>
            <button class="query-history-icon-button" data-action="close-charts-query-detail" type="button">
              <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
        <div class="flex flex-1 items-center justify-center px-6 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
          Loading chart detail...
        </div>
      </section>
    `;
    }

    if (state.charts.detailError && !detail) {
        return `
      <section class="flex h-full min-h-0 flex-col bg-surface-low">
        <div class="border-b border-outline-variant/10 px-5 py-4">
          <div class="flex items-center justify-between gap-3">
            <span class="font-headline text-sm font-black uppercase tracking-[0.18em] text-primary-container">
              Chart Detail
            </span>
            <button class="query-history-icon-button" data-action="close-charts-query-detail" type="button">
              <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
        <div class="p-5">
          <div class="border border-error/30 bg-error-container/20 px-4 py-4 text-sm text-error">
            ${escapeHtml(state.charts.detailError.message)}
          </div>
        </div>
      </section>
    `;
    }

    if (!detail?.item) {
        return '';
    }

    const charts = detail.charts ?? [];
    const result = state.charts.result;
    const chartTypeBadges = charts.length
        ? charts.map(chart => renderStatusBadge(getQueryChartTypeLabel(chart.chartType), 'primary')).join('')
        : renderStatusBadge('no charts', 'muted');
    const savedBadgeMarkup = `
      <span
        data-charts-saved-badge
        data-history-id="${escapeHtml(detail.item.id)}"
        ${detail.item.isSaved ? '' : 'hidden'}
      >
        ${renderStatusBadge('saved', 'primary')}
      </span>
    `;
    const statusMarkup = [
        savedBadgeMarkup,
        state.charts.resultError ? renderStatusBadge('result error', 'alert') : '',
        state.charts.resultLoading ? renderStatusBadge('loading result', 'muted') : '',
        chartTypeBadges,
    ].join('');
    const metaMarkup = [
        renderChartsDetailDrawerMetaItem('Charts', formatNumber(charts.length)),
        renderChartsDetailDrawerMetaItem('Rows', formatNumber(result?.rows?.length ?? 0)),
        renderChartsDetailDrawerMetaItem('Columns', formatNumber(result?.columns?.length ?? 0)),
        renderChartsDetailDrawerMetaItem('Query ID', String(detail.item.id)),
    ].join('');

    return `
    <section class="flex h-full min-h-0 flex-col bg-surface-low">
      <div class="border-b border-outline-variant/10 px-5 py-4">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-primary-container/70">
              Chart Detail
            </div>
            <h2 class="mt-1 truncate font-headline text-lg font-black uppercase tracking-tight text-on-surface">
              ${escapeHtml(detail.item.displayTitle)}
            </h2>
          </div>
          <button
            class="query-history-icon-button"
            data-action="close-charts-query-detail"
            title="Close chart detail"
            type="button"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        ${renderQueryHistoryBadgeRow(statusMarkup, { compact: false, className: 'mt-4' })}
      </div>
      <div class="custom-scrollbar min-h-0 flex-1 overflow-auto px-5 py-5">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          ${metaMarkup}
        </div>
        <div class="mt-5 flex flex-wrap gap-2">
          <button
            class="standard-button"
            data-action="open-query-history"
            data-history-id="${escapeHtml(detail.item.id)}"
            type="button"
          >
            Open In Editor
          </button>
          <button
            class="standard-button"
            data-action="toggle-charts-query-history-saved"
            data-history-id="${escapeHtml(detail.item.id)}"
            data-next-value="${detail.item.isSaved ? 'false' : 'true'}"
            title="${detail.item.isSaved ? 'Remove from saved' : 'Save query'}"
            type="button"
          >
            <span data-charts-saved-label>${detail.item.isSaved ? 'Unsave' : 'Save'}</span>
          </button>
        </div>
        ${renderChartsDetailDrawerQuerySection(detail.item.rawSql)}
        ${renderChartsDetailDrawerResultsSection(state)}
      </div>
    </section>
  `;
}

function resolveChartCardSizeClass(state) {
    return `query-chart-card--${String(state.charts.chartHeightPreset ?? 'medium')
        .trim()
        .toLowerCase()}`;
}

function renderChartHeightPresetToggle(state) {
    const activePreset = String(state.charts.chartHeightPreset ?? 'medium')
        .trim()
        .toLowerCase();
    const presets = [
        { value: 'small', label: 'Small', height: '300px' },
        { value: 'medium', label: 'Medium', height: '450px' },
        { value: 'large', label: 'Large', height: '600px' },
    ];

    return `
    <div class="flex flex-col gap-2">
      <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
        Chart Height
      </div>
      <div class="charts-height-toggle" role="group" aria-label="Chart height preset">
        ${presets
            .map(
                preset => `
              <button
                class="standard-button charts-height-toggle__button ${activePreset === preset.value ? 'is-active' : ''}"
                data-action="set-charts-height-preset"
                data-preset="${preset.value}"
                type="button"
                title="${preset.height}"
              >
                ${preset.label}
              </button>
            `,
            )
            .join('')}
      </div>
    </div>
  `;
}

function renderChartSurface(chart, state, analysis) {
    if (state.charts.resultLoading) {
        return `
      <div class="query-chart-surface-state flex h-full items-center justify-center text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
        Loading chart result...
      </div>
    `;
    }

    if (state.charts.resultError) {
        return `
      <div class="query-chart-surface-state flex items-center justify-center border border-error/20 bg-error-container/10 px-6 text-center text-sm text-error">
        ${escapeHtml(state.charts.resultError.message)}
      </div>
    `;
    }

    const validation = validateQueryChartConfig(chart.chartType, chart.config, analysis);

    if (!validation.valid) {
        return `
      <div class="query-chart-surface-state flex items-center justify-center border border-error/20 bg-error-container/10 px-6 text-center text-sm text-error">
        ${escapeHtml(validation.errors.join(' '))}
      </div>
    `;
    }

    return `
    <div
      class="query-chart-canvas w-full"
      data-query-chart-id="${escapeHtml(chart.id)}"
      data-chart-export-name="${escapeHtml(chart.name.replace(/[^\w.-]+/g, '_'))}"
    ></div>
  `;
}

function renderChartCard(chart, state, analysis) {
    const sizeClass = resolveChartCardSizeClass(state);

    return [
        '<article class="query-chart-card ',
        sizeClass,
        '"><header class="query-chart-card__header"><div class="min-w-0">',
        '<div class="flex flex-wrap items-center gap-2">',
        '<h3 class="truncate font-headline text-xl font-black uppercase tracking-tight text-on-surface">',
        escapeHtml(chart.name),
        '</h3>',
        renderStatusBadge(getQueryChartTypeLabel(chart.chartType), 'primary'),
        '</div></div><div class="flex flex-wrap items-center gap-2">',
        '<button class="standard-button" data-action="open-edit-query-chart-modal" data-chart-id="',
        escapeHtml(chart.id),
        '" type="button">Edit</button>',
        '<button class="delete-button" data-action="open-delete-query-chart-modal" data-chart-id="',
        escapeHtml(chart.id),
        '" type="button"><span class="material-symbols-outlined">delete</span> Delete</button>',
        '<button class="standard-button" data-action="export-query-chart-png" data-chart-id="',
        escapeHtml(chart.id),
        '" type="button">Export PNG</button>',
        '</div></header><div class="query-chart-card__body">',
        renderChartSurface(chart, state, analysis),
        '</div></article>',
    ].join('');
}

export function renderChartsDetail(state) {
    const detail = state.charts.detail;
    const selectedHistoryId = state.charts.selectedHistoryId;
    const historyVisible = state.charts.historyPanelVisible !== false;

    if (!selectedHistoryId) {
        return renderEmptyChartDetail();
    }

    if (state.charts.detailLoading && !detail) {
        return `
      <div class="flex flex-1 items-center justify-center px-8 text-center text-on-surface-variant/45">
        <div>
          <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
          <p class="font-mono text-[10px] uppercase tracking-[0.18em]">Loading Query Detail</p>
        </div>
      </div>
    `;
    }

    if (state.charts.detailError && !detail) {
        return `
      <div class="p-8">
        <div class="border border-error/30 bg-error-container/20 px-4 py-4 text-sm text-error">
          ${escapeHtml(state.charts.detailError.message)}
        </div>
      </div>
    `;
    }

    if (!detail?.item) {
        return renderEmptyChartDetail();
    }

    const analysis = state.charts.result ? analyzeQueryChartResult(state.charts.result) : null;
    const charts = detail.charts ?? [];

    return `
    <div class="charts-detail-scroll custom-scrollbar flex-1 overflow-auto">
      <div class="charts-detail-shell">
        <header class="charts-detail-shell__header" data-charts-detail-header>
          <div class="charts-detail-shell__title">
            <h1 class="mt-2 truncate font-headline text-4xl font-black uppercase tracking-tight text-primary-container">
              ${escapeHtml(detail.item.displayTitle)}
            </h1>
          </div>
          <div class="charts-detail-shell__controls">
            <div class="charts-detail-shell__controls-group">
              ${renderChartHeightPresetToggle(state)}
              <button
                class="standard-button"
                data-action="open-query-history"
                data-history-id="${escapeHtml(detail.item.id)}"
                type="button"
              >
                <span class="material-symbols-outlined text-sm">terminal</span>
                Open In Editor
              </button>
              <button
                class="signature-button"
                data-action="open-create-query-chart-modal"
                type="button"
                ${state.charts.resultError || !state.charts.result ? 'disabled' : ''}
              >
                New Chart
              </button>
            </div>
            <div class="charts-detail-shell__controls-group charts-detail-shell__controls-group--end">
              <button
                class="standard-button panel-toggle-button ${historyVisible ? '' : 'is-active'}"
                aria-pressed="${historyVisible ? 'false' : 'true'}"
                data-action="toggle-query-history-panel"
                data-next-value="${historyVisible ? 'false' : 'true'}"
                type="button"
              >
                <span class="material-symbols-outlined text-sm">${
                    historyVisible ? 'visibility_off' : 'visibility'
                }</span>
                ${historyVisible ? 'Hide History' : 'Show History'}
              </button>
            </div>
          </div>
        </header>

        <section class="mt-6 space-y-5" data-charts-card-list>
          ${
              charts.length
                  ? charts.map(chart => renderChartCard(chart, state, analysis)).join('')
                  : `
                  <div class="flex min-h-[240px] items-center justify-center border border-dashed border-outline-variant/20 bg-surface-container-low px-8 text-center">
                    <div>
                      <span class="material-symbols-outlined mb-3 text-4xl text-on-surface-variant/25">add_chart</span>
                      <p class="font-headline text-lg font-black uppercase tracking-tight text-on-surface">
                        No Charts Yet
                      </p>
                      <p class="mt-2 max-w-md text-sm leading-6 text-on-surface-variant/60">
                        Create the first chart for this query. The query stays read-only here; only chart definitions are editable.
                      </p>
                    </div>
                  </div>
                `
          }
        </section>

      </div>
    </div>
  `;
}

export function renderChartsView(state) {
    const historyVisible = state.charts.historyPanelVisible !== false || !state.charts.selectedHistoryId;

    if (!state.connections.active && state.charts.error?.code === 'ACTIVE_DATABASE_REQUIRED') {
        return {
            main: `<section class="view-surface flex min-h-full">${renderMissingDatabase()}</section>`,
            panel: '',
        };
    }

    return {
        main: `
      <section class="charts-view">
        <div class="charts-view__detail">${renderChartsDetail(state)}</div>
        ${
            historyVisible
                ? `
                  <aside class="query-history-panel charts-view__sidebar">
                    <div class="query-history-panel__header charts-view__sidebar-header">
                      ${renderQueryHistoryHeader()}
                      ${renderChartsHistoryTabs(state)}
                      ${renderQueryHistorySearch({
                          bind: 'charts-history-search',
                          value: state.charts.historySearchInput,
                      })}
                    </div>
                    ${renderChartsList(state)}
                  </aside>
                `
                : ''
        }
      </section>
    `,
        panel: renderChartsDetailDrawer(state),
    };
}
