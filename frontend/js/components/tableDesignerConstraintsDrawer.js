import { escapeHtml, formatNumber, highlightSql } from "../utils/format.js";

function normalizeColumnName(name) {
  return String(name ?? "").trim().toLowerCase();
}

function quoteIdentifier(identifier) {
  return `"${String(identifier ?? "").replaceAll('"', '""')}"`;
}

function normalizeCheckExpression(expression) {
  const normalized = String(expression ?? "").trim();

  if (!normalized) {
    return "";
  }

  return /^CHECK\s*\(/i.test(normalized) ? normalized : `CHECK (${normalized})`;
}

function checkIncludesColumn(constraint, column) {
  if (constraint.columnId && column?.id) {
    return constraint.columnId === column.id;
  }

  const normalizedColumn = normalizeColumnName(column?.name);

  if (!normalizedColumn) {
    return false;
  }

  if (constraint.columnId) {
    return true;
  }

  return (constraint.columns ?? []).some(
    (column) => normalizeColumnName(column.name) === normalizedColumn
  );
}

function getVisibleChecks(draft, column) {
  const checks = (draft?.checkConstraints ?? []).filter((constraint) => !constraint.deleted);

  if (!column) {
    return checks;
  }

  return checks.filter((constraint) => {
    if (!(constraint.columns ?? []).length && !constraint.columnId) {
      return true;
    }

    return checkIncludesColumn(constraint, column);
  });
}

function isTextColumn(column) {
  return ["TEXT", "DATE", "DATETIME"].includes(String(column?.type ?? "").trim().toUpperCase());
}

function isNumericColumn(column) {
  return ["INTEGER", "REAL", "NUMERIC"].includes(String(column?.type ?? "").trim().toUpperCase());
}

function isBooleanLikeColumn(column) {
  const type = String(column?.type ?? "").trim().toUpperCase();
  const name = String(column?.name ?? "").trim().toLowerCase();

  return type === "BOOLEAN" || (type === "INTEGER" && /^(is_|has_|can_|in_stock$)/.test(name));
}

function renderPresetButton(id, label, activePresetId) {
  return `
    <button
      class="standard-button table-designer-check-drawer__preset-button ${activePresetId === id ? "is-active" : ""}"
      data-action="apply-table-designer-check-preset"
      data-preset-id="${escapeHtml(id)}"
      title="${escapeHtml(label)}"
      type="button"
    >
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderPresetParameters(editor) {
  const presetId = editor?.presetId ?? "";
  const fields = editor?.presetFields ?? {};

  if (presetId === "text-min-length") {
    return renderNumberField("MIN LENGTH", "minLength", fields.minLength ?? "3");
  }

  if (presetId === "text-max-length") {
    return renderNumberField("MAX LENGTH", "maxLength", fields.maxLength ?? "255");
  }

  if (presetId === "text-length-range") {
    return `
      <div class="grid grid-cols-2 gap-3">
        ${renderNumberField("MIN", "minLength", fields.minLength ?? "3")}
        ${renderNumberField("MAX", "maxLength", fields.maxLength ?? "255")}
      </div>
    `;
  }

  if (presetId === "text-allowed-values") {
    return `
      <label class="table-designer-check-drawer__field">
        <span>Allowed Values</span>
        <textarea
          class="table-designer-field table-designer-check-drawer__textarea custom-scrollbar"
          data-bind="table-designer-check-editor-field"
          data-field="allowedValues"
          spellcheck="false"
        >${escapeHtml(fields.allowedValues ?? "draft\npublished\narchived")}</textarea>
      </label>
    `;
  }

  if (presetId === "numeric-min-value") {
    return renderNumberField("MIN VALUE", "minValue", fields.minValue ?? "0");
  }

  if (presetId === "numeric-max-value") {
    return renderNumberField("MAX VALUE", "maxValue", fields.maxValue ?? "100");
  }

  if (presetId === "numeric-range") {
    return `
      <div class="grid grid-cols-2 gap-3">
        ${renderNumberField("MIN", "minValue", fields.minValue ?? "0")}
        ${renderNumberField("MAX", "maxValue", fields.maxValue ?? "100")}
      </div>
    `;
  }

  return "";
}

function renderNumberField(label, field, value) {
  return `
    <label class="table-designer-check-drawer__field">
      <span>${escapeHtml(label)}</span>
      <input
        class="table-designer-field"
        data-bind="table-designer-check-editor-field"
        data-field="${escapeHtml(field)}"
        inputmode="numeric"
        spellcheck="false"
        type="text"
        value="${escapeHtml(value)}"
      />
    </label>
  `;
}

function renderPresetButtons(column, activePresetId) {
  if (!column) {
    return "";
  }

  const buttons = [];

  if (isTextColumn(column)) {
    buttons.push(
      renderPresetButton("text-non-empty", "Non Empty", activePresetId),
      renderPresetButton("text-min-length", "Min Length", activePresetId),
      renderPresetButton("text-max-length", "Max Length", activePresetId),
      renderPresetButton("text-length-range", "Length Range", activePresetId),
      renderPresetButton("text-allowed-values", "Allowed Values", activePresetId)
    );
  }

  if (isNumericColumn(column)) {
    buttons.push(
      renderPresetButton("numeric-positive", "Positive", activePresetId),
      renderPresetButton("numeric-non-negative", "Non Negative", activePresetId),
      renderPresetButton("numeric-min-value", "Min Value", activePresetId),
      renderPresetButton("numeric-max-value", "Max Value", activePresetId),
      renderPresetButton("numeric-range", "Range", activePresetId),
      renderPresetButton("numeric-non-zero", "Non Zero", activePresetId)
    );
  }

  if (isBooleanLikeColumn(column)) {
    buttons.push(renderPresetButton("boolean-integer", "Boolean 0 / 1", activePresetId));
  }

  if (!buttons.length) {
    return "";
  }

  return `
    <div class="table-designer-check-drawer__quick">
      <div class="table-designer-check-drawer__subheader">
        <span>Quick Checks</span>
        <span class="status-badge status-badge--muted">${escapeHtml(column.type || "TEXT")}</span>
      </div>
      <div class="table-designer-check-drawer__preset-grid">
        ${buttons.join("")}
      </div>
      <p class="table-designer-check-drawer__note">
        CHECK constraints do not replace NOT NULL. Use NOT NULL separately to reject NULL.
      </p>
    </div>
  `;
}

function renderCheckItem(constraint, draft) {
  const expression = normalizeCheckExpression(constraint.expression);
  const canEdit = draft.mode === "create";

  return `
    <article class="table-designer-check-drawer__item">
      <div class="table-designer-check-drawer__item-header">
        <div>
          <div class="table-designer-check-drawer__item-title">${escapeHtml(
            constraint.name || "CHECK"
          )}</div>
          ${
            constraint.source === "preset"
              ? '<div class="table-designer-check-drawer__item-meta">Preset</div>'
              : ""
          }
        </div>
        ${constraint.originalExpression ? '<span class="status-badge status-badge--muted">Detected</span>' : ""}
      </div>
      <pre class="table-designer-check-drawer__sql custom-scrollbar"><code>${highlightSql(expression)}</code></pre>
      ${
        canEdit
          ? `
            <div class="table-designer-check-drawer__item-actions">
              <button
                class="standard-button"
                data-action="edit-table-designer-check"
                data-constraint-id="${escapeHtml(constraint.id)}"
                type="button"
              >
                Edit
              </button>
              <button
                class="delete-button"
                data-action="remove-table-designer-check"
                data-constraint-id="${escapeHtml(constraint.id)}"
                type="button"
              >
                <span class="material-symbols-outlined text-base">delete</span>
                Remove
              </button>
            </div>
          `
          : ""
      }
    </article>
  `;
}

function renderCheckList(draft, column, checks) {
  return `
    <section class="table-designer-check-drawer__section">
      <div class="table-designer-check-drawer__section-header">
        <div class="table-designer-check-drawer__section-title">
          <span>Check Constraints</span>
          <span class="status-badge status-badge--muted">${formatNumber(checks.length)}</span>
        </div>
        ${
          draft.mode === "create"
            ? `
              <button
                class="standard-button table-designer-check-drawer__header-action"
                data-action="start-table-designer-check-editor"
                type="button"
              >
                <span class="material-symbols-outlined text-base">add</span>
                Add Check
              </button>
            `
            : ""
        }
      </div>
      ${
        checks.length
          ? `<div class="table-designer-check-drawer__list">${checks
              .map((constraint) => renderCheckItem(constraint, draft))
              .join("")}</div>`
          : `
            <div class="table-designer-check-drawer__empty">
              <div>NO CHECK CONSTRAINTS</div>
              <p>CHECK constraints reject rows that do not satisfy a SQL expression.</p>
            </div>
          `
      }
    </section>
  `;
}

function renderEditor(drawer, column) {
  const editor = drawer.editor;

  if (!editor) {
    return "";
  }

  const expression = String(editor.expression ?? "");
  const generatedSql = normalizeCheckExpression(expression);

  return `
    <section class="table-designer-check-drawer__section">
      <div class="table-designer-check-drawer__section-header">
        <div class="table-designer-check-drawer__section-title">
          <span>${drawer.editingConstraintId ? "Edit Check" : "New Check"}</span>
        </div>
      </div>
      ${renderPresetButtons(column, editor.presetId)}
      ${renderPresetParameters(editor)}
      <label class="table-designer-check-drawer__field">
        <span>Custom Expression</span>
        <textarea
          aria-label="CHECK expression"
          class="table-designer-field table-designer-check-drawer__expression custom-scrollbar"
          data-bind="table-designer-check-editor-field"
          data-field="expression"
          spellcheck="false"
        >${escapeHtml(expression)}</textarea>
      </label>
      ${
        editor.error
          ? `
            <div class="table-designer-check-drawer__error" role="alert">
              <div>${escapeHtml(editor.error.code || "INVALID_CHECK_EXPRESSION")}</div>
              <p>${escapeHtml(editor.error.message || "Invalid CHECK expression.")}</p>
            </div>
          `
          : ""
      }
      <div class="table-designer-check-drawer__preview">
        <div>Generated SQL</div>
        <pre class="custom-scrollbar"><code data-table-designer-check-preview>${highlightSql(generatedSql || "CHECK (...)")}</code></pre>
      </div>
      <div class="table-designer-check-drawer__actions">
        <button class="standard-button" data-action="cancel-table-designer-check-editor" type="button">
          Cancel
        </button>
        <button
          class="signature-button"
          data-action="save-table-designer-check"
          type="button"
          ${editor.validating ? "disabled" : ""}
          >
          ${editor.validating ? "Validating..." : "Save Check"}
        </button>
      </div>
    </section>
  `;
}

export function renderTableDesignerConstraintsDrawer(state) {
  const drawer = state.tableDesigner?.constraintsDrawer;
  const draft = state.tableDesigner?.draft;

  if (!drawer?.visible || !draft) {
    return "";
  }

  const column =
    (draft.columns ?? []).find((candidate) => candidate.id === drawer.columnId) ?? null;
  const columnLabel = column?.name || drawer.columnName || "Table";
  const checks = getVisibleChecks(draft, column);

  return `
    <section class="table-designer-check-drawer flex h-full min-h-0 flex-col bg-surface-low">
      <div class="border-b border-outline-variant/10 px-5 py-4">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-container/70">
              Table Designer // ${escapeHtml(columnLabel)}
            </div>
            <h2 class="mt-1 truncate font-body text-lg font-black uppercase tracking-tight text-on-surface">
              Checks
            </h2>
          </div>
          <button
            class="query-history-icon-button"
            aria-label="Close check constraints"
            data-action="close-table-designer-constraints"
            title="Close check constraints"
            type="button"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>
      <div class="table-designer-check-drawer__body custom-scrollbar">
        ${renderCheckList(draft, column, checks)}
        ${renderEditor(drawer, column)}
      </div>
    </section>
  `;
}
