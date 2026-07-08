import { renderStatusBadge } from '../components/badges.js';
import { renderPageHeader } from '../components/pageHeader.js';
import {
    escapeHtml,
    formatBytes,
    formatCellValue,
    formatCompactDateTime,
    formatDateTime,
    formatNumber,
    truncateMiddle,
} from '../utils/format.js';

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

function isBackupForActiveConnection(backup, state) {
    const activeConnection = state.connections.active;

    if (!activeConnection) {
        return false;
    }

    if (backup.connectionId && String(backup.connectionId) === String(activeConnection.id)) {
        return true;
    }

    return Boolean(backup.sourcePath && activeConnection.path && backup.sourcePath === activeConnection.path);
}

function renderBackupMetadataItem(label, value, extraClass = '') {
    return `
      <div class="min-w-0 border border-outline-variant/10 bg-surface-container-lowest px-3 py-2 ${extraClass}">
        <div class="font-mono text-[9px] uppercase tracking-[0.16em] text-on-surface-variant/45">${escapeHtml(label)}</div>
        <div class="mt-1 break-words font-mono text-[10px] uppercase tracking-[0.1em] text-on-surface/80">${escapeHtml(value)}</div>
      </div>
    `;
}

function renderBackupMetadata(backup) {
    return `
      <div class="grid min-w-0 grid-cols-2 gap-2">
        ${renderBackupMetadataItem('Size', formatBytes(backup.sizeBytes))}
        <div class="min-w-0 border border-outline-variant/10 bg-surface-container-lowest px-3 py-2">
          <div class="font-mono text-[9px] uppercase tracking-[0.16em] text-on-surface-variant/45">Status</div>
          <div class="mt-1">${renderBackupStatus(backup)}</div>
        </div>
        ${renderBackupMetadataItem('SQLite Hub', backup.sqliteHubVersion ? `v${backup.sqliteHubVersion}` : 'n/a')}
        ${renderBackupMetadataItem('SQLite', backup.sqliteVersion ? `v${backup.sqliteVersion}` : 'n/a')}
      </div>
    `;
}

function getBackupsUsageSummary(items = []) {
    return items.reduce(
        (summary, backup) => {
            const sizeBytes = Number(backup.sizeBytes ?? 0);
            const fileExists = backup.fileExists !== false;

            summary.backupCount += 1;

            if (fileExists) {
                summary.availableCount += 1;
                summary.totalSizeBytes += Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0;
            } else {
                summary.missingCount += 1;
            }

            return summary;
        },
        {
            totalSizeBytes: 0,
            backupCount: 0,
            availableCount: 0,
            missingCount: 0,
        },
    );
}

