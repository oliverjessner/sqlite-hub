import { escapeHtml, formatNumber, highlightSql, truncateMiddle } from '../utils/format.js';
import {
    buildCopyColumnText,
    buildCopyColumnPreviewText,
    getCopyColumnActionLabel,
    getCopyColumnExportMetadata,
    isMarkdownTodoCopyColumnMode,
} from '../utils/copyColumnExport.js';
import { renderConnectionLogo } from './connectionLogo.js';
import { renderTextInput } from './formControls.js';
import { analyzeQueryChartResult, getQueryChartTypeLabel, QUERY_CHART_TYPES } from '../lib/queryCharts.js';
import {
    hasDefaultMediaTaggingTagTable,
    hasDefaultMediaTaggingMappingTable,
    MEDIA_TAGGING_DEFAULT_MAPPING_TABLE,
    MEDIA_TAGGING_DEFAULT_MAPPING_TABLE_SQL,
    MEDIA_TAGGING_DEFAULT_TAG_TABLE,
    MEDIA_TAGGING_DEFAULT_TAG_TABLE_SQL,
} from '../lib/mediaTaggingDefaults.js';
import { SYNTHETIC_GENERATOR_TYPES, getSyntheticGeneratorLabel } from '../utils/syntheticData.js';

function renderField({ label, name, type = 'text', placeholder = '', value = '' }) {
    return `
    <label class="block space-y-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        ${escapeHtml(label)}
      </span>
      ${renderTextInput({ name, placeholder, type, value })}
    </label>
  `;
}

function renderCheckboxField({ label, name, checked = false, text }) {
    return `
    <label class="flex flex-col gap-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        ${escapeHtml(label)}
      </span>
      <span class="standard-checkbox">
        <input
          ${checked ? 'checked' : ''}
          name="${escapeHtml(name)}"
          type="checkbox"
        />
        <span>${escapeHtml(text || label)}</span>
      </span>
    </label>
  `;
}

function renderSqlPreviewField(value, minHeightClass = 'sql-highlight-shell--tall') {
    return `
    <div class="sql-highlight-shell ${minHeightClass}">
      <div class="query-editor-layer sql-highlight-layer">
        <div
          aria-hidden="true"
          class="query-editor-highlight sql-highlight-content"
          data-query-editor-highlight
        >${value ? highlightSql(value) : ''}</div>
        <textarea
          class="query-editor-input sql-highlight-input custom-scrollbar"
          data-sql-highlight="true"
          readonly
          spellcheck="false"
          wrap="off"
        >${escapeHtml(value)}</textarea>
      </div>
    </div>
  `;
}

function renderFileField({ label, name, accept = '', helpText = '' }) {
    return `
    <label class="block space-y-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        ${escapeHtml(label)}
      </span>
      <input
        accept="${escapeHtml(accept)}"
        class="control-input block w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface file:mr-4 file:border-0 file:bg-primary-container file:px-3 file:py-2 file:text-xs file:font-bold file:text-on-primary"
        name="${escapeHtml(name)}"
        type="file"
      />
      ${helpText ? `<p class="text-[11px] leading-5 text-on-surface-variant/60">${escapeHtml(helpText)}</p>` : ''}
    </label>
  `;
}

function renderSelectField({ label, name, value = '', options = [], bind = '' }) {
    const attributes = [
        bind ? ['data-bind="', escapeHtml(bind), '"'].join('') : '',
        name ? ['name="', escapeHtml(name), '"'].join('') : '',
    ]
        .filter(Boolean)
        .join(' ');
    const optionMarkup = options
        .map(option =>
            [
                '<option value="',
                escapeHtml(option.value),
                '" ',
                String(option.value) === String(value) ? 'selected' : '',
                '>',
                escapeHtml(option.label),
                '</option>',
            ].join(''),
        )
        .join('');

    return [
        '<label class="block space-y-2">',
        '<span class="block text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">',
        escapeHtml(label),
        '</span>',
        '<select class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" ',
        attributes,
        '>',
        optionMarkup,
        '</select></label>',
    ].join('');
}

function renderError(error) {
    if (!error) {
        return '';
    }

    return `
    <div class="border border-error/20 bg-error-container/20 px-4 py-3 text-sm text-error">
      <div class="font-body text-xs font-bold uppercase tracking-[0.18em]">${escapeHtml(
          error.code || 'Request failed',
      )}</div>
      <div class="mt-1 text-on-surface">${escapeHtml(error.message)}</div>
    </div>
  `;
}

export function renderOpenConnectionForm(modal) {
    return `
    <form class="space-y-5" data-form="open-connection">
      <label class="block space-y-2">
        <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          SQLite File Path
        </span>
        <span class="flex items-stretch gap-2">
          ${renderTextInput({
              className: 'min-w-0 flex-1',
              dataAttributes: { openDatabasePath: true },
              name: 'path',
              placeholder: '/absolute/path/to/database.sqlite',
          })}
          <button
            class="standard-button flex-none"
            data-action="choose-open-database-path"
            type="button"
          >
            <span class="material-symbols-outlined text-sm">folder_open</span>
            <span data-open-database-path-button-label>Browse...</span>
          </button>
        </span>
        <span class="block text-[11px] leading-5 text-on-surface-variant/60">
          Choose an existing SQLite file, or enter an absolute path manually.
        </span>
      </label>
      ${renderField({
          label: 'Label',
          name: 'label',
          placeholder: 'Optional display name',
      })}
      ${renderCheckboxField({
          label: 'Open read-only',
          name: 'readOnly',
          text: 'Open read-only',
      })}
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="standard-button"
          type="submit"
        >
          ${modal.submitting ? 'Opening...' : 'Open Database'}
        </button>
      </div>
    </form>
  `;
}

function renderEditConnectionForm(modal) {
    const connection = modal.connection ?? {};

    return `
    <form class="space-y-5" data-form="edit-connection">
      <input name="connectionId" type="hidden" value="${escapeHtml(connection.id ?? '')}" />
      ${renderField({
          label: 'SQLite File Path',
          name: 'path',
          placeholder: '/absolute/path/to/database.sqlite',
          value: connection.path ?? '',
      })}
      ${renderField({
          label: 'Label',
          name: 'label',
          placeholder: 'Optional display name',
          value: connection.label ?? '',
      })}
      <div class="space-y-3">
        <span class="block text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Database Icon
        </span>
        <div class="flex flex-wrap items-center gap-4 border border-outline-variant/10 bg-surface-container-lowest px-4 py-4">
          ${renderConnectionLogo(connection, {
              containerClass:
                  'flex h-16 w-16 items-center justify-center overflow-hidden border border-outline-variant/20 bg-surface-container-highest',
              imageClassName: 'h-full w-full object-cover',
              iconClassName: 'text-2xl text-primary-container',
          })}
          <div class="min-w-0 flex-1">
            ${renderFileField({
                label: 'Upload image',
                name: 'logoFile',
                accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',
                helpText: 'Allowed formats: PNG, JPG, WEBP.',
            })}
            ${
                connection.logoUrl
                    ? renderCheckboxField({
                          label: 'Reset icon',
                          name: 'clearLogo',
                          text: 'Use the default icon again',
                      })
                    : ''
            }
          </div>
        </div>
      </div>
      ${renderCheckboxField({
          label: 'Open read-only',
          name: 'readOnly',
          checked: Boolean(connection.readOnly),
          text: 'Open read-only',
      })}
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="standard-button"
          type="submit"
        >
          ${modal.submitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  `;
}

export function renderCreateDatabaseForm(modal) {
    return `
    <form class="space-y-5" data-form="create-connection">
      <label class="block space-y-2">
        <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          New SQLite File Path
        </span>
        <span class="flex items-stretch gap-2">
          ${renderTextInput({
              className: 'min-w-0 flex-1',
              dataAttributes: { createDatabasePath: true },
              name: 'path',
              placeholder: '/absolute/path/to/new-database.sqlite',
          })}
          <button
            class="standard-button flex-none"
            data-action="choose-create-database-path"
            type="button"
          >
            <span class="material-symbols-outlined text-sm">folder_open</span>
            <span data-create-database-path-button-label>Browse...</span>
          </button>
        </span>
        <span class="block text-[11px] leading-5 text-on-surface-variant/60">
          Choose a folder and filename, or enter an absolute path manually.
        </span>
      </label>
      ${renderField({
          label: 'Label',
          name: 'label',
          placeholder: 'Optional display name',
      })}
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="standard-button"
          type="submit"
        >
          ${modal.submitting ? 'Creating...' : 'Create Database'}
        </button>
      </div>
    </form>
  `;
}

function renderImportTargetOptions(state) {
    const recentOptions = state.connections.recent
        .map(connection =>
            [
                '<option value="',
                escapeHtml(connection.id),
                '">',
                escapeHtml(connection.label),
                ' • ',
                escapeHtml(truncateMiddle(connection.path, 42)),
                '</option>',
            ].join(''),
        )
        .join('');
    const activeOption = state.connections.active ? '<option value="active">Use active database</option>' : '';
    const recentModeOption = state.connections.recent.length
        ? '<option value="recent">Use recent connection</option>'
        : '';
    const recentConnectionSelect = state.connections.recent.length
        ? [
              '<label class="block space-y-2">',
              '<span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">Recent Connection</span>',
              '<select class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" name="targetConnectionId">',
              recentOptions,
              '</select></label>',
          ].join('')
        : '';

    return [
        '<label class="block space-y-2">',
        '<span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">Import Target</span>',
        '<select class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" name="targetMode">',
        activeOption,
        recentModeOption,
        '<option value="create">Create new database from dump</option>',
        '<option value="path">Open explicit target path</option>',
        '</select></label>',
        recentConnectionSelect,
        renderField({
            label: 'Target Path',
            name: 'targetPath',
            placeholder: '/absolute/path/to/target.sqlite',
        }),
        renderField({
            label: 'Target Label',
            name: 'label',
            placeholder: 'Optional display name',
        }),
    ].join('');
}

