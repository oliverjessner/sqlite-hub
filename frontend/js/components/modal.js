import { escapeHtml, formatNumber, highlightSql, truncateMiddle } from "../utils/format.js";
import {
  buildCopyColumnText,
  buildCopyColumnPreviewText,
  getCopyColumnActionLabel,
  getCopyColumnExportMetadata,
  isMarkdownTodoCopyColumnMode,
} from "../utils/copyColumnExport.js";
import { renderConnectionLogo } from "./connectionLogo.js";
import {
  analyzeQueryChartResult,
  getQueryChartTypeLabel,
  QUERY_CHART_TYPES,
} from "../lib/queryCharts.js";
import {
  hasDefaultMediaTaggingTagTable,
  hasDefaultMediaTaggingMappingTable,
  MEDIA_TAGGING_DEFAULT_MAPPING_TABLE,
  MEDIA_TAGGING_DEFAULT_MAPPING_TABLE_SQL,
  MEDIA_TAGGING_DEFAULT_TAG_TABLE,
  MEDIA_TAGGING_DEFAULT_TAG_TABLE_SQL,
} from "../lib/mediaTaggingDefaults.js";

function renderField({ label, name, type = "text", placeholder = "", value = "" }) {
  return `
    <label class="block space-y-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        ${escapeHtml(label)}
      </span>
      <input
        class="control-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
        name="${escapeHtml(name)}"
        placeholder="${escapeHtml(placeholder)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value)}"
      />
    </label>
  `;
}

function renderCheckboxField({ label, name, checked = false, text }) {
  return `
    <label class="flex flex-col gap-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        ${escapeHtml(label)}
      </span>
      <span class="standard-checkbox">
        <input
          ${checked ? "checked" : ""}
          name="${escapeHtml(name)}"
          type="checkbox"
        />
        <span>${escapeHtml(text || label)}</span>
      </span>
    </label>
  `;
}

function renderSqlPreviewField(value, minHeightClass = "sql-highlight-shell--tall") {
  return `
    <div class="sql-highlight-shell ${minHeightClass}">
      <div class="query-editor-layer sql-highlight-layer">
        <div
          aria-hidden="true"
          class="query-editor-highlight sql-highlight-content"
          data-query-editor-highlight
        >${value ? highlightSql(value) : ""}</div>
        <textarea
          class="query-editor-input sql-highlight-input custom-scrollbar"
          data-sql-highlight="true"
          readonly
          spellcheck="false"
          wrap="off"
        >${escapeHtml(value)}</textarea>
      </div>
    </div>
  `;
}

function renderFileField({
  label,
  name,
  accept = "",
  helpText = "",
}) {
  return `
    <label class="block space-y-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        ${escapeHtml(label)}
      </span>
      <input
        accept="${escapeHtml(accept)}"
        class="control-input block w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface file:mr-4 file:border-0 file:bg-primary-container file:px-3 file:py-2 file:text-xs file:font-bold file:text-on-primary"
        name="${escapeHtml(name)}"
        type="file"
      />
      ${
        helpText
          ? `<p class="text-[11px] leading-5 text-on-surface-variant/60">${escapeHtml(helpText)}</p>`
          : ""
      }
    </label>
  `;
}

function renderSelectField({ label, name, value = "", options = [], bind = "" }) {
  const attributes = [
    bind ? ['data-bind="', escapeHtml(bind), '"'].join("") : "",
    name ? ['name="', escapeHtml(name), '"'].join("") : "",
  ]
    .filter(Boolean)
    .join(" ");
  const optionMarkup = options
    .map((option) =>
      [
        '<option value="',
        escapeHtml(option.value),
        '" ',
        String(option.value) === String(value) ? "selected" : "",
        ">",
        escapeHtml(option.label),
        "</option>",
      ].join("")
    )
    .join("");

  return [
    '<label class="block space-y-2">',
    '<span class="block text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">',
    escapeHtml(label),
    "</span>",
    '<select class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" ',
    attributes,
    ">",
    optionMarkup,
    "</select></label>",
  ].join("");
}

function renderError(error) {
  if (!error) {
    return "";
  }

  return `
    <div class="border border-error/20 bg-error-container/20 px-4 py-3 text-sm text-error">
      <div class="font-headline text-xs font-bold uppercase tracking-[0.18em]">${escapeHtml(
        error.code || "Request failed"
      )}</div>
      <div class="mt-1 text-on-surface">${escapeHtml(error.message)}</div>
    </div>
  `;
}

function renderOpenConnectionForm(modal) {
  return `
    <form class="space-y-5" data-form="open-connection">
      ${renderField({
        label: "SQLite File Path",
        name: "path",
        placeholder: "/absolute/path/to/database.sqlite",
      })}
      ${renderField({
        label: "Label",
        name: "label",
        placeholder: "Optional display name",
      })}
      ${renderCheckboxField({
        label: "Open read-only",
        name: "readOnly",
        text: "Open read-only",
      })}
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="standard-button"
          type="submit"
        >
          ${modal.submitting ? "Opening..." : "Open Database"}
        </button>
      </div>
    </form>
  `;
}

