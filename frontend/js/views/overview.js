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
    <section class="shell-section">
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
      ${
        overview.file?.path
          ? `
            <div class="border-t border-outline-variant/10 px-4 py-3">
              <button
                class="toolbar-button border border-outline-variant/20 bg-surface-container px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface transition-colors hover:border-primary-container hover:text-primary-container"
                data-action="open-overview-in-finder"
                type="button"
              >
                Open In Finder
              </button>
            </div>
          `
          : ""
      }
    </section>
  `;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return Number(count) === 1 ? singular : plural;
}

function getSchemaMapNarrative(preview) {
  const relationshipCount = Number(preview.relationshipCount ?? 0);
  const fkClusters = Number(preview.fkClusters ?? 0);
  const isolatedTables = Number(preview.isolatedTables ?? 0);
  const connectedTables = Math.max(0, Number(preview.tableCount ?? 0) - isolatedTables);

  if (relationshipCount === 0 || fkClusters === 0) {
    return {
      title: "Mostly standalone schema",
      body:
        "There are no meaningful foreign-key groups yet. The Structure view will read more like a list of isolated tables than a connected graph.",
    };
  }

  if (isolatedTables === 0) {
    return {
      title: "Connected schema",
      body: `Foreign keys tie the whole schema together in ${formatNumber(
        fkClusters
      )} ${pluralize(fkClusters, "cluster")}. Structure is useful here because dependencies and joins are visible at a glance.`,
    };
  }

  return {
    title: "One connected core, several islands",
    body: `${formatNumber(connectedTables)} ${pluralize(
      connectedTables,
      "table"
    )} are connected through foreign keys, while ${formatNumber(
      isolatedTables
    )} ${pluralize(
      isolatedTables,
      "table"
    )} stand alone. Structure helps most when you want to inspect the connected core and ignore the isolated tables.`,
  };
}

function renderSchemaMapPreview(overview) {
  const preview = overview.schemaMap ?? {
    tableCount: overview.counts?.tables ?? 0,
    indexCount: overview.counts?.indexes ?? 0,
    relationshipCount: 0,
    fkClusters: 0,
    isolatedTables: 0,
  };
  const narrative = getSchemaMapNarrative(preview);
  const stats = [
    { label: "FK Links", value: formatNumber(preview.relationshipCount) },
    { label: "FK Clusters", value: formatNumber(preview.fkClusters) },
    { label: "Isolated Tables", value: formatNumber(preview.isolatedTables) },
  ];

  return `
    <section class="shell-section overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(45,250,255,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(252,227,0,0.12),transparent_42%),linear-gradient(135deg,#1b1b19,#101111)]">
      <div class="flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-highest/60 px-4 py-2">
        <span class="text-[10px] font-bold uppercase tracking-[0.25em]">Schema Map</span>
        <span class="material-symbols-outlined text-xs text-on-surface-variant">account_tree</span>
      </div>
      <div class="space-y-5 p-4">
        <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div class="font-headline text-xl font-black uppercase tracking-tight text-primary-container">
              ${escapeHtml(narrative.title)}
            </div>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant/70">
              ${escapeHtml(narrative.body)}
            </p>
          </div>
          <div class="flex justify-start xl:justify-end">
            <button
              class="toolbar-button border border-outline-variant/20 bg-surface-container px-4 py-2 text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface transition-colors hover:border-primary-container hover:text-primary-container"
              data-action="navigate"
              data-to="/structure"
              type="button"
            >
              <span class="material-symbols-outlined text-sm">account_tree</span>
              Open Structure
            </button>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          ${stats
            .map(
              (stat) => `
                <div class="border border-outline-variant/10 bg-surface-container-lowest/70 px-3 py-3">
                  <div class="text-[9px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
                    ${escapeHtml(stat.label)}
                  </div>
                  <div class="mt-2 font-headline text-2xl font-black uppercase tracking-tight text-on-surface">
                    ${escapeHtml(stat.value)}
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="border border-outline-variant/10 bg-surface-container-lowest/70 px-4 py-4">
          <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-primary-container/70">
            Why It Helps
          </div>
          <div class="mt-3 grid gap-3 md:grid-cols-3">
            <div class="border border-outline-variant/10 bg-surface-container px-3 py-3">
              <div class="text-[9px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
                FK Links
              </div>
              <div class="mt-2 text-sm leading-6 text-on-surface-variant/70">
                Shows how many actual relationships exist between tables.
              </div>
            </div>
            <div class="border border-outline-variant/10 bg-surface-container px-3 py-3">
              <div class="text-[9px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
                FK Clusters
              </div>
              <div class="mt-2 text-sm leading-6 text-on-surface-variant/70">
                Tells you whether the schema is one connected area or split into separate groups.
              </div>
            </div>
            <div class="border border-outline-variant/10 bg-surface-container px-3 py-3">
              <div class="text-[9px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
                Isolated Tables
              </div>
              <div class="mt-2 text-sm leading-6 text-on-surface-variant/70">
                Highlights how many tables have no FK links and can usually be ignored during relationship analysis.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderIntegrityCard(overview, readOnly) {
  return `
    <section class="shell-section relative overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(252,227,0,0.14),transparent_30%),linear-gradient(135deg,#1c1b1b,#0e0e0e)]">
      <div class="flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-highest/60 px-4 py-2">
        <span class="text-[10px] font-bold uppercase tracking-[0.25em]">Integrity Status</span>
        <span class="material-symbols-outlined text-xs text-on-surface-variant">security</span>
      </div>
      <div class="pointer-events-none absolute inset-x-0 bottom-0 top-10 bg-[linear-gradient(to_top,rgba(32,31,31,0.95),rgba(32,31,31,0.2))]"></div>
      <div class="relative flex min-h-[220px] flex-col justify-end p-6">
        <div class="mb-6 flex h-16 w-16 items-center justify-center border border-primary-container/20 bg-primary-container/10">
          <span class="material-symbols-outlined text-4xl text-primary-container">security</span>
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
                        <div class="space-y-6 xl:col-span-2">
                          ${renderTopTables(overview)}
                          ${renderSchemaMapPreview(overview)}
                        </div>
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
