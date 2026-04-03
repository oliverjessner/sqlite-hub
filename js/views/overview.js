import { renderMetricCard } from "../components/metricCard.js";
import { renderPageHeader } from "../components/pageHeader.js";
import { renderStatusBadge } from "../components/badges.js";
import { escapeHtml, formatBytes, formatDateTime, formatNumber } from "../utils/format.js";

function renderMissingDatabase() {
  return `
    <div class="border border-dashed border-outline-variant/20 bg-surface-container-low px-8 py-12 text-center">
      <span class="material-symbols-outlined mb-3 text-5xl text-on-surface-variant/25">database_off</span>
      <p class="font-headline text-xl font-black uppercase tracking-tight text-primary-container">
        No Active SQLite Database
      </p>
      <p class="mx-auto mt-3 max-w-xl text-sm leading-7 text-on-surface-variant/65">
        Open a local SQLite file to load real overview metrics, object counts, and storage details.
      </p>
    </div>
  `;
}

function renderOverviewMetrics(overview) {
  const estimatedSizeBytes =
    overview.estimatedSizeBytes || overview.file?.sizeBytes || 0;

  const metrics = [
    {
      label: "Database Size",
      value: formatBytes(overview.file?.sizeBytes ?? estimatedSizeBytes),
      subtext: `Estimated pages: ${formatNumber(overview.sqlite?.pageCount ?? 0)}`,
      accent: true,
    },
    {
      label: "Tables",
      value: formatNumber(overview.counts?.tables ?? 0),
      subtext: `${formatNumber(overview.counts?.views ?? 0)} views`,
    },
    {
      label: "Indexes",
      value: formatNumber(overview.counts?.indexes ?? 0),
      subtext: `${formatNumber(overview.counts?.triggers ?? 0)} triggers`,
    },
    {
      label: "Journal Mode",
      value: String(overview.sqlite?.journalMode ?? "n/a").toUpperCase(),
      subtext: overview.sqlite?.foreignKeys ? "FK enabled" : "FK disabled",
    },
  ];

  return `
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      ${metrics.map((metric) => renderMetricCard(metric)).join("")}
    </div>
  `;
}