function renderEditConnectionForm(modal) {
  const connection = modal.connection ?? {};

  return `
    <form class="space-y-5" data-form="edit-connection">
      <input name="connectionId" type="hidden" value="${escapeHtml(connection.id ?? "")}" />
      ${renderField({
        label: "SQLite File Path",
        name: "path",
        placeholder: "/absolute/path/to/database.sqlite",
        value: connection.path ?? "",
      })}
      ${renderField({
        label: "Label",
        name: "label",
        placeholder: "Optional display name",
        value: connection.label ?? "",
      })}
      <div class="space-y-3">
        <span class="block text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Database Icon
        </span>
        <div class="flex flex-wrap items-center gap-4 border border-outline-variant/10 bg-surface-container-lowest px-4 py-4">
          ${renderConnectionLogo(connection, {
            containerClass:
              "flex h-16 w-16 items-center justify-center overflow-hidden border border-outline-variant/20 bg-surface-container-highest",
            imageClassName: "h-full w-full object-cover",
            iconClassName: "text-2xl text-primary-container",
          })}
          <div class="min-w-0 flex-1">
            ${renderFileField({
              label: "Upload image",
              name: "logoFile",
              accept: ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp",
              helpText: "Allowed formats: PNG, JPG, WEBP. The file is stored in db_logos.",
            })}
            ${
              connection.logoUrl
                ? renderCheckboxField({
                    label: "Reset icon",
                    name: "clearLogo",
                    text: "Use the default icon again",
                  })
                : ""
            }
          </div>
        </div>
      </div>
      ${renderCheckboxField({
        label: "Open read-only",
        name: "readOnly",
        checked: Boolean(connection.readOnly),
        text: "Open read-only",
      })}
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="standard-button"
          type="submit"
        >
          ${modal.submitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  `;
}

function renderCreateDatabaseForm(modal) {
  return `
    <form class="space-y-5" data-form="create-connection">
      ${renderField({
        label: "New SQLite File Path",
        name: "path",
        placeholder: "/absolute/path/to/new-database.sqlite",
      })}
      ${renderField({
        label: "Label",
        name: "label",
        placeholder: "Optional display name",
      })}
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="standard-button"
          type="submit"
        >
          ${modal.submitting ? "Creating..." : "Create Database"}
        </button>
      </div>
    </form>
  `;
}

function renderImportTargetOptions(state) {
  const recentOptions = state.connections.recent
    .map((connection) =>
      [
        '<option value="',
        escapeHtml(connection.id),
        '">',
        escapeHtml(connection.label),
        " • ",
        escapeHtml(truncateMiddle(connection.path, 42)),
        "</option>",
      ].join("")
    )
    .join("");
  const activeOption = state.connections.active
    ? '<option value="active">Use active database</option>'
    : "";
  const recentModeOption = state.connections.recent.length
    ? '<option value="recent">Use recent connection</option>'
    : "";
  const recentConnectionSelect = state.connections.recent.length
    ? [
        '<label class="block space-y-2">',
        '<span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">Recent Connection</span>',
        '<select class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" name="targetConnectionId">',
        recentOptions,
        "</select></label>",
      ].join("")
    : "";

  return [
    '<label class="block space-y-2">',
    '<span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">Import Target</span>',
    '<select class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" name="targetMode">',
    activeOption,
    recentModeOption,
    '<option value="create">Create new database from dump</option>',
    '<option value="path">Open explicit target path</option>',
    "</select></label>",
    recentConnectionSelect,
    renderField({
      label: "Target Path",
      name: "targetPath",
      placeholder: "/absolute/path/to/target.sqlite",
    }),
    renderField({
      label: "Target Label",
      name: "label",
      placeholder: "Optional display name",
    }),
  ].join("");
}

function renderImportSqlForm(modal, state) {
  return `
    <form class="space-y-5" data-form="import-sql">
      ${renderField({
        label: "SQL Dump Path",
        name: "sqlFilePath",
        placeholder: "/absolute/path/to/dump.sql",
      })}
      ${renderImportTargetOptions(state)}
      <p class="text-[11px] leading-6 text-on-surface-variant/60">
        Use an absolute filesystem path. Browsers do not expose local file paths, so SQLite Hub imports by
        explicit path instead of file upload.
      </p>
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="standard-button"
          type="submit"
        >
          ${modal.submitting ? "Importing..." : "Import SQL Dump"}
        </button>
      </div>
    </form>
  `;
}

function renderDeleteRowConfirmForm(modal) {
  const rowPreview = modal.rowPreview ?? [];
  const rowLabelMarkup = modal.rowLabel
    ? [
        '<div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">',
        escapeHtml(modal.rowLabel),
        "</div>",
      ].join("")
    : "";
  const rowPreviewMarkup = rowPreview.length
    ? [
        '<div class="grid grid-cols-1 gap-3 md:grid-cols-2">',
        rowPreview
          .map((field) =>
            [
              '<div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">',
              '<div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">',
              escapeHtml(field.label),
              "</div>",
              '<div class="mt-2 text-sm text-on-surface" title="',
              escapeHtml(field.fullValue ?? field.value ?? ""),
              '">',
              escapeHtml(field.value ?? ""),
              "</div></div>",
            ].join("")
          )
          .join(""),
        "</div>",
      ].join("")
    : "";

  return [
    '<form class="space-y-5" data-form="delete-row-confirm"><div class="space-y-3">',
    '<p class="text-sm leading-7 text-on-surface">Delete this row from <span class="font-bold text-primary-container">',
    escapeHtml(modal.tableName ?? "the current table"),
    "</span>?</p>",
    '<p class="text-sm leading-7 text-on-surface-variant/65">This action cannot be undone.</p>',
    rowLabelMarkup,
    rowPreviewMarkup,
    "</div>",
    renderError(modal.error),
    '<div class="flex items-center justify-between gap-3 pt-2">',
    '<button class="standard-button" data-action="close-modal" type="button">Cancel</button>',
    '<button class="delete-button" type="submit">',
    modal.submitting ? "Deleting..." : "Delete Row",
    "</button></div></form>",
  ].join("");
}

