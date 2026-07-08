import { escapeHtml } from "../utils/format.js";

export function renderStatusBadge(label, tone = "muted") {
  return `<span class="status-badge status-badge--${tone}">${escapeHtml(label)}</span>`;
}

export function renderTableKindBadge(table) {
  if (table?.isVirtual) {
    return `<span class="status-badge status-badge--primary shrink-0" title="Virtual table">Virtual</span>`;
  }

  if (table?.isShadow) {
    return `<span class="status-badge status-badge--muted shrink-0" title="Shadow table">Shadow</span>`;
  }

  return "";
}

export function renderVirtualTableBadge(table) {
  return renderTableKindBadge(table);
}
