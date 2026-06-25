export function renderTopNav() {
    return `
    <div class="top-nav-shell">
      <a class="top-nav-brand" href="#/">SQLite Hub</a>
      <div class="top-nav-actions">
        <button class="top-nav-icon" data-action="navigate" data-to="/logs" type="button" aria-label="Logs">
          <span class="material-symbols-outlined">receipt_long</span>
        </button>
      </div>
    </div>
  `;
}
