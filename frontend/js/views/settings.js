import { renderPageHeader } from '../components/pageHeader.js';
import { escapeHtml } from '../utils/format.js';

function renderSettingsContent(state) {
    if (state.settings.loading && !state.settings.appVersion) {
        return `
      <div class="flex min-h-[280px] items-center justify-center border border-outline-variant/10 bg-surface-container-low">
        <div class="text-center text-on-surface-variant/40">
          <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
          <p class="font-mono text-[10px] uppercase tracking-[0.22em]">LOADING_SETTINGS</p>
        </div>
      </div>
    `;
    }

    if (state.settings.error) {
        return `
      <div class="border border-error/20 bg-error-container/10 px-6 py-5 text-sm text-on-surface">
        <div class="font-headline text-xs font-bold uppercase tracking-[0.18em] text-error">
          ${escapeHtml(state.settings.error.code)}
        </div>
        <div class="mt-2">${escapeHtml(state.settings.error.message)}</div>
      </div>
    `;
    }

    const appVersion = escapeHtml(state.settings.appVersion ?? '0.0.0');
    const sqliteVersion = escapeHtml(state.settings.sqliteVersion ?? 'unknown');

    return `
    <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <section class="shell-section overflow-hidden">
        <div class="flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-highest px-4 py-2">
          <span class="text-[10px] font-bold uppercase tracking-[0.25em]">Application</span>
          <span class="material-symbols-outlined text-xs text-primary-container">deployed_code</span>
        </div>
        <div class="space-y-5 p-6">
          <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <div class="text-[10px] font-mono uppercase tracking-[0.2em] text-on-surface-variant/60">
                Current_Version
              </div>
              <div class="mt-2 font-headline text-4xl font-black uppercase tracking-tight text-primary-container">
                v${appVersion}
              </div>
            </div>
            <div>
              <div class="text-[10px] font-mono uppercase tracking-[0.2em] text-on-surface-variant/60">
                SQLite_Runtime
              </div>
              <div class="mt-2 font-headline text-4xl font-black uppercase tracking-tight text-primary-container">
                ${sqliteVersion}
              </div>
            </div>
          </div>
          <div class="border-t border-outline-variant/10 py-4 text-sm leading-6 text-on-surface-variant">
            SQL functions and syntax are evaluated with this SQLite runtime.
          </div>
        </div>
      </section>

      <section class="shell-section overflow-hidden">
        <div class="flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-highest px-4 py-2">
          <span class="text-[10px] font-bold uppercase tracking-[0.25em]">CLI</span>
          <span class="material-symbols-outlined text-xs text-primary-container">terminal</span>
        </div>
        <div class="space-y-4 p-6">
          <div>
            <div class="text-[10px] font-mono uppercase tracking-[0.2em] text-on-surface-variant/60">
              Custom_Port
            </div>
            <div class="mt-3 border border-outline-variant/10 bg-surface-container-high px-4 py-3 font-mono text-sm text-primary-container">
              sqlite-hub --port:PORT
            </div>
          </div>
          <div class="text-sm leading-6 text-on-surface-variant">
            Start SQLite Hub with a different local port when the default port is already in use.
          </div>
        </div>
      </section>

      <section class="shell-section overflow-hidden">
        <div class="flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-highest px-4 py-2">
          <span class="text-[10px] font-bold uppercase tracking-[0.25em]">Copyright</span>
          <span class="material-symbols-outlined text-xs text-primary-container">badge</span>
        </div>
        <div class="space-y-4 p-6">
          <div class="text-sm leading-7 text-on-surface">
            Copyright Oliver Jessner
          </div>
          <a
            class="standard-button"
            href="https://oliverjessner.at"
            rel="noreferrer"
            target="_blank"
          >
            <span class="material-symbols-outlined text-sm">open_in_new</span>
            Open Website
          </a>
        </div>
      </section>

      <section class="shell-section overflow-hidden">
        <div class="flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-highest px-4 py-2">
          <span class="text-[10px] font-bold uppercase tracking-[0.25em]">Source Code</span>
          <span class="material-symbols-outlined text-xs text-primary-container">badge</span>
        </div>
        <div class="space-y-4 p-6">
          <div class="text-sm leading-7 text-on-surface">
            Open Source Code
          </div>
          <a
            class="standard-button"
            href="https://github.com/oliverjessner/sqlite-hub"
            rel="noreferrer"
            target="_blank"
          >
            <span class="material-symbols-outlined text-sm">open_in_new</span>
            Open Github 
          </a>
        </div>
      </section>
    </div>
  `;
}

export function renderSettingsView(state) {
    return {
        main: `
      <section class="view-surface min-h-full bg-surface-container">
        <div class="view-frame mx-auto max-w-6xl space-y-8">
          ${renderPageHeader({
              title: 'Settings',
              subtitle: 'Application // Build + Credits',
          })}
          ${renderSettingsContent(state)}
        </div>
      </section>
    `,
        panel: '',
    };
}
