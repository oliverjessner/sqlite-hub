export function renderTopNav() {
    return `
    <div class="top-nav-shell">
      <a class="top-nav-brand" href="#/">SQLite Hub</a>
      <div class="top-nav-actions">
        <button
          class="top-nav-icon"
          data-action="open-modal"
          data-modal="open-connection"
          type="button"
          aria-label="Open Database"
        >
          <span class="material-symbols-outlined">folder_open</span>
        </button>
        <button class="top-nav-icon" data-action="navigate" data-to="/editor" type="button" aria-label="SQL Editor">
          <span class="material-symbols-outlined">terminal</span>
        </button>
        <button class="top-nav-icon" data-action="navigate" data-to="/settings" type="button" aria-label="Settings">
          <span class="material-symbols-outlined">settings</span>
        </button>
      </div>
    </div>
  `;
}