function renderBackupUsageSummary(state) {
    const summary = getBackupsUsageSummary(state.backups.items);
    const details = [
        `${formatNumber(summary.availableCount)} available`,
        summary.missingCount ? `${formatNumber(summary.missingCount)} missing` : '',
    ]
        .filter(Boolean)
        .join(' // ');

    return `
    <div class="mb-4 grid gap-3 border border-outline-variant/10 bg-surface-container-low px-4 py-4 md:grid-cols-[minmax(14rem,1fr)_minmax(10rem,0.45fr)]">
      <div class="min-w-0">
        <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/55">Total backup usage</div>
        <div class="mt-1 font-body text-2xl font-black uppercase text-primary-container">${escapeHtml(formatBytes(summary.totalSizeBytes))}</div>
      </div>
      <div class="min-w-0 border border-outline-variant/10 bg-surface-container-lowest px-3 py-2">
        <div class="font-mono text-[9px] uppercase tracking-[0.16em] text-on-surface-variant/45">Backups</div>
        <div class="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-on-surface/80">
          ${escapeHtml(formatNumber(summary.backupCount))}${details ? ` // ${escapeHtml(details)}` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderBackupRows(state) {
    return state.backups.items
        .map(backup => {
            const busy = isBackupBusy(backup, state);
            const canRestore = backup.status === 'verified' && backup.fileExists && !busy && !state.connections.active?.readOnly;
            const canCompare =
                backup.status === 'verified' && backup.fileExists && !busy && isBackupForActiveConnection(backup, state);
            const canDownload = backup.fileExists && !busy;
            const canEdit = !busy;
            const canDelete = !busy;

            return `
        <div class="grid min-w-[76rem] gap-5 px-4 py-5 xl:grid-cols-[minmax(18rem,1.2fr)_minmax(17rem,0.85fr)_minmax(18rem,1fr)_14rem]">
          <div class="min-w-0 space-y-2">
              <div class="break-words font-body text-sm font-black uppercase text-on-surface">${escapeHtml(backup.name)}</div>
              <div class="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant/45" title="${escapeHtml(backup.path)}">
                ${escapeHtml(truncateMiddle(backup.fileName || backup.path, 48))}
              </div>
              <div class="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant/55">
                Created // ${escapeHtml(formatCompactDateTime(backup.createdAt))}
              </div>
              <div class="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant/45">
                PK // ${escapeHtml(backup.id)}
              </div>
          </div>
          <div class="min-w-0">
            ${renderBackupMetadata(backup)}
          </div>
          <div class="min-w-0">
            <div class="mb-2 flex items-center justify-between gap-3">
              <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/45">Note</div>
              <button class="standard-button flex-none" data-action="open-edit-backup-modal" data-backup-id="${escapeHtml(backup.id)}" type="button" ${canEdit ? '' : 'disabled'}>
                <span class="material-symbols-outlined text-sm">edit_note</span>
                Edit
              </button>
            </div>
            <div class="min-h-20 border border-outline-variant/10 bg-surface-container-lowest px-3 py-3">
              <div class="max-w-full whitespace-pre-wrap break-words text-xs leading-6 text-on-surface-variant/70 [overflow-wrap:anywhere]">
                ${backup.notes ? escapeHtml(backup.notes) : '<span class="text-on-surface-variant/35">No notes</span>'}
                ${backup.errorMessage ? `<div class="mt-2 text-error">${escapeHtml(backup.errorMessage)}</div>` : ''}
              </div>
            </div>
          </div>
          <div class="min-w-0">
            <div class="flex min-w-0 flex-col items-stretch gap-2">
              <button class="standard-button" data-action="open-compare-backup-drawer" data-backup-id="${escapeHtml(backup.id)}" type="button" ${canCompare ? '' : 'disabled'}>
                <span class="material-symbols-outlined text-sm">difference</span>
                Compare with current
              </button>
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
          </div>
        </div>
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
    ${renderBackupUsageSummary(state)}
    <div class="overflow-auto border border-outline-variant/10 bg-surface-container-low">
      <div class="grid min-w-[76rem] grid-cols-[minmax(18rem,1.2fr)_minmax(17rem,0.85fr)_minmax(18rem,1fr)_14rem] gap-5 border-b border-outline-variant/10 bg-surface-container px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/55">
        <div>Backup</div>
        <div>Metadata</div>
        <div>Note</div>
        <div class="text-right">Actions</div>
      </div>
      <div class="divide-y divide-outline-variant/10">
        ${renderBackupRows(state)}
      </div>
    </div>
  `;
}

function formatDiffMetric(value) {
    return value === null || value === undefined ? '-' : formatNumber(value);
}

function formatDiffValue(value) {
    if (value && typeof value === 'object' && value.__type === 'integer') {
        return value.value;
    }

    return formatCellValue(value);
}

function hasBackupDiffChanges(summary = {}) {
    return Boolean(
        Number(summary.schemaChanges ?? 0) ||
            Number(summary.rowsAdded ?? 0) ||
            Number(summary.rowsChanged ?? 0) ||
            Number(summary.rowsRemoved ?? 0) ||
            Number(summary.skippedTables ?? 0),
    );
}

function renderBackupDiffMetaItem(label, value) {
    return `
    <div class="border border-outline-variant/10 bg-surface-container px-3 py-3">
      <div class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/55">
        ${escapeHtml(label)}
      </div>
      <div class="mt-2 break-words text-sm text-on-surface">${escapeHtml(value || '-')}</div>
    </div>
  `;
}

function renderBackupDiffSummary(summary = {}) {
    const items = [
        ['Schema changes', summary.schemaChanges],
        ['Rows added', summary.rowsAdded],
        ['Rows changed', summary.rowsChanged],
        ['Rows removed', summary.rowsRemoved],
        ['Skipped tables', summary.skippedTables],
    ];

    return `
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      ${items.map(([label, value]) => renderBackupDiffMetaItem(label, formatDiffMetric(value))).join('')}
    </div>
  `;
}

function renderBackupDiffTabs(activeTab) {
    return `
    <div class="mt-5 flex flex-col items-start gap-2">
      <div class="charts-height-toggle" role="group" aria-label="Backup diff view">
        <button
          class="standard-button charts-height-toggle__button ${activeTab === 'schema' ? 'is-active' : ''}"
          aria-pressed="${activeTab === 'schema' ? 'true' : 'false'}"
          data-action="set-backup-diff-tab"
          data-tab="schema"
          type="button"
        >
          Schema
        </button>
        <button
          class="standard-button charts-height-toggle__button ${activeTab === 'data' ? 'is-active' : ''}"
          aria-pressed="${activeTab === 'data' ? 'true' : 'false'}"
          data-action="set-backup-diff-tab"
          data-tab="data"
          type="button"
        >
          Data
        </button>
      </div>
    </div>
  `;
}

function getSchemaObjectLabel(objectType) {
    return (
        {
            table: 'table',
            column: 'column',
            index: 'index',
            foreign_key: 'foreign key',
            view: 'view',
            trigger: 'trigger',
        }[objectType] || objectType || 'object'
    );
}

function getSchemaActionIcon(action) {
    return (
        {
            added: '+',
            changed: '~',
            removed: '-',
        }[action] || '*'
    );
}

function getSchemaActionLabel(action) {
    return (
        {
            added: 'Added',
            changed: 'Changed',
            removed: 'Removed',
        }[action] || 'Updated'
    );
}

function renderSchemaDefinitionPair(change) {
    if (!change.before && !change.after) {
        return '';
    }

    return `
    <div class="mt-2 grid gap-2 text-[11px]">
      <div class="border border-outline-variant/10 bg-surface-container px-3 py-2">
        <div class="font-mono text-[9px] uppercase tracking-[0.16em] text-on-surface-variant/45">Backup</div>
        <div class="mt-1 whitespace-pre-wrap break-words font-mono text-on-surface-variant/75 [overflow-wrap:anywhere]">${escapeHtml(change.before || '-')}</div>
      </div>
      <div class="border border-outline-variant/10 bg-surface-container px-3 py-2">
        <div class="font-mono text-[9px] uppercase tracking-[0.16em] text-on-surface-variant/45">Current</div>
        <div class="mt-1 whitespace-pre-wrap break-words font-mono text-on-surface-variant/75 [overflow-wrap:anywhere]">${escapeHtml(change.after || '-')}</div>
      </div>
    </div>
  `;
}

function renderSchemaChange(change) {
    const name = change.name || change.definition || getSchemaObjectLabel(change.objectType);
    const detail =
        change.action === 'changed'
            ? ''
            : change.definition && change.definition !== name
              ? `: ${change.definition}`
              : '';

    return `
    <div class="border-l border-outline-variant/20 pl-3">
      <div class="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface/80">
        ${escapeHtml(getSchemaActionIcon(change.action))}
        ${escapeHtml(getSchemaActionLabel(change.action))}
        ${escapeHtml(getSchemaObjectLabel(change.objectType))}: ${escapeHtml(name)}${escapeHtml(detail)}
      </div>
      ${renderSchemaDefinitionPair(change)}
    </div>
  `;
}

function renderSchemaEntry(entry, fallbackAction) {
    const changes = Array.isArray(entry.changes)
        ? entry.changes
        : [
              {
                  action: fallbackAction,
                  objectType: entry.type,
                  name: entry.name,
                  definition: entry.definition,
              },
          ];

    return `
    <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-4">
      <div class="break-words font-body text-sm font-black uppercase text-on-surface">${escapeHtml(entry.name)}</div>
      <div class="mt-3 space-y-3">
        ${changes.map(renderSchemaChange).join('')}
      </div>
    </div>
  `;
}

function renderSchemaGroup(title, entries, fallbackAction) {
    return `
    <section class="space-y-3">
      <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-on-surface-variant/55">${escapeHtml(title)}</div>
      ${
          entries?.length
              ? `<div class="space-y-3">${entries.map(entry => renderSchemaEntry(entry, fallbackAction)).join('')}</div>`
              : '<div class="border border-dashed border-outline-variant/15 bg-surface-container px-4 py-3 text-sm text-on-surface-variant/50">No changes in this group.</div>'
      }
    </section>
  `;
}

function renderBackupDiffSchema(diff) {
    const schema = diff?.schema ?? { added: [], changed: [], removed: [] };

    return `
    <div class="mt-5 space-y-5">
      ${renderSchemaGroup('Added', schema.added, 'added')}
      ${renderSchemaGroup('Changed', schema.changed, 'changed')}
      ${renderSchemaGroup('Removed', schema.removed, 'removed')}
    </div>
  `;
}

function renderSampleValueRows(sample, valueLabel) {
    const entries = Object.entries(sample.values ?? {});

    if (!entries.length) {
        return '';
    }

    return `
    <div class="overflow-auto border border-outline-variant/10">
      <table class="min-w-full border-collapse text-left text-xs">
        <thead class="bg-surface-container">
          <tr class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/55">
            <th class="px-3 py-2 font-normal">Column</th>
            <th class="px-3 py-2 font-normal">${escapeHtml(valueLabel)}</th>
          </tr>
        </thead>
        <tbody>
          ${entries
              .map(
                  ([column, value]) => `
              <tr class="border-t border-outline-variant/10">
                <td class="px-3 py-2 font-mono text-on-surface-variant/70">${escapeHtml(column)}</td>
                <td class="px-3 py-2 text-on-surface">${escapeHtml(formatDiffValue(value))}</td>
              </tr>
            `,
              )
              .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderChangedRowSample(sample) {
    return `
    <div class="space-y-2 border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">
      <div class="break-words font-body text-sm font-black text-on-surface">${escapeHtml(sample.identityLabel || 'Row')}</div>
      <div class="overflow-auto border border-outline-variant/10">
        <table class="min-w-full border-collapse text-left text-xs">
          <thead class="bg-surface-container">
            <tr class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/55">
              <th class="px-3 py-2 font-normal">Column</th>
              <th class="px-3 py-2 font-normal">Backup</th>
              <th class="px-3 py-2 font-normal">Current</th>
            </tr>
          </thead>
          <tbody>
            ${(sample.columns ?? [])
                .map(
                    column => `
                <tr class="border-t border-outline-variant/10">
                  <td class="px-3 py-2 font-mono text-on-surface-variant/70">${escapeHtml(column.name)}</td>
                  <td class="px-3 py-2 text-on-surface">${escapeHtml(formatDiffValue(column.backup))}</td>
                  <td class="px-3 py-2 text-on-surface">${escapeHtml(formatDiffValue(column.current))}</td>
                </tr>
              `,
                )
                .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAddedOrRemovedSample(sample, valueLabel) {
    return `
    <div class="space-y-2 border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">
      ${sample.identityLabel ? `<div class="break-words font-body text-sm font-black text-on-surface">${escapeHtml(sample.identityLabel)}</div>` : ''}
      ${renderSampleValueRows(sample, valueLabel)}
    </div>
  `;
}

function renderDataSampleGroup(title, samples, renderer) {
    if (!samples?.length) {
        return '';
    }

    return `
    <section class="space-y-3">
      <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/50">${escapeHtml(title)}</div>
      <div class="space-y-3">${samples.map(renderer).join('')}</div>
    </section>
  `;
}

function renderDataTableDetails(table) {
    const sampleMarkup = [
        renderDataSampleGroup('Rows added', table.samples?.added, sample =>
            renderAddedOrRemovedSample(sample, 'Current'),
        ),
        renderDataSampleGroup('Rows changed', table.samples?.changed, renderChangedRowSample),
        renderDataSampleGroup('Rows removed', table.samples?.removed, sample =>
            renderAddedOrRemovedSample(sample, 'Backup'),
        ),
    ]
        .filter(Boolean)
        .join('');

    if (!sampleMarkup) {
        return `
      <div class="border-t border-outline-variant/10 px-4 py-3 text-sm text-on-surface-variant/50">
        No sample rows returned for this table.
      </div>
    `;
    }

    return `<div class="space-y-4 border-t border-outline-variant/10 px-4 py-4">${sampleMarkup}</div>`;
}

function renderDataTableRow(table) {
    const canExpand =
        table.status === 'comparable' &&
        ((table.samples?.added?.length ?? 0) ||
            (table.samples?.changed?.length ?? 0) ||
            (table.samples?.removed?.length ?? 0));
    const summary = `
      <div class="grid grid-cols-[minmax(10rem,1fr)_4rem_4rem_4rem] items-center gap-3 px-4 py-3">
        <div class="min-w-0">
          <div class="break-words font-body text-sm font-black uppercase text-on-surface">${escapeHtml(table.name)}</div>
          <div class="mt-1 text-xs text-on-surface-variant/60" title="${escapeHtml(table.reason ?? '')}">
            ${escapeHtml(table.statusLabel || table.status)}
          </div>
        </div>
        <div class="font-mono text-xs text-on-surface">${escapeHtml(formatDiffMetric(table.added))}</div>
        <div class="font-mono text-xs text-on-surface">${escapeHtml(formatDiffMetric(table.changed))}</div>
        <div class="font-mono text-xs text-on-surface">${escapeHtml(formatDiffMetric(table.removed))}</div>
      </div>
    `;

    if (!canExpand) {
        return `<div class="border-t border-outline-variant/10">${summary}</div>`;
    }

    return `
    <details class="border-t border-outline-variant/10">
      <summary class="cursor-pointer list-none">${summary}</summary>
      ${renderDataTableDetails(table)}
    </details>
  `;
}

function renderBackupDiffData(diff) {
    const tables = diff?.data?.tables ?? [];

    if (!tables.length) {
        return `
      <div class="mt-5 border border-dashed border-outline-variant/15 bg-surface-container px-4 py-3 text-sm text-on-surface-variant/50">
        No user tables were found in either database state.
      </div>
    `;
    }

    return `
    <div class="mt-5 overflow-auto border border-outline-variant/10 bg-surface-container-lowest">
      <div class="grid grid-cols-[minmax(10rem,1fr)_4rem_4rem_4rem] gap-3 bg-surface-container px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/55">
        <div>Table</div>
        <div>Added</div>
        <div>Changed</div>
        <div>Removed</div>
      </div>
      ${tables.map(renderDataTableRow).join('')}
    </div>
  `;
}

function renderBackupDiffDrawerBody(diffState) {
    if (diffState.loading) {
        return `
      <div class="flex flex-1 items-center justify-center px-6 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
        Comparing backup...
      </div>
    `;
    }

    if (diffState.error) {
        return `
      <div class="p-5">
        <div class="border border-error/30 bg-error-container/20 px-4 py-4 text-sm text-error">
          <div class="font-mono text-[10px] uppercase tracking-[0.18em]">${escapeHtml(diffState.error.code || 'REQUEST_FAILED')}</div>
          <div class="mt-2">${escapeHtml(diffState.error.message || 'Backup comparison failed.')}</div>
        </div>
      </div>
    `;
    }

    const diff = diffState.data;

    if (!diff) {
        return '';
    }

    const activeTab = diffState.activeTab === 'data' ? 'data' : 'schema';

    return `
    <div class="custom-scrollbar min-h-0 flex-1 overflow-auto px-5 py-5">
      <div class="grid grid-cols-1 gap-3">
        ${renderBackupDiffMetaItem('Created', formatDateTime(diff.backup?.createdAt ?? diffState.backupCreatedAt))}
        ${renderBackupDiffMetaItem('Current', diff.current?.label || diffState.currentLabel || 'Current database')}
      </div>
      <section class="mt-5">
        ${renderBackupDiffSummary(diff.summary)}
      </section>
      ${
          hasBackupDiffChanges(diff.summary)
              ? ''
              : `
                <div class="mt-5 border border-outline-variant/10 bg-surface-container px-4 py-5 text-center">
                  <span class="material-symbols-outlined mb-2 text-4xl text-primary-container/60">check_circle</span>
                  <div class="font-body text-sm font-black uppercase text-on-surface">No changes found</div>
                  <p class="mt-2 text-sm leading-6 text-on-surface-variant/65">
                    The verified backup and current database match.
                  </p>
                </div>
              `
      }
      ${renderBackupDiffTabs(activeTab)}
      ${activeTab === 'schema' ? renderBackupDiffSchema(diff) : renderBackupDiffData(diff)}
    </div>
  `;
}

export function renderBackupDiffDrawer(state) {
    const diffState = state.backups.diff;

    if (!diffState?.visible) {
        return '';
    }

    const title = diffState.data?.backup?.name ?? diffState.backupName ?? 'Backup comparison';
    const currentLabel = diffState.data?.current?.label ?? diffState.currentLabel ?? 'Current database';

    return `
    <section class="flex h-full min-h-0 flex-col bg-surface-low">
      <div class="border-b border-outline-variant/10 px-5 py-4">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-container/70">
              Backup Compare // ${escapeHtml(currentLabel)}
            </div>
            <h2 class="mt-1 truncate font-body text-lg font-black uppercase tracking-tight text-on-surface">
              ${escapeHtml(title)}
            </h2>
          </div>
          <button
            class="query-history-icon-button"
            data-action="close-backup-diff-drawer"
            title="Close backup comparison"
            type="button"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          ${renderStatusBadge('read only', 'muted')}
          ${diffState.loading ? renderStatusBadge('loading', 'muted') : ''}
          ${diffState.error ? renderStatusBadge('error', 'muted') : ''}
        </div>
      </div>
      ${renderBackupDiffDrawerBody(diffState)}
    </section>
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
        panel: renderBackupDiffDrawer(state),
    };
}
