import { renderPageHeader } from '../components/pageHeader.js';
import { renderTextInput } from '../components/formControls.js';
import { escapeHtml, formatCompactDateTime, formatNumber } from '../utils/format.js';

function renderSettingsNavigation(activeSection) {
    const items = [
        { id: 'information', icon: 'info', label: 'Information' },
        { id: 'api-tokens', icon: 'key', label: 'API Tokens' },
    ];

    return `
      <nav class="flex flex-wrap gap-2 border-b border-outline-variant/10 pb-4" aria-label="Settings sections">
        ${items
            .map(
                item => `
              <button
                class="query-history-tab ${activeSection === item.id ? 'is-active' : ''}"
                aria-current="${activeSection === item.id ? 'page' : 'false'}"
                data-action="set-settings-section"
                data-section="${item.id}"
                type="button"
              >
                <span class="material-symbols-outlined text-sm mr-[5px]">${item.icon}</span>
                ${item.label}
              </button>
            `,
            )
            .join('')}
      </nav>
    `;
}

function renderVersionCheckStatus(settings) {
    const result = settings.versionCheck;
    const error = settings.versionCheckError;

    if (error) {
        return `
          <div class="border border-error/20 bg-error-container/10 px-4 py-3 text-sm text-on-surface">
            <div class="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-error">
              ${escapeHtml(error.code ?? 'VERSION_CHECK_FAILED')}
            </div>
            <div class="mt-1 text-on-surface-variant">${escapeHtml(error.message ?? 'Version check failed.')}</div>
          </div>
        `;
    }

    if (!result) {
        return `
          <div class="border border-outline-variant/10 bg-surface-container-high px-4 py-3 text-sm text-on-surface-variant">
            No version check has been run yet.
          </div>
        `;
    }

    const updateAvailable = Boolean(result.updateAvailable);
    const releaseLink =
        updateAvailable && result.releaseUrl
            ? `
              <a
                class="standard-button"
                href="${escapeHtml(result.releaseUrl)}"
                rel="noreferrer"
                target="_blank"
              >
                <span class="material-symbols-outlined text-sm">open_in_new</span>
                Open Release
              </a>
            `
            : '';

    return `
      <div class="border ${
          updateAvailable ? 'border-primary-container/30 bg-primary-container/5' : 'border-outline-variant/10 bg-surface-container-high'
      } px-4 py-3">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <div class="font-mono text-[10px] font-bold uppercase tracking-[0.18em] ${
                updateAvailable ? 'text-primary-container' : 'text-on-surface-variant/70'
            }">
              ${updateAvailable ? 'New Version Available' : 'Up To Date'}
            </div>
            <div class="mt-1 text-sm text-on-surface-variant">
              Current v${escapeHtml(result.currentVersion ?? '0.0.0')} · Latest v${escapeHtml(result.latestVersion ?? 'unknown')}
            </div>
          </div>
          ${releaseLink}
        </div>
      </div>
    `;
}

function renderApiTokenRow(token, tokenSaving) {
    const callCount = Number(token.callCount ?? 0);
    const createdAt = token.createdAt ? formatCompactDateTime(token.createdAt) : 'Unknown';
    const lastCallAt = token.lastCallAt ? formatCompactDateTime(token.lastCallAt) : 'Never';

    return `
      <div class="grid grid-cols-1 gap-4 border-t border-outline-variant/10 bg-surface-container-high px-4 py-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(8rem,0.75fr)_7rem_minmax(8rem,0.85fr)_8rem] xl:items-center">
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-on-surface" title="${escapeHtml(token.name)}">
            ${escapeHtml(token.name)}
          </div>
          <div
            class="mt-2 inline-flex max-w-full border border-outline-variant/10 bg-surface-container-lowest px-3 py-1 font-mono text-[11px] text-primary-container"
            title="${escapeHtml(token.tokenPrefix ?? '')}"
          >
            <span class="truncate">${escapeHtml(token.tokenPrefix)}...</span>
          </div>
        </div>
        <div>
          <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/45 xl:hidden">Created</div>
          <div class="mt-1 font-mono text-[11px] text-on-surface-variant/75 xl:mt-0" title="${escapeHtml(token.createdAt ?? 'unknown')}">
            ${escapeHtml(createdAt)}
          </div>
        </div>
        <div>
          <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/45 xl:hidden">Calls</div>
          <div class="mt-1 font-mono text-lg font-bold text-on-surface xl:mt-0">
            ${escapeHtml(formatNumber(callCount))}
          </div>
        </div>
        <div>
          <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/45 xl:hidden">Last Call</div>
          <div class="mt-1 font-mono text-[11px] text-on-surface-variant/75 xl:mt-0" title="${escapeHtml(token.lastCallAt ?? 'never')}">
            ${escapeHtml(lastCallAt)}
          </div>
        </div>
        <div class="flex xl:justify-end">
          <button
            class="delete-button"
            data-action="open-delete-api-token-modal"
            data-token-id="${escapeHtml(token.id)}"
            type="button"
            ${tokenSaving ? 'disabled' : ''}
          >
            <span class="material-symbols-outlined text-sm">delete</span>
            Delete
          </button>
        </div>
      </div>
    `;
}

