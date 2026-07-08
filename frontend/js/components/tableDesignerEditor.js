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

export function renderTableDesignerReferenceColumnOptions(
  draft,
  catalogTables,
  referencesTable,
  selectedValue
) {
  const referenceColumns = getReferencedColumns(draft, catalogTables, referencesTable);

  return [
    '<option value="">No FK column</option>',
    referenceColumns
      .map((name) =>
        [
          '<option value="',
          escapeHtml(name),
          '" ',
          name === selectedValue ? "selected" : "",
          ">",
          escapeHtml(name),
          "</option>",
        ].join("")
      )
      .join(""),
  ].join("");
}

function normalizeConstraintColumnName(name) {
  return String(name ?? "").trim().toLowerCase();
}

function constraintIncludesColumn(constraint, column) {
  if (constraint.columnId && constraint.columnId === column.id) {
    return true;
  }

  const columnName = column.name;
  const normalizedColumn = normalizeConstraintColumnName(columnName);

  if (!normalizedColumn) {
    return false;
  }

  return (constraint.columns ?? []).some(
    (constraintColumn) => normalizeConstraintColumnName(constraintColumn.name) === normalizedColumn
  );
}

function countColumnCheckConstraints(column, draft) {
  return (draft.checkConstraints ?? []).filter((constraint) =>
    !constraint.deleted && constraintIncludesColumn(constraint, column)
  ).length;
}

function renderColumnCheckAction(column, draft) {
  const checkCount = countColumnCheckConstraints(column, draft);
  const columnName = column.name || "Unnamed column";
  const checkCountLabel = String(checkCount || 0);

  return `
    <button
      aria-label="Checks for ${escapeHtml(columnName)}"
      class="standard-button table-designer-row-check-button"
      data-action="open-table-designer-constraints"
      data-column-id="${escapeHtml(column.id)}"
      data-column-name="${escapeHtml(column.name)}"
      title="Checks for ${escapeHtml(columnName)}"
      type="button"
    >
      <span class="material-symbols-outlined text-base">fact_check</span>
      <span>Checks</span>
      <span
        class="status-badge status-badge--muted table-designer-row-check-button__count${checkCount ? "" : " is-empty"}"
        ${checkCount ? "" : 'aria-hidden="true"'}
      >
        ${escapeHtml(checkCountLabel)}
      </span>
    </button>
  `;
}

function renderColumnRow(column, draft, catalogTables) {
  const typeOptions = draft.supportedTypes
    .map((type) =>
      [
        '<option value="',
        escapeHtml(type),
        '" ',
        type === column.type ? "selected" : "",
        ">",
        escapeHtml(type),
        "</option>",
      ].join("")
    )
    .join("");
  const referenceTableOptions = catalogTables
    .map((table) =>
      [
        '<option value="',
        escapeHtml(table.name),
        '" ',
        table.name === column.referencesTable ? "selected" : "",
        ">",
        escapeHtml(table.name),
        "</option>",
      ].join("")
    )
    .join("");
  const referenceColumnOptions = renderTableDesignerReferenceColumnOptions(
    draft,
    catalogTables,
    column.referencesTable,
    column.referencesColumn
  );

  const columnId = escapeHtml(column.id);

  return [
    '<div class="table-designer-grid__row">',
    '<input class="table-designer-field" data-bind="table-designer-column-field" data-column-id="',
    columnId,
    '" data-field="name" placeholder="column_name" spellcheck="false" type="text" value="',
    escapeHtml(column.name),
    '" />',
    '<select class="table-designer-field" data-bind="table-designer-column-field" data-column-id="',
    columnId,
    '" data-field="type">',
    typeOptions,
    "</select>",
    '<label class="standard-checkbox table-designer-check table-designer-checkbox-override">',
    '<input data-bind="table-designer-column-flag" data-column-id="',
    columnId,
    '" data-field="notNull" type="checkbox" ',
    column.notNull ? "checked" : "",
    ' /><span>Not null</span></label>',
    '<label class="standard-checkbox table-designer-check table-designer-checkbox-override">',
    '<input data-bind="table-designer-column-flag" data-column-id="',
    columnId,
    '" data-field="unique" type="checkbox" ',
    column.unique ? "checked" : "",
    ' /><span>Unique</span></label>',
    '<label class="standard-checkbox table-designer-check table-designer-checkbox-override">',
    '<input data-bind="table-designer-column-flag" data-column-id="',
    columnId,
    '" data-field="primaryKey" type="checkbox" ',
    column.primaryKey ? "checked" : "",
    ' /><span>PK</span></label>',
    '<input class="table-designer-field" data-bind="table-designer-column-field" data-column-id="',
    columnId,
    '" data-field="defaultValue" placeholder="SQL default" spellcheck="false" type="text" value="',
    escapeHtml(column.defaultValue),
    '" />',
    '<select class="table-designer-field" data-bind="table-designer-column-field" data-column-id="',
    columnId,
    '" data-field="referencesTable"><option value="">No FK table</option>',
    referenceTableOptions,
    "</select>",
    '<select class="table-designer-field" data-bind="table-designer-column-field" data-column-id="',
    columnId,
    '" data-field="referencesColumn">',
    referenceColumnOptions,
    "</select>",
    '<div class="table-designer-row-actions">',
    renderColumnCheckAction(column, draft),
    '<button class="delete-button" data-action="remove-table-designer-column" data-column-id="',
    columnId,
    '" type="button"><span class="material-symbols-outlined text-base">delete</span><span>Remove</span></button>',
    "</div>",
    "</div>",
  ].join("");
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
        <div>Actions</div>
      </div>
      ${visibleColumns.map((column) => renderColumnRow(column, draft, catalogTables)).join("")}
    </div>
  `;
}

function getDraftImportRows(draft) {
  return Array.isArray(draft.importRows) && draft.importRows.length
    ? draft.importRows
    : draft.importedCsvRows ?? [];
}

function renderImportSource(draft) {
  const importFormat = String(draft.importFormat ?? "").trim().toUpperCase();
  const sourceFileName = String(draft.importSourceFileName ?? draft.importedCsvFileName ?? "").trim();

  if (draft.mode !== "create" || !importFormat || !sourceFileName) {
    return "";
  }

  return `
    <div class="table-designer-import-source">
      <span class="table-designer-import-source__label">SOURCE // ${escapeHtml(importFormat)}</span>
      <span class="table-designer-import-source__file">${escapeHtml(sourceFileName)}</span>
    </div>
  `;
}

function renderFillToggle(draft) {
  if (draft.mode !== "create") {
    return "";
  }

  const importRows = getDraftImportRows(draft);
  const hasImportedRows = importRows.length > 0;

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
            ? `${escapeHtml(String(importRows.length))} imported row${
                importRows.length === 1 ? "" : "s"
              }`
            : "Available after data import"
        }
      </span>
    </label>
  `;
}