function renderTopTables(overview) {
  const sizeMap = new Map(
    (overview.topTablesByEstimatedSize ?? []).map((entry) => [entry.name, entry.sizeBytes])
  );

  return `
    <section class="shell-section xl:col-span-2">
      <div class="flex items-center justify-between bg-surface-container-highest px-4 py-2">
        <span class="text-[10px] font-bold uppercase tracking-[0.25em]">Top Tables</span>
        <span class="material-symbols-outlined text-xs text-on-surface-variant">table_rows</span>
      </div>
      <div class="custom-scrollbar overflow-auto">
        <table class="w-full text-left font-mono text-xs">
          <thead>
            <tr class="border-b border-outline-variant/10 text-on-surface/40">
              <th class="p-4 font-normal">TABLE_NAME</th>
              <th class="p-4 font-normal">ROWS</th>
              <th class="p-4 font-normal">INDEXES</th>
              <th class="p-4 font-normal">ESTIMATED_SIZE</th>
            </tr>
          </thead>
          <tbody>
            ${(overview.topTablesByRowCount ?? [])
              .map(
                (table, index) => `
                  <tr
                    class="${
                      index % 2 === 0 ? "bg-surface-container" : "bg-surface-container-lowest/30"
                    } border-b border-outline-variant/5"
                  >
                    <td class="p-4 text-primary-container">${escapeHtml(table.name)}</td>
                    <td class="p-4">${escapeHtml(formatNumber(table.rowCount ?? 0))}</td>
                    <td class="p-4">${escapeHtml(formatNumber(table.indexCount ?? 0))}</td>
                    <td class="p-4">${escapeHtml(
                      sizeMap.has(table.name) ? formatBytes(sizeMap.get(table.name)) : "n/a"
                    )}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderOperationalSurface(overview) {
  const lines = [
    `PATH: ${overview.file?.path ?? "n/a"}`,
    `LAST_MODIFIED: ${formatDateTime(overview.file?.lastModifiedAt)}`,
    `SQLITE_VERSION: ${overview.sqlite?.version ?? "n/a"}`,
    `PAGE_SIZE: ${formatNumber(overview.sqlite?.pageSize ?? 0)} bytes`,
    `FREELIST_COUNT: ${formatNumber(overview.sqlite?.freelistCount ?? 0)}`,
    `ENCODING: ${overview.sqlite?.encoding ?? "n/a"}`,
  ];

  return `
    <section class="shell-section overflow-hidden">
      <div class="flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-highest px-4 py-2">
        <span class="text-[10px] font-bold uppercase tracking-[0.25em]">Storage Telemetry</span>
        <span class="text-[8px] text-primary-container">LIVE</span>
      </div>
      <div class="custom-scrollbar h-56 space-y-2 overflow-y-auto p-4 font-mono text-[10px] leading-relaxed">
        ${lines
          .map(
            (line) => `
              <div class="text-on-surface/40">
                <span class="text-[#00dce1]">INFO:</span> ${escapeHtml(line)}
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderIntegrityCard(overview, readOnly) {
  return `
    <section class="relative overflow-hidden border border-outline-variant/10 bg-[radial-gradient(circle_at_top_right,rgba(252,227,0,0.14),transparent_30%),linear-gradient(135deg,#1c1b1b,#0e0e0e)]">
      <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(32,31,31,0.95),rgba(32,31,31,0.2))]"></div>
      <div class="relative flex min-h-[220px] flex-col justify-end p-6">
        <div class="mb-6 flex h-16 w-16 items-center justify-center border border-primary-container/20 bg-primary-container/10">
          <span class="material-symbols-outlined text-4xl text-primary-container">security</span>
        </div>
        <div class="text-[10px] font-black uppercase tracking-[0.25em] text-primary-container">
          INTEGRITY_STATUS
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          ${renderStatusBadge(overview.sqlite?.integrityCheck ?? "unknown", "success")}
          ${renderStatusBadge(
            readOnly ? "READ_ONLY" : "READ_WRITE",
            readOnly ? "alert" : "primary"
          )}
        </div>
        <div class="mt-3 font-mono text-xs text-on-surface">
          QUICK_CHECK: ${escapeHtml(String(overview.sqlite?.quickCheck ?? "n/a"))}
        </div>
        <div class="mt-2 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/60">
          USER_VERSION ${escapeHtml(String(overview.sqlite?.userVersion ?? 0))} //
          SCHEMA_VERSION ${escapeHtml(String(overview.sqlite?.schemaVersion ?? 0))}
        </div>
      </div>
    </section>
  `;
}

export function renderOverviewView(state) {
  const overview = state.overview.data;
  const readOnly = state.connections.active?.readOnly;

  return {
    main: `
      <section class="view-surface min-h-full bg-surface-container">
        <div class="view-frame mx-auto max-w-7xl space-y-8">
          ${renderPageHeader({
            title: "DATABASE_OVERVIEW",
            subtitle: overview
              ? `System Registry: ${overview.connection?.label ?? "ACTIVE_SQLITE_DB"}`
              : "System Registry: NO_ACTIVE_DATABASE",
            actions: `
              <button
                class="toolbar-button toolbar-button--primary bg-primary-container px-4 py-2 font-headline text-xs font-bold uppercase tracking-widest text-on-primary clipped-corner"
                data-action="navigate"
                data-to="/editor"
                style="--clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);"
                type="button"
              >
                <span class="material-symbols-outlined text-sm">terminal</span>
                Run Query
              </button>
            `,
          })}

          ${
            state.overview.loading && !overview
              ? `
                <div class="flex min-h-[280px] items-center justify-center border border-outline-variant/10 bg-surface-container-low">
                  <div class="text-center text-on-surface-variant/40">
                    <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
                    <p class="font-mono text-[10px] uppercase tracking-[0.22em]">LOADING_OVERVIEW</p>
                  </div>
                </div>
              `
              : state.overview.error
                ? renderMissingDatabase()
                : overview
                  ? `
                      ${renderOverviewMetrics(overview)}
                      <div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
                        ${renderTopTables(overview)}
                        <div class="space-y-6">
                          ${renderOperationalSurface(overview)}
                          ${renderIntegrityCard(overview, readOnly)}
                        </div>
                      </div>
                    `
                  : renderMissingDatabase()
          }
        </div>
      </section>
    `,
    panel: "",
  };
}
