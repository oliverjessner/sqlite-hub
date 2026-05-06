import { renderQueryResultsPane } from '../components/queryResults.js';
import { analyzeQueryChartResult, getQueryChartTypeLabel, validateQueryChartConfig } from '../lib/queryCharts.js';
import { escapeHtml, highlightSql } from '../utils/format.js';
import { renderStatusBadge } from '../components/badges.js';

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

function renderChartsList(state) {
    const activeTab = ['recent', 'saved'].includes(state.charts.historyTab) ? state.charts.historyTab : 'recent';
    const allQueries = state.charts.queries ?? [];
    const queries = activeTab === 'saved' ? allQueries.filter(item => item.isSaved) : allQueries;
    const selectedHistoryId = Number(state.charts.selectedHistoryId);

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

        return `
      <div class="flex h-full items-center justify-center px-6 text-center">
        <div>
          <span class="material-symbols-outlined mb-3 text-4xl text-on-surface-variant/25">${
              isSavedTab ? 'bookmark' : 'query_stats'
          }</span>
          <p class="font-headline text-lg font-black uppercase tracking-tight text-on-surface">
            ${isSavedTab ? 'No Saved Charts Queries' : 'No Chartable Queries'}
          </p>
          <p class="mt-2 max-w-xs text-sm leading-6 text-on-surface-variant/60">
            ${
                isSavedTab
                    ? 'Save chartable queries from this list or from the SQL Editor to keep them here.'
                    : 'Run SELECT queries in the SQL Editor first. They will appear here automatically.'
            }
          </p>
        </div>
      </div>
    `;
    }

    return `
    <div class="custom-scrollbar flex-1 overflow-auto px-4 py-4">
      <div class="space-y-2">
        ${queries
            .map(
                item => `
              <article
                class="group w-full border transition-colors ${
                    selectedHistoryId === Number(item.id)
                        ? 'border-primary-container/30 bg-surface-container-high'
                        : 'border-outline-variant/10 bg-surface-container-lowest hover:bg-surface-container-high'
                }"
                data-charts-history-item
              >
                <button
                  class="w-full px-4 py-3 text-left transition-colors group-hover:bg-surface-container-high"
                  data-action="navigate"
                  data-history-id="${escapeHtml(item.id)}"
                  data-to="/charts/${encodeURIComponent(item.id)}"
                  type="button"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1 truncate font-mono text-xs ${
                        selectedHistoryId === Number(item.id) ? 'text-primary-container' : 'text-on-surface'
                    }" data-charts-history-title>
                      ${escapeHtml(item.displayTitle)}
                    </div>
                    <div class="flex shrink-0 flex-wrap justify-end gap-1">
                      <span class="inline-flex" data-charts-saved-badge ${item.isSaved ? '' : 'hidden'}>
                        ${renderStatusBadge('saved', 'primary')}
                      </span>
                      ${
                          item.chartTypes?.length
                              ? item.chartTypes
                                    .map(chartType => renderStatusBadge(getQueryChartTypeLabel(chartType), 'primary'))
                                    .join('')
                              : renderStatusBadge('None', 'muted')
                      }
                    </div>
                  </div>
                  <div class="mt-1 truncate text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/45">
                    ${escapeHtml(item.previewSql)}
                  </div>
                </button>
                <div class="flex items-center justify-end border-t border-outline-variant/10 px-3 py-2 transition-colors group-hover:bg-surface-container-high">
                  <button
                    aria-label="Open chart query"
                    class="min-h-[var(--control-height)] flex-1 self-stretch"
                    data-action="navigate"
                    data-history-id="${escapeHtml(item.id)}"
                    data-to="/charts/${encodeURIComponent(item.id)}"
                    type="button"
                  ></button>
                  <button
                    class="query-history-icon-button ${item.isSaved ? 'is-active' : ''}"
                    data-action="toggle-charts-query-history-saved"
                    data-history-id="${escapeHtml(item.id)}"
                    data-next-value="${item.isSaved ? 'false' : 'true'}"
                    title="${item.isSaved ? 'Remove from saved' : 'Save query'}"
                    type="button"
                  >
                    <span class="material-symbols-outlined text-[18px]">
                      ${item.isSaved ? 'bookmark' : 'bookmark_add'}
                    </span>
                  </button>
                </div>
              </article>
            `,
            )
            .join('')}
      </div>
    </div>
  `;
}

function renderChartsHistoryTabs(state) {
    const activeTab = ['recent', 'saved'].includes(state.charts.historyTab) ? state.charts.historyTab : 'recent';
    const savedCount = (state.charts.queries ?? []).filter(item => item.isSaved).length;
    const tabs = [
        { id: 'recent', label: 'Recent', count: state.charts.queries?.length ?? 0 },
        { id: 'saved', label: 'Saved', count: savedCount },
    ];

    return `
    <div class="mt-4 flex items-center gap-2">
      ${tabs
          .map(
              tab => `
                <button
                  class="query-history-tab ${activeTab === tab.id ? 'is-active' : ''}"
                  data-action="set-charts-history-tab"
                  data-tab="${escapeHtml(tab.id)}"
                  type="button"
                >
                  ${escapeHtml(tab.label)}
                </button>
              `,
          )
          .join('')}
      <span class="ml-auto text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/50">
        <span data-charts-history-count>${escapeHtml(String(tabs.find(tab => tab.id === activeTab)?.count ?? 0))}</span>
      </span>
    </div>
  `;
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
          Choose a query-history entry on the left to load its charts, render the live result set, and manage chart definitions.
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

    return '';
}