function renderImportSqlForm(modal, state) {
    return `
    <form class="space-y-5" data-form="import-sql">
      ${renderField({
          label: 'SQL Dump Path',
          name: 'sqlFilePath',
          placeholder: '/absolute/path/to/dump.sql',
      })}
      ${renderImportTargetOptions(state)}
      <p class="text-[11px] leading-6 text-on-surface-variant/60">
        Use an absolute filesystem path. Browsers do not expose local file paths, so SQLite Hub imports by
        explicit path instead of file upload.
      </p>
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="standard-button"
          type="submit"
        >
          ${modal.submitting ? 'Importing...' : 'Import SQL Dump'}
        </button>
      </div>
    </form>
  `;
}

function renderCreateBackupForm(modal) {
    return `
    <form class="space-y-5" data-form="create-backup">
      ${renderField({
          label: 'Name',
          name: 'name',
          placeholder: 'Manual backup',
          value: modal.name ?? '',
      })}
      <label class="block space-y-2">
        <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">Notes</span>
        <textarea
          class="control-input min-h-28 w-full resize-y border border-outline-variant/20 bg-surface-container-lowest px-3 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
          name="notes"
          placeholder="Optional backup notes"
        >${escapeHtml(modal.notes ?? '')}</textarea>
      </label>
      <input name="type" type="hidden" value="${escapeHtml(modal.backupType ?? 'manual')}" />
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button class="standard-button" data-action="close-modal" type="button">Cancel</button>
        <button class="signature-button" type="submit" ${modal.submitting ? 'disabled' : ''}>
          <span class="material-symbols-outlined text-sm">inventory_2</span>
          ${modal.submitting ? 'Creating...' : 'Create backup'}
        </button>
      </div>
    </form>
  `;
}

function renderDeleteBackupForm(modal) {
    return [
        '<form class="space-y-5" data-form="delete-backup-confirm"><div class="space-y-3">',
        '<p class="text-sm leading-6 text-on-surface-variant/70">Delete this managed backup and remove its backup file from disk.</p>',
        '<div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">',
        escapeHtml(modal.backupName ?? 'Backup'),
        modal.fileName ? ` // ${escapeHtml(modal.fileName)}` : '',
        '</div></div>',
        renderError(modal.error),
        '<div class="flex items-center justify-between gap-3 pt-2">',
        '<button class="standard-button" data-action="close-modal" type="button">Cancel</button>',
        '<button class="delete-button" type="submit">',
        '<span class="material-symbols-outlined text-sm">delete</span>',
        modal.submitting ? 'Deleting...' : 'Delete Backup',
        '</button></div></form>',
    ].join('');
}

function renderEditBackupForm(modal) {
    return `
    <form class="space-y-5" data-form="edit-backup">
      <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">
        <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/55">Primary Key</div>
        <div class="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface/80">
          ${escapeHtml(modal.backupId ?? 'n/a')}
        </div>
      </div>
      <label class="block space-y-2">
        <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">Name</span>
        <input
          class="control-input w-full border border-outline-variant/20 bg-surface-container-lowest px-3 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
          name="name"
          placeholder="Backup name"
          required
          value="${escapeHtml(modal.backupName ?? 'Backup')}"
        />
      </label>
      <label class="block space-y-2">
        <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">Notes</span>
        <textarea
          class="control-input min-h-36 w-full resize-y border border-outline-variant/20 bg-surface-container-lowest px-3 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
          name="notes"
          placeholder="Optional backup notes" style="height: 160px"
        >${escapeHtml(modal.notes ?? '')}</textarea>
      </label>
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button class="standard-button" data-action="close-modal" type="button">Cancel</button>
        <button class="signature-button" type="submit" ${modal.submitting ? 'disabled' : ''}>
          <span class="material-symbols-outlined text-sm">save</span>
          ${modal.submitting ? 'Saving...' : 'Save backup'}
        </button>
      </div>
    </form>
  `;
}

function renderBackupSafetyForm(modal) {
    const description =
        modal.description ||
        'This operation may change or remove data or database structures. Creating a backup allows you to restore the current state if something goes wrong.';

    return `
    <div class="space-y-5">
      <p class="text-sm leading-7 text-on-surface-variant/70">
        ${escapeHtml(description)}
      </p>
      <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">
        <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/55">Safety Backup</div>
        <div class="mt-2 font-body text-sm font-black uppercase text-on-surface">${escapeHtml(
            modal.backupNameBeforeOperation ?? modal.backupName ?? 'Before operation',
        )}</div>
      </div>
      ${renderError(modal.error)}
      <div class="backup-safety-actions pt-2">
        <button class="standard-button" data-action="backup-safety-cancel" type="button" ${modal.submitting ? 'disabled' : ''}>
          Cancel
        </button>
        <button class="delete-button" data-action="backup-safety-continue" type="button" ${modal.submitting ? 'disabled' : ''}>
          <span class="material-symbols-outlined text-sm">warning</span>
          Continue without backup
        </button>
        <button class="signature-button" data-action="backup-safety-create" type="button" ${modal.submitting ? 'disabled' : ''}>
          <span class="material-symbols-outlined text-sm">inventory_2</span>
          ${modal.submitting ? 'Working...' : 'Create backup and continue'}
        </button>
      </div>
    </div>
  `;
}

function renderTypeGenerationSelect({ label, field, value, options = [] }) {
    return renderSelectField({
        label,
        name: field,
        value,
        bind: 'type-generation-field',
        options,
    }).replace('<select ', `<select data-type-generation-field="${escapeHtml(field)}" `);
}

function renderTypeGenerationCheckbox({ label, field, checked }) {
    return `
      <label class="standard-checkbox">
        <input
          ${checked ? 'checked' : ''}
          data-bind="type-generation-field"
          data-type-generation-field="${escapeHtml(field)}"
          type="checkbox"
        />
        <span>${escapeHtml(label)}</span>
      </label>
    `;
}

function renderTypeGenerationCodePreview(code) {
    const text = String(code ?? '');
    const normalized =
        text.includes('\n') || text.includes('\\n')
            ? text.replace(/\\n/g, '\n')
            : text
                  .replace(/\{\s*/g, '{\n  ')
                  .replace(/;\s*/g, ';\n  ')
                  .replace(/\s*\}\s*$/g, '\n}');

    return normalized
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => `<span class="block whitespace-pre">${line ? escapeHtml(line) : '&nbsp;'}</span>`)
        .join('');
}

