import {
  escapeHtml,
  formatBytes,
  formatDateTime,
  truncateMiddle,
} from "../utils/format.js";
import { renderStatusBadge } from "./badges.js";

export function renderConnectionCard(connection, activeConnectionId) {
  const isActive = activeConnectionId
    ? connection.id === activeConnectionId
    : Boolean(connection.isActive);
  const clipPath = "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)";
  const primaryActionLabel = isActive ? "Open Overview" : "Set Active";

  return `
    <article
      class="connection-card clipped-corner ${isActive ? "is-active" : ""}"
      style="--clip-path: ${clipPath};"
    >
      <div class="p-6">
        <div class="mb-6 flex items-start justify-between">
          <div
            class="clipped-corner flex h-10 w-10 items-center justify-center transition-colors ${
              isActive ? "bg-primary-container" : "bg-surface-container-highest"
            }"
            style="--clip-path: ${clipPath};"
          >
            <span class="material-symbols-outlined ${
              isActive ? "text-on-primary" : "text-outline-variant"
            }">database</span>
          </div>
          <div class="flex items-center gap-2">
            ${renderStatusBadge(isActive ? "ACTIVE" : "RECENT", isActive ? "primary" : "muted")}
            ${connection.readOnly ? renderStatusBadge("READ_ONLY", "alert") : ""}
          </div>
        </div>
        <h3 class="mb-1 font-headline text-xl font-bold uppercase ${
          isActive ? "text-[#FCE300]" : "text-on-surface"
        }">
          ${escapeHtml(connection.label)}
        </h3>
        <p class="font-mono text-[10px] text-outline-variant">
          ${escapeHtml(truncateMiddle(connection.path, 68))}
        </p>
        <div class="mt-8 grid grid-cols-2 gap-4">
          <div>
            <div class="mb-1 text-[9px] font-mono uppercase text-outline-variant">Allocation</div>
            <div class="text-xs font-bold text-on-surface">${escapeHtml(
              formatBytes(connection.sizeBytes)
            )}</div>
          </div>
          <div>
            <div class="mb-1 text-[9px] font-mono uppercase text-outline-variant">Last Modified</div>
            <div class="text-xs font-bold text-on-surface">${escapeHtml(
              formatDateTime(connection.lastModifiedAt)
            )}</div>
          </div>
          <div>
            <div class="mb-1 text-[9px] font-mono uppercase text-outline-variant">Last Opened</div>
            <div class="text-xs font-bold text-on-surface">${escapeHtml(
              formatDateTime(connection.lastOpenedAt)
            )}</div>
          </div>
          <div>
            <div class="mb-1 text-[9px] font-mono uppercase text-outline-variant">Mode</div>
            <div class="text-xs font-bold text-on-surface">${connection.readOnly ? "Read only" : "Read / Write"}</div>
          </div>
        </div>
      </div>
      <div class="border-t border-outline-variant/10 bg-surface-container-low px-4 py-3">
        <div class="grid grid-cols-[minmax(0,1fr)_5.1rem_5.8rem] gap-2">
          <button
            class="clipped-corner min-w-0 bg-primary-container px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-on-primary shadow-[0_0_18px_-10px_rgba(252,227,0,0.7)] transition-[filter,box-shadow] hover:brightness-105"
            data-action="select-connection"
            data-connection-id="${escapeHtml(connection.id)}"
            style="--clip-path: ${clipPath};"
            type="button"
            title="${primaryActionLabel}"
          >
            ${primaryActionLabel}
          </button>
          <button
            class="border border-outline-variant/20 bg-surface-container px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant transition-colors hover:bg-surface-container-highest"
            data-action="edit-connection"
            data-connection-id="${escapeHtml(connection.id)}"
            type="button"
          >
            Edit
          </button>
          <button
            class="border border-outline-variant/20 bg-surface-container px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant transition-colors hover:bg-surface-container-highest"
            data-action="remove-connection"
            data-connection-id="${escapeHtml(connection.id)}"
            type="button"
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  `;
}
