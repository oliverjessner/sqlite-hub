import {
    escapeHtml,
    formatDateTime,
    formatNumber,
    highlightSql,
    truncateMiddle,
} from '../utils/format.js';
import { renderVirtualTableBadge } from '../components/badges.js';
import { renderWorkspaceOpenDropdown } from '../components/workspaceOpenDropdown.js';

const CATEGORY_LABELS = {
    schema: 'Schema',
    constraints: 'Constraints',
    performance: 'Performance',
    'data-quality': 'Data Quality',
    documentation: 'Documentation',
};

const CATEGORY_ORDER = ['schema', 'constraints', 'performance', 'data-quality', 'documentation'];

function getScoreClass(score) {
    if (score >= 80) {
        return 'text-primary-container';
    }

    if (score >= 60) {
        return 'text-on-surface';
    }

    return 'text-error';
}

function renderError(error) {
    if (!error) {
        return '';
    }

    return `
      <div class="border border-error/20 bg-error-container/10 px-6 py-5 text-sm text-on-surface">
        <div class="font-body text-xs font-bold uppercase tracking-[0.18em] text-error">
          ${escapeHtml(error.code ?? 'REQUEST_FAILED')}
        </div>
        <div class="mt-2">${escapeHtml(error.message ?? 'Request failed.')}</div>
      </div>
    `;
}

function renderSeverityBadge(severity = 'info') {
    const normalized = String(severity ?? 'info').toLowerCase();
    const className =
        normalized === 'critical'
            ? 'border-error/35 bg-error-container/25 text-error'
            : normalized === 'warning'
              ? 'border-primary-container/35 bg-primary-container/15 text-primary-container'
              : 'border-outline-variant/20 bg-surface-container-lowest text-on-surface-variant';

    return `<span class="inline-flex h-6 items-center border px-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${className}">${escapeHtml(
        normalized,
    )}</span>`;
}

function renderRiskBadge(risk = 'low') {
    const normalized = String(risk ?? 'low').toLowerCase();
    const className =
        normalized === 'high'
            ? 'border-error/35 text-error'
            : normalized === 'medium'
              ? 'border-primary-container/35 text-primary-container'
              : 'border-outline-variant/20 text-on-surface-variant/70';

    return `<span class="inline-flex h-6 items-center border bg-surface-container-lowest px-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${className}">Risk ${escapeHtml(
        normalized,
    )}</span>`;
}

function renderTableList(state) {
    const { selectedTableName } = state.tableAdvisor;
    const tables = (state.tableAdvisor.tables ?? []).filter(table => !table?.isShadow);

    if (state.tableAdvisor.loading && !tables.length) {
        return `
          <div class="px-4 py-6 text-sm text-on-surface-variant/45">
            Loading tables...
          </div>
        `;
    }

    if (!tables.length) {
        return `
          <div class="px-4 py-6 text-sm text-on-surface-variant/45">
            No tables found.
          </div>
        `;
    }

    return `
      <div class="subnavi-list custom-scrollbar">
        ${tables
            .map(table => {
                const isActive = table.name === selectedTableName;

                return `
                  <a
                    class="table-designer-sidebar__item subnavi-item block border px-4 py-3 text-left transition-colors ${
                        isActive
                            ? 'is-active border-primary-container/30 bg-surface-container-high'
                            : 'border-outline-variant/10 bg-surface-container-lowest hover:bg-surface-container-high'
                    }"
                    href="#/table-advisor/${encodeURIComponent(table.name)}"
                    title="${escapeHtml(table.name)}"
                  >
                    <div class="flex min-w-0 items-center gap-2">
                      <div class="table-designer-sidebar__item-name min-w-0 flex-1 ${isActive ? 'is-active' : ''}">
                        ${escapeHtml(table.name)}
                      </div>
                      ${renderVirtualTableBadge(table)}
                    </div>
                    <div class="table-designer-sidebar__item-meta">
                      ${escapeHtml(formatNumber(table.columnCount ?? 0))} columns
                    </div>
                  </a>
                `;
            })
            .join('')}
      </div>
    `;
}

