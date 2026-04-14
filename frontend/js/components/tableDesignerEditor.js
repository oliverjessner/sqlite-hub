import { escapeHtml } from "../utils/format.js";

function renderWarningList(items = [], className, title, tone = "alert") {
  if (!items.length) {
    return "";
  }

  return `
    <section class="${className}">
      <div class="table-designer-banner__header">
        <div class="table-designer-banner__title">${escapeHtml(title)}</div>
        <div class="status-badge status-badge--${tone}">
          ${escapeHtml(String(items.length))}
        </div>
      </div>
      <div class="table-designer-banner__list">
        ${items
          .map(
            (item) => `
              <div class="table-designer-banner__item">
                <div class="table-designer-banner__item-title">${escapeHtml(
                  item.title || item
                )}</div>
                ${
                  item.message
                    ? `<div class="table-designer-banner__item-text">${escapeHtml(item.message)}</div>`
                    : ""
                }
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function getReferencedColumns(draft, catalogTables, referencesTable) {
  const normalizedReference = String(referencesTable ?? "").trim().toLowerCase();
  const normalizedDraftTable = String(draft.tableName ?? "").trim().toLowerCase();

  if (!normalizedReference) {
    return [];
  }

  if (normalizedReference === normalizedDraftTable) {
    return draft.columns
      .filter((column) => !column.deleted)
      .map((column) => column.name)
      .filter(Boolean);
  }

  return (
    catalogTables.find((table) => table.name.toLowerCase() === normalizedReference)?.columns ?? []
  );
}

function renderColumnRow(column, draft, catalogTables) {
  const referenceColumns = getReferencedColumns(draft, catalogTables, column.referencesTable);

  return `
    <div class="table-designer-grid__row">
      <input
        class="table-designer-field"
        data-bind="table-designer-column-field"
        data-column-id="${escapeHtml(column.id)}"
        data-field="name"
        placeholder="column_name"
        spellcheck="false"
        type="text"
        value="${escapeHtml(column.name)}"
      />
      <select
        class="table-designer-field"
        data-bind="table-designer-column-field"
        data-column-id="${escapeHtml(column.id)}"
        data-field="type"
      >
        ${draft.supportedTypes
          .map(
            (type) => `
              <option value="${escapeHtml(type)}" ${type === column.type ? "selected" : ""}>
                ${escapeHtml(type)}
              </option>
            `
          )
          .join("")}
      </select>
      <label class="standard-checkbox table-designer-check table-designer-checkbox-override">
        <input
          data-bind="table-designer-column-flag"
          data-column-id="${escapeHtml(column.id)}"
          data-field="notNull"
          type="checkbox"
          ${column.notNull ? "checked" : ""}
        />
        <span>Not null</span>
      </label>
      <label class="standard-checkbox table-designer-check table-designer-checkbox-override">
        <input
          data-bind="table-designer-column-flag"
          data-column-id="${escapeHtml(column.id)}"
          data-field="unique"
          type="checkbox"
          ${column.unique ? "checked" : ""}
        />
        <span>Unique</span>
      </label>
      <label class="standard-checkbox table-designer-check table-designer-checkbox-override">
        <input
          data-bind="table-designer-column-flag"
          data-column-id="${escapeHtml(column.id)}"
          data-field="primaryKey"
          type="checkbox"
          ${column.primaryKey ? "checked" : ""}
        />
        <span>PK</span>
      </label>
      <input
        class="table-designer-field"
        data-bind="table-designer-column-field"
        data-column-id="${escapeHtml(column.id)}"
        data-field="defaultValue"
        placeholder="SQL default"
        spellcheck="false"
        type="text"
        value="${escapeHtml(column.defaultValue)}"
      />
      <select
        class="table-designer-field"
        data-bind="table-designer-column-field"
        data-column-id="${escapeHtml(column.id)}"
        data-field="referencesTable"
      >
        <option value="">No FK table</option>
        ${catalogTables
          .map(
            (table) => `
              <option
                value="${escapeHtml(table.name)}"
                ${table.name === column.referencesTable ? "selected" : ""}
              >
                ${escapeHtml(table.name)}
              </option>
            `
          )
          .join("")}
      </select>
      <select
        class="table-designer-field"
        data-bind="table-designer-column-field"
        data-column-id="${escapeHtml(column.id)}"
        data-field="referencesColumn"
      >
        <option value="">No FK column</option>
        ${referenceColumns
          .map(
            (name) => `
              <option value="${escapeHtml(name)}" ${name === column.referencesColumn ? "selected" : ""}>
                ${escapeHtml(name)}
              </option>
            `
          )
          .join("")}
      </select>
      <button
        class="delete-button"
        data-action="remove-table-designer-column"
        data-column-id="${escapeHtml(column.id)}"
        type="button"
      >
        <span class="material-symbols-outlined text-base">delete</span>
        <span>Remove</span>
      </button>
    </div>
  `;
}

function renderColumnGrid(draft, catalogTables) {
  const visibleColumns = draft.columns.filter((column) => !column.deleted);

  return `
    <div class="table-designer-grid custom-scrollbar">
      <div class="table-designer-grid__header">
        <div>Name</div>
        <div>Type</div>
        <div>Not Null</div>
        <div>Unique</div>
        <div>Primary Key</div>
        <div>Default</div>
        <div>FK Table</div>
        <div>FK Column</div>
        <div></div>
      </div>
      ${visibleColumns.map((column) => renderColumnRow(column, draft, catalogTables)).join("")}
    </div>
  `;
}

function renderFillToggle(draft) {
  if (draft.mode !== "create") {
    return "";
  }

  const hasImportedRows = (draft.importedCsvRows?.length ?? 0) > 0;

  return `
    <label class="standard-checkbox table-designer-fill-toggle table-designer-checkbox-override ${hasImportedRows ? "" : "is-disabled"}">
      <input
        data-bind="table-designer-field"
        data-field="fillImportedRows"
        type="checkbox"
        ${draft.fillImportedRows ? "checked" : ""}
        ${hasImportedRows ? "" : "disabled"}
      />
      <span>Fill</span>
      <span class="table-designer-fill-toggle__meta">
        ${
          hasImportedRows
            ? `${escapeHtml(String(draft.importedCsvRows.length))} imported row${
                draft.importedCsvRows.length === 1 ? "" : "s"
              }`
            : "Available after CSV import"
        }
      </span>
    </label>
  `;
}

export function renderTableDesignerEditor(state) {
  const draft = state.tableDesigner.draft;

  if (state.tableDesigner.loading || state.tableDesigner.detailLoading) {
    return `
      <section class="table-designer-main__empty shell-section">
        <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
        <div class="table-designer-main__empty-title">Loading Schema Draft</div>
        <div class="table-designer-main__empty-text">
          Reading the current SQLite schema and preparing the editable draft.
        </div>
      </section>
    `;
  }

  if (!draft) {
    return `
      <section class="table-designer-main__empty shell-section">
        <div class="table-designer-main__empty-title">No Table Selected</div>
        <div class="table-designer-main__empty-text">
          Open an existing table from the left or start a new draft with <strong>+ New Table</strong>.
        </div>
      </section>
    `;
  }

  const validationItems = (draft.validationErrors ?? []).map((message) => ({
    title: message,
  }));
  const warningItems = draft.warnings ?? [];
  const catalogTables = state.tableDesigner.tables ?? [];
  const visibleColumns = draft.columns.filter((column) => !column.deleted);
  const saveLabel =
    draft.mode === "create"
      ? state.tableDesigner.saving
        ? "Creating..."
        : "Create Table"
      : state.tableDesigner.saving
        ? "Saving..."
        : "Save Changes";

  return `
    <section class="table-designer-main shell-section">
      <header class="table-designer-main__header">
        <div>
          <div class="table-designer-main__eyebrow">
            ${draft.mode === "create" ? "New Table Draft" : "Editing Existing Table"}
          </div>
          <div class="table-designer-main__title-row">
            <input
              class="table-designer-main__name"
              data-bind="table-designer-field"
              data-field="tableName"
              placeholder="table_name"
              spellcheck="false"
              type="text"
              value="${escapeHtml(draft.tableName)}"
            />
            ${
              draft.mode === "edit"
                ? `<div class="status-badge status-badge--muted">FROM ${escapeHtml(
                    draft.originalTableName
                  )}</div>`
                : `<div class="status-badge status-badge--primary">CREATE</div>`
            }
          </div>
          <div class="table-designer-main__subtitle">
            ${escapeHtml(String(visibleColumns.length))} visible column${
              visibleColumns.length === 1 ? "" : "s"
            } // SQLite-safe operations only
          </div>
        </div>
        <div class="table-designer-main__actions">
          ${renderFillToggle(draft)}
          <button
            class="standard-button"
            data-action="refresh-view"
            type="button"
          >
            Reload Schema
          </button>
          <button
            class="standard-button"
            data-action="save-table-designer"
            ${draft.canSave ? "" : "disabled"}
            type="button"
          >
            ${escapeHtml(saveLabel)}
          </button>
        </div>
      </header>

      ${
        state.tableDesigner.saveError
          ? `
              <div class="table-designer-main__error">
                <div class="table-designer-main__error-code">${escapeHtml(
                  state.tableDesigner.saveError.code
                )}</div>
                <div class="table-designer-main__error-text">${escapeHtml(
                  state.tableDesigner.saveError.message
                )}</div>
              </div>
            `
          : ""
      }

      ${renderWarningList(validationItems, "table-designer-banner is-validation", "Validation", "alert")}
      ${renderWarningList(warningItems, "table-designer-banner is-warning", "Warnings", "alert")}

      <section class="table-designer-main__section">
        <div class="table-designer-main__section-header">
          <div>
            <div class="table-designer-main__section-title">Columns</div>
          </div>
          <button
            class="standard-button"
            data-action="add-table-designer-column"
            type="button"
          >
            + Add Column
          </button>
        </div>
        ${renderColumnGrid(draft, catalogTables)}
      </section>
    </section>
  `;
}