function renderRowUpdatePreviewForm(modal) {
  const preview = modal.preview ?? {};
  const changes = preview.changes ?? [];
  const params = preview.params ?? [];
  const warnings = preview.warnings ?? [];
  const changesMarkup = changes.length
    ? [
        '<div class="overflow-hidden border border-outline-variant/10">',
        '<table class="w-full text-left text-sm">',
        '<thead class="bg-surface-container-highest text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">',
        '<tr><th class="px-3 py-2">Column</th><th class="px-3 py-2">Old</th><th class="px-3 py-2">New</th></tr>',
        '</thead><tbody class="divide-y divide-outline-variant/10">',
        changes
          .map(
            change => `
              <tr>
                <td class="px-3 py-2 font-mono text-xs text-primary-container">${escapeHtml(change.column)}</td>
                <td class="px-3 py-2 text-on-surface-variant/70">${escapeHtml(change.oldValue)}</td>
                <td class="px-3 py-2 text-on-surface">${escapeHtml(change.newValue)}</td>
              </tr>
            `,
          )
          .join(''),
        '</tbody></table></div>',
      ].join('')
    : '<div class="border border-outline-variant/10 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant/65">No changed values were detected.</div>';
  const paramsMarkup = params.length
    ? `
        <div class="space-y-2">
          <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">Parameters</div>
          <div class="space-y-2">
            ${params
              .map(
                param => `
                  <div class="flex gap-3 border border-outline-variant/10 bg-surface-container-low px-3 py-2 text-xs">
                    <span class="font-mono text-primary-container">$${escapeHtml(param.index)}</span>
                    <span class="min-w-0 break-words text-on-surface">${escapeHtml(param.value)}</span>
                  </div>
                `,
              )
              .join('')}
          </div>
        </div>
      `
    : '';
  const warningsMarkup = warnings.length
    ? `
        <div class="space-y-2">
          ${warnings
            .map(
              warning => `
                <div class="border border-primary-container/20 bg-primary-container/10 px-4 py-3 text-sm text-on-surface">
                  ${escapeHtml(warning)}
                </div>
              `,
            )
            .join('')}
        </div>
      `
    : '';

  return `
    <form class="space-y-5" data-form="apply-row-update-preview">
      <div class="space-y-2">
        <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
          ${escapeHtml(modal.tableName ?? 'Table Row')}
        </div>
        <p class="text-sm leading-7 text-on-surface-variant/70">
          Review the SQL and changed values before applying this row update.
        </p>
      </div>
      ${warningsMarkup}
      <div class="space-y-2">
        <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">SQL Preview</div>
        ${renderSqlPreviewField(preview.sql ?? '', 'sql-highlight-shell--compact')}
      </div>
      <div class="space-y-2">
        <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">Changed Values</div>
        ${changesMarkup}
      </div>
      ${paramsMarkup}
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button class="standard-button" data-action="close-modal" type="button">Cancel</button>
        <button class="signature-button" type="submit">
          ${modal.submitting ? 'Applying...' : 'Apply Changes'}
        </button>
      </div>
    </form>
  `;
}

function renderChartColumnOptions(analysis, { allowEmpty = false, includeNumericHint = false } = {}) {
  const options = allowEmpty ? [{ value: "", label: "None" }] : [];

  return options.concat(
    (analysis?.columns ?? []).map((column) => ({
      value: column.name,
      label: `${column.name} (${column.type}${includeNumericHint && column.type === "number" ? " numeric" : ""})`,
    }))
  );
}