export function renderGenerateTypesForm(modal) {
    const options = modal.options ?? {};
    const result = modal.result ?? {};
    const target = modal.target ?? 'typescript';
    const isAllTables = modal.scope === 'all';
    const fileCount = result.files?.length ?? modal.tableNames?.length ?? 0;
    const subjectLabel = isAllTables
        ? `all ${fileCount || ''} tables`.replace(/\s+/g, ' ').trim()
        : `the schema of "${modal.tableName ?? ''}"`;
    const downloadLabel = result.files?.length ? 'Download Files' : 'Download';

    return `
    <div class="space-y-5">
      <p class="text-sm leading-6 text-on-surface-variant/70">
        Generate application types from ${escapeHtml(subjectLabel)}.
      </p>
      <div class="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <div class="min-w-0 space-y-4">
          <div class="space-y-4">
            ${renderTypeGenerationSelect({
                label: 'Target',
                field: 'target',
                value: target,
                options: [
                    { value: 'typescript', label: 'TypeScript' },
                    { value: 'rust', label: 'Rust' },
                    { value: 'kotlin', label: 'Kotlin' },
                    { value: 'swift', label: 'Swift' },
                ],
            })}
            ${renderTypeGenerationSelect({
                label: 'Property naming',
                field: 'propertyNaming',
                value: options.propertyNaming ?? 'camel',
                options: [
                    { value: 'preserve', label: 'Preserve' },
                    { value: 'camel', label: 'camelCase' },
                    { value: 'pascal', label: 'PascalCase' },
                    { value: 'snake', label: 'snake_case' },
                ],
            })}
            ${renderTypeGenerationSelect({
                label: 'Nullable handling',
                field: 'nullableMode',
                value: options.nullableMode ?? 'native',
                options: [
                    { value: 'native', label: 'Native' },
                    { value: 'optional', label: 'Optional (TypeScript)' },
                ],
            })}
            ${
                target === 'typescript'
                    ? renderTypeGenerationSelect({
                          label: 'JSON type',
                          field: 'jsonType',
                          value: options.jsonType ?? 'unknown',
                          options: [
                              { value: 'unknown', label: 'unknown' },
                              { value: 'record', label: 'Record<string, unknown>' },
                              { value: 'json-value', label: 'JsonValue' },
                          ],
                      })
                    : ''
            }
          </div>
          <div class="grid gap-2">
            ${renderTypeGenerationCheckbox({
                label: 'Export declaration',
                field: 'exportDeclaration',
                checked: options.exportDeclaration !== false,
            })}
            ${renderTypeGenerationCheckbox({
                label: 'Include default values as comments',
                field: 'includeDefaultsAsComments',
                checked: Boolean(options.includeDefaultsAsComments),
            })}
            ${renderTypeGenerationCheckbox({
                label: 'Include generated columns',
                field: 'includeGeneratedColumns',
                checked: options.includeGeneratedColumns !== false,
            })}
            ${renderTypeGenerationCheckbox({
                label: 'Include hidden columns',
                field: 'includeHiddenColumns',
                checked: Boolean(options.includeHiddenColumns),
            })}
          </div>
        </div>
        <div class="min-w-0 space-y-3">
          <div class="flex items-center justify-between gap-3">
            <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-container">Code Preview</div>
            <div class="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/45">
              ${escapeHtml(result.fileName ?? '')}
            </div>
          </div>
          ${
              result.files?.length
                  ? `<div class="flex flex-wrap gap-2">${result.files
                        .map(
                            file =>
                                `<span class="border border-outline-variant/20 bg-surface-highest px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/70">${escapeHtml(
                                    file.fileName ?? file.tableName ?? 'types',
                                )}</span>`,
                        )
                        .join('')}</div>`
                  : ''
          }
          <pre class="type-generation-code-preview custom-scrollbar border border-outline-variant/10 bg-surface-container-lowest px-4 py-4 font-mono text-xs leading-6 text-on-surface"><code>${renderTypeGenerationCodePreview(
              modal.loading ? 'Generating...' : (result.code ?? ''),
          )}</code></pre>
          ${renderError(modal.error)}
        </div>
      </div>
      <div class="flex items-center justify-between gap-3 pt-2">
        <button class="standard-button" data-action="close-modal" type="button">Cancel</button>
        <div class="flex items-center gap-2">
          <button class="standard-button" data-action="copy-generated-types" type="button" ${
              result.code ? '' : 'disabled'
          }>
            <span class="material-symbols-outlined text-sm">content_copy</span>
            Copy Code
          </button>
          <button class="signature-button" data-action="download-generated-types" type="button" ${
              result.code ? '' : 'disabled'
          }>
            <span class="material-symbols-outlined text-sm">download</span>
            ${escapeHtml(downloadLabel)}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderSyntheticGeneratorOptions(value) {
    return SYNTHETIC_GENERATOR_TYPES.map(
        type =>
            `<option value="${escapeHtml(type.value)}" ${String(type.value) === String(value) ? 'selected' : ''}>${escapeHtml(
                type.label,
            )}</option>`,
    ).join('');
}

function renderSyntheticOptionInput({
    columnName,
    option,
    type = 'text',
    value = '',
    min = null,
    max = null,
    step = null,
    placeholder = '',
}) {
    const attributes = [
        `class="control-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"`,
        placeholder ? `aria-label="${escapeHtml(placeholder)}"` : '',
        `data-bind="generate-data-mapping"`,
        `data-column-name="${escapeHtml(columnName)}"`,
        `data-field="${escapeHtml(option)}"`,
        placeholder ? `placeholder="${escapeHtml(placeholder)}"` : '',
        `type="${escapeHtml(type)}"`,
        `value="${escapeHtml(value)}"`,
        min !== null ? `min="${escapeHtml(min)}"` : '',
        max !== null ? `max="${escapeHtml(max)}"` : '',
        step !== null ? `step="${escapeHtml(step)}"` : '',
    ].filter(Boolean);

    return `<input ${attributes.join(' ')} />`;
}

function renderSyntheticOptionSelect({ columnName, option, value = '', options = [] }) {
    return `
      <select
        class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
        data-bind="generate-data-mapping"
        data-column-name="${escapeHtml(columnName)}"
        data-field="${escapeHtml(option)}"
      >
        ${options
            .map(
                item =>
                    `<option value="${escapeHtml(item.value)}" ${String(item.value) === String(value) ? 'selected' : ''}>${escapeHtml(
                        item.label,
                    )}</option>`,
            )
            .join('')}
      </select>
    `;
}

function renderSyntheticMappingOptions(mapping) {
    const options = mapping.options ?? {};
    const columnName = mapping.columnName;

    switch (mapping.generator) {
        case 'static':
            return renderSyntheticOptionInput({
                columnName,
                option: 'value',
                value: options.value ?? '',
                placeholder: 'Value',
            });
        case 'randomInteger':
            return `
              <div class="synthetic-generator-options-grid synthetic-generator-options-grid--two">
                ${renderSyntheticOptionInput({
                    columnName,
                    option: 'min',
                    type: 'number',
                    value: options.min ?? 1,
                    step: 1,
                    placeholder: 'Min',
                })}
                ${renderSyntheticOptionInput({
                    columnName,
                    option: 'max',
                    type: 'number',
                    value: options.max ?? 1000,
                    step: 1,
                    placeholder: 'Max',
                })}
              </div>
            `;
        case 'randomDecimal':
            return `
              <div class="synthetic-generator-options-grid synthetic-generator-options-grid--three">
                ${renderSyntheticOptionInput({
                    columnName,
                    option: 'min',
                    type: 'number',
                    value: options.min ?? 0,
                    step: '0.01',
                    placeholder: 'Min',
                })}
                ${renderSyntheticOptionInput({
                    columnName,
                    option: 'max',
                    type: 'number',
                    value: options.max ?? 1000,
                    step: '0.01',
                    placeholder: 'Max',
                })}
                ${renderSyntheticOptionInput({
                    columnName,
                    option: 'decimals',
                    type: 'number',
                    value: options.decimals ?? 2,
                    min: 0,
                    max: 8,
                    step: 1,
                    placeholder: 'Decimals',
                })}
              </div>
            `;
        case 'boolean':
            return renderSyntheticOptionInput({
                columnName,
                option: 'trueProbability',
                type: 'number',
                value: options.trueProbability ?? 50,
                min: 0,
                max: 100,
                step: 1,
                placeholder: 'True %',
            });
        case 'timestamp':
            return `
              <div class="synthetic-generator-options-grid synthetic-generator-options-grid--timestamp">
                ${renderSyntheticOptionSelect({
                    columnName,
                    option: 'range',
                    value: options.range ?? 'last30',
                    options: [
                        { value: 'last30', label: 'Last 30 days' },
                        { value: 'last365', label: 'Last 365 days' },
                        { value: 'custom', label: 'Custom' },
                    ],
                })}
                ${
                    options.range === 'custom'
                        ? `${renderSyntheticOptionInput({
                              columnName,
                              option: 'from',
                              type: 'datetime-local',
                              value: options.from ?? '',
                              placeholder: 'From',
                          })}
                          ${renderSyntheticOptionInput({
                              columnName,
                              option: 'to',
                              type: 'datetime-local',
                              value: options.to ?? '',
                              placeholder: 'To',
                          })}`
                        : ''
                }
              </div>
            `;
        case 'oneOf':
            return renderSyntheticOptionInput({
                columnName,
                option: 'values',
                value: options.values ?? '',
                placeholder: 'Comma values',
            });
        case 'skip':
        default:
            return `<span class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/45">No options</span>`;
    }
}

function formatSyntheticPreviewValue(value) {
    if (value === null || value === undefined) {
        return 'NULL';
    }

    if (typeof value === 'object') {
        return JSON.stringify(value);
    }

    return String(value);
}

function renderSyntheticPreview(modal) {
    const rows = (modal.previewRows ?? []).slice(0, 3);
    const columns = modal.previewColumns?.length
        ? modal.previewColumns
        : (modal.columns ?? []).map(column => column.name);

    if (!rows.length) {
        return `
          <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-4 text-sm text-on-surface-variant/55">
            Preview creates up to 3 rows without writing to the database.
          </div>
        `;
    }

    return `
      <div class="synthetic-generator-preview">
        <table>
          <thead>
            <tr>
              ${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows
                .map(
                    row => `
                  <tr>
                    ${columns
                        .map(
                            column =>
                                `<td title="${escapeHtml(formatSyntheticPreviewValue(row[column]))}">${escapeHtml(
                                    truncateMiddle(formatSyntheticPreviewValue(row[column]), 56),
                                )}</td>`,
                        )
                        .join('')}
                  </tr>
                `,
                )
                .join('')}
          </tbody>
        </table>
      </div>
    `;
}

export function renderGenerateDataForm(modal) {
    const columns = modal.columns ?? [];
    const mappings = modal.mappings ?? [];
    const disabledAttribute = modal.submitting || modal.previewLoading ? 'disabled aria-disabled="true"' : '';

    return `
    <form class="generate-data-modal-form" data-form="generate-data">
      <div class="synthetic-generator-count-row">
        <label class="block space-y-2">
          <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">Rows</span>
          <input
            class="control-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
            data-bind="generate-data-field"
            data-field="rowCount"
            max="10000"
            min="1"
            name="rowCount"
            step="1"
            type="number"
            value="${escapeHtml(modal.rowCount ?? 100)}"
          />
        </label>
        <div class="flex items-end text-sm leading-6 text-on-surface-variant/60">
          Create test rows for "${escapeHtml(modal.tableName ?? '')}".
        </div>
      </div>
      <div class="synthetic-generator-grid custom-scrollbar">
        <div class="synthetic-generator-grid__header">
          <div>Column</div>
          <div>SQLite Type</div>
          <div>Generator</div>
          <div>Options</div>
        </div>
        ${
            columns.length
                ? mappings
                      .map(mapping => {
                          const column = columns.find(item => item.name === mapping.columnName) ?? {};
                          const sqliteType = column.declaredType || column.affinity || 'ANY';

                          return `
                            <div class="synthetic-generator-grid__row">
                              <div class="min-w-0">
                                <div class="synthetic-generator-column-name">${escapeHtml(mapping.columnName)}</div>
                                ${
                                    mapping.note
                                        ? `<div class="synthetic-generator-column-note">${escapeHtml(mapping.note)}</div>`
                                        : ''
                                }
                              </div>
                              <div class="synthetic-generator-sqlite-type">
                                ${escapeHtml(sqliteType)}
                                ${column.notNull ? '<span>NOT NULL</span>' : ''}
                              </div>
                              <div>
                                <select
                                  class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
                                  data-bind="generate-data-mapping"
                                  data-column-name="${escapeHtml(mapping.columnName)}"
                                  data-field="generator"
                                  title="${escapeHtml(getSyntheticGeneratorLabel(mapping.generator))}"
                                >
                                  ${renderSyntheticGeneratorOptions(mapping.generator)}
                                </select>
                              </div>
                              <div class="min-w-0">
                                ${renderSyntheticMappingOptions(mapping)}
                              </div>
                            </div>
                          `;
                      })
                      .join('')
                : `<div class="px-4 py-6 text-sm text-on-surface-variant/55">No writable columns available.</div>`
        }
      </div>
      <div class="space-y-3">
        <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-container">Preview</div>
        ${renderSyntheticPreview(modal)}
      </div>
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button class="standard-button" data-action="close-modal" type="button">Cancel</button>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <button class="standard-button" data-action="preview-generate-data" type="button" ${disabledAttribute}>
            <span class="material-symbols-outlined text-sm">visibility</span>
            ${modal.previewLoading ? 'Previewing...' : 'Preview'}
          </button>
          <button class="signature-button" type="submit" ${modal.submitting ? 'disabled aria-disabled="true"' : ''}>
            <span class="material-symbols-outlined text-sm">auto_awesome</span>
            ${modal.submitting ? 'Inserting...' : 'Insert Rows'}
          </button>
        </div>
      </div>
    </form>
  `;
}

