import { renderStatusBadge } from '../components/badges.js';
import { renderPageHeader } from '../components/pageHeader.js';
import { escapeHtml, formatBytes, formatCompactDateTime, truncateMiddle } from '../utils/format.js';

const STATUS_TONE = {
    creating: 'muted',
    verifying: 'muted',
    verified: 'success',
    failed: 'alert',
    restoring: 'muted',
};

function formatStatus(value) {
    return String(value ?? 'unknown')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function renderBackupStatus(backup) {
    if (!backup.fileExists) {
        return renderStatusBadge('File Missing', 'alert');
    }

    return renderStatusBadge(formatStatus(backup.status), STATUS_TONE[backup.status] ?? 'muted');
}

function isBackupBusy(backup, state) {
    return Boolean(state.backups.operationLoading) || ['creating', 'verifying', 'restoring'].includes(backup.status);
}

function renderBackupMetadataItem(label, value, extraClass = '') {
    return `
      <div class="border border-outline-variant/10 bg-surface-container-lowest px-3 py-2 ${extraClass}">
        <div class="font-mono text-[9px] uppercase tracking-[0.16em] text-on-surface-variant/45">${escapeHtml(label)}</div>
        <div class="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-on-surface/80">${escapeHtml(value)}</div>
      </div>
    `;
}

function renderBackupMetadata(backup) {
    return `
      <div class="grid min-w-[24rem] grid-cols-2 gap-2">
        ${renderBackupMetadataItem('Size', formatBytes(backup.sizeBytes))}
        <div class="border border-outline-variant/10 bg-surface-container-lowest px-3 py-2">
          <div class="font-mono text-[9px] uppercase tracking-[0.16em] text-on-surface-variant/45">Status</div>
          <div class="mt-1">${renderBackupStatus(backup)}</div>
        </div>
        ${renderBackupMetadataItem('SQLite Hub', backup.sqliteHubVersion ? `v${backup.sqliteHubVersion}` : 'n/a')}
        ${renderBackupMetadataItem('SQLite', backup.sqliteVersion ? `v${backup.sqliteVersion}` : 'n/a')}
      </div>
    `;
}

function renderBackupRows(state) {
    return state.backups.items
        .map(backup => {
            const busy = isBackupBusy(backup, state);
            const canRestore = backup.status === 'verified' && backup.fileExists && !busy && !state.connections.active?.readOnly;
            const canDownload = backup.fileExists && !busy;
            const canEditNotes = !busy;
            const canDelete = !busy;

            return `
        <tr class="border-b border-outline-variant/10 align-top">
          <td class="min-w-[20rem] px-4 py-5">
            <div class="space-y-2">
              <div class="font-body text-sm font-black uppercase text-on-surface">${escapeHtml(backup.name)}</div>
              <div class="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant/45" title="${escapeHtml(backup.path)}">
                ${escapeHtml(truncateMiddle(backup.fileName || backup.path, 48))}
              </div>
              <div class="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant/55">
                Created // ${escapeHtml(formatCompactDateTime(backup.createdAt))}
              </div>
            </div>
          </td>
          <td class="px-4 py-5">
            ${renderBackupMetadata(backup)}
          </td>
          <td class="min-w-[18rem] max-w-[24rem] px-4 py-5">
            <div class="flex h-full flex-col items-start gap-3">
              <div class="text-xs leading-6 text-on-surface-variant/70">
                ${backup.notes ? escapeHtml(backup.notes) : '<span class="text-on-surface-variant/35">No notes</span>'}
                ${backup.errorMessage ? `<div class="mt-2 text-error">${escapeHtml(backup.errorMessage)}</div>` : ''}
              </div>
              <button class="standard-button" data-action="open-edit-backup-notes-modal" data-backup-id="${escapeHtml(backup.id)}" type="button" ${canEditNotes ? '' : 'disabled'}>
                <span class="material-symbols-outlined text-sm">edit_note</span>
                Edit Notes
              </button>
            </div>
          </td>
          <td class="px-4 py-5">
            <div class="flex min-w-[10rem] flex-col items-stretch gap-2">
              <button class="standard-button" data-action="open-restore-backup-modal" data-backup-id="${escapeHtml(backup.id)}" type="button" ${canRestore ? '' : 'disabled'}>
                <span class="material-symbols-outlined text-sm">restore</span>
                Restore
              </button>
              <button class="standard-button" data-action="download-backup" data-backup-id="${escapeHtml(backup.id)}" type="button" ${canDownload ? '' : 'disabled'}>
                <span class="material-symbols-outlined text-sm">download</span>
                Download
              </button>
              <button class="delete-button" data-action="open-delete-backup-modal" data-backup-id="${escapeHtml(backup.id)}" type="button" ${canDelete ? '' : 'disabled'}>
                <span class="material-symbols-outlined text-sm">delete</span>
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
        })
        .join('');
}

function renderBackupsBody(state) {
    if (state.backups.loading) {
        return `
      <div class="flex min-h-[280px] items-center justify-center border border-outline-variant/10 bg-surface-container-low">
        <div class="text-center text-on-surface-variant/40">
          <span class="material-symbols-outlined mb-3 text-4xl">progress_activity</span>
          <p class="font-mono text-[10px] uppercase tracking-[0.22em]">LOADING_BACKUPS</p>
        </div>
      </div>
    `;
    }

    if (state.backups.error) {
        return `
      <div class="border border-error/20 bg-error-container/10 px-6 py-5 text-sm text-on-surface">
        <div class="font-body text-xs font-bold uppercase tracking-[0.18em] text-error">
          ${escapeHtml(state.backups.error.code)}
        </div>
        <div class="mt-2">${escapeHtml(state.backups.error.message)}</div>
      </div>
    `;
    }

    if (!state.backups.items.length) {
        return `
      <div class="border border-dashed border-outline-variant/20 bg-surface-container-low px-8 py-10 text-center">
        <span class="material-symbols-outlined mb-3 text-5xl text-on-surface-variant/25">inventory_2</span>
        <p class="font-body text-xl font-black uppercase tracking-tight text-primary-container">
          No backups yet
        </p>
        <p class="mx-auto mt-3 max-w-xl text-sm leading-7 text-on-surface-variant/65">
          Create a backup to protect your database before making significant changes.
        </p>
        <div class="mt-6 flex items-center justify-center">
          <button class="signature-button" data-action="open-create-backup-modal" type="button">
            <span class="material-symbols-outlined text-sm">inventory_2</span>
            Create backup
          </button>
        </div>
      </div>
    `;
    }

    return `
    <div class="overflow-auto border border-outline-variant/10 bg-surface-container-low">
      <table class="min-w-full border-collapse text-left">
        <thead class="border-b border-outline-variant/10 bg-surface-container">
          <tr class="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/55">
            <th class="px-4 py-3 font-normal">Backup</th>
            <th class="px-4 py-3 font-normal">Metadata</th>
            <th class="px-4 py-3 font-normal">Note</th>
            <th class="px-4 py-3 text-right font-normal">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${renderBackupRows(state)}
        </tbody>
      </table>
    </div>
  `;
}

export function renderBackupsView(state) {
    const activeLabel = state.connections.active?.label ?? 'No active database';
    const actions = `
      <button class="standard-button" data-action="refresh-backups" type="button" ${state.backups.loading ? 'disabled' : ''}>
        <span class="material-symbols-outlined text-sm">refresh</span>
        Refresh
      </button>
      <button class="signature-button" data-action="open-create-backup-modal" type="button" ${state.backups.operationLoading ? 'disabled' : ''}>
        <span class="material-symbols-outlined text-sm">inventory_2</span>
        Create backup
      </button>
    `;

    return {
        main: `
      <section class="view-surface relative min-h-full overflow-hidden">
        <div class="data-grid-texture pointer-events-none absolute inset-0"></div>
        <div class="view-frame relative z-10">
          ${renderPageHeader({
              title: 'Backups',
              subtitle: `Active // ${activeLabel}`,
              actions,
          })}
          ${renderBackupsBody(state)}
        </div>
      </section>
    `,
        panel: '',
    };
}
