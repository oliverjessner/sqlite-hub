import { renderPageHeader } from "../components/pageHeader.js";
import { clearInspector, renderInspector } from "../components/structureGraph.js";
import { escapeHtml, formatNumber } from "../utils/format.js";

function renderEntryGroup(title, entries, activeName, options = {}) {
  const { compact = false, showMeta = true } = options;

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
                        class="w-full border px-3 ${compact ? "py-2.5" : "py-3"} text-left transition-colors ${
                          entry.name === activeName
                            ? "border-primary-container/30 bg-surface-container-high"
                            : "border-outline-variant/10 bg-surface-container-lowest hover:bg-surface-container-high"
                        }"
                        data-action="select-structure-entry"
                        data-entry-name="${escapeHtml(entry.name)}"
                        ${
                          entry.type === "table"
                            ? `data-structure-entry-name="${escapeHtml(entry.name)}"`
                            : ""
                        }
                        type="button"
                      >
                        <div class="font-mono text-xs ${
                          entry.name === activeName
                            ? "text-primary-container"
                            : "text-on-surface"
                        }">
                          ${escapeHtml(entry.name)}
                        </div>
                        ${
                          showMeta
                            ? `
                                <div class="mt-1 text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/45">
                                  ${escapeHtml(entry.tableName || entry.type)}
                                </div>
                              `
                            : ""
                        }
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

function renderLoadingInspector() {
  return `
    <div class="structure-graph__panel is-empty">
      <span class="material-symbols-outlined structure-graph__empty-icon">progress_activity</span>
      <div class="structure-graph__title">Loading</div>
      <p class="text-sm leading-7 text-on-surface-variant/55">
        Loading structure metadata for the selected object.
      </p>
    </div>
  `;
}

function renderObjectInspector(detail) {
  if (!detail) {
    return clearInspector();
  }

  const visibleColumns = (detail.columns ?? []).filter((column) => column.visible !== false);
  const foreignKeyLinks = (detail.foreignKeys ?? []).reduce(
    (count, foreignKey) => count + (foreignKey.mappings?.length ?? 0),
    0
  );

  return `
    <div class="structure-graph__panel">
      <div class="space-y-3">
        <div class="structure-graph__eyebrow">Object Inspector</div>
        <div class="structure-graph__title">${escapeHtml(detail.name)}</div>
        <div class="flex flex-wrap items-center gap-3">
          <div class="structure-graph__subtitle">${escapeHtml(detail.type ?? "object")}</div>
          ${
            detail.tableName
              ? `
                  <div class="structure-graph__subtitle">
                    TABLE ${escapeHtml(detail.tableName)}
                  </div>
                `
              : ""
          }
        </div>
      </div>

      <div class="structure-graph__summary">
        <div class="structure-graph__summary-card">
          <div class="structure-graph__summary-label">Columns</div>
          <div class="structure-graph__summary-value">${escapeHtml(
            formatNumber(visibleColumns.length)
          )}</div>
        </div>
        <div class="structure-graph__summary-card">
          <div class="structure-graph__summary-label">FK Links</div>
          <div class="structure-graph__summary-value">${escapeHtml(
            formatNumber(foreignKeyLinks)
          )}</div>
        </div>
        <div class="structure-graph__summary-card">
          <div class="structure-graph__summary-label">Indexes</div>
          <div class="structure-graph__summary-value">${escapeHtml(
            formatNumber(detail.indexes?.length ?? 0)
          )}</div>
        </div>
        <div class="structure-graph__summary-card">
          <div class="structure-graph__summary-label">Triggers</div>
          <div class="structure-graph__summary-value">${escapeHtml(
            formatNumber(detail.triggers?.length ?? 0)
          )}</div>
        </div>
      </div>

      ${
        visibleColumns.length
          ? `
              <section class="structure-graph__section">
                <div class="structure-graph__section-title">Columns</div>
                <div class="structure-graph__column-list">
                  ${visibleColumns
                    .map(
                      (column) => `
                        <div class="structure-graph__column-row">
                          <div class="min-w-0 space-y-1">
                            <div class="structure-graph__column-name">${escapeHtml(
                              column.name
                            )}</div>
                            <div class="structure-graph__column-type">${escapeHtml(
                              column.declaredType || column.affinity || "BLOB"
                            )}</div>
                          </div>
                          <div class="structure-graph__column-flags">
                            ${
                              column.primaryKeyPosition > 0
                                ? `<span class="structure-graph__flag is-key">PK${
                                    column.primaryKeyPosition > 1
                                      ? ` ${escapeHtml(String(column.primaryKeyPosition))}`
                                      : ""
                                  }</span>`
                                : ""
                            }
                            <span class="structure-graph__flag is-nullable">${
                              column.notNull ? "NOT NULL" : "NULLABLE"
                            }</span>
                          </div>
                        </div>
                      `
                    )
                    .join("")}
                </div>
              </section>
            `
          : ""
      }

      <section class="structure-graph__section">
        <div class="structure-graph__section-title">DDL</div>
        <pre class="structure-graph__ddl custom-scrollbar">${escapeHtml(
          detail.ddl || "No DDL available."
        )}</pre>
      </section>
    </div>
  `;
}