function renderDeleteRowConfirmForm(modal) {
    const rowPreview = modal.rowPreview ?? [];
    const rowLabelMarkup = modal.rowLabel
        ? [
              '<div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">',
              escapeHtml(modal.rowLabel),
              '</div>',
          ].join('')
        : '';
    const rowPreviewMarkup = rowPreview.length
        ? [
              '<div class="grid grid-cols-1 gap-3 md:grid-cols-2">',
              rowPreview
                  .map(field =>
                      [
                          '<div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">',
                          '<div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">',
                          escapeHtml(field.label),
                          '</div>',
                          '<div class="mt-2 text-sm text-on-surface" title="',
                          escapeHtml(field.fullValue ?? field.value ?? ''),
                          '">',
                          escapeHtml(field.value ?? ''),
                          '</div></div>',
                      ].join(''),
                  )
                  .join(''),
              '</div>',
          ].join('')
        : '';

    return [
        '<form class="space-y-5" data-form="delete-row-confirm"><div class="space-y-3">',
        '<p class="text-sm leading-7 text-on-surface">Delete this row from <span class="font-bold text-primary-container">',
        escapeHtml(modal.tableName ?? 'the current table'),
        '</span>?</p>',
        '<p class="text-sm leading-7 text-on-surface-variant/65">This action cannot be undone.</p>',
        rowLabelMarkup,
        rowPreviewMarkup,
        '</div>',
        renderError(modal.error),
        '<div class="flex items-center justify-between gap-3 pt-2">',
        '<button class="standard-button" data-action="close-modal" type="button">Cancel</button>',
        '<button class="delete-button" type="submit">',
        modal.submitting ? 'Deleting...' : 'Delete Row',
        '</button></div></form>',
    ].join('');
}

function renderRowUpdatePreviewForm(modal) {
    const preview = modal.preview ?? {};
    const changes = preview.changes ?? [];
    const params = preview.params ?? [];
    const warnings = preview.warnings ?? [];
    const changesMarkup = changes.length
        ? [
              '<div class="overflow-hidden border border-outline-variant/10">',
              '<table class="w-full text-left text-sm">',
              '<thead class="bg-surface-container-highest text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">',
              '<tr><th class="px-3 py-2">Column</th><th class="px-3 py-2">Old</th><th class="px-3 py-2">New</th></tr>',
              '</thead><tbody class="divide-y divide-outline-variant/10">',
              changes
                  .map(
                      change => `
              <tr>
                <td class="px-3 py-2 font-mono text-xs text-primary-container">${escapeHtml(change.column)}</td>
                <td class="px-3 py-2 text-on-surface-variant/70">${escapeHtml(change.oldValue)}</td>
                <td class="px-3 py-2 text-on-surface">${escapeHtml(change.newValue)}</td>
              </tr>
            `,
                  )
                  .join(''),
              '</tbody></table></div>',
          ].join('')
        : '<div class="border border-outline-variant/10 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant/65">No changed values were detected.</div>';
    const paramsMarkup = params.length
        ? `
        <div class="space-y-2">
          <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">Parameters</div>
          <div class="space-y-2">
            ${params
                .map(
                    param => `
                  <div class="flex gap-3 border border-outline-variant/10 bg-surface-container-low px-3 py-2 text-xs">
                    <span class="font-mono text-primary-container">$${escapeHtml(param.index)}</span>
                    <span class="min-w-0 break-words text-on-surface">${escapeHtml(param.value)}</span>
                  </div>
                `,
                )
                .join('')}
          </div>
        </div>
      `
        : '';
    const warningsMarkup = warnings.length
        ? `
        <div class="space-y-2">
          ${warnings
              .map(
                  warning => `
                <div class="border border-primary-container/20 bg-primary-container/10 px-4 py-3 text-sm text-on-surface">
                  ${escapeHtml(warning)}
                </div>
              `,
              )
              .join('')}
        </div>
      `
        : '';

    return `
    <form class="space-y-5" data-form="apply-row-update-preview">
      <div class="space-y-2">
        <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
          ${escapeHtml(modal.tableName ?? 'Table Row')}
        </div>
        <p class="text-sm leading-7 text-on-surface-variant/70">
          Review the SQL and changed values before applying this row update.
        </p>
      </div>
      ${warningsMarkup}
      <div class="space-y-2">
        <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">SQL Preview</div>
        ${renderSqlPreviewField(preview.sql ?? '', 'sql-highlight-shell--compact')}
      </div>
      <div class="space-y-2">
        <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">Changed Values</div>
        ${changesMarkup}
      </div>
      ${paramsMarkup}
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button class="standard-button" data-action="close-modal" type="button">Cancel</button>
        <button class="signature-button" type="submit">
          ${modal.submitting ? 'Applying...' : 'Apply Changes'}
        </button>
      </div>
    </form>
  `;
}

function renderChartColumnOptions(analysis, { allowEmpty = false, includeNumericHint = false } = {}) {
    const options = allowEmpty ? [{ value: '', label: 'None' }] : [];

    return options.concat(
        (analysis?.columns ?? []).map(column => ({
            value: column.name,
            label: `${column.name} (${column.type}${includeNumericHint && column.type === 'number' ? ' numeric' : ''})`,
        })),
    );
}

