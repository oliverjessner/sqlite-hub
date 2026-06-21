import { renderTableDesignerEditor } from "../components/tableDesignerEditor.js";
import { renderTableDesignerSidebar } from "../components/tableDesignerSidebar.js";
import { renderTableDesignerSqlPreview } from "../components/tableDesignerSqlPreview.js";
import { renderWorkspaceOpenDropdown } from "../components/workspaceOpenDropdown.js";
import { escapeHtml } from "../utils/format.js";

function renderRouteError(error) {
  if (!error) {
    return "";
  }

  return `
    <div class="table-designer-route-error">
      <div class="table-designer-route-error__code">${escapeHtml(error.code)}</div>
      <div class="table-designer-route-error__text">${escapeHtml(error.message)}</div>
    </div>
  `;
}

function renderWorkspaceToolbar(state) {
  const tablesVisible = state.tableDesigner.tablesVisible !== false;
  const tableName = state.tableDesigner.selectedTableName ?? state.tableDesigner.draft?.tableName ?? "";

  return `
    <div class="table-designer-workspace__toolbar workspace-header">
      <div class="table-designer-workspace__toolbar-left">
        <button
          class="standard-button panel-toggle-button ${tablesVisible ? "" : "is-active"}"
          aria-pressed="${tablesVisible ? "false" : "true"}"
          data-action="toggle-table-designer-tables"
          type="button"
        >
          <span class="material-symbols-outlined">${tablesVisible ? "visibility_off" : "visibility"}</span>
          ${tablesVisible ? "Hide Tables" : "Show Tables"}
        </button>
      </div>
      <div class="table-designer-workspace__toolbar-right">
        ${renderWorkspaceOpenDropdown({
          tableName,
          disabled: !state.tableDesigner.selectedTableName,
          destinations: [
            {
              icon: "table_rows",
              key: "data",
              label: "Data",
              target: name => `/data/${encodeURIComponent(name)}`,
            },
            {
              icon: "account_tree",
              key: "structure",
              label: "Structure",
              target: name => `/structure/${encodeURIComponent(name)}`,
            },
            {
              key: "sql-editor",
            },
          ],
        })}
        <button
          class="standard-button"
          data-action="import-table-designer-csv"
          type="button"
        >
          Import CSV
        </button>
        <input
          accept=".csv,text/csv"
          class="table-designer-workspace__file-input"
          data-bind="table-designer-import-file"
          type="file"
        />
        <button
          class="signature-button"
          data-action="navigate"
          data-to="/table-designer/new"
          type="button"
        >
          + New Table
        </button>
      </div>
    </div>
  `;
}

export function renderTableDesignerView(state) {
  return {
    main: `
      <section class="view-surface table-designer-view">
        ${state.tableDesigner.tablesVisible !== false ? renderTableDesignerSidebar(state) : ""}
        <div class="table-designer-workspace">
          ${renderWorkspaceToolbar(state)}
          ${renderRouteError(state.tableDesigner.error)}
          <div class="table-designer-workspace__top">
            ${renderTableDesignerEditor(state)}
          </div>
          <div class="table-designer-workspace__bottom${
            state.tableDesigner.sqlPreviewVisible ? "" : " is-collapsed"
          }">
            ${renderTableDesignerSqlPreview(
              state.tableDesigner.draft,
              state.tableDesigner.sqlPreviewVisible
            )}
          </div>
        </div>
      </section>
    `,
    panel: "",
  };
}