function renderSummary(result = {}) {
    const score = Number(result.score ?? 0);

    return `
      <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div class="border border-outline-variant/10 bg-surface-container-low px-4 py-3">
          <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/55">Table</div>
          <div class="mt-2 flex min-w-0 items-center gap-2">
            <div class="min-w-0 truncate text-lg font-black text-on-surface" title="${escapeHtml(
                result.tableName ?? '',
            )}">${escapeHtml(result.tableName ?? 'Unknown')}</div>
            ${renderVirtualTableBadge(result)}
          </div>
        </div>
        <div class="border border-outline-variant/10 bg-surface-container-low px-4 py-3">
          <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/55">Score</div>
          <div class="mt-2 text-3xl font-black ${getScoreClass(score)}">${escapeHtml(formatNumber(score))}</div>
        </div>
        <div class="border border-outline-variant/10 bg-surface-container-low px-4 py-3">
          <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/55">Issues</div>
          <div class="mt-2 text-3xl font-black text-on-surface">${escapeHtml(formatNumber(result.issueCount ?? 0))}</div>
        </div>
        <div class="border border-outline-variant/10 bg-surface-container-low px-4 py-3">
          <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/55">Rows</div>
          <div class="mt-2 text-3xl font-black text-on-surface">${escapeHtml(formatNumber(result.rowCount ?? 0))}</div>
          <div class="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/45">
            ${escapeHtml(formatDateTime(result.analyzedAt))}
          </div>
        </div>
      </div>
    `;
}

function renderIssue(issue = {}) {
    const sql = String(issue.sql ?? '').trim();

    return `
      <article class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              ${renderSeverityBadge(issue.severity)}
              ${renderRiskBadge(issue.risk)}
            </div>
            <h4 class="mt-3 text-lg font-black text-on-surface">${escapeHtml(issue.title ?? 'Advisor issue')}</h4>
          </div>
          <div class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/45" title="${escapeHtml(
              issue.id ?? '',
          )}">
            ${escapeHtml(truncateMiddle(issue.id ?? '', 42))}
          </div>
        </div>
        <div class="mt-3 grid grid-cols-1 gap-3 text-sm leading-6 text-on-surface-variant/75 lg:grid-cols-3">
          <div>
            <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/45">Explanation</div>
            <p class="mt-1">${escapeHtml(issue.explanation ?? '')}</p>
          </div>
          <div>
            <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/45">Evidence</div>
            <p class="mt-1">${escapeHtml(issue.evidence ?? '')}</p>
          </div>
          <div>
            <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/45">Recommendation</div>
            <p class="mt-1">${escapeHtml(issue.recommendation ?? '')}</p>
          </div>
        </div>
        ${
            issue.risk === 'high'
                ? `<div class="mt-3 border border-error/20 bg-error-container/15 px-3 py-2 text-xs leading-5 text-error">
                    This change may require rebuilding the table. Create a backup before applying it.
                  </div>`
                : ''
        }
        ${
            sql
                ? `<div class="mt-4 border border-outline-variant/10 bg-surface-container-low">
                    <div class="flex items-center justify-between gap-3 border-b border-outline-variant/10 px-3 py-2">
                      <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-container">SQL</div>
                      <button
                        class="standard-button min-h-8 px-3 py-1 text-[10px]"
                        data-action="copy-table-advisor-sql"
                        data-issue-id="${escapeHtml(issue.id ?? '')}"
                        type="button"
                      >
                        <span class="material-symbols-outlined text-sm">content_copy</span>
                        Copy SQL
                      </button>
                    </div>
                    <pre class="custom-scrollbar max-h-48 overflow-auto whitespace-pre-wrap px-3 py-3 text-xs leading-6 text-on-surface"><code>${highlightSql(
                        sql,
                    )}</code></pre>
                  </div>`
                : ''
        }
      </article>
    `;
}

function renderIssues(result = {}) {
    const issues = result.issues ?? [];

    if (!issues.length) {
        return `
          <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-6 text-sm leading-6 text-on-surface-variant/70">
            No table advisor issues found for this table.
          </div>
        `;
    }

    return CATEGORY_ORDER.map(category => {
        const categoryIssues = issues.filter(issue => issue.category === category);

        if (!categoryIssues.length) {
            return '';
        }

        return `
          <section class="space-y-3">
            <div class="flex items-center justify-between gap-3 border-b border-outline-variant/10 pb-2">
              <h3 class="font-mono text-[11px] uppercase tracking-[0.22em] text-primary-container">
                ${escapeHtml(CATEGORY_LABELS[category] ?? category)}
              </h3>
              <div class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/45">
                ${escapeHtml(formatNumber(categoryIssues.length))}
              </div>
            </div>
            ${categoryIssues.map(issue => renderIssue(issue)).join('')}
          </section>
        `;
    }).join('');
}