function renderChartEditorForm(modal, state) {
    const draft = modal.draft ?? {};
    const analysis = state.charts.result ? analyzeQueryChartResult(state.charts.result) : null;
    const chartTypeOptions = QUERY_CHART_TYPES.map(chartType => ({
        value: chartType,
        label: getQueryChartTypeLabel(chartType),
    }));
    const columnOptions = renderChartColumnOptions(analysis);
    const optionalColumnOptions = renderChartColumnOptions(analysis, { allowEmpty: true });
    let chartSpecificFields = '';

    if (draft.chartType === 'bar') {
        chartSpecificFields = `
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        ${renderSelectField({
            label: 'X Column',
            value: draft.config?.x_column ?? '',
            options: columnOptions,
            bind: 'query-chart-draft-config:x_column',
        })}
        ${renderSelectField({
            label: 'Y Column',
            value: draft.config?.y_column ?? '',
            options: columnOptions,
            bind: 'query-chart-draft-config:y_column',
        })}
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
        ${renderSelectField({
            label: 'Sort By',
            value: draft.config?.sort_by ?? 'y',
            options: [
                { value: 'x', label: 'X column' },
                { value: 'y', label: 'Y value' },
            ],
            bind: 'query-chart-draft-config:sort_by',
        })}
        ${renderSelectField({
            label: 'Sort Direction',
            value: draft.config?.sort_direction ?? 'desc',
            options: [
                { value: 'asc', label: 'Ascending / smallest first' },
                { value: 'desc', label: 'Descending / largest first' },
            ],
            bind: 'query-chart-draft-config:sort_direction',
        })}
        ${renderCheckboxField({
            label: 'Show legend',
            name: '',
            checked: Boolean(draft.config?.show_legend),
            text: 'Show legend',
        }).replace('<input', '<input data-bind="query-chart-draft-config:show_legend"')}
        ${renderCheckboxField({
            label: 'Show labels',
            name: '',
            checked: Boolean(draft.config?.show_labels),
            text: 'Show labels',
        }).replace('<input', '<input data-bind="query-chart-draft-config:show_labels"')}
      </div>
    `;
    } else if (draft.chartType === 'line') {
        chartSpecificFields = `
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        ${renderSelectField({
            label: 'X Column',
            value: draft.config?.x_column ?? '',
            options: columnOptions,
            bind: 'query-chart-draft-config:x_column',
        })}
        ${renderSelectField({
            label: 'Y Column',
            value: draft.config?.y_column ?? '',
            options: columnOptions,
            bind: 'query-chart-draft-config:y_column',
        })}
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
        ${renderSelectField({
            label: 'Sort Direction',
            value: draft.config?.sort_direction ?? 'asc',
            options: [
                { value: 'asc', label: 'Ascending' },
                { value: 'desc', label: 'Descending' },
            ],
            bind: 'query-chart-draft-config:sort_direction',
        })}
        ${renderCheckboxField({
            label: 'Smooth line',
            name: '',
            checked: Boolean(draft.config?.smooth),
            text: 'Smooth line',
        }).replace('<input', '<input data-bind="query-chart-draft-config:smooth"')}
        ${renderCheckboxField({
            label: 'Show legend',
            name: '',
            checked: Boolean(draft.config?.show_legend),
            text: 'Show legend',
        }).replace('<input', '<input data-bind="query-chart-draft-config:show_legend"')}
        ${renderCheckboxField({
            label: 'Show labels',
            name: '',
            checked: Boolean(draft.config?.show_labels),
            text: 'Show labels',
        }).replace('<input', '<input data-bind="query-chart-draft-config:show_labels"')}
      </div>
    `;
    } else if (draft.chartType === 'pie') {
        chartSpecificFields = `
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        ${renderSelectField({
            label: 'Label Column',
            value: draft.config?.label_column ?? '',
            options: columnOptions,
            bind: 'query-chart-draft-config:label_column',
        })}
        ${renderSelectField({
            label: 'Value Column',
            value: draft.config?.value_column ?? '',
            options: columnOptions,
            bind: 'query-chart-draft-config:value_column',
        })}
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        ${renderCheckboxField({
            label: 'Donut',
            name: '',
            checked: Boolean(draft.config?.donut),
            text: 'Render as donut',
        }).replace('<input', '<input data-bind="query-chart-draft-config:donut"')}
        ${renderCheckboxField({
            label: 'Show legend',
            name: '',
            checked: Boolean(draft.config?.show_legend),
            text: 'Show legend',
        }).replace('<input', '<input data-bind="query-chart-draft-config:show_legend"')}
        ${renderCheckboxField({
            label: 'Show labels',
            name: '',
            checked: Boolean(draft.config?.show_labels),
            text: 'Show labels',
        }).replace('<input', '<input data-bind="query-chart-draft-config:show_labels"')}
      </div>
    `;
    } else if (draft.chartType === 'scatter') {
        chartSpecificFields = `
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        ${renderSelectField({
            label: 'X Column',
            value: draft.config?.x_column ?? '',
            options: columnOptions,
            bind: 'query-chart-draft-config:x_column',
        })}
        ${renderSelectField({
            label: 'Y Column',
            value: draft.config?.y_column ?? '',
            options: columnOptions,
            bind: 'query-chart-draft-config:y_column',
        })}
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        ${renderSelectField({
            label: 'Size Column',
            value: draft.config?.size_column ?? '',
            options: optionalColumnOptions,
            bind: 'query-chart-draft-config:size_column',
        })}
        ${renderSelectField({
            label: 'Series Column',
            value: draft.config?.series_column ?? '',
            options: optionalColumnOptions,
            bind: 'query-chart-draft-config:series_column',
        })}
        ${renderCheckboxField({
            label: 'Show legend',
            name: '',
            checked: Boolean(draft.config?.show_legend),
            text: 'Show legend',
        }).replace('<input', '<input data-bind="query-chart-draft-config:show_legend"')}
      </div>
    `;
    }

    return `
    <form class="space-y-5" data-form="save-query-chart">
      ${renderField({
          label: 'Chart Name',
          name: 'chartName',
          value: draft.name ?? '',
      }).replace('<input', '<input data-bind="query-chart-draft:name"')}
      ${renderSelectField({
          label: 'Chart Type',
          value: draft.chartType ?? 'bar',
          options: chartTypeOptions,
          bind: 'query-chart-draft:chartType',
      })}
      ${chartSpecificFields}
      ${
          analysis
              ? `
            <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-4">
              <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
                Result Columns
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                ${analysis.columns
                    .map(
                        column => `
                      <span class="border border-outline-variant/15 bg-surface-container px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-on-surface-variant/70">
                        ${escapeHtml(column.name)} • ${escapeHtml(column.type)}
                      </span>
                    `,
                    )
                    .join('')}
              </div>
            </div>
          `
              : ''
      }
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="standard-button"
          type="submit"
        >
          ${modal.submitting ? 'Saving...' : draft.mode === 'edit' ? 'Save Chart' : 'Create Chart'}
        </button>
      </div>
    </form>
  `;
}

function renderDeleteChartForm(modal) {
    return [
        '<form class="space-y-5" data-form="delete-query-chart"><div class="space-y-3">',
        '<p class="text-sm leading-7 text-on-surface">Delete chart <span class="font-bold text-primary-container">',
        escapeHtml(modal.chartName ?? 'Chart'),
        '</span>?</p>',
        '<p class="text-sm leading-7 text-on-surface-variant/65">The linked query-history entry stays intact. Only this chart definition is removed.</p>',
        '</div>',
        renderError(modal.error),
        '<div class="flex items-center justify-between gap-3 pt-2">',
        '<button class="standard-button" data-action="close-modal" type="button">Cancel</button>',
        '<button class="delete-button" type="submit">',
        modal.submitting ? 'Deleting...' : 'Delete Chart',
        '</button></div></form>',
    ].join('');
}

function renderDeleteQueryHistoryForm(modal) {
    return [
        '<form class="space-y-5" data-form="delete-query-history-confirm"><div class="space-y-3">',
        '<p class="text-sm leading-7 text-on-surface">Delete query <span class="font-bold text-primary-container">',
        escapeHtml(modal.queryTitle ?? 'SQL query'),
        '</span>?</p>',
        '<p class="text-sm leading-7 text-on-surface-variant/65">This removes the query-history entry and all recorded runs linked to it.</p>',
        '</div>',
        renderError(modal.error),
        '<div class="flex items-center justify-between gap-3 pt-2">',
        '<button class="standard-button" data-action="close-modal" type="button">Cancel</button>',
        '<button class="delete-button" type="submit">',
        modal.submitting ? 'Deleting...' : 'Delete Query',
        '</button></div></form>',
    ].join('');
}

function renderDeleteDocumentForm(modal) {
    return [
        '<form class="space-y-5" data-form="delete-document-confirm"><div class="space-y-3">',
        '<p class="text-sm leading-7 text-on-surface">Delete document <span class="font-bold text-primary-container">',
        escapeHtml(modal.filename ?? 'document'),
        '</span>?</p>',
        '<p class="text-sm leading-7 text-on-surface-variant/65">This removes the Markdown document from the active database document folder.</p>',
        '<div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">',
        formatNumber(modal.contentLength ?? 0),
        ' chars</div>',
        '</div>',
        renderError(modal.error),
        '<div class="flex items-center justify-between gap-3 pt-2">',
        '<button class="standard-button" data-action="close-modal" type="button">Cancel</button>',
        '<button class="delete-button" type="submit">',
        modal.submitting ? 'Deleting...' : 'Delete Document',
        '</button></div></form>',
    ].join('');
}

export function renderDeleteApiTokenForm(modal) {
    return [
        '<form class="space-y-5" data-form="delete-api-token-confirm"><div class="space-y-3">',
        '<p class="text-sm leading-7 text-on-surface">Delete API token <span class="font-bold text-primary-container">',
        escapeHtml(modal.tokenName ?? 'API token'),
        '</span>?</p>',
        '<p class="text-sm leading-7 text-on-surface-variant/65">Requests using this token will immediately lose access to <span class="font-semibold text-on-surface">',
        escapeHtml(modal.databaseLabel ?? 'the active database'),
        '.</span></p>',
        '<div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 font-mono text-[10px] text-on-surface-variant/55">',
        escapeHtml(modal.tokenPrefix ?? ''),
        '...</div>',
        '</div>',
        renderError(modal.error),
        '<div class="flex items-center justify-between gap-3 pt-2">',
        '<button class="standard-button" data-action="close-modal" type="button">Cancel</button>',
        '<button class="delete-button" type="submit">',
        modal.submitting ? 'Deleting...' : 'Delete Token',
        '</button></div></form>',
    ].join('');
}

function getDocumentInsertQueryTitle(query) {
    return query?.displayTitle || query?.title || query?.previewSql || query?.rawSql || 'Saved query';
}

function getSelectedDocumentInsertQuery(modal) {
    const selectedHistoryId = String(modal.selectedHistoryId ?? '');

    return (modal.queries ?? []).find(query => String(query.id) === selectedHistoryId) ?? null;
}

function renderDocumentInsertQuerySelect(modal, emptyText) {
    const queries = modal.queries ?? [];

    if (modal.loading) {
        return '<div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant/65">Loading saved queries...</div>';
    }

    if (!queries.length) {
        return `<div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant/65">${escapeHtml(emptyText)}</div>`;
    }

    return `
    <label class="block space-y-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        Saved Query
      </span>
      <select
        class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
        data-bind="document-insert-query-select"
        name="historyId"
      >
        ${queries
            .map(
                query => `
              <option
                value="${escapeHtml(query.id)}"
                ${String(query.id) === String(modal.selectedHistoryId) ? 'selected' : ''}
              >
                ${escapeHtml(getDocumentInsertQueryTitle(query))}
              </option>
            `,
            )
            .join('')}
      </select>
    </label>
  `;
}

function renderDocumentInsertQueryPreview(query) {
    if (!query) {
        return '';
    }

    return `
    <div class="space-y-2">
      <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        Query Preview
      </div>
      <pre class="max-h-44 overflow-auto border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 font-mono text-xs leading-6 text-on-surface-variant/75 custom-scrollbar">${escapeHtml(
          query.rawSql || query.previewSql || '',
      )}</pre>
    </div>
  `;
}