export function renderTableDesignerFeedback(draft, saveError) {
  const validationItems = (draft?.validationErrors ?? []).map((message) => ({
    title: message,
  }));
  const warningItems = draft?.warnings ?? [];
  const schemaNotes = warningItems.filter(
    (item) => item.tone === "muted" && item.code !== "COMPLEX_UNIQUE_CONSTRAINTS_PRESENT"
  );
  const alertWarnings = warningItems.filter((item) => item.tone !== "muted");

  return [
    saveError
      ? `
              <div class="table-designer-main__error">
                <div class="table-designer-main__error-code">${escapeHtml(saveError.code)}</div>
                <div class="table-designer-main__error-text">${escapeHtml(saveError.message)}</div>
              </div>
    `
      : "",
    renderWarningList(validationItems, "table-designer-banner is-validation", "Validation", "alert"),
    renderWarningList(alertWarnings, "table-designer-banner is-warning", "Warnings", "alert"),
    renderWarningList(schemaNotes, "table-designer-banner is-note", "Schema Notes", "muted"),
  ].join("");
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

  const catalogTables = state.tableDesigner.tables ?? [];
  const hasImportedRows = getDraftImportRows(draft).length > 0;
  const saveLabel =
    draft.mode === "create"
      ? hasImportedRows
        ? state.tableDesigner.saving
          ? "Creating & importing..."
          : "Create & Import"
        : state.tableDesigner.saving
          ? "Creating..."
          : "Create Table"
      : state.tableDesigner.saving
        ? "Saving..."
        : "Save Changes";

  return `
    <section class="table-designer-main shell-section">
      <div data-table-designer-feedback>
        ${renderTableDesignerFeedback(draft, state.tableDesigner.saveError)}
      </div>

      <section class="table-designer-main__section">
        <div class="table-designer-main__section-header">
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
              draft.mode === "create"
                ? `<div class="status-badge status-badge--primary">CREATE</div>`
                : ""
            }
            ${renderImportSource(draft)}
          </div>
          <div class="table-designer-main__section-actions">
            <button
              class="standard-button"
              data-action="add-table-designer-column"
              type="button"
            >
              + Add Column
            </button>
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
              data-table-designer-save-button
              ${draft.canSave ? "" : "disabled"}
              type="button"
            >
              ${escapeHtml(saveLabel)}
            </button>
            ${renderFillToggle(draft)}
          </div>
        </div>
        ${renderColumnGrid(draft, catalogTables)}
      </section>
    </section>
  `;
}
