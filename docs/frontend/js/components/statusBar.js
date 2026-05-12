import { escapeHtml, formatBytes, formatDateTime } from "../utils/format.js";

export function renderStatusBar(state) {
  const active = state.connections.active;
  const overview = state.overview.data;
  const result = state.editor.result;

  return `
    <div class="status-bar-shell">
      <div class="status-bar-primary">
        <span class="status-bar-text">
          ${
            active
              ? `ACTIVE_DB // ${escapeHtml(active.label)}`
              : "NO_ACTIVE_DATABASE // CONNECT_SQLITE_FILE"
          }
        </span>
        <div class="status-bar-dot"></div>
      </div>
      <div class="status-bar-secondary">
        <span class="status-bar-link">
          ${active ? (active.readOnly ? "READ_ONLY" : "READ_WRITE") : "IDLE"}
        </span>
        <span class="status-bar-link">
          ${overview?.sqlite?.journalMode ? escapeHtml(overview.sqlite.journalMode) : "journal:n/a"}
        </span>
        <span class="status-bar-link">
          ${overview?.file?.sizeBytes ? escapeHtml(formatBytes(overview.file.sizeBytes)) : "size:n/a"}
        </span>
        <span class="status-bar-link">
          ${result ? `last query ${escapeHtml(String(result.timingMs ?? 0))}ms` : "no query executed"}
        </span>
        <span class="status-bar-link">
          ${active?.lastOpenedAt ? escapeHtml(formatDateTime(active.lastOpenedAt)) : "waiting"}
        </span>
      </div>
    </div>
  `;
}