function renderQuerySqlSection(state, rawSql) {
    const isExpanded = Boolean(state.charts.sqlExpanded);

    return `
    <section class="mt-5 border border-outline-variant/10 bg-surface-container-lowest">
      <button
        class="standard-button flex w-full justify-between border-b border-outline-variant/10 px-4 text-left"
        data-action="toggle-charts-sql-panel"
        type="button"
      >
        <span class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
          Query SQL
        </span>
        <span class="material-symbols-outlined text-on-surface-variant/55">
          ${isExpanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      ${
          isExpanded
              ? `
            <pre class="custom-scrollbar overflow-auto p-4 font-mono text-sm leading-6 text-on-surface"><code>${highlightSql(
                rawSql,
            )}</code></pre>
          `
              : ''
      }
    </section>
  `;
}

function renderQueryResultsSection(state) {
    const isVisible = Boolean(state.charts.resultsVisible);
    const statusMarkup = renderQueryResultState(state, state.charts.result);

    return `
    <section class="mt-6 border border-outline-variant/10 bg-surface-container-lowest">
      <div class="flex items-center justify-between gap-3 border-b border-outline-variant/10 px-4 py-3">
        <span class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
          Results
        </span>
        <button
          class="standard-button"
          data-action="toggle-charts-results-panel"
          type="button"
        >
          <span class="material-symbols-outlined text-sm">
            ${isVisible ? 'table_rows_narrow' : 'table_rows'}
          </span>
          ${isVisible ? 'Hide Results' : 'Show Results'}
        </button>
      </div>
      ${statusMarkup}
      ${
          isVisible && state.charts.result && !state.charts.resultLoading && !state.charts.resultError
              ? `
            <div class="h-[18rem] overflow-hidden">
              ${renderQueryResultsPane(state.charts.result, {
                  selectedRowIndex: null,
                  editable: false,
                  sortColumn: null,
                  sortDirection: null,
              })}
            </div>
          `
              : ''
      }
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

    return `
    <article class="query-chart-card ${sizeClass}">
      <header class="query-chart-card__header">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="truncate font-headline text-xl font-black uppercase tracking-tight text-on-surface">
              ${escapeHtml(chart.name)}
            </h3>
            ${renderStatusBadge(getQueryChartTypeLabel(chart.chartType), 'primary')}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="standard-button"
            data-action="open-edit-query-chart-modal"
            data-chart-id="${escapeHtml(chart.id)}"
            type="button"
          >
            Edit
          </button>
          <button
            class="delete-button"
            data-action="open-delete-query-chart-modal"
            data-chart-id="${escapeHtml(chart.id)}"
            type="button"
          >
            Delete
          </button>
          <button
            class="standard-button"
            data-action="export-query-chart-png"
            data-chart-id="${escapeHtml(chart.id)}"
            type="button"
          >
            Export PNG
          </button>
        </div>
      </header>
      <div class="query-chart-card__body">
        ${renderChartSurface(chart, state, analysis)}
      </div>
    </article>
  `;
}

export function renderChartsDetail(state) {
    const detail = state.charts.detail;
    const selectedHistoryId = state.charts.selectedHistoryId;
    const historyVisible = state.editor.historyPanelVisible !== false;

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
    <div class="custom-scrollbar flex-1 overflow-auto">
      <div class="charts-detail-shell">
        <header class="charts-detail-shell__header">
          <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-primary-container/70">
            Charts
          </div>
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
                data-action="toggle-query-history-panel"
                data-next-value="${historyVisible ? 'false' : 'true'}"
                type="button"
              >
                <span class="material-symbols-outlined text-sm">${
                  historyVisible ? 'visibility_off' : 'history'
                }</span>
                ${historyVisible ? 'Hide Query History' : 'Show Query History'}
              </button>
            </div>
            <div class="charts-detail-shell__controls-group charts-detail-shell__controls-group--end">
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
          </div>
        </header>

        ${renderQuerySqlSection(state, detail.item.rawSql)}

        <section class="mt-6 space-y-5">
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

        ${renderQueryResultsSection(state)}
      </div>
    </div>
  `;
}

export function renderChartsView(state) {
    const historyVisible = state.editor.historyPanelVisible !== false || !state.charts.selectedHistoryId;

    if (!state.connections.active && state.charts.error?.code === 'ACTIVE_DATABASE_REQUIRED') {
        return {
            main: `<section class="view-surface flex min-h-full">${renderMissingDatabase()}</section>`,
            panel: '',
        };
    }

    return {
        main: `
      <section class="charts-view">
        ${
            historyVisible
                ? `
                  <aside class="charts-view__sidebar">
                    <div class="charts-view__sidebar-header">
                      <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">
                        Query History
                      </div>
                      <h2 class="mt-2 text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
                        Charts
                      </h2>
                      ${renderChartsHistoryTabs(state)}
                    </div>
                    ${renderChartsList(state)}
                  </aside>
                `
                : ''
        }
        <div class="charts-view__detail">${renderChartsDetail(state)}</div>
      </section>
    `,
        panel: '',
    };
}
