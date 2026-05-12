export function renderAppShell() {
  return `
    <div class="app-shell">
      <header id="top-nav" class="app-top-nav bg-[#131313]"></header>
      <div class="app-body">
        <aside id="sidebar" class="app-sidebar sidebar-shell"></aside>
        <main class="app-main">
          <div id="app-view" class="app-main-scroll app-view custom-scrollbar"></div>
        </main>
        <aside id="app-panel" class="app-right-panel"></aside>
      </div>
      <footer id="status-bar" class="app-status-bar"></footer>
    </div>
    <div id="modal-root"></div>
    <div id="toast-root"></div>
  `;
}
