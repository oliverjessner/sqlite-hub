import { renderConnectionCard } from "../components/connectionCard.js";
import { renderPageHeader } from "../components/pageHeader.js";
import { escapeHtml } from "../utils/format.js";

function renderConnectionsActionButton({
  label,
  icon,
  modal,
  tone = "secondary",
  className = "",
}) {
  const clipPath = "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)";
  const toneClassName =
    tone === "primary"
      ? "clipped-corner border border-primary-container bg-primary-container text-on-primary shadow-[0_0_18px_-10px_rgba(252,227,0,0.65)] hover:bg-primary-fixed"
      : "clipped-corner border border-outline-variant/20 bg-surface-container-highest text-primary-container shadow-[inset_2px_0_0_0_rgba(252,227,0,0.95)] hover:bg-surface-bright";
  const iconClassName =
    tone === "primary"
      ? "text-base text-on-primary"
      : "text-base text-primary-container/90";
  const clipStyle = `style="--clip-path: ${clipPath};"`;

  return `
    <button
      class="flex h-11 items-center justify-between gap-6 px-5 font-headline text-xs font-bold uppercase tracking-[0.18em] transition-colors ${toneClassName} ${className}"
      data-action="open-modal"
      data-modal="${modal}"
      ${clipStyle}
      type="button"
    >
      <span>${label}</span>
      <span class="material-symbols-outlined ${iconClassName}">${icon}</span>
    </button>
  `;
}

function renderConnectionsBody(state) {
  if (state.connections.loading && !state.connections.recent.length) {
    return `
      <div class="flex min-h-[280px] items-center justify-center border border-outline-variant/10 bg-surface-container-low">
        <div class="text-center text-on-surface-variant/40">
          <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
          <p class="font-mono text-[10px] uppercase tracking-[0.22em]">LOADING_CONNECTIONS</p>
        </div>
      </div>
    `;
  }

  if (state.connections.error) {
    return `
      <div class="border border-error/20 bg-error-container/10 px-6 py-5 text-sm text-on-surface">
        <div class="font-headline text-xs font-bold uppercase tracking-[0.18em] text-error">
          ${escapeHtml(state.connections.error.code)}
        </div>
        <div class="mt-2">${escapeHtml(state.connections.error.message)}</div>
      </div>
    `;
  }

  if (!state.connections.recent.length) {
    return `
      <div class="border border-dashed border-outline-variant/20 bg-surface-container-low px-8 py-10 text-center">
        <span class="material-symbols-outlined mb-3 text-5xl text-on-surface-variant/25">database_off</span>
        <p class="font-headline text-xl font-black uppercase tracking-tight text-primary-container">
          No Recorded SQLite Connections
        </p>
        <p class="mx-auto mt-3 max-w-xl text-sm leading-7 text-on-surface-variant/65">
          Open an existing SQLite database or create a new one to add your first connection.
        </p>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          ${renderConnectionsActionButton({
            label: "Open Database",
            icon: "folder_open",
            modal: "open-connection",
            tone: "primary",
            className: "min-w-[17rem] px-8 py-6 text-sm",
          })}
          ${renderConnectionsActionButton({
            label: "Create Database",
            icon: "note_add",
            modal: "create-connection",
            className: "min-w-[17rem] px-8 py-6 text-sm",
          })}
        </div>
      </div>
    `;
  }

  return `
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      ${state.connections.recent
        .map((connection) =>
          renderConnectionCard(connection, state.connections.active?.id)
        )
        .join("")}
    </div>
  `;
}

export function renderConnectionsView(state) {
  const actions = `
    ${renderConnectionsActionButton({
      label: "Open Database",
      icon: "folder_open",
      modal: "open-connection",
      tone: "primary",
      className: "min-w-[13rem]",
    })}
    ${renderConnectionsActionButton({
      label: "Create Database",
      icon: "note_add",
      modal: "create-connection",
      className: "min-w-[13rem]",
    })}
  `;

  return {
    main: `
      <section class="view-surface relative min-h-full overflow-hidden">
        <div class="data-grid-texture pointer-events-none absolute inset-0"></div>
        <div class="view-frame relative z-10">
          ${renderPageHeader({
            title: "Connections",
            subtitle: `Registry // Recent_Targets: ${String(state.connections.recent.length).padStart(2, "0")}`,
            actions,
          })}
          ${renderConnectionsBody(state)}
        </div>
      </section>
    `,
    panel: "",
  };
}
