import { escapeHtml } from "../utils/format.js";

export function renderStatusBadge(label, tone = "muted") {
  return `<span class="status-badge status-badge--${tone}">${escapeHtml(label)}</span>`;
}
