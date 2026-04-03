import { renderMetricCard } from "../components/metricCard.js";
import { renderPageHeader } from "../components/pageHeader.js";
import { getCurrentStructureEntryDetail } from "../store.js";
import { escapeHtml, formatNumber } from "../utils/format.js";

function renderEntryGroup(title, entries, activeName) {
  return `
    <section class="shell-section p-5">
      <div class="mb-4 text-[10px] font-bold uppercase tracking-[0.25em] text-primary-container">
        ${escapeHtml(title)}
      </div>
      ${
        entries.length
          ? `
              <div class="space-y-2">
                ${entries
                  .map(
                    (entry) => `
                      <button
                        class="w-full border px-3 py-3 text-left transition-colors ${
                          entry.name === activeName
                            ? "border-primary-container/30 bg-surface-container-high"
                            : "border-outline-variant/10 bg-surface-container-lowest hover:bg-surface-container-high"
                        }"
                        data-action="select-structure-entry"
                        data-entry-name="${escapeHtml(entry.name)}"
                        type="button"
                      >
                        <div class="font-mono text-xs ${
                          entry.name === activeName
                            ? "text-primary-container"
                            : "text-on-surface"
                        }">
                          ${escapeHtml(entry.name)}
                        </div>
                        <div class="mt-1 text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/45">
                          ${escapeHtml(entry.tableName || entry.type)}
                        </div>
                      </button>
                    `
                  )
                  .join("")}
              </div>
            `
          : `<div class="text-sm text-on-surface-variant/45">No ${escapeHtml(
              title.toLowerCase()
            )} found.</div>`
      }
    </section>
  `;
}

function renderDetail(detail) {
  if (!detail) {
    return `
      <div class="shell-section p-8">
        <p class="text-sm text-on-surface-variant/55">Select a structure object to inspect metadata and relational detail.</p>
      </div>
    `;
  }

  return `
    <section class="shell-section p-8">
      <div class="mb-6 flex items-center justify-between border-b border-outline-variant/10 pb-4">
        <div>
          <h2 class="font-headline text-2xl font-black uppercase tracking-tight text-primary-container">
            ${escapeHtml(detail.name)}
          </h2>
          <p class="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/50">
            ${escapeHtml(detail.type ?? "table")}
          </p>
        </div>
        <div class="flex items-center gap-3">
          ${
            detail.type === "table"
              ? `
                  <button
                    class="border border-outline-variant/20 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface hover:bg-surface-container-highest"
                    data-action="navigate"
                    data-to="/data/${encodeURIComponent(detail.name)}"
                    type="button"
                  >
                    Open Data
                  </button>
                `
              : ""
          }
          <div class="flex h-12 w-12 items-center justify-center bg-primary-container/10">
            <span class="material-symbols-outlined text-2xl text-primary-container">account_tree</span>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div class="space-y-6">
          <div class="bg-surface-container-lowest p-4">
            <div class="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">Columns</div>
            ${
              detail.columns?.length
                ? `
                    <div class="space-y-2 font-mono text-[11px] text-on-surface/65">
                      ${detail.columns
                        .map(
                          (column) => `
                            <div class="flex justify-between gap-3">
                              <span>${escapeHtml(column.name)}</span>
                              <span class="text-primary-container">${escapeHtml(
                                column.declaredType || column.affinity
                              )}</span>
                            </div>
                          `
                        )
                        .join("")}
                    </div>
                  `
                : '<div class="text-sm text-on-surface-variant/45">No column metadata for this object.</div>'
            }
          </div>
          <div class="bg-surface-container-lowest p-4">
            <div class="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">Relational Detail</div>
            <div class="space-y-2 font-mono text-[11px] text-on-surface/65">
              <div class="flex justify-between">
                <span>Foreign Keys</span>
                <span class="text-primary-container">${escapeHtml(
                  formatNumber(detail.foreignKeys?.length ?? 0)
                )}</span>
              </div>
              <div class="flex justify-between">
                <span>Indexes</span>
                <span class="text-primary-container">${escapeHtml(
                  formatNumber(detail.indexes?.length ?? 0)
                )}</span>
              </div>
              <div class="flex justify-between">
                <span>Triggers</span>
                <span class="text-primary-container">${escapeHtml(
                  formatNumber(detail.triggers?.length ?? 0)
                )}</span>
              </div>
              <div class="flex justify-between">
                <span>Identity</span>
                <span class="text-primary-container">${escapeHtml(
                  detail.identityStrategy?.type ?? "n/a"
                )}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="bg-surface-container-lowest p-4">
          <div class="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">DDL</div>
          <pre class="custom-scrollbar max-h-[520px] overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-6 text-on-surface-variant/75">${escapeHtml(
            detail.ddl || "No DDL available."
          )}</pre>
        </div>
      </div>
    </section>
  `;
}

export function renderStructureView(state) {
  const structure = state.structure.data;
  const detail = getCurrentStructureEntryDetail(state);
  const counts = structure
    ? [
        { label: "Tables", value: formatNumber(structure.grouped.tables.length) },
        { label: "Views", value: formatNumber(structure.grouped.views.length) },
        { label: "Indexes", value: formatNumber(structure.grouped.indexes.length) },
        {
          label: "Triggers",
          value: formatNumber(structure.grouped.triggers.length),
          accent: true,
        },
      ]
    : [];

  return {
    main: `
      <section class="view-surface min-h-full bg-surface-container">
        <div class="view-frame mx-auto max-w-7xl space-y-8">
          ${renderPageHeader({
            eyebrow: "Structure // sqlite_master + PRAGMA",
            title: "Structure",
            subtitle: "Raw DDL, table identity, foreign keys, and index metadata",
          })}

          ${
            state.structure.loading && !structure
              ? `
                <div class="flex min-h-[280px] items-center justify-center border border-outline-variant/10 bg-surface-container-low">
                  <div class="text-center text-on-surface-variant/40">
                    <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
                    <p class="font-mono text-[10px] uppercase tracking-[0.22em]">LOADING_STRUCTURE</p>
                  </div>
                </div>
              `
              : state.structure.error
                ? `
                    <div class="border border-error/20 bg-error-container/10 px-6 py-5 text-sm text-on-surface">
                      <div class="font-headline text-xs font-bold uppercase tracking-[0.18em] text-error">
                        ${escapeHtml(state.structure.error.code)}
                      </div>
                      <div class="mt-2">${escapeHtml(state.structure.error.message)}</div>
                    </div>
                  `
                : structure
                  ? `
                      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        ${counts.map((metric) => renderMetricCard(metric)).join("")}
                      </div>
                      <section class="grid grid-cols-1 gap-6 xl:grid-cols-[0.45fr_1.55fr]">
                        <div class="space-y-6">
                          ${renderEntryGroup(
                            "Tables",
                            structure.grouped.tables,
                            state.structure.selectedName
                          )}
                          ${renderEntryGroup(
                            "Views",
                            structure.grouped.views,
                            state.structure.selectedName
                          )}
                          ${renderEntryGroup(
                            "Indexes",
                            structure.grouped.indexes,
                            state.structure.selectedName
                          )}
                          ${renderEntryGroup(
                            "Triggers",
                            structure.grouped.triggers,
                            state.structure.selectedName
                          )}
                        </div>
                        ${renderDetail(detail)}
                      </section>
                    `
                  : ""
          }
        </div>
      </section>
    `,
    panel: "",
  };
}
