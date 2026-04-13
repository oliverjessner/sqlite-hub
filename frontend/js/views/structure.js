import { clearInspector, renderDdlSection, renderInspector } from "../components/structureGraph.js";
import { escapeHtml, formatNumber } from "../utils/format.js";

function renderEntryGroup(title, entries, activeName, options = {}) {
  const { compact = false, showMeta = true } = options;

  return `
    <section class="structure-sidebar__section">
      <div class="mb-4 shrink-0 text-[10px] font-bold uppercase tracking-[0.25em] text-primary-container">
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

      ${renderDdlSection(detail.ddl)}
    </div>
  `;
}

function renderGraphSurface(structure, selectedName, detail, detailLoading, tablesVisible = true) {
  const graph = structure?.graph ?? { tables: [], relationshipCount: 0 };
  const selectedGraphTable =
    graph.tables?.find((table) => table.name === selectedName && table.type === "table") ?? null;
  const toolbarButtonClass =
    "toolbar-button structure-graph__button border border-outline-variant/20 bg-surface-container px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface transition-colors hover:border-primary-container hover:text-primary-container";
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
          <button
            class="${toolbarButtonClass}"
            data-action="toggle-structure-tables"
            type="button"
          >
            <span class="material-symbols-outlined text-sm">${
              tablesVisible ? "visibility_off" : "visibility"
            }</span>
            ${tablesVisible ? "Hide Tables" : "Show Tables"}
          </button>
        </div>
        <div class="structure-graph__toolbar-actions">
          <button
            class="${toolbarButtonClass}"
            data-structure-graph-action="fit"
            type="button"
          >
            <span class="material-symbols-outlined text-sm">fit_screen</span>
            Fit Graph
          </button>
          <button
            class="${toolbarButtonClass}"
            data-structure-graph-action="relayout"
            type="button"
          >
            <span class="material-symbols-outlined text-sm">device_hub</span>
            Recalculate Layout
          </button>
          <button
            class="${toolbarButtonClass}"
            data-structure-graph-action="clear"
            type="button"
          >
            <span class="material-symbols-outlined text-sm">close</span>
            Clear Selection
          </button>
          <button
            class="${toolbarButtonClass} is-disabled disabled:cursor-default disabled:opacity-30"
            data-structure-graph-action="open-data"
            disabled
            type="button"
          >
            <span class="material-symbols-outlined text-sm">table_rows</span>
            Open Data
          </button>
          <button
            class="${toolbarButtonClass}"
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

function renderStructureWorkspaceHeader(structure, selectedName) {
  const tableCount = structure?.grouped?.tables?.length ?? 0;
  const viewCount = structure?.grouped?.views?.length ?? 0;

  return `
    <header class="structure-view__header">
      <div class="structure-headline-container">
        <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">
          Schema Graph
        </div>
        <h1 class="mt-2 font-headline text-4xl font-black uppercase tracking-tight text-primary-container">
          Structure
        </h1>
        <div class="mt-2 text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
          ${
            selectedName
              ? `selected ${escapeHtml(selectedName)} // tables ${escapeHtml(formatNumber(tableCount))} // views ${escapeHtml(formatNumber(viewCount))}`
              : `tables ${escapeHtml(formatNumber(tableCount))} // views ${escapeHtml(formatNumber(viewCount))}`
          }
        </div>
      </div>
    </header>
  `;
}

export function renderStructureView(state) {
  const structure = state.structure.data;
  const detail =
    state.structure.detail?.name === state.structure.selectedName ? state.structure.detail : null;
  const tablesVisible = state.structure.tablesVisible !== false;

  return {
    main: `
      <section class="view-surface structure-view">
        ${
          tablesVisible
            ? `
              <aside class="structure-view__sidebar">
                <div class="structure-view__sidebar-header">
                  <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">
                    Objects
                  </div>
                  <div class="mt-2 text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
                    total ${escapeHtml(
                      formatNumber(
                        (structure?.grouped?.tables?.length ?? 0) +
                          (structure?.grouped?.views?.length ?? 0) +
                          (structure?.grouped?.indexes?.length ?? 0) +
                          (structure?.grouped?.triggers?.length ?? 0)
                      )
                    )}
                  </div>
                </div>
                <div class="structure-view__sidebar-body custom-scrollbar">
                  ${
                    structure
                      ? `
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
                        `
                      : ""
                  }
                </div>
              </aside>
            `
            : ""
        }

        <section class="structure-view__detail">
          ${renderStructureWorkspaceHeader(structure, state.structure.selectedName)}
          ${
            state.structure.loading && !structure
              ? `
                <div class="flex min-h-0 flex-1 items-center justify-center border-t border-outline-variant/10 bg-surface-container-low">
                  <div class="text-center text-on-surface-variant/40">
                    <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
                    <p class="font-mono text-[10px] uppercase tracking-[0.22em]">LOADING_STRUCTURE</p>
                  </div>
                </div>
              `
              : state.structure.error
                ? `
                    <div class="min-h-0 flex-1 border-t border-error/20 bg-error-container/10 px-6 py-5 text-sm text-on-surface">
                      <div class="font-headline text-xs font-bold uppercase tracking-[0.18em] text-error">
                        ${escapeHtml(state.structure.error.code)}
                      </div>
                      <div class="mt-2">${escapeHtml(state.structure.error.message)}</div>
                    </div>
                  `
                : structure
                  ? `
                      <div class="structure-view__graph-shell">
                        ${renderGraphSurface(
                          structure,
                          state.structure.selectedName,
                          detail,
                          state.structure.detailLoading,
                          tablesVisible
                        )}
                      </div>
                    `
                  : ""
          }
        </section>
      </section>
    `,
    panel: "",
  };
}