function renderDocumentInsertTableForm(modal) {
    const selectedQuery = getSelectedDocumentInsertQuery(modal);
    const disabledAttribute =
        modal.loading || modal.submitting || !(modal.queries ?? []).length ? 'disabled aria-disabled="true"' : '';

    return `
    <form class="space-y-5" data-form="document-insert-table">
      ${renderDocumentInsertQuerySelect(modal, 'No saved queries are available for this database.')}
      ${renderDocumentInsertQueryPreview(selectedQuery)}
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button class="standard-button" data-action="close-modal" type="button">Cancel</button>
        <button class="signature-button" type="submit" ${disabledAttribute}>
          ${modal.submitting ? 'Inserting...' : 'Insert Table'}
        </button>
      </div>
    </form>
  `;
}

function renderDocumentInsertNoteForm(modal) {
    const selectedQuery = getSelectedDocumentInsertQuery(modal);
    const note = String(selectedQuery?.notes ?? '').trim();
    const disabledAttribute =
        modal.loading || modal.submitting || !(modal.queries ?? []).length ? 'disabled aria-disabled="true"' : '';

    return `
    <form class="space-y-5" data-form="document-insert-note">
      ${renderDocumentInsertQuerySelect(modal, 'No saved queries with notes are available for this database.')}
      ${
          note
              ? `
            <div class="space-y-2">
              <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
                Note Preview
              </div>
              <pre class="max-h-64 overflow-auto whitespace-pre-wrap border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-sm leading-6 text-on-surface custom-scrollbar">${escapeHtml(
                  note,
              )}</pre>
            </div>
          `
              : ''
      }
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button class="standard-button" data-action="close-modal" type="button">Cancel</button>
        <button class="signature-button" type="submit" ${disabledAttribute}>
          ${modal.submitting ? 'Inserting...' : 'Insert Note'}
        </button>
      </div>
    </form>
  `;
}

function renderQueryExportPreview(lines = []) {
    return lines.map(line => `<span class="block whitespace-pre">${escapeHtml(line)}</span>`).join('');
}

function getExportOptions() {
    return [
        { label: 'CSV', format: 'csv', icon: 'table_rows', meta: '.csv', preview: ['id,name', '1,Acme'] },
        { label: 'TSV', format: 'tsv', icon: 'view_column', meta: '.tsv', preview: ['id\tname', '1\tAcme'] },
        {
            label: 'Markdown',
            format: 'md',
            icon: 'article',
            meta: '.md',
            preview: ['| id | name |', '| --- | --- |'],
        },
        {
            label: 'JSON',
            format: 'json',
            icon: 'data_object',
            meta: '.json',
            preview: ['[', '  {"id":1,"name":"Acme"}', ']'],
        },
        {
            label: 'Parquet',
            format: 'parquet',
            icon: 'dataset',
            meta: '.parquet',
            preview: ['columnar binary', 'typed row groups'],
        },
        {
            label: 'Duplicate',
            format: 'table',
            icon: 'table_chart',
            meta: 'as table',
            preview: ['columns inferred', 'rows prefilled'],
        },
    ];
}

function renderTextExportModal(modal, action) {
    const disabledAttribute = modal.submitting ? 'disabled aria-disabled="true"' : '';

    return `
    <div class="space-y-5" data-export-modal>
      <label class="block space-y-2">
        <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Filename
        </span>
        <input
          autocomplete="off"
          class="control-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
          name="filename"
          spellcheck="false"
          type="text"
          value="${escapeHtml(modal.filename ?? '')}"
          ${disabledAttribute}
        />
      </label>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        ${getExportOptions()
            .map(
                option => `
              <button
                class="group flex min-h-36 flex-col justify-between border border-outline-variant/20 bg-surface-container-low px-5 py-5 text-left text-on-surface transition-colors hover:border-primary-container/45 hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-container disabled:cursor-wait disabled:opacity-60"
                data-action="${escapeHtml(action)}"
                data-export-format="${escapeHtml(option.format)}"
                type="button"
                ${disabledAttribute}
              >
                <span class="flex w-full items-start justify-between gap-4">
                  <span class="flex min-w-0 items-center gap-3">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center border border-outline-variant/20 bg-surface-container-highest text-primary-container group-hover:border-primary-container/35">
                      <span class="material-symbols-outlined text-xl">${escapeHtml(option.icon)}</span>
                    </span>
                    <span class="min-w-0">
                      <span class="block truncate font-body text-lg font-black uppercase tracking-normal text-primary-container">
                        ${escapeHtml(option.label)}
                      </span>
                      <span class="mt-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/55">
                        ${escapeHtml(option.meta)}
                      </span>
                    </span>
                  </span>
                  <span class="material-symbols-outlined mt-1 text-base text-on-surface-variant/35 group-hover:text-primary-container">
                    arrow_forward
                  </span>
                </span>
                <span class="mt-5 block w-full overflow-hidden border border-outline-variant/10 bg-surface-container-lowest px-3 py-3 font-mono text-[11px] leading-5 text-on-surface-variant/70">
                  ${renderQueryExportPreview(option.preview)}
                </span>
              </button>
            `,
            )
            .join('')}
      </div>
      ${renderError(modal.error)}
      <div class="flex justify-start">
        <button class="standard-button" data-action="close-modal" type="button">
          Cancel
        </button>
      </div>
    </div>
  `;
}

function renderQueryExportModal(modal) {
    return renderTextExportModal(modal, 'export-query-format');
}

function renderDataExportModal(modal) {
    return renderTextExportModal(modal, 'export-data-format');
}

function getCopyColumnResult(state, modal) {
    return modal.scope === 'charts' ? state.charts.result : state.editor.result;
}

function renderCopyColumnPreview(modal, state) {
    const result = getCopyColumnResult(state, modal);
    const isMarkdownTodo = isMarkdownTodoCopyColumnMode(modal.copyMode);
    const separator =
        Boolean(modal.lineBreaks) && !isMarkdownTodoCopyColumnMode(modal.copyMode)
            ? '\n'
            : String(modal.separator ?? ',');
    const wrapper = String(modal.wrapper ?? '"');
    const preview = isMarkdownTodo
        ? (modal.editedText ??
          buildCopyColumnText({
              result,
              columnName: modal.columnName,
              copyMode: modal.copyMode,
              separator: '\n',
              wrapper,
          }).text)
        : buildCopyColumnPreviewText({
              result,
              columnName: modal.columnName,
              copyMode: modal.copyMode,
              separator,
              wrapper,
              maxRows: 4,
          });

    if (!preview && !isMarkdownTodo) {
        return '';
    }

    if (isMarkdownTodo) {
        return `
      <label class="block space-y-2">
        <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Editable Preview
        </span>
        <textarea
          class="copy-column-preview copy-column-preview--editable custom-scrollbar"
          name="editedText"
          spellcheck="true"
        >${escapeHtml(preview)}</textarea>
      </label>
    `;
    }

    return `
    <div class="space-y-2">
      <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        Preview
      </div>
      <pre class="copy-column-preview custom-scrollbar">${escapeHtml(preview)}</pre>
    </div>
  `;
}

function renderCopyColumnLineBreaksField({ checked = false, disabled = false } = {}) {
    return `
    <label class="block space-y-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        Format
      </span>
      <span class="standard-checkbox ${disabled ? 'is-disabled' : ''}">
        <input
          ${checked ? 'checked' : ''}
          ${disabled ? 'disabled' : ''}
          data-bind="copy-column-format-field"
          data-field="lineBreaks"
          name="lineBreaks"
          type="checkbox"
        />
        <span>Line breaks</span>
      </span>
    </label>
  `;
}

function renderCopyColumnFormatField({ label, name, value = '' }) {
    return `
    <label class="block space-y-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        ${escapeHtml(label)}
      </span>
      <input
        class="control-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
        data-bind="copy-column-format-field"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        type="text"
        value="${escapeHtml(value)}"
      />
    </label>
  `;
}

export function renderCopyColumnModal(modal, state) {
    const result = getCopyColumnResult(state, modal);
    const rows = result?.rows ?? [];
    const valueCount = modal.copyMode === 'first-10' ? Math.min(rows.length, 10) : rows.length;
    const disabledAttribute = modal.submitting ? 'disabled aria-disabled="true"' : '';
    const exportMetadata = getCopyColumnExportMetadata(modal.copyMode);
    const isMarkdownTodo = isMarkdownTodoCopyColumnMode(modal.copyMode);
    const lineBreaks = isMarkdownTodo || Boolean(modal.lineBreaks);
    const formatFieldsMarkup = isMarkdownTodo
        ? renderCopyColumnLineBreaksField({
              checked: true,
              disabled: true,
          })
        : `
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        ${renderCopyColumnFormatField({
            label: 'Separator',
            name: 'separator',
            value: modal.separator ?? ',',
        })}
        ${renderCopyColumnFormatField({
            label: 'Wrapper',
            name: 'wrapper',
            value: modal.wrapper ?? '"',
        })}
        ${renderCopyColumnLineBreaksField({
            checked: lineBreaks,
        })}
      </div>
    `;

    return `
    <form class="space-y-5" data-form="copy-column">
      <input name="scope" type="hidden" value="${escapeHtml(modal.scope ?? 'editor')}" />
      <input name="columnName" type="hidden" value="${escapeHtml(modal.columnName ?? '')}" />
      <input name="copyMode" type="hidden" value="${escapeHtml(modal.copyMode ?? 'column')}" />
      <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Column
        </div>
        <div class="mt-2 flex min-w-0 items-center justify-between gap-4">
          <code class="min-w-0 truncate font-mono text-sm text-primary-container" title="${escapeHtml(
              modal.columnName ?? '',
          )}">${escapeHtml(modal.columnName ?? '')}</code>
          <span class="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/50">
            ${escapeHtml(getCopyColumnActionLabel(modal.copyMode))} · ${formatNumber(valueCount)}
          </span>
        </div>
      </div>
      ${formatFieldsMarkup}
      ${renderCopyColumnPreview(modal, state)}
      ${renderError(modal.error)}
      <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
          ${disabledAttribute}
        >
          Cancel
        </button>
        <div class="flex flex-wrap items-center justify-end gap-3">
          <button
            class="standard-button"
            name="intent"
            type="submit"
            value="export"
            ${disabledAttribute}
          >
            ${modal.submitting ? 'Working...' : `Export as ${exportMetadata.extension.toUpperCase()}`}
          </button>
          ${
              isMarkdownTodo
                  ? `
          <button
            class="standard-button"
            name="intent"
            type="submit"
            value="document"
            ${disabledAttribute}
          >
            ${modal.submitting ? 'Working...' : 'Export to document folder'}
          </button>
          `
                  : ''
          }
          <button
            class="signature-button"
            name="intent"
            type="submit"
            value="copy"
            ${disabledAttribute}
          >
            ${modal.submitting ? 'Working...' : 'Copy'}
          </button>
        </div>
      </div>
    </form>
  `;
}