function renderApiTokenRows(apiTokens, tokenSaving) {
    if (!apiTokens.length) {
        return `
          <div class="border border-outline-variant/10 bg-surface-container-high px-4 py-5 text-sm text-on-surface-variant">
            No API tokens exist for this database.
          </div>
        `;
    }

    return `
      <div class="overflow-hidden border border-outline-variant/10">
        <div class="hidden bg-surface-container-highest px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/55 xl:grid xl:grid-cols-[minmax(0,1.35fr)_minmax(8rem,0.75fr)_7rem_minmax(8rem,0.85fr)_8rem]">
          <div>Token</div>
          <div>Created</div>
          <div>Calls</div>
          <div>Last Call</div>
          <div class="text-right">Actions</div>
        </div>
        ${apiTokens.map(token => renderApiTokenRow(token, tokenSaving)).join('')}
      </div>
    `;
}

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
        <div class="font-body text-xs font-bold uppercase tracking-[0.18em] text-error">
          ${escapeHtml(state.settings.error.code)}
        </div>
        <div class="mt-2">${escapeHtml(state.settings.error.message)}</div>
      </div>
    `;
    }

    const activeSection = state.settings.section === 'api-tokens' ? 'api-tokens' : 'information';
    const appVersion = escapeHtml(state.settings.appVersion ?? '0.0.0');
    const sqliteVersion = escapeHtml(state.settings.sqliteVersion ?? 'unknown');
    const versionCheckLoading = Boolean(state.settings.versionCheckLoading);
    const tokenDatabase = state.settings.tokenDatabase;
    const apiTokens = state.settings.apiTokens ?? [];
    const createdApiToken = state.settings.createdApiToken;
    const tokenSaving = Boolean(state.settings.tokenSaving);
    const tokenItems = renderApiTokenRows(apiTokens, tokenSaving);
    const tokenSection = tokenDatabase
        ? `
          <div class="space-y-5">
            <div class="space-y-3">
              <div class="text-sm font-semibold text-on-surface">${escapeHtml(tokenDatabase.label)}</div>
              <div>
                <div class="text-[10px] font-mono uppercase tracking-[0.2em] text-on-surface-variant/60">
                  Database ID
                </div>
                <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                  <div
                    class="min-w-0 flex-1 break-all border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 font-mono text-sm text-primary-container"
                    data-database-id
                  >${escapeHtml(tokenDatabase.id)}</div>
                  <button class="standard-button w-full self-center justify-center" data-action="copy-database-id" type="button">
                    <span class="material-symbols-outlined text-sm">content_copy</span>
                    Copy ID
                  </button>
                </div>
              </div>
            </div>
            <form class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]" data-form="create-api-token">
              ${renderTextInput({
                  className: 'min-w-0 flex-1',
                  dataAttributes: { apiTokenName: true },
                  maxlength: 80,
                  name: 'name',
                  placeholder: 'Token name',
              })}
              <button class="standard-button w-full self-center justify-center" type="submit" ${tokenSaving ? 'disabled' : ''}>
                Create Token
              </button>
            </form>
            ${
                createdApiToken?.token
                    ? `
                <div class="border border-primary-container/20 bg-primary-container/5 p-4">
                  <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">Shown once</div>
                  <div class="mt-2 text-sm text-on-surface-variant">Store this token now. SQLite Hub only keeps its hash.</div>
                  <div class="mt-3 flex flex-col gap-2 sm:flex-row">
                    ${renderTextInput({
                        className: 'min-w-0 flex-1 font-mono',
                        dataAttributes: { createdApiToken: true },
                        readonly: true,
                        value: createdApiToken.token,
                    })}
                    <button class="standard-button" data-action="copy-created-api-token" type="button">Copy</button>
                  </div>
                </div>
              `
                    : ''
            }
            <div class="space-y-2">${tokenItems}</div>
          </div>
        `
        : '<div class="text-sm leading-6 text-on-surface-variant">Select a database before creating database-specific API tokens.</div>';

    const informationSection = `
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
              <div class="mt-2 font-body text-4xl font-black uppercase tracking-tight text-primary-container">
                v${appVersion}
              </div>
            </div>
            <div>
              <div class="text-[10px] font-mono uppercase tracking-[0.2em] text-on-surface-variant/60">
                SQLite_Runtime
              </div>
              <div class="mt-2 font-body text-4xl font-black uppercase tracking-tight text-primary-container">
                ${sqliteVersion}
              </div>
            </div>
          </div>
          <div class="border-t border-outline-variant/10 py-4 text-sm leading-6 text-on-surface-variant">
            SQL functions and syntax are evaluated with this SQLite runtime.
          </div>
          <div class="border-t border-outline-variant/10 pt-4">
            <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="text-[10px] font-mono uppercase tracking-[0.2em] text-on-surface-variant/60">
                Version_Check
              </div>
              <button
                class="standard-button"
                data-action="check-app-version"
                type="button"
                ${versionCheckLoading ? 'disabled aria-disabled="true"' : ''}
              >
                <span class="material-symbols-outlined text-sm">${versionCheckLoading ? 'progress_activity' : 'sync'}</span>
                ${versionCheckLoading ? 'Checking...' : 'Check Updates'}
              </button>
            </div>
            ${renderVersionCheckStatus(state.settings)}
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
    const apiTokensSection = `
      <section class="shell-section overflow-hidden">
        <div class="flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-highest px-4 py-2">
          <span class="text-[10px] font-bold uppercase tracking-[0.25em] mr-px">API Tokens</span>
          <span class="material-symbols-outlined text-xs text-primary-container">key</span>
        </div>
        <div class="p-6">
          ${tokenSection}
        </div>
      </section>
    `;

    return `
      <div class="space-y-6">
        ${renderSettingsNavigation(activeSection)}
        ${activeSection === 'api-tokens' ? apiTokensSection : informationSection}
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
              subtitle:
                  state.settings.section === 'api-tokens'
                      ? 'Security // Database API access'
                      : 'Application // Build + Credits',
          })}
          ${renderSettingsContent(state)}
        </div>
      </section>
    `,
        panel: '',
    };
}