function renderGraphSurface(structure, selectedName, detail, detailLoading) {
  const graph = structure?.graph ?? { tables: [], relationshipCount: 0 };
  const selectedGraphTable =
    graph.tables?.find((table) => table.name === selectedName && table.type === "table") ?? null;
  const inspectorMarkup = selectedGraphTable
    ? renderInspector(selectedGraphTable)
    : detailLoading
      ? renderLoadingInspector()
      : detail
        ? renderObjectInspector(detail)
        : clearInspector();

  return `
    <section class="structure-graph" data-structure-graph-root>
      <div class="structure-graph__toolbar">
        <div class="structure-graph__toolbar-main">
          <label class="structure-graph__search" data-structure-graph-search>
            <span class="material-symbols-outlined structure-graph__search-icon">search</span>
            <input
              class="structure-graph__search-input"
              data-structure-graph-search-input
              placeholder="Find table"
              spellcheck="false"
              type="search"
            />
          </label>
          <div class="structure-graph__toolbar-meta">
            ${escapeHtml(formatNumber(graph.tables?.length ?? 0))} TABLES //
            ${escapeHtml(formatNumber(graph.relationshipCount ?? 0))} RELATIONSHIPS
          </div>
        </div>
        <div class="structure-graph__toolbar-actions">
          <button
            class="structure-graph__button"
            data-structure-graph-action="fit"
            type="button"
          >
            <span class="material-symbols-outlined text-sm">fit_screen</span>
            Fit Graph
          </button>
          <button
            class="structure-graph__button"
            data-structure-graph-action="relayout"
            type="button"
          >
            <span class="material-symbols-outlined text-sm">device_hub</span>
            Recalculate Layout
          </button>
          <button
            class="structure-graph__button"
            data-structure-graph-action="clear"
            type="button"
          >
            <span class="material-symbols-outlined text-sm">close</span>
            Clear Selection
          </button>
          <button
            class="structure-graph__button is-disabled"
            data-structure-graph-action="open-data"
            disabled
            type="button"
          >
            <span class="material-symbols-outlined text-sm">table_rows</span>
            Open Data
          </button>
          <button
            class="structure-graph__button"
            data-structure-graph-action="toggle-inspector"
            type="button"
          >
            <span class="material-symbols-outlined text-sm">right_panel_close</span>
            Hide Inspector
          </button>
        </div>
      </div>

      <div class="structure-graph__workspace">
        <div class="structure-graph__canvas-shell">
          <div class="structure-graph__canvas" data-structure-graph-canvas></div>
          <div
            class="structure-graph__empty"
            data-structure-graph-empty
            ${graph.tables?.length ? "hidden" : ""}
          >
            <span class="material-symbols-outlined structure-graph__empty-icon">account_tree</span>
            <div class="structure-graph__title">No Tables</div>
            <p class="text-sm leading-7 text-on-surface-variant/55">
              The active database does not expose table metadata for the schema graph.
            </p>
          </div>
        </div>

        <aside
          class="structure-graph__inspector custom-scrollbar"
          data-structure-graph-inspector
        >
          ${inspectorMarkup}
        </aside>
      </div>
    </section>
  `;
}

export function renderStructureView(state) {
  const structure = state.structure.data;
  const detail =
    state.structure.detail?.name === state.structure.selectedName ? state.structure.detail : null;

  return {
    main: `
      <section class="view-surface min-h-full bg-surface-container">
        <div class="view-frame space-y-8">
          ${renderPageHeader({
            title: "Structure",
            subtitle: "Schema graph, foreign-key paths, raw DDL, and object metadata",
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
                      <section class="grid grid-cols-1 gap-6 xl:grid-cols-[18.5rem_minmax(0,1fr)] 2xl:grid-cols-[19.5rem_minmax(0,1fr)]">
                        <div class="space-y-6">
                          ${renderEntryGroup(
                            "Tables",
                            structure.grouped.tables,
                            state.structure.selectedName,
                            { compact: true, showMeta: false }
                          )}
                          ${renderEntryGroup(
                            "Views",
                            structure.grouped.views,
                            state.structure.selectedName
                          )}
                          ${renderEntryGroup(
                            "Indexes",
                            structure.grouped.indexes,
                            state.structure.selectedName,
                            { compact: true, showMeta: false }
                          )}
                          ${renderEntryGroup(
                            "Triggers",
                            structure.grouped.triggers,
                            state.structure.selectedName
                          )}
                        </div>
                        ${renderGraphSurface(
                          structure,
                          state.structure.selectedName,
                          detail,
                          state.structure.detailLoading
                        )}
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