function getTableDesignerUniqueConstraintTypeLabel(constraint) {
    if (constraint.partial) {
        return 'Partial unique index';
    }

    if ((constraint.columns?.length ?? 0) > 1) {
        return 'Multi-column unique';
    }

    return 'Unique constraint';
}

function renderTableDesignerUniqueConstraintExpression(constraint) {
    const expression = String(constraint.expression || constraint.sql || '').trim();

    if (expression) {
        return expression;
    }

    const columns = (constraint.columns ?? []).map(column => column.name).filter(Boolean);
    return columns.length ? `UNIQUE (${columns.join(', ')})` : 'UNIQUE constraint';
}

function renderTableDesignerCheckConstraintExpression(constraint) {
    return String(constraint.expression || '').trim() || 'CHECK constraint';
}

function normalizeTableDesignerConstraintColumnName(name) {
    return String(name ?? '')
        .trim()
        .toLowerCase();
}

function tableDesignerConstraintIncludesColumn(constraint, columnName) {
    const normalizedColumn = normalizeTableDesignerConstraintColumnName(columnName);

    if (!normalizedColumn) {
        return false;
    }

    return (constraint.columns ?? []).some(
        constraintColumn => normalizeTableDesignerConstraintColumnName(constraintColumn.name) === normalizedColumn,
    );
}

