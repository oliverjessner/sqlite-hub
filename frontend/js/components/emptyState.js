import {
  escapeHtml,
  formatBytes,
  formatDateTime,
  truncateMiddle,
} from "../utils/format.js";
import { renderConnectionLogo } from "./connectionLogo.js";

function renderRecentConnectionButton(connection) {
  return [
    '<button class="control-button flex items-center gap-2 border border-outline-variant/15 bg-surface-container-low px-4 text-left text-on-surface transition-colors hover:border-primary-container/30 hover:bg-surface-container-high" data-action="select-connection" data-connection-id="',
    escapeHtml(connection.id),
    '" type="button">',
    renderConnectionLogo(connection, {
      containerClass:
        "flex h-8 w-8 items-center justify-center overflow-hidden bg-surface-container-highest",
      imageClassName: "h-full w-full object-cover",
      iconClassName: "text-sm text-primary-container",
    }),
    '<span class="min-w-0"><span class="block truncate font-mono text-xs">',
    escapeHtml(connection.label),
    '</span><span class="block truncate text-[10px] text-on-surface-variant/45">',
    escapeHtml(truncateMiddle(connection.path, 34)),
    "</span></span></button>",
  ].join("");
}

function renderRecentConnections(recentConnections = []) {
  if (!recentConnections.length) {
    return `
      <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/40">
        No recent SQLite databases recorded yet.
      </div>
    `;
  }

  return `
    <div class="flex flex-wrap justify-center gap-4">
      ${recentConnections
        .slice(0, 4)
        .map((connection) => renderRecentConnectionButton(connection))
        .join("")}
    </div>
  `;
}

function renderActiveConnection(activeConnection) {
  if (!activeConnection) {
    return `
      <p class="font-light text-lg uppercase tracking-wide text-on-surface-variant">
        No database connected
      </p>
    `;
  }

  return `
    <div class="mx-auto max-w-2xl border border-outline-variant/15 bg-surface-container-low px-6 py-5 text-left">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-start gap-4">
          ${renderConnectionLogo(activeConnection, {
            containerClass:
              "flex h-14 w-14 items-center justify-center overflow-hidden border border-outline-variant/15 bg-surface-container-highest",
            imageClassName: "h-full w-full object-cover",
            iconClassName: "text-2xl text-primary-container",
          })}
          <div>
            <p class="text-[10px] font-mono uppercase tracking-[0.24em] text-primary-container/70">
              ACTIVE_DATABASE
            </p>
            <h2 class="mt-2 font-headline text-2xl font-black uppercase tracking-tight text-primary-container">
              ${escapeHtml(activeConnection.label)}
            </h2>
            <p class="mt-2 font-mono text-[10px] text-on-surface-variant/55">${escapeHtml(
              truncateMiddle(activeConnection.path, 72)
            )}</p>
          </div>
        </div>
        <div class="text-right text-xs text-on-surface-variant/65">
          <div>${escapeHtml(formatBytes(activeConnection.sizeBytes))}</div>
          <div class="mt-1">${escapeHtml(formatDateTime(activeConnection.lastModifiedAt))}</div>
          <div class="mt-1">${activeConnection.readOnly ? "READ_ONLY" : "READ_WRITE"}</div>
        </div>
      </div>
    </div>
  `;
}

export function renderEmptyState({ activeConnection, recentConnections = [] }) {
  const hasActive = Boolean(activeConnection);

  return `
    <section class="landing-view machined-grid px-6">
      <div class="landing-accent landing-accent--a"></div>
      <div class="landing-accent landing-accent--b"></div>
      <div class="landing-accent--c absolute"></div>
      <div class="empty-state-shell z-10 text-center">
        <div class="mb-2">
          <span class="font-mono text-[10px] tracking-[0.3em] text-primary-container/40">
            SYSTEM_READY // ${hasActive ? "ACTIVE_CONTEXT" : "IDLE_STATE"}
          </span>
        </div>
        <h1 class="mb-4 font-headline text-7xl font-black tracking-tighter text-primary-container opacity-90 md:text-9xl">
          SQLite Hub
        </h1>
        <div class="mx-auto mb-12 max-w-3xl space-y-4">
          ${renderActiveConnection(activeConnection)}
          <div class="h-[2px] w-12 bg-primary-container mx-auto"></div>
        </div>
        <div class="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 px-6 md:grid-cols-2">
          <button
            class="landing-primary-action clipped-btn group flex items-center justify-between bg-primary-container px-8 py-6 font-headline text-lg font-bold transition-all duration-300 hover:shadow-[0_0_20px_rgba(252,227,0,0.3)]"
            data-action="open-modal"
            data-modal="open-connection"
            style="--clip-path: polygon(0 0, 90% 0, 100% 25%, 100% 100%, 0 100%);"
            type="button"
          >
            <span>CONNECT DATABASE</span>
            <span class="material-symbols-outlined transition-transform group-hover:translate-x-1">add_circle</span>
          </button>
          <button
            class="flex items-center justify-between border-l-2 border-primary-container bg-surface-container-highest px-8 py-6 font-headline text-lg font-bold text-primary-container transition-colors duration-150 hover:bg-surface-bright"
            data-action="open-modal"
            data-modal="create-connection"
            type="button"
          >
            <span>CREATE DATABASE</span>
            <span class="material-symbols-outlined">note_add</span>
          </button>
        </div>
        ${
          hasActive
            ? `
              <div class="mx-auto mt-8 grid w-full max-w-3xl grid-cols-1 gap-4 px-6 md:grid-cols-3">
                <button
                  class="standard-button"
                  data-action="navigate"
                  data-to="/overview"
                  type="button"
                >
                  Overview
                </button>
                <button
                  class="standard-button"
                  data-action="navigate"
                  data-to="/structure"
                  type="button"
                >
                  Structure
                </button>
                <button
                  class="standard-button"
                  data-action="navigate"
                  data-to="/editor"
                  type="button"
                >
                  SQL Editor
                </button>
              </div>
            `
            : ""
        }
        <div class="mt-16 flex flex-col items-center gap-4 opacity-70 transition-opacity hover:opacity-100">
          <p class="font-mono text-[10px] tracking-widest text-on-surface-variant">RECENT_TARGETS</p>
          ${renderRecentConnections(recentConnections)}
        </div>
      </div>
      <div class="pointer-events-none absolute bottom-0 left-0 h-1/3 w-full bg-gradient-to-t from-surface-container-lowest to-transparent"></div>
    </section>
  `;
}
