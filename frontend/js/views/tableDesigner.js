import { renderTableDesignerEditor } from "../components/tableDesignerEditor.js";
import { renderTableDesignerSidebar } from "../components/tableDesignerSidebar.js";
import { renderTableDesignerSqlPreview } from "../components/tableDesignerSqlPreview.js";
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

export function renderTableDesignerView(state) {
  return {
    main: `
      <section class="view-surface table-designer-view">
        ${renderTableDesignerSidebar(state)}
        <div class="table-designer-workspace">
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