function renderTableDesignerUniqueConstraintEditor(constraint) {
    const columns = (constraint.columns ?? []).map(column => column.name).filter(Boolean);

    return `
    <article class="table-designer-constraint-editor">
      <div class="table-designer-constraint-editor__header">
        <div class="min-w-0">
          <div class="table-designer-constraint-editor__type">
            ${escapeHtml(getTableDesignerUniqueConstraintTypeLabel(constraint))}
            ${constraint.origin ? ` // origin ${escapeHtml(constraint.origin)}` : ''}
          </div>
          <input
            class="table-designer-field table-designer-constraint-editor__name"
            data-bind="table-designer-constraint-field"
            data-constraint-id="${escapeHtml(constraint.id)}"
            data-constraint-kind="unique"
            data-field="name"
            spellcheck="false"
            type="text"
            value="${escapeHtml(constraint.name || 'UNIQUE constraint')}"
          />
        </div>
        <div class="status-badge status-badge--muted">Rebuild</div>
      </div>
      ${
          columns.length
              ? `
            <div class="table-designer-constraint__columns">
              ${columns.map(column => `<span>${escapeHtml(column)}</span>`).join('')}
            </div>
          `
              : ''
      }
      <textarea
        class="table-designer-constraint-editor__sql custom-scrollbar"
        data-bind="table-designer-constraint-field"
        data-constraint-id="${escapeHtml(constraint.id)}"
        data-constraint-kind="unique"
        data-field="expression"
        spellcheck="false"
      >${escapeHtml(renderTableDesignerUniqueConstraintExpression(constraint))}</textarea>
    </article>
  `;
}

function renderTableDesignerCheckConstraintEditor(constraint) {
    const columns = constraint.columns ?? [];
    const allowedValues = columns.flatMap(column =>
        (column.allowedValues ?? []).map(value => ({
            columnName: column.name,
            value,
        })),
    );

    return `
    <article class="table-designer-constraint-editor">
      <div class="table-designer-constraint-editor__header">
        <div class="min-w-0">
          <div class="table-designer-constraint-editor__type">
            ${columns.length ? escapeHtml(columns.map(column => column.name).join(', ')) : 'Table check'}
          </div>
          <input
            class="table-designer-field table-designer-constraint-editor__name"
            data-bind="table-designer-constraint-field"
            data-constraint-id="${escapeHtml(constraint.id)}"
            data-constraint-kind="check"
            data-field="name"
            spellcheck="false"
            type="text"
            value="${escapeHtml(constraint.name || 'CHECK constraint')}"
          />
        </div>
        <div class="status-badge status-badge--muted">Rebuild</div>
      </div>
      ${
          allowedValues.length
              ? `
            <div class="table-designer-constraint__values custom-scrollbar">
              ${allowedValues
                  .map(
                      entry => `
                    <span title="${escapeHtml(entry.columnName)}">${escapeHtml(entry.value)}</span>
                  `,
                  )
                  .join('')}
            </div>
          `
              : ''
      }
      <textarea
        class="table-designer-constraint-editor__sql custom-scrollbar"
        data-bind="table-designer-constraint-field"
        data-constraint-id="${escapeHtml(constraint.id)}"
        data-constraint-kind="check"
        data-field="expression"
        spellcheck="false"
      >${escapeHtml(renderTableDesignerCheckConstraintExpression(constraint))}</textarea>
    </article>
  `;
}

function renderTableDesignerConstraintSection({ title, count, emptyText, body }) {
    return `
    <section class="table-designer-constraints-modal__section">
      <div class="table-designer-constraints-modal__section-header">
        <div class="table-designer-constraints-modal__section-title">${escapeHtml(title)}</div>
        <div class="status-badge status-badge--muted">${formatNumber(count)}</div>
      </div>
      ${
          count
              ? `<div class="table-designer-constraints__list">${body}</div>`
              : `<div class="table-designer-constraints-modal__empty">${escapeHtml(emptyText)}</div>`
      }
    </section>
  `;
}

function renderTableDesignerConstraintsModal(modal, state) {
    const draft = state.tableDesigner?.draft;

    if (!draft) {
        return `
      <div class="table-designer-constraints-modal__empty">
        No active table designer draft.
      </div>
      <div class="flex items-center justify-between gap-3 pt-2">
        <button class="standard-button" data-action="close-modal" type="button">Close</button>
      </div>
    `;
    }

    const selectedColumn = modal.columnId ? (draft.columns ?? []).find(column => column.id === modal.columnId) : null;
    const selectedColumnName = String(modal.columnName ?? selectedColumn?.name ?? '').trim();
    const hasSelectedColumn = Boolean(modal.columnId || selectedColumnName);
    const selectedColumnLabel = selectedColumnName || 'Unnamed column';
    const allUniqueConstraints = draft.mode === 'edit' ? (draft.uniqueConstraints ?? []) : [];
    const allCheckConstraints = draft.mode === 'edit' ? (draft.checkConstraints ?? []) : [];
    const uniqueConstraints = hasSelectedColumn
        ? allUniqueConstraints.filter(constraint =>
              tableDesignerConstraintIncludesColumn(constraint, selectedColumnName),
          )
        : allUniqueConstraints;
    const checkConstraints = hasSelectedColumn
        ? allCheckConstraints.filter(constraint =>
              tableDesignerConstraintIncludesColumn(constraint, selectedColumnName),
          )
        : allCheckConstraints;
    const totalCount = uniqueConstraints.length + checkConstraints.length;

    return `
    <div class="table-designer-constraints-modal">
      <div class="table-designer-constraints-modal__summary">
        <div class="min-w-0">
          <div class="table-designer-constraints-modal__label">Table</div>
          <code title="${escapeHtml(draft.tableName ?? '')}">${escapeHtml(draft.tableName ?? '')}</code>
        </div>
        ${
            hasSelectedColumn
                ? `
              <div class="min-w-0">
                <div class="table-designer-constraints-modal__label">Column</div>
                <code title="${escapeHtml(selectedColumnLabel)}">${escapeHtml(selectedColumnLabel)}</code>
              </div>
            `
                : ''
        }
        <div class="status-badge status-badge--primary">V2 · ${formatNumber(totalCount)}</div>
      </div>
      ${renderTableDesignerConstraintSection({
          title: 'Check constraints',
          count: checkConstraints.length,
          emptyText: hasSelectedColumn
              ? 'No check constraints detected for this column.'
              : 'No check constraints detected.',
          body: checkConstraints.map(renderTableDesignerCheckConstraintEditor).join(''),
      })}
      ${renderTableDesignerConstraintSection({
          title: hasSelectedColumn ? 'Related unique constraints' : 'Unique constraints',
          count: uniqueConstraints.length,
          emptyText: hasSelectedColumn
              ? 'No related multi-column or partial unique constraints detected.'
              : 'No multi-column or partial unique constraints detected.',
          body: uniqueConstraints.map(renderTableDesignerUniqueConstraintEditor).join(''),
      })}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button class="standard-button" data-action="close-modal" type="button">Close</button>
      </div>
    </div>
  `;
}

function renderCreateMediaTaggingMappingTableForm(modal, state) {
    const mappingExists = hasDefaultMediaTaggingMappingTable(state.mediaTagging.schemaTables ?? []);
    const readOnly = Boolean(state.mediaTagging.connection?.readOnly);

    return `
    <form class="space-y-5" data-form="create-media-tagging-mapping-table">
      <div class="space-y-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Mapping Table
        </div>
        <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 font-mono text-sm text-on-surface">
          ${escapeHtml(MEDIA_TAGGING_DEFAULT_MAPPING_TABLE)}
        </div>
      </div>
      <div class="space-y-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Status
        </div>
        <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface">
          ${
              mappingExists
                  ? `${escapeHtml(MEDIA_TAGGING_DEFAULT_MAPPING_TABLE)} already exists in the active database.`
                  : `${escapeHtml(MEDIA_TAGGING_DEFAULT_MAPPING_TABLE)} does not exist yet.`
          }
          ${
              readOnly && !mappingExists
                  ? `<div class="mt-2 text-on-surface-variant/60">The active connection is read-only, so the table cannot be created here.</div>`
                  : ''
          }
        </div>
      </div>
      <div class="space-y-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          SQL
        </div>
        ${renderSqlPreviewField(MEDIA_TAGGING_DEFAULT_MAPPING_TABLE_SQL)}
      </div>
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Close
        </button>
        ${
            !mappingExists
                ? `
                <button
                  class="standard-button"
                  type="submit"
                  ${readOnly ? 'disabled' : ''}
                >
                  ${modal.submitting ? 'Creating...' : 'Create Table'}
                </button>
              `
                : ''
        }
      </div>
    </form>
  `;
}

function renderCreateMediaTaggingTagTableForm(modal, state) {
    const tagTableExists = hasDefaultMediaTaggingTagTable(state.mediaTagging.schemaTables ?? []);
    const readOnly = Boolean(state.mediaTagging.connection?.readOnly);

    return `
    <form class="space-y-5" data-form="create-media-tagging-tag-table">
      <div class="space-y-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Tag Table
        </div>
        <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 font-mono text-sm text-on-surface">
          ${escapeHtml(MEDIA_TAGGING_DEFAULT_TAG_TABLE)}
        </div>
      </div>
      <div class="space-y-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          Status
        </div>
        <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface">
          ${
              tagTableExists
                  ? `${escapeHtml(MEDIA_TAGGING_DEFAULT_TAG_TABLE)} already exists in the active database.`
                  : `${escapeHtml(MEDIA_TAGGING_DEFAULT_TAG_TABLE)} does not exist yet.`
          }
          ${
              readOnly && !tagTableExists
                  ? `<div class="mt-2 text-on-surface-variant/60">The active connection is read-only, so the table cannot be created here.</div>`
                  : ''
          }
        </div>
      </div>
      <div class="space-y-3">
        <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
          SQL
        </div>
        ${renderSqlPreviewField(MEDIA_TAGGING_DEFAULT_TAG_TABLE_SQL)}
      </div>
      ${renderError(modal.error)}
      <div class="flex items-center justify-between gap-3 pt-2">
        <button
          class="standard-button"
          data-action="close-modal"
          type="button"
        >
          Close
        </button>
        ${
            !tagTableExists
                ? `
                <button
                  class="standard-button"
                  type="submit"
                  ${readOnly ? 'disabled' : ''}
                >
                  ${modal.submitting ? 'Creating...' : 'Create Table'}
                </button>
              `
                : ''
        }
      </div>
    </form>
  `;
}

export function renderModal(state) {
    const modal = state.modal;

    if (!modal) {
        return '';
    }

    const contentByKind = {
        'open-connection': {
            eyebrow: 'Filesystem // Open existing SQLite database',
            title: 'Connect Database',
            body: renderOpenConnectionForm(modal),
        },
        'create-connection': {
            eyebrow: 'Filesystem // Create a new SQLite database',
            title: 'Create Database',
            body: renderCreateDatabaseForm(modal),
        },
        'import-sql': {
            eyebrow: 'Import // Execute SQL dump into SQLite',
            title: 'Import SQL Dump',
            body: renderImportSqlForm(modal, state),
        },
        'create-backup': {
            eyebrow: 'Backups // Managed SQLite snapshot',
            title: 'Create Backup',
            body: renderCreateBackupForm(modal),
        },
        'delete-backup': {
            eyebrow: 'Backups // Confirm deletion',
            title: 'Delete Backup',
            body: renderDeleteBackupForm(modal),
        },
        'edit-backup': {
            eyebrow: 'Backups // Edit',
            title: 'Edit Backup',
            body: renderEditBackupForm(modal),
        },
        'backup-safety': {
            eyebrow: 'Backups // Safety check',
            title: 'Create a safety backup?',
            body: renderBackupSafetyForm(modal),
        },
        'generate-types': {
            eyebrow: 'Structure // Type generation',
            title: 'Generate Types',
            body: renderGenerateTypesForm(modal),
        },
        'generate-data': {
            eyebrow: 'Data Browser // Synthetic rows',
            title: 'Generate Synthetic Data',
            body: renderGenerateDataForm(modal),
        },
        'edit-connection': {
            eyebrow: 'Registry // Update saved SQLite target',
            title: 'Edit Connection',
            body: renderEditConnectionForm(modal),
        },
        'delete-row': {
            eyebrow: 'Mutation // Confirm row deletion',
            title: 'Delete Row',
            body: renderDeleteRowConfirmForm(modal),
        },
        'row-update-preview': {
            eyebrow: 'Mutation // Review row update',
            title: 'Review Update',
            body: renderRowUpdatePreviewForm(modal),
        },
        'chart-editor': {
            eyebrow: 'Charts // Configure query-based ECharts panel',
            title: modal.draft?.mode === 'edit' ? 'Edit Chart' : 'New Chart',
            body: renderChartEditorForm(modal, state),
        },
        'delete-chart': {
            eyebrow: 'Charts // Confirm chart deletion',
            title: 'Delete Chart',
            body: renderDeleteChartForm(modal),
        },
        'delete-query-history': {
            eyebrow: 'History // Confirm query deletion',
            title: 'Delete Query',
            body: renderDeleteQueryHistoryForm(modal),
        },
        'delete-document': {
            eyebrow: 'Documents // Confirm deletion',
            title: 'Delete Document',
            body: renderDeleteDocumentForm(modal),
        },
        'delete-api-token': {
            eyebrow: 'Settings // Confirm token deletion',
            title: 'Delete API Token',
            body: renderDeleteApiTokenForm(modal),
        },
        'document-insert-table': {
            eyebrow: 'Documents // Saved query output',
            title: 'Insert Table',
            body: renderDocumentInsertTableForm(modal),
        },
        'document-insert-note': {
            eyebrow: 'Documents // Saved query notes',
            title: 'Insert Note',
            body: renderDocumentInsertNoteForm(modal),
        },
        'query-export': {
            eyebrow: 'SQL Editor // Export query result',
            title: 'Export Query',
            body: renderQueryExportModal(modal),
        },
        'data-export': {
            eyebrow: 'Data Browser // Export table data',
            title: 'Export Table',
            body: renderDataExportModal(modal),
        },
        'copy-column': {
            eyebrow: 'Results // Copy or export column values',
            title: isMarkdownTodoCopyColumnMode(modal.copyMode) ? 'Export Markdown Todo' : 'Copy column',
            body: renderCopyColumnModal(modal, state),
        },
        'table-designer-constraints': {
            eyebrow: 'Table Designer // Constraints',
            title: 'Checks',
            body: renderTableDesignerConstraintsModal(modal, state),
        },
        'create-media-tagging-tag-table': {
            eyebrow: 'Media Tagging // Create default tag table',
            title: 'Create Tag Table',
            body: renderCreateMediaTaggingTagTableForm(modal, state),
        },
        'create-media-tagging-mapping-table': {
            eyebrow: 'Media Tagging // Create default join table',
            title: 'Create Mapping Table',
            body: renderCreateMediaTaggingMappingTableForm(modal, state),
        },
    };

    const config = contentByKind[modal.kind];

    if (!config) {
        return '';
    }

    const modalBodyClass =
        modal.kind === 'generate-data'
            ? 'app-modal-body app-modal-body--no-scroll px-6 py-6'
            : 'app-modal-body custom-scrollbar space-y-5 px-6 py-6';

    return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-4 backdrop-blur-sm">
      <div class="app-modal-shell w-full ${
          modal.kind === 'chart-editor' ||
          modal.kind === 'document-insert-table' ||
          modal.kind === 'document-insert-note' ||
          modal.kind === 'row-update-preview' ||
          modal.kind === 'table-designer-constraints'
              ? 'max-w-3xl'
              : modal.kind === 'generate-types' || modal.kind === 'generate-data'
                ? 'max-w-6xl'
                : modal.kind === 'query-export' || modal.kind === 'data-export' || modal.kind === 'backup-safety'
                  ? 'max-w-4xl'
                  : 'max-w-xl'
      } border border-outline-variant/20 bg-surface-container shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div class="shrink-0 flex items-start justify-between gap-4 border-b border-outline-variant/10 bg-surface-container-low px-6 py-5">
          <div>
            <div class="text-[10px] font-mono uppercase tracking-[0.26em] text-primary-container/70">
              ${escapeHtml(config.eyebrow)}
            </div>
            <h2 class="mt-2 font-body text-3xl font-black uppercase tracking-tight text-primary-container">
              ${escapeHtml(config.title)}
            </h2>
          </div>
          <button
            class="control-icon-button border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-highest hover:text-primary-container"
            data-action="close-modal"
            type="button"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="${modalBodyClass}">${config.body}</div>
      </div>
    </div>
  `;
}