function renderChartEditorForm(modal, state) {
  const draft = modal.draft ?? {};
  const analysis = state.charts.result ? analyzeQueryChartResult(state.charts.result) : null;
  const chartTypeOptions = QUERY_CHART_TYPES.map((chartType) => ({
    value: chartType,
    label: getQueryChartTypeLabel(chartType),
  }));
  const columnOptions = renderChartColumnOptions(analysis);
  const optionalColumnOptions = renderChartColumnOptions(analysis, { allowEmpty: true });
  let chartSpecificFields = "";

  if (draft.chartType === "bar") {
    chartSpecificFields = `
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        ${renderSelectField({
          label: "X Column",
          value: draft.config?.x_column ?? "",
          options: columnOptions,
          bind: "query-chart-draft-config:x_column",
        })}
        ${renderSelectField({
          label: "Y Column",
          value: draft.config?.y_column ?? "",
          options: columnOptions,
          bind: "query-chart-draft-config:y_column",
        })}
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
        ${renderSelectField({
          label: "Sort By",
          value: draft.config?.sort_by ?? "y",
          options: [
            { value: "x", label: "X column" },
            { value: "y", label: "Y value" },
          ],
          bind: "query-chart-draft-config:sort_by",
        })}
        ${renderSelectField({
          label: "Sort Direction",
          value: draft.config?.sort_direction ?? "desc",
          options: [
            { value: "asc", label: "Ascending / smallest first" },
            { value: "desc", label: "Descending / largest first" },
          ],
          bind: "query-chart-draft-config:sort_direction",
        })}
        ${renderCheckboxField({
          label: "Show legend",
          name: "",
          checked: Boolean(draft.config?.show_legend),
          text: "Show legend",
        }).replace("<input", '<input data-bind="query-chart-draft-config:show_legend"')}
        ${renderCheckboxField({
          label: "Show labels",
          name: "",
          checked: Boolean(draft.config?.show_labels),
          text: "Show labels",
        }).replace("<input", '<input data-bind="query-chart-draft-config:show_labels"')}
      </div>
    `;
  } else if (draft.chartType === "line") {
    chartSpecificFields = `
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        ${renderSelectField({
          label: "X Column",
          value: draft.config?.x_column ?? "",
          options: columnOptions,
          bind: "query-chart-draft-config:x_column",
        })}
        ${renderSelectField({
          label: "Y Column",
          value: draft.config?.y_column ?? "",
          options: columnOptions,
          bind: "query-chart-draft-config:y_column",
        })}
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
        ${renderSelectField({
          label: "Sort Direction",
          value: draft.config?.sort_direction ?? "asc",
          options: [
            { value: "asc", label: "Ascending" },
            { value: "desc", label: "Descending" },
          ],
          bind: "query-chart-draft-config:sort_direction",
        })}
        ${renderCheckboxField({
          label: "Smooth line",
          name: "",
          checked: Boolean(draft.config?.smooth),
          text: "Smooth line",
        }).replace("<input", '<input data-bind="query-chart-draft-config:smooth"')}
        ${renderCheckboxField({
          label: "Show legend",
          name: "",
          checked: Boolean(draft.config?.show_legend),
          text: "Show legend",
        }).replace("<input", '<input data-bind="query-chart-draft-config:show_legend"')}
        ${renderCheckboxField({
          label: "Show labels",
          name: "",
          checked: Boolean(draft.config?.show_labels),
          text: "Show labels",
        }).replace("<input", '<input data-bind="query-chart-draft-config:show_labels"')}
      </div>
    `;
  } else if (draft.chartType === "pie") {
    chartSpecificFields = `
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        ${renderSelectField({
          label: "Label Column",
          value: draft.config?.label_column ?? "",
          options: columnOptions,
          bind: "query-chart-draft-config:label_column",
        })}
        ${renderSelectField({
          label: "Value Column",
          value: draft.config?.value_column ?? "",
          options: columnOptions,
          bind: "query-chart-draft-config:value_column",
        })}
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        ${renderCheckboxField({
          label: "Donut",
          name: "",
          checked: Boolean(draft.config?.donut),
          text: "Render as donut",
        }).replace("<input", '<input data-bind="query-chart-draft-config:donut"')}
        ${renderCheckboxField({
          label: "Show legend",
          name: "",
          checked: Boolean(draft.config?.show_legend),
          text: "Show legend",
        }).replace("<input", '<input data-bind="query-chart-draft-config:show_legend"')}
        ${renderCheckboxField({
          label: "Show labels",
          name: "",
          checked: Boolean(draft.config?.show_labels),
          text: "Show labels",
        }).replace("<input", '<input data-bind="query-chart-draft-config:show_labels"')}
      </div>
    `;
  } else if (draft.chartType === "scatter") {
    chartSpecificFields = `
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        ${renderSelectField({
          label: "X Column",
          value: draft.config?.x_column ?? "",
          options: columnOptions,
          bind: "query-chart-draft-config:x_column",
        })}
        ${renderSelectField({
          label: "Y Column",
          value: draft.config?.y_column ?? "",
          options: columnOptions,
          bind: "query-chart-draft-config:y_column",
        })}
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        ${renderSelectField({
          label: "Size Column",
          value: draft.config?.size_column ?? "",
          options: optionalColumnOptions,
          bind: "query-chart-draft-config:size_column",
        })}
        ${renderSelectField({
          label: "Series Column",
          value: draft.config?.series_column ?? "",
          options: optionalColumnOptions,
          bind: "query-chart-draft-config:series_column",
        })}
        ${renderCheckboxField({
          label: "Show legend",
          name: "",
          checked: Boolean(draft.config?.show_legend),
          text: "Show legend",
        }).replace("<input", '<input data-bind="query-chart-draft-config:show_legend"')}
      </div>
    `;
  }

  return `
    <form class="space-y-5" data-form="save-query-chart">
      ${renderField({
        label: "Chart Name",
        name: "chartName",
        value: draft.name ?? "",
      }).replace("<input", '<input data-bind="query-chart-draft:name"')}
      ${renderSelectField({
        label: "Chart Type",
        value: draft.chartType ?? "bar",
        options: chartTypeOptions,
        bind: "query-chart-draft:chartType",
      })}
      ${chartSpecificFields}
      ${
        analysis
          ? `
            <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-4">
              <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
                Result Columns
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                ${analysis.columns
                  .map(
                    (column) => `
                      <span class="border border-outline-variant/15 bg-surface-container px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-on-surface-variant/70">
                        ${escapeHtml(column.name)} • ${escapeHtml(column.type)}
                      </span>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
          : ""
      }
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="standard-button"
          type="submit"
        >
          ${modal.submitting ? "Saving..." : draft.mode === "edit" ? "Save Chart" : "Create Chart"}
        </button>
      </div>
    </form>
  `;
}

function renderDeleteChartForm(modal) {
  return [
    '<form class="space-y-5" data-form="delete-query-chart"><div class="space-y-3">',
    '<p class="text-sm leading-7 text-on-surface">Delete chart <span class="font-bold text-primary-container">',
    escapeHtml(modal.chartName ?? "Chart"),
    "</span>?</p>",
    '<p class="text-sm leading-7 text-on-surface-variant/65">The linked query-history entry stays intact. Only this chart definition is removed.</p>',
    "</div>",
    renderError(modal.error),
    '<div class="flex items-center justify-between gap-3 pt-2">',
    '<button class="standard-button" data-action="close-modal" type="button">Cancel</button>',
    '<button class="delete-button" type="submit">',
    modal.submitting ? "Deleting..." : "Delete Chart",
    "</button></div></form>",
  ].join("");
}

function renderDeleteQueryHistoryForm(modal) {
  return [
    '<form class="space-y-5" data-form="delete-query-history-confirm"><div class="space-y-3">',
    '<p class="text-sm leading-7 text-on-surface">Delete query <span class="font-bold text-primary-container">',
    escapeHtml(modal.queryTitle ?? "SQL query"),
    "</span>?</p>",
    '<p class="text-sm leading-7 text-on-surface-variant/65">This removes the query-history entry and all recorded runs linked to it.</p>',
    "</div>",
    renderError(modal.error),
    '<div class="flex items-center justify-between gap-3 pt-2">',
    '<button class="standard-button" data-action="close-modal" type="button">Cancel</button>',
    '<button class="delete-button" type="submit">',
    modal.submitting ? "Deleting..." : "Delete Query",
    "</button></div></form>",
  ].join("");
}

function renderQueryExportPreview(lines = []) {
  return lines.map((line) => `<span class="block whitespace-pre">${escapeHtml(line)}</span>`).join("");
}

function getExportOptions() {
  return [
    { label: "CSV", format: "csv", icon: "table_rows", meta: ".csv", preview: ["id,name", "1,Acme"] },
    { label: "TSV", format: "tsv", icon: "view_column", meta: ".tsv", preview: ["id\tname", "1\tAcme"] },
    {
      label: "Markdown",
      format: "md",
      icon: "article",
      meta: ".md",
      preview: ["| id | name |", "| --- | --- |"],
    },
    {
      label: "Duplicate",
      format: "table",
      icon: "table_chart",
      meta: "as table",
      preview: ["columns inferred", "rows prefilled"],
    },
  ];
}

function renderTextExportModal(modal, action) {
  const disabledAttribute = modal.submitting ? 'disabled aria-disabled="true"' : "";

  return `
    <div class="space-y-5" data-export-modal>
      <label class="block space-y-2">
        <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Filename
        </span>
        <input
          autocomplete="off"
          class="control-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
          name="filename"
          spellcheck="false"
          type="text"
          value="${escapeHtml(modal.filename ?? "")}"
          ${disabledAttribute}
        />
      </label>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        ${getExportOptions()
          .map(
            (option) => `
              <button
                class="group flex min-h-36 flex-col justify-between border border-outline-variant/20 bg-surface-container-low px-5 py-5 text-left text-on-surface transition-colors hover:border-primary-container/45 hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-container disabled:cursor-wait disabled:opacity-60"
                data-action="${escapeHtml(action)}"
                data-export-format="${escapeHtml(option.format)}"
                type="button"
                ${disabledAttribute}
              >
                <span class="flex w-full items-start justify-between gap-4">
                  <span class="flex min-w-0 items-center gap-3">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center border border-outline-variant/20 bg-surface-container-highest text-primary-container group-hover:border-primary-container/35">
                      <span class="material-symbols-outlined text-xl">${escapeHtml(option.icon)}</span>
                    </span>
                    <span class="min-w-0">
                      <span class="block truncate font-headline text-lg font-black uppercase tracking-normal text-primary-container">
                        ${escapeHtml(option.label)}
                      </span>
                      <span class="mt-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/55">
                        ${escapeHtml(option.meta)}
                      </span>
                    </span>
                  </span>
                  <span class="material-symbols-outlined mt-1 text-base text-on-surface-variant/35 group-hover:text-primary-container">
                    arrow_forward
                  </span>
                </span>
                <span class="mt-5 block w-full overflow-hidden border border-outline-variant/10 bg-surface-container-lowest px-3 py-3 font-mono text-[11px] leading-5 text-on-surface-variant/70">
                  ${renderQueryExportPreview(option.preview)}
                </span>
              </button>
            `,
          )
          .join("")}
      </div>
      ${renderError(modal.error)}
      <div class="flex justify-start">
        <button class="standard-button" data-action="close-modal" type="button">
          Cancel
        </button>
      </div>
    </div>
  `;
}

function renderQueryExportModal(modal) {
  return renderTextExportModal(modal, "export-query-format");
}

function renderDataExportModal(modal) {
  return renderTextExportModal(modal, "export-data-format");
}

function getCopyColumnResult(state, modal) {
  return modal.scope === "charts" ? state.charts.result : state.editor.result;
}

function renderCopyColumnPreview(modal, state) {
  const result = getCopyColumnResult(state, modal);
  const isMarkdownTodo = isMarkdownTodoCopyColumnMode(modal.copyMode);
  const separator = Boolean(modal.lineBreaks) && !isMarkdownTodoCopyColumnMode(modal.copyMode)
    ? "\n"
    : String(modal.separator ?? ",");
  const wrapper = String(modal.wrapper ?? '"');
  const preview = isMarkdownTodo
    ? modal.editedText ?? buildCopyColumnText({
        result,
        columnName: modal.columnName,
        copyMode: modal.copyMode,
        separator: "\n",
        wrapper,
      }).text
    : buildCopyColumnPreviewText({
        result,
        columnName: modal.columnName,
        copyMode: modal.copyMode,
        separator,
        wrapper,
        maxRows: 4,
      });

  if (!preview && !isMarkdownTodo) {
    return "";
  }

  if (isMarkdownTodo) {
    return `
      <label class="block space-y-2">
        <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Editable Preview
        </span>
        <textarea
          class="copy-column-preview copy-column-preview--editable custom-scrollbar"
          name="editedText"
          spellcheck="true"
        >${escapeHtml(preview)}</textarea>
      </label>
    `;
  }

  return `
    <div class="space-y-2">
      <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        Preview
      </div>
      <pre class="copy-column-preview custom-scrollbar">${escapeHtml(preview)}</pre>
    </div>
  `;
}

function renderCopyColumnLineBreaksField({ checked = false, disabled = false } = {}) {
  return `
    <label class="block space-y-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        Format
      </span>
      <span class="standard-checkbox ${disabled ? "is-disabled" : ""}">
        <input
          ${checked ? "checked" : ""}
          ${disabled ? "disabled" : ""}
          data-bind="copy-column-format-field"
          data-field="lineBreaks"
          name="lineBreaks"
          type="checkbox"
        />
        <span>Line breaks</span>
      </span>
    </label>
  `;
}

function renderCopyColumnFormatField({ label, name, value = "" }) {
  return `
    <label class="block space-y-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        ${escapeHtml(label)}
      </span>
      <input
        class="control-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
        data-bind="copy-column-format-field"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        type="text"
        value="${escapeHtml(value)}"
      />
    </label>
  `;
}

export function renderCopyColumnModal(modal, state) {
  const result = getCopyColumnResult(state, modal);
  const rows = result?.rows ?? [];
  const valueCount = modal.copyMode === "first-10" ? Math.min(rows.length, 10) : rows.length;
  const disabledAttribute = modal.submitting ? 'disabled aria-disabled="true"' : "";
  const exportMetadata = getCopyColumnExportMetadata(modal.copyMode);
  const isMarkdownTodo = isMarkdownTodoCopyColumnMode(modal.copyMode);
  const lineBreaks = isMarkdownTodo || Boolean(modal.lineBreaks);
  const formatFieldsMarkup = isMarkdownTodo
    ? renderCopyColumnLineBreaksField({
        checked: true,
        disabled: true,
      })
    : `
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        ${renderCopyColumnFormatField({
          label: "Separator",
          name: "separator",
          value: modal.separator ?? ",",
        })}
        ${renderCopyColumnFormatField({
          label: "Wrapper",
          name: "wrapper",
          value: modal.wrapper ?? '"',
        })}
        ${renderCopyColumnLineBreaksField({
          checked: lineBreaks,
        })}
      </div>
    `;

  return `
    <form class="space-y-5" data-form="copy-column">
      <input name="scope" type="hidden" value="${escapeHtml(modal.scope ?? "editor")}" />
      <input name="columnName" type="hidden" value="${escapeHtml(modal.columnName ?? "")}" />
      <input name="copyMode" type="hidden" value="${escapeHtml(modal.copyMode ?? "column")}" />
      <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Column
        </div>
        <div class="mt-2 flex min-w-0 items-center justify-between gap-4">
          <code class="min-w-0 truncate font-mono text-sm text-primary-container" title="${escapeHtml(
            modal.columnName ?? ""
          )}">${escapeHtml(modal.columnName ?? "")}</code>
          <span class="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/50">
            ${escapeHtml(getCopyColumnActionLabel(modal.copyMode))} · ${formatNumber(valueCount)}
          </span>
        </div>
      </div>
      ${formatFieldsMarkup}
      ${renderCopyColumnPreview(modal, state)}
      ${renderError(modal.error)}
      <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
          ${disabledAttribute}
        >
          Cancel
        </button>
        <div class="flex flex-wrap items-center justify-end gap-3">
          <button
            class="standard-button"
            name="intent"
            type="submit"
            value="export"
            ${disabledAttribute}
          >
            ${modal.submitting ? "Working..." : `Export as ${exportMetadata.extension.toUpperCase()}`}
          </button>
          ${
            isMarkdownTodo
              ? `
          <button
            class="standard-button"
            name="intent"
            type="submit"
            value="document"
            ${disabledAttribute}
          >
            ${modal.submitting ? "Working..." : "Export to document folder"}
          </button>
          `
              : ""
          }
          <button
            class="signature-button"
            name="intent"
            type="submit"
            value="copy"
            ${disabledAttribute}
          >
            ${modal.submitting ? "Working..." : "Copy"}
          </button>
        </div>
      </div>
    </form>
  `;
}

function getTableDesignerUniqueConstraintTypeLabel(constraint) {
  if (constraint.partial) {
    return "Partial unique index";
  }

  if ((constraint.columns?.length ?? 0) > 1) {
    return "Multi-column unique";
  }

  return "Unique constraint";
}

function renderTableDesignerUniqueConstraintExpression(constraint) {
  const expression = String(constraint.expression || constraint.sql || "").trim();

  if (expression) {
    return expression;
  }

  const columns = (constraint.columns ?? []).map((column) => column.name).filter(Boolean);
  return columns.length ? `UNIQUE (${columns.join(", ")})` : "UNIQUE constraint";
}

function renderTableDesignerCheckConstraintExpression(constraint) {
  return String(constraint.expression || "").trim() || "CHECK constraint";
}

function normalizeTableDesignerConstraintColumnName(name) {
  return String(name ?? "").trim().toLowerCase();
}

function tableDesignerConstraintIncludesColumn(constraint, columnName) {
  const normalizedColumn = normalizeTableDesignerConstraintColumnName(columnName);

  if (!normalizedColumn) {
    return false;
  }

  return (constraint.columns ?? []).some(
    (constraintColumn) =>
      normalizeTableDesignerConstraintColumnName(constraintColumn.name) === normalizedColumn
  );
}

function renderTableDesignerUniqueConstraintEditor(constraint) {
  const columns = (constraint.columns ?? []).map((column) => column.name).filter(Boolean);

  return `
    <article class="table-designer-constraint-editor">
      <div class="table-designer-constraint-editor__header">
        <div class="min-w-0">
          <div class="table-designer-constraint-editor__type">
            ${escapeHtml(getTableDesignerUniqueConstraintTypeLabel(constraint))}
            ${constraint.origin ? ` // origin ${escapeHtml(constraint.origin)}` : ""}
          </div>
          <input
            class="table-designer-field table-designer-constraint-editor__name"
            data-bind="table-designer-constraint-field"
            data-constraint-id="${escapeHtml(constraint.id)}"
            data-constraint-kind="unique"
            data-field="name"
            spellcheck="false"
            type="text"
            value="${escapeHtml(constraint.name || "UNIQUE constraint")}"
          />
        </div>
        <div class="status-badge status-badge--muted">Rebuild</div>
      </div>
      ${
        columns.length
          ? `
            <div class="table-designer-constraint__columns">
              ${columns.map((column) => `<span>${escapeHtml(column)}</span>`).join("")}
            </div>
          `
          : ""
      }
      <textarea
        class="table-designer-constraint-editor__sql custom-scrollbar"
        data-bind="table-designer-constraint-field"
        data-constraint-id="${escapeHtml(constraint.id)}"
        data-constraint-kind="unique"
        data-field="expression"
        spellcheck="false"
      >${escapeHtml(renderTableDesignerUniqueConstraintExpression(constraint))}</textarea>
    </article>
  `;
}

function renderTableDesignerCheckConstraintEditor(constraint) {
  const columns = constraint.columns ?? [];
  const allowedValues = columns.flatMap((column) =>
    (column.allowedValues ?? []).map((value) => ({
      columnName: column.name,
      value,
    }))
  );

  return `
    <article class="table-designer-constraint-editor">
      <div class="table-designer-constraint-editor__header">
        <div class="min-w-0">
          <div class="table-designer-constraint-editor__type">
            ${columns.length ? escapeHtml(columns.map((column) => column.name).join(", ")) : "Table check"}
          </div>
          <input
            class="table-designer-field table-designer-constraint-editor__name"
            data-bind="table-designer-constraint-field"
            data-constraint-id="${escapeHtml(constraint.id)}"
            data-constraint-kind="check"
            data-field="name"
            spellcheck="false"
            type="text"
            value="${escapeHtml(constraint.name || "CHECK constraint")}"
          />
        </div>
        <div class="status-badge status-badge--muted">Rebuild</div>
      </div>
      ${
        allowedValues.length
          ? `
            <div class="table-designer-constraint__values custom-scrollbar">
              ${allowedValues
                .map(
                  (entry) => `
                    <span title="${escapeHtml(entry.columnName)}">${escapeHtml(entry.value)}</span>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
      <textarea
        class="table-designer-constraint-editor__sql custom-scrollbar"
        data-bind="table-designer-constraint-field"
        data-constraint-id="${escapeHtml(constraint.id)}"
        data-constraint-kind="check"
        data-field="expression"
        spellcheck="false"
      >${escapeHtml(renderTableDesignerCheckConstraintExpression(constraint))}</textarea>
    </article>
  `;
}

function renderTableDesignerConstraintSection({ title, count, emptyText, body }) {
  return `
    <section class="table-designer-constraints-modal__section">
      <div class="table-designer-constraints-modal__section-header">
        <div class="table-designer-constraints-modal__section-title">${escapeHtml(title)}</div>
        <div class="status-badge status-badge--muted">${formatNumber(count)}</div>
      </div>
      ${
        count
          ? `<div class="table-designer-constraints__list">${body}</div>`
          : `<div class="table-designer-constraints-modal__empty">${escapeHtml(emptyText)}</div>`
      }
    </section>
  `;
}

function renderTableDesignerConstraintsModal(modal, state) {
  const draft = state.tableDesigner?.draft;

  if (!draft) {
    return `
      <div class="table-designer-constraints-modal__empty">
        No active table designer draft.
      </div>
      <div class="flex items-center justify-between gap-3 pt-2">
        <button class="standard-button" data-action="close-modal" type="button">Close</button>
      </div>
    `;
  }

  const selectedColumn = modal.columnId
    ? (draft.columns ?? []).find((column) => column.id === modal.columnId)
    : null;
  const selectedColumnName = String(modal.columnName ?? selectedColumn?.name ?? "").trim();
  const hasSelectedColumn = Boolean(modal.columnId || selectedColumnName);
  const selectedColumnLabel = selectedColumnName || "Unnamed column";
  const allUniqueConstraints = draft.mode === "edit" ? draft.uniqueConstraints ?? [] : [];
  const allCheckConstraints = draft.mode === "edit" ? draft.checkConstraints ?? [] : [];
  const uniqueConstraints = hasSelectedColumn
    ? allUniqueConstraints.filter((constraint) =>
        tableDesignerConstraintIncludesColumn(constraint, selectedColumnName)
      )
    : allUniqueConstraints;
  const checkConstraints = hasSelectedColumn
    ? allCheckConstraints.filter((constraint) =>
        tableDesignerConstraintIncludesColumn(constraint, selectedColumnName)
      )
    : allCheckConstraints;
  const totalCount = uniqueConstraints.length + checkConstraints.length;

  return `
    <div class="table-designer-constraints-modal">
      <div class="table-designer-constraints-modal__summary">
        <div class="min-w-0">
          <div class="table-designer-constraints-modal__label">Table</div>
          <code title="${escapeHtml(draft.tableName ?? "")}">${escapeHtml(draft.tableName ?? "")}</code>
        </div>
        ${
          hasSelectedColumn
            ? `
              <div class="min-w-0">
                <div class="table-designer-constraints-modal__label">Column</div>
                <code title="${escapeHtml(selectedColumnLabel)}">${escapeHtml(selectedColumnLabel)}</code>
              </div>
            `
            : ""
        }
        <div class="status-badge status-badge--primary">V2 · ${formatNumber(totalCount)}</div>
      </div>
      ${renderTableDesignerConstraintSection({
        title: "Check constraints",
        count: checkConstraints.length,
        emptyText: hasSelectedColumn
          ? "No check constraints detected for this column."
          : "No check constraints detected.",
        body: checkConstraints.map(renderTableDesignerCheckConstraintEditor).join(""),
      })}
      ${renderTableDesignerConstraintSection({
        title: hasSelectedColumn ? "Related unique constraints" : "Unique constraints",
        count: uniqueConstraints.length,
        emptyText: hasSelectedColumn
          ? "No related multi-column or partial unique constraints detected."
          : "No multi-column or partial unique constraints detected.",
        body: uniqueConstraints.map(renderTableDesignerUniqueConstraintEditor).join(""),
      })}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button class="standard-button" data-action="close-modal" type="button">Close</button>
      </div>
    </div>
  `;
}

function renderCreateMediaTaggingMappingTableForm(modal, state) {
  const mappingExists = hasDefaultMediaTaggingMappingTable(state.mediaTagging.schemaTables ?? []);
  const readOnly = Boolean(state.mediaTagging.connection?.readOnly);

  return `
    <form class="space-y-5" data-form="create-media-tagging-mapping-table">
      <div class="space-y-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Mapping Table
        </div>
        <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 font-mono text-sm text-on-surface">
          ${escapeHtml(MEDIA_TAGGING_DEFAULT_MAPPING_TABLE)}
        </div>
      </div>
      <div class="space-y-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Status
        </div>
        <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface">
          ${
            mappingExists
              ? `${escapeHtml(MEDIA_TAGGING_DEFAULT_MAPPING_TABLE)} already exists in the active database.`
              : `${escapeHtml(MEDIA_TAGGING_DEFAULT_MAPPING_TABLE)} does not exist yet.`
          }
          ${
            readOnly && !mappingExists
              ? `<div class="mt-2 text-on-surface-variant/60">The active connection is read-only, so the table cannot be created here.</div>`
              : ""
          }
        </div>
      </div>
      <div class="space-y-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          SQL
        </div>
        ${renderSqlPreviewField(MEDIA_TAGGING_DEFAULT_MAPPING_TABLE_SQL)}
      </div>
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Close
        </button>
        ${
          !mappingExists
            ? `
                <button
                  class="standard-button"
                  type="submit"
                  ${readOnly ? "disabled" : ""}
                >
                  ${modal.submitting ? "Creating..." : "Create Table"}
                </button>
              `
            : ""
        }
      </div>
    </form>
  `;
}

function renderCreateMediaTaggingTagTableForm(modal, state) {
  const tagTableExists = hasDefaultMediaTaggingTagTable(state.mediaTagging.schemaTables ?? []);
  const readOnly = Boolean(state.mediaTagging.connection?.readOnly);

  return `
    <form class="space-y-5" data-form="create-media-tagging-tag-table">
      <div class="space-y-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Tag Table
        </div>
        <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 font-mono text-sm text-on-surface">
          ${escapeHtml(MEDIA_TAGGING_DEFAULT_TAG_TABLE)}
        </div>
      </div>
      <div class="space-y-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Status
        </div>
        <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface">
          ${
            tagTableExists
              ? `${escapeHtml(MEDIA_TAGGING_DEFAULT_TAG_TABLE)} already exists in the active database.`
              : `${escapeHtml(MEDIA_TAGGING_DEFAULT_TAG_TABLE)} does not exist yet.`
          }
          ${
            readOnly && !tagTableExists
              ? `<div class="mt-2 text-on-surface-variant/60">The active connection is read-only, so the table cannot be created here.</div>`
              : ""
          }
        </div>
      </div>
      <div class="space-y-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          SQL
        </div>
        ${renderSqlPreviewField(MEDIA_TAGGING_DEFAULT_TAG_TABLE_SQL)}
      </div>
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Close
        </button>
        ${
          !tagTableExists
            ? `
                <button
                  class="standard-button"
                  type="submit"
                  ${readOnly ? "disabled" : ""}
                >
                  ${modal.submitting ? "Creating..." : "Create Table"}
                </button>
              `
            : ""
        }
      </div>
    </form>
  `;
}

export function renderModal(state) {
  const modal = state.modal;

  if (!modal) {
    return "";
  }

  const contentByKind = {
    "open-connection": {
      eyebrow: "Filesystem // Open existing SQLite database",
      title: "Connect Database",
      body: renderOpenConnectionForm(modal),
    },
    "create-connection": {
      eyebrow: "Filesystem // Create a new SQLite database",
      title: "Create Database",
      body: renderCreateDatabaseForm(modal),
    },
    "import-sql": {
      eyebrow: "Import // Execute SQL dump into SQLite",
      title: "Import SQL Dump",
      body: renderImportSqlForm(modal, state),
    },
    "edit-connection": {
      eyebrow: "Registry // Update saved SQLite target",
      title: "Edit Connection",
      body: renderEditConnectionForm(modal),
    },
    "delete-row": {
      eyebrow: "Mutation // Confirm row deletion",
      title: "Delete Row",
      body: renderDeleteRowConfirmForm(modal),
    },
    "row-update-preview": {
      eyebrow: "Mutation // Review row update",
      title: "Review Update",
      body: renderRowUpdatePreviewForm(modal),
    },
    "chart-editor": {
      eyebrow: "Charts // Configure query-based ECharts panel",
      title: modal.draft?.mode === "edit" ? "Edit Chart" : "New Chart",
      body: renderChartEditorForm(modal, state),
    },
    "delete-chart": {
      eyebrow: "Charts // Confirm chart deletion",
      title: "Delete Chart",
      body: renderDeleteChartForm(modal),
    },
    "delete-query-history": {
      eyebrow: "History // Confirm query deletion",
      title: "Delete Query",
      body: renderDeleteQueryHistoryForm(modal),
    },
    "query-export": {
      eyebrow: "SQL Editor // Export query result",
      title: "Export Query",
      body: renderQueryExportModal(modal),
    },
    "data-export": {
      eyebrow: "Data Browser // Export table data",
      title: "Export Table",
      body: renderDataExportModal(modal),
    },
    "copy-column": {
      eyebrow: "Results // Copy or export column values",
      title: isMarkdownTodoCopyColumnMode(modal.copyMode) ? "Export Markdown Todo" : "Copy column",
      body: renderCopyColumnModal(modal, state),
    },
    "table-designer-constraints": {
      eyebrow: "Table Designer // Constraints",
      title: "Checks",
      body: renderTableDesignerConstraintsModal(modal, state),
    },
    "create-media-tagging-tag-table": {
      eyebrow: "Media Tagging // Create default tag table",
      title: "Create Tag Table",
      body: renderCreateMediaTaggingTagTableForm(modal, state),
    },
    "create-media-tagging-mapping-table": {
      eyebrow: "Media Tagging // Create default join table",
      title: "Create Mapping Table",
      body: renderCreateMediaTaggingMappingTableForm(modal, state),
    },
  };

  const config = contentByKind[modal.kind];

  if (!config) {
    return "";
  }

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-4 backdrop-blur-sm">
      <div class="w-full ${
        modal.kind === "chart-editor" ||
        modal.kind === "row-update-preview" ||
        modal.kind === "table-designer-constraints"
          ? "max-w-3xl"
          : "max-w-xl"
      } border border-outline-variant/20 bg-surface-container shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div class="flex items-start justify-between gap-4 border-b border-outline-variant/10 bg-surface-container-low px-6 py-5">
          <div>
            <div class="text-[10px] font-mono uppercase tracking-[0.26em] text-primary-container/70">
              ${escapeHtml(config.eyebrow)}
            </div>
            <h2 class="mt-2 font-headline text-3xl font-black uppercase tracking-tight text-primary-container">
              ${escapeHtml(config.title)}
            </h2>
          </div>
          <button
            class="control-icon-button border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-highest hover:text-primary-container"
            data-action="close-modal"
            type="button"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="space-y-5 px-6 py-6">${config.body}</div>
      </div>
    </div>
  `;
}
