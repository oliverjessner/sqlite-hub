import { escapeHtml } from "../utils/format.js";

export function renderTableDesignerSqlPreview(draft) {
  if (!draft) {
    return `
      <section class="table-designer-preview shell-section">
        <div class="table-designer-preview__header">
          <div>
            <div class="table-designer-preview__eyebrow">SQL Preview</div>
            <div class="table-designer-preview__title">No Draft Selected</div>
          </div>
        </div>
        <div class="table-designer-preview__empty">
          Select a table or create a new one to inspect the generated SQLite statements.
        </div>
      </section>
    `;
  }

  return `
    <section class="table-designer-preview shell-section">
      <div class="table-designer-preview__header">
        <div>
          <div class="table-designer-preview__eyebrow">SQL Preview</div>
          <div class="table-designer-preview__title">Live SQLite Output</div>
        </div>
        <button
          class="table-designer-preview__copy"
          data-action="copy-table-designer-sql"
          type="button"
        >
          Copy SQL
        </button>
      </div>
      <pre class="table-designer-preview__body custom-scrollbar">${escapeHtml(
        draft.sqlPreview || "-- SQL preview unavailable."
      )}</pre>
    </section>
  `;
}
