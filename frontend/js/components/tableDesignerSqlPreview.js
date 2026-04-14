import { escapeHtml } from "../utils/format.js";

function renderPreviewHeader(draft, isVisible) {
  return `
    <div class="table-designer-preview__header">
      <div>
        <div class="table-designer-preview__eyebrow">SQL Preview</div>
        <div class="table-designer-preview__title">${
          draft ? "Live SQLite Output" : "No Draft Selected"
        }</div>
      </div>
      <div class="table-designer-preview__actions">
        ${
          draft && isVisible
            ? `
              <button
                class="standard-button"
                data-action="copy-table-designer-sql"
                type="button"
              >
                Copy SQL
              </button>
            `
            : ""
        }
        <button
          class="standard-button"
          data-action="toggle-table-designer-sql-preview"
          data-next-value="${isVisible ? "false" : "true"}"
          type="button"
        >
          <span class="material-symbols-outlined">${isVisible ? "visibility_off" : "expand_less"}</span>
          ${isVisible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  `;
}

export function renderTableDesignerSqlPreview(draft, isVisible = true) {
  if (!draft) {
    return `
      <section class="table-designer-preview shell-section${isVisible ? "" : " is-collapsed"}">
        ${renderPreviewHeader(draft, isVisible)}
        ${
          isVisible
            ? `
              <div class="table-designer-preview__empty">
                Select a table or create a new one to inspect the generated SQLite statements.
              </div>
            `
            : ""
        }
      </section>
    `;
  }

  return `
    <section class="table-designer-preview shell-section${isVisible ? "" : " is-collapsed"}">
      ${renderPreviewHeader(draft, isVisible)}
      ${
        isVisible
          ? `
            <pre class="table-designer-preview__body custom-scrollbar">${escapeHtml(
              draft.sqlPreview || "-- SQL preview unavailable."
            )}</pre>
          `
          : ""
      }
    </section>
  `;
}