function renderAdvisorBody(state) {
    const advisor = state.tableAdvisor;

    if (advisor.error) {
        return renderError(advisor.error);
    }

    if (advisor.loading && !advisor.result) {
        return `
          <div class="flex min-h-[280px] items-center justify-center border border-outline-variant/10 bg-surface-container-low">
            <div class="text-center text-on-surface-variant/40">
              <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
              <p class="font-mono text-[10px] uppercase tracking-[0.22em]">LOADING_TABLES</p>
            </div>
          </div>
        `;
    }

    if (!advisor.selectedTableName) {
        return `
          <div class="border border-dashed border-outline-variant/20 bg-surface-container-low px-8 py-10 text-center">
            <span class="material-symbols-outlined mb-3 text-5xl text-on-surface-variant/25">troubleshoot</span>
            <p class="font-body text-xl font-black uppercase tracking-tight text-primary-container">
              No table selected
            </p>
          </div>
        `;
    }

    if (advisor.analysisLoading) {
        return `
          <div class="flex min-h-[280px] items-center justify-center border border-outline-variant/10 bg-surface-container-low">
            <div class="text-center text-on-surface-variant/40">
              <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
              <p class="font-mono text-[10px] uppercase tracking-[0.22em]">ANALYZING_TABLE</p>
            </div>
          </div>
        `;
    }

    if (advisor.analysisError) {
        return renderError(advisor.analysisError);
    }

    if (!advisor.result) {
        return '';
    }

    return `
      <div class="space-y-6">
        ${renderSummary(advisor.result)}
        ${renderIssues(advisor.result)}
      </div>
    `;
}

function renderToolbar(state) {
    const tableName = state.tableAdvisor.selectedTableName;

    return `
      <header class="workspace-header">
        <div class="min-w-0">
          <div class="font-mono text-[10px] uppercase tracking-[0.26em] text-primary-container/70">
            Local analysis
          </div>
          <h1 class="mt-1 truncate font-body text-3xl font-black uppercase tracking-tight text-primary-container">
            Table Advisor
          </h1>
        </div>
        <div class="ml-auto flex flex-wrap items-center justify-end gap-3">
          ${renderWorkspaceOpenDropdown({
              tableName: tableName ?? '',
              destinations: [
                  {
                      icon: 'table_rows',
                      key: 'data',
                      label: 'Data',
                      target: name => `/data/${encodeURIComponent(name)}`,
                  },
                  {
                      icon: 'account_tree',
                      key: 'structure',
                      label: 'Structure',
                      target: name => `/structure/${encodeURIComponent(name)}`,
                  },
                  {
                      icon: 'table_chart',
                      key: 'table-designer',
                      label: 'Table Designer',
                      target: name => `/table-designer/${encodeURIComponent(name)}`,
                  },
                  {
                      key: 'sql-editor',
                  },
              ],
          })}
          <button class="standard-button" data-action="refresh-view" type="button">
            <span class="material-symbols-outlined text-sm">refresh</span>
            Refresh
          </button>
        </div>
      </header>
    `;
}

export function renderTableAdvisorView(state) {
    return {
        main: `
          <section class="view-surface flex h-full min-h-full min-h-0 flex-col overflow-hidden bg-surface-container">
            <div class="data-view-grid data-view-grid--with-subnavi">
              <aside class="subnavi-panel border-r border-outline-variant/10 bg-surface-low">
                <div class="subnavi-header">
                  <div>
                    <div class="subnavi-header-title">Tables</div>
                    <div class="subnavi-header-details">
                      total ${escapeHtml(formatNumber(state.tableAdvisor.tables.length))}
                    </div>
                  </div>
                </div>
                ${renderTableList(state)}
              </aside>
              <section class="flex min-h-0 flex-col overflow-hidden">
                ${renderToolbar(state)}
                <div class="custom-scrollbar min-h-0 flex-1 overflow-auto p-6">
                  ${renderAdvisorBody(state)}
                </div>
              </section>
            </div>
          </section>
        `,
        panel: '',
    };
}
