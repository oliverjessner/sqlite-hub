import { escapeHtml, formatCellValue, formatNumber, highlightSql, truncateMiddle } from '../utils/format.js';
import {
    hasDefaultMediaTaggingTagTable,
    hasDefaultMediaTaggingMappingTable,
    MEDIA_TAGGING_DEFAULT_MAPPING_TABLE,
    MEDIA_TAGGING_DEFAULT_TAG_TABLE,
} from '../lib/mediaTaggingDefaults.js';

function normalizeDraft(draft = {}) {
    return {
        tagTable: MEDIA_TAGGING_DEFAULT_TAG_TABLE,
        mediaTable: String(draft.mediaTable ?? '').trim(),
        pathColumn: String(draft.pathColumn ?? '').trim(),
        taggedColumn: String(draft.taggedColumn ?? '').trim(),
        untaggedQuery: String(draft.untaggedQuery ?? ''),
        taggedQuery: String(draft.taggedQuery ?? ''),
        mappingTable: MEDIA_TAGGING_DEFAULT_MAPPING_TABLE,
    };
}

function hasConfigResetNotice(state) {
    if (!state.mediaTagging.persistedConfig) {
        return false;
    }

    const persisted = normalizeDraft(state.mediaTagging.persistedConfig ?? {});
    const draft = normalizeDraft(state.mediaTagging.draft ?? {});

    return JSON.stringify(persisted) !== JSON.stringify(draft);
}

function getMediaTaggingIssueKey(issue = {}) {
    return `issue:${String(issue.scope ?? '').trim()}:${String(issue.code ?? '').trim()}:${String(issue.message ?? '').trim()}`;
}

function getMediaTaggingRouteErrorKey(error = {}) {
    return `route:${String(error.code ?? '').trim()}:${String(error.message ?? '').trim()}`;
}

function renderIssueCard({ code, message, toneClass = '', issueKey }) {
    return `
        <article class="media-tagging-issue ${toneClass}">
          <button
            class="media-tagging-issue__dismiss"
            data-action="dismiss-media-tagging-issue"
            data-issue-key="${escapeHtml(issueKey)}"
            type="button"
            aria-label="Hide issue"
            title="Hide issue"
          >
            ×
          </button>
          <div class="media-tagging-issue__code">${escapeHtml(code)}</div>
          <div class="mt-2">${escapeHtml(message)}</div>
        </article>
      `;
}

function renderIssueList(state) {
    const routeError = state.mediaTagging.error;
    const issues = state.mediaTagging.issues ?? [];
    const dismissedIssueKeys = new Set(state.mediaTagging.dismissedIssueKeys ?? []);

    const routeErrorMarkup =
        routeError && !dismissedIssueKeys.has(getMediaTaggingRouteErrorKey(routeError))
            ? renderIssueCard({
                  code: routeError.code,
                  message: routeError.message,
                  toneClass: 'is-error',
                  issueKey: getMediaTaggingRouteErrorKey(routeError),
              })
            : '';
    const issuesMarkup = issues
        .filter(issue => !dismissedIssueKeys.has(getMediaTaggingIssueKey(issue)))
        .map(issue =>
            renderIssueCard({
                code: issue.code,
                message: issue.message,
                toneClass: issue.severity === 'success' ? 'is-success' : '',
                issueKey: getMediaTaggingIssueKey(issue),
            }),
        )
        .join('');

    if (!routeErrorMarkup && !issuesMarkup) {
        return '';
    }

    return `
    <section class="media-tagging-issues">
      ${routeErrorMarkup}
      ${issuesMarkup}
    </section>
  `;
}

function renderSqlTextarea({ label, value = '', dataBind, dataField }) {
    return `
      <label class="media-tagging-field">
        <span class="media-tagging-field__label">${escapeHtml(label)}</span>
        <div class="sql-highlight-shell sql-highlight-shell--media">
          <div class="query-editor-layer sql-highlight-layer">
            <div
              aria-hidden="true"
              class="query-editor-highlight sql-highlight-content"
              data-query-editor-highlight
            >${value ? highlightSql(value) : ''}</div>
            <textarea
              class="query-editor-input sql-highlight-input custom-scrollbar"
              data-bind="${escapeHtml(dataBind)}"
              data-field="${escapeHtml(dataField)}"
              data-sql-highlight="true"
              spellcheck="false"
            >${escapeHtml(value)}</textarea>
          </div>
        </div>
      </label>
    `;
}

function renderOptionList(options = [], selectedValue, placeholder) {
    return [
        `<option value="">${escapeHtml(placeholder)}</option>`,
        ...options.map(
            option => `
        <option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? 'selected' : ''}>
          ${escapeHtml(option.label)}
        </option>
      `,
        ),
    ].join('');
}

function renderTagFormField(column, value) {
    if (column.inputKind === 'checkbox') {
        return `
      <div class="media-tagging-field">
        <label class="standard-checkbox table-designer-check table-designer-checkbox-override">
          <input
            data-bind="media-tagging-tag-form-field"
            data-field="${escapeHtml(column.name)}"
            type="checkbox"
            ${value ? 'checked' : ''}
          />
          <span class="media-tagging-field__meta">
            <span class="media-tagging-field__label">${escapeHtml(column.name)}</span>
            <span class="media-tagging-field__hint">${escapeHtml(
                column.declaredType || column.affinity || 'BOOLEAN',
            )}</span>
          </span>
        </label>
      </div>
    `;
    }

    return `
    <label class="media-tagging-field">
      <span class="media-tagging-field__label">${escapeHtml(column.name)}</span>
      <input
        class="control-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
        data-bind="media-tagging-tag-form-field"
        data-field="${escapeHtml(column.name)}"
        placeholder="name…"
        type="${column.inputKind === 'number' ? 'number' : 'text'}"
        value="${escapeHtml(value ?? '')}"
      />
    </label>
  `;
}

function renderParentTagFields({
    parentToggleColumn = null,
    parentSelectColumn = null,
    tagFormValues = {},
    parentTagOptions = [],
} = {}) {
    if (!parentToggleColumn && !parentSelectColumn) {
        return '';
    }

    const isCreatingParentTag = Boolean(parentToggleColumn ? tagFormValues[parentToggleColumn.name] : false);
    const selectedParentTagId = parentSelectColumn ? String(tagFormValues[parentSelectColumn.name] ?? '') : '';
    const parentSelectMarkup = parentSelectColumn
        ? [
              '<label class="media-tagging-field"><span class="media-tagging-field__label">Parent Tag</span>',
              '<select class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" data-bind="media-tagging-tag-form-field" data-field="',
              escapeHtml(parentSelectColumn.name),
              '" ',
              isCreatingParentTag ? 'disabled' : '',
              '>',
              renderOptionList(
                  parentTagOptions.map(tag => ({
                      value: String(tag.identityValue ?? ''),
                      label: tag.label,
                  })),
                  selectedParentTagId,
                  parentTagOptions.length ? 'Select a parent tag' : 'No parent tags available',
              ),
              '</select></label>',
          ].join('')
        : '';
    const parentToggleMarkup = parentToggleColumn
        ? [
              '<div class="media-tagging-field"><label class="standard-checkbox table-designer-check table-designer-checkbox-override">',
              '<input data-bind="media-tagging-tag-form-field" data-field="',
              escapeHtml(parentToggleColumn.name),
              '" type="checkbox" ',
              isCreatingParentTag ? 'checked' : '',
              '/>',
              '<span class="media-tagging-field__meta"><span class="media-tagging-field__label">Create Parent Tag</span></span>',
              '</label></div>',
          ].join('')
        : '';

    return [parentSelectMarkup, parentToggleMarkup].join('');
}

function renderTagList(tags = [], selectedTagKeys = []) {
    const selectedSet = new Set(selectedTagKeys);

    return `
    <div class="media-tagging-tag-list custom-scrollbar">
      ${
          tags.length
              ? tags
                    .map(
                        tag => `
                  <label
                    class="media-tagging-tag-option ${selectedSet.has(tag.key) ? 'is-selected' : ''}"
                    data-tag-search-text="${escapeHtml(
                        `${String(tag.label ?? '')} ${String(tag.parentTagLabel ?? '')}`.trim().toLowerCase(),
                    )}"
                  >
                    <input
                      class="media-tagging-tag-option__checkbox"
                      data-bind="media-tagging-tag-selection"
                      data-tag-key="${escapeHtml(tag.key)}"
                      type="checkbox"
                      ${selectedSet.has(tag.key) ? 'checked' : ''}
                    />
                    <span class="media-tagging-tag-option__content">
                      <span class="media-tagging-tag-option__text">${escapeHtml(tag.label)}</span>
                    </span>
                    ${
                        tag.parentTagLabel
                            ? `<span class="media-tagging-tag-option__badge">${escapeHtml(tag.parentTagLabel)}</span>`
                            : ''
                    }
                  </label>
                `,
                    )
                    .join('')
              : `<div class="text-sm text-on-surface-variant/55">No tags available yet.</div>`
      }
    </div>
  `;
}

function getWorkflowMetadataEntries(currentItem) {
    return Object.entries(currentItem?.row ?? {}).filter(([key]) => key !== '__sqlite_hub_media_rowid');
}

function renderCreatedTagList(tags = [], { canRemove = false, removingTagKey = null } = {}) {
    if (!tags.length) {
        return `
      <div class="text-sm text-on-surface-variant/55">
        No tags have been created yet for the selected tag table.
      </div>
    `;
    }

    return `
    <div class="media-tagging-created-tags custom-scrollbar">
      ${tags
          .map(tag => {
              const parentMetaMarkup =
                  tag.isParentTag || tag.parentTagLabel
                      ? [
                            '<div class="media-tagging-created-tag__meta">',
                            tag.isParentTag ? '<span class="media-tagging-created-tag__badge">Parent</span>' : '',
                            tag.parentTagLabel
                                ? [
                                      '<span class="media-tagging-created-tag__badge">',
                                      escapeHtml(tag.parentTagLabel),
                                      '</span>',
                                  ].join('')
                                : '',
                            '</div>',
                        ].join('')
                      : '';

              return [
                  '<article class="media-tagging-created-tag">',
                  '<div class="media-tagging-created-tag__content">',
                  '<div class="media-tagging-created-tag__label">',
                  escapeHtml(tag.label),
                  '</div>',
                  parentMetaMarkup,
                  '</div>',
                  '<button aria-label="Remove tag" class="delete-button media-tagging-created-tag__remove" data-action="remove-media-tag" data-tag-key="',
                  escapeHtml(tag.key),
                  '" type="button" title="Remove tag" ',
                  canRemove && removingTagKey !== tag.key ? '' : 'disabled',
                  '><span class="material-symbols-outlined text-sm">',
                  'delete',
                  '</span>',
                  removingTagKey === tag.key ? 'Removing...' : 'Delete',
                  '</button></article>',
              ].join('');
          })
          .join('')}
    </div>
  `;
}

function renderPreviewMedia(
    currentItem,
    { detailsVisible = true, mediaTableName = '', rotationDegrees = 0, status = null } = {},
) {
    if (!currentItem) {
        return `
      <div class="media-tagging-preview__empty">
        <span class="material-symbols-outlined text-4xl">photo_size_select_large</span>
        <div class="mt-3 font-headline text-lg uppercase tracking-[0.06em] text-primary-container">
          Queue Empty
        </div>
        <div class="mt-2 text-sm text-on-surface-variant/55">
          No current media item is available with the active configuration.
        </div>
      </div>
    `;
    }

    const pathValue = String(currentItem.path ?? '');
    const fileName = pathValue.split(/[\\/]/).filter(Boolean).pop() || 'Audio file';
    const isAudioPreview = Boolean(currentItem.previewUrl && currentItem.previewKind === 'audio');
    const isRotatablePreview = Boolean(
        currentItem.previewUrl && (currentItem.previewKind === 'image' || currentItem.previewKind === 'video'),
    );
    const numericRotation = Number(rotationDegrees);
    const normalizedRotation = Number.isFinite(numericRotation)
        ? ((Math.round(numericRotation / 90) * 90) % 360 + 360) % 360
        : 0;
    const rotationStyle = `--media-tagging-preview-rotation: ${normalizedRotation}deg;`;
    const rotationClass = normalizedRotation === 90 || normalizedRotation === 270 ? ' is-rotated-quarter' : '';
    let assetMarkup = `
    <div class="media-tagging-preview__placeholder">
      <span class="material-symbols-outlined text-5xl">perm_media</span>
    </div>
  `;

    if (currentItem.previewUrl && currentItem.previewKind === 'image') {
        assetMarkup = `
      <img
        class="media-tagging-preview__asset${rotationClass}"
        data-media-tagging-rotation-target="true"
        data-rotation-degrees="${escapeHtml(String(normalizedRotation))}"
        style="${escapeHtml(rotationStyle)}"
        src="${escapeHtml(currentItem.previewUrl)}"
        alt="${escapeHtml(pathValue || 'Current media item')}"
      />
    `;
    } else if (currentItem.previewUrl && currentItem.previewKind === 'video') {
        assetMarkup = `
      <video
        class="media-tagging-preview__asset${rotationClass}"
        data-media-tagging-rotation-target="true"
        data-rotation-degrees="${escapeHtml(String(normalizedRotation))}"
        style="${escapeHtml(rotationStyle)}"
        controls
        preload="metadata"
        src="${escapeHtml(
          currentItem.previewUrl,
      )}"
      ></video>
    `;
    } else if (currentItem.previewUrl && currentItem.previewKind === 'audio') {
        assetMarkup = `
      <div class="media-tagging-audio-preview">
        <div class="media-tagging-audio-preview__icon">
          <span class="material-symbols-outlined">audio_file</span>
        </div>
        <div class="media-tagging-audio-preview__content">
          <div class="media-tagging-audio-preview__eyebrow">Audio Preview</div>
          <div class="media-tagging-audio-preview__title" title="${escapeHtml(fileName)}">
            ${escapeHtml(truncateMiddle(fileName, 56))}
          </div>
          <audio
            class="media-tagging-audio-preview__player"
            controls
            preload="metadata"
            src="${escapeHtml(currentItem.previewUrl)}"
          ></audio>
        </div>
      </div>
    `;
    }

    const metadata = getWorkflowMetadataEntries(currentItem);
    const toggleLabel = detailsVisible
        ? '<span class="material-symbols-outlined">visibility_off</span> Hide Viewer'
        : '<span class="material-symbols-outlined">visibility</span> Show Viewer';

    return `
    <div class="media-tagging-preview ${detailsVisible ? '' : 'media-tagging-preview--meta-hidden'}">
      <div class="media-tagging-preview__media${isAudioPreview ? ' media-tagging-preview__media--audio' : ''}">
        <div class="media-tagging-preview__media-toolbar">
          <div class="media-tagging-status media-tagging-status--compact media-tagging-status--preview">
            <div class="media-tagging-status__value">${escapeHtml(status?.ratioLabel ?? '0 / 0')}</div>
            <div class="media-tagging-status__label">
              tagged / total
            </div>
          </div>
          <div class="media-tagging-preview__toolbar-actions">
            ${
                isRotatablePreview
                    ? `
            <div class="media-tagging-preview__rotation-controls" aria-label="Rotate media preview">
              <button
                class="standard-button media-tagging-preview__icon-button"
                data-action="rotate-media-tagging-current-media"
                data-rotation-command="left"
                type="button"
                aria-label="Rotate left 90 degrees"
                title="Rotate left 90 degrees"
              >
                <span class="material-symbols-outlined">rotate_left</span>
              </button>
              <button
                class="standard-button media-tagging-preview__icon-button"
                data-action="rotate-media-tagging-current-media"
                data-rotation-command="right"
                type="button"
                aria-label="Rotate right 90 degrees"
                title="Rotate right 90 degrees"
              >
                <span class="material-symbols-outlined">rotate_right</span>
              </button>
              <button
                class="standard-button media-tagging-preview__icon-button"
                data-action="rotate-media-tagging-current-media"
                data-rotation-command="reset"
                type="button"
                aria-label="Reset rotation"
                title="Reset rotation"
                ${normalizedRotation === 0 ? 'disabled' : ''}
              >
                <span class="material-symbols-outlined">restart_alt</span>
              </button>
            </div>
            `
                    : ''
            }
            <button
              class="standard-button panel-toggle-button media-tagging-preview__toggle ${detailsVisible ? '' : 'is-active'}"
              aria-pressed="${detailsVisible ? 'false' : 'true'}"
              data-action="toggle-media-tagging-current-media"
              data-next-value="${detailsVisible ? 'false' : 'true'}"
              data-expanded-label="Hide Viewer"
              data-collapsed-label="Show Viewer"
              aria-expanded="${detailsVisible ? 'true' : 'false'}"
              type="button"
            >
              ${toggleLabel}
            </button>
          </div>
        </div>
        <div class="media-tagging-preview__asset-shell">
          ${assetMarkup}
        </div>
      </div>
      <div class="media-tagging-preview__meta">
        <div class="media-tagging-preview__meta-header">
          <div class="media-tagging-preview__eyebrow">Current Media</div>
          <div class="media-tagging-preview__meta-actions">
            ${
                mediaTableName
                    ? `
                    <button
                      class="standard-button media-tagging-preview__meta-action"
                      data-action="open-media-tagging-current-in-structure"
                      type="button"
                    >
                      Open Structure
                    </button>
                  `
                    : ''
            }
            ${
                mediaTableName && currentItem.identity
                    ? `
                    <button
                      class="standard-button media-tagging-preview__meta-action"
                      data-action="open-media-tagging-current-in-data"
                      type="button"
                    >
                      Open In Data
                    </button>
                  `
                    : ''
            }
          </div>
        </div>
        ${
            metadata.length
                ? `
                <div class="media-tagging-preview__metadata">
                  ${metadata
                      .map(
                          ([key, value]) => `
                        <div class="media-tagging-preview__metadata-row">
                          <span>${escapeHtml(key)}</span>
                          <span title="${escapeHtml(formatCellValue(value))}">
                            ${escapeHtml(formatCellValue(value))}
                          </span>
                        </div>
                      `,
                      )
                      .join('')}
                </div>
              `
                : ''
        }
      </div>
    </div>
  `;
}

function renderTagsSection(state) {
    const tagColumns = state.mediaTagging.tagTableColumns ?? [];
    const tagFormValues = state.mediaTagging.tagFormValues ?? {};
    const tags = state.mediaTagging.tags ?? [];
    const tagTableExists = hasDefaultMediaTaggingTagTable(state.mediaTagging.schemaTables ?? []);
    const parentToggleColumn = tagColumns.find(column => column.uiRole === 'parent-toggle') ?? null;
    const parentSelectColumn = tagColumns.find(column => column.uiRole === 'parent-select') ?? null;
    const standardTagColumns = tagColumns.filter(column => !column.uiRole);
    const parentTagOptions = tags.filter(tag => tag.isParentTag);

    return `
    <section class="media-tagging-card shell-section">
      <div class="media-tagging-card__header">
        <div>
          <div class="media-tagging-card__eyebrow">1. Tags</div>
          <h2 class="media-tagging-card__title">Tag Table</h2>
        </div>
        <div class="flex flex-col items-end gap-3">
          <span class="status-badge ${tagTableExists ? 'status-badge--success' : ''}">
            ${tagTableExists ? 'Available' : 'Missing'}
          </span>
          <button
            class="standard-button"
            data-action="open-modal"
            data-modal="create-media-tagging-tag-table"
            type="button"
          >
            Create Tag Table
          </button>
        </div>
      </div>
      <div class="media-tagging-card__body">
        ${
            tagColumns.length
                ? `
                <div class="media-tagging-form-grid">
                  ${standardTagColumns.map(column => renderTagFormField(column, tagFormValues[column.name])).join('')}
                  ${renderParentTagFields({
                      parentToggleColumn,
                      parentSelectColumn,
                      tagFormValues,
                      parentTagOptions,
                  })}
                </div>
                <div class="flex flex-wrap items-center gap-3">
                  <button
                    class="standard-button"
                    data-action="create-media-tag"
                    type="button"
                    ${state.mediaTagging.creatingTag || state.mediaTagging.connection?.readOnly ? 'disabled' : ''}
                  ><span class="material-symbols-outlined">sell</span>
                    ${state.mediaTagging.creatingTag ? 'Saving...' : 'Create Tag'}
                  </button>
                  <div class="text-[11px] font-mono uppercase tracking-[0.14em] text-on-surface-variant/45">
                    ${escapeHtml(formatNumber(tags.length))} existing tag(s)
                  </div>
                </div>
                <div class="media-tagging-created-tags-shell">
                  <div class="media-tagging-field__label">Created Tags</div>
                  <div class="media-tagging-created-tags-frame mt-3">
                    ${renderCreatedTagList(tags, {
                        canRemove: !state.mediaTagging.connection?.readOnly,
                        removingTagKey: state.mediaTagging.removingTagKey,
                    })}
                  </div>
                  <div class="mt-3">
                    <button
                      class="standard-button"
                      data-action="copy-media-tags"
                      type="button"
                      ${tags.length ? '' : 'disabled'}
                    >
                      <span class="material-symbols-outlined text-sm">content_copy</span>
                      Copy Tags to clipboard
                    </button>
                  </div>
                </div>
              `
                : `
                <div class="text-sm text-on-surface-variant/55">
                  ${escapeHtml(MEDIA_TAGGING_DEFAULT_TAG_TABLE)} must exist to generate the tag creation form.
                </div>
              `
        }
      </div>
    </section>
  `;
}

function renderTaggingSection(state) {
    const tables = state.mediaTagging.schemaTables ?? [];
    const draft = normalizeDraft(state.mediaTagging.draft ?? {});
    const mediaTableColumns = state.mediaTagging.mediaTableColumns ?? [];
    const pathCandidates = state.mediaTagging.pathCandidates ?? [];
    const booleanCandidates = state.mediaTagging.booleanCandidates ?? [];
    const tableOptions = renderOptionList(
        tables
            .map(table => ({ value: table.name, label: table.name }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        draft.mediaTable,
        'Select a media table',
    );
    const pathOptions = renderOptionList(
        mediaTableColumns
            .map(column => ({
                value: column.name,
                label: pathCandidates.includes(column.name)
                    ? [column.name, ' // suggested'].join('')
                    : column.name,
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        draft.pathColumn,
        'Select the media path column',
    );
    const taggedOptions = renderOptionList(
        mediaTableColumns
            .map(column => ({
                value: column.name,
                label: booleanCandidates.includes(column.name)
                    ? [column.name, ' // suggested'].join('')
                    : column.name,
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        draft.taggedColumn,
        mediaTableColumns.length ? 'Select the tagged flag column' : 'No columns available',
    );

    return [
        '<section class="media-tagging-card media-tagging-card--tagging shell-section">',
        '<div class="media-tagging-card__header"><div><div class="media-tagging-card__eyebrow">2. Tagging</div><h2 class="media-tagging-card__title">Media Source</h2></div></div>',
        '<div class="media-tagging-card__body"><div class="media-tagging-form-grid">',
        '<label class="media-tagging-field"><span class="media-tagging-field__label">Media Table</span>',
        '<select class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" data-bind="media-tagging-field" data-field="mediaTable">',
        tableOptions,
        '</select></label><div></div>',
        '<label class="media-tagging-field"><span class="media-tagging-field__label">Path Column</span>',
        '<select class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" data-bind="media-tagging-field" data-field="pathColumn">',
        pathOptions,
        '</select></label>',
        '<label class="media-tagging-field"><span class="media-tagging-field__label">Tagged Boolean Column</span>',
        '<select class="control-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" data-bind="media-tagging-field" data-field="taggedColumn">',
        taggedOptions,
        '</select></label></div>',
        '<div class="media-tagging-query-grid">',
        renderSqlTextarea({
            label: 'Untagged Query',
            value: draft.untaggedQuery,
            dataBind: 'media-tagging-field',
            dataField: 'untaggedQuery',
        }),
        renderSqlTextarea({
            label: 'Tagged Query',
            value: draft.taggedQuery,
            dataBind: 'media-tagging-field',
            dataField: 'taggedQuery',
        }),
        '</div>',
        '<div class="flex flex-wrap items-center gap-3"><button class="standard-button" data-action="reset-media-tagging-queries" type="button">Reset Queries to Defaults</button></div>',
        '</div></section>',
    ].join('');
}

function renderMappingSection(state) {
    const candidates = state.mediaTagging.mappingCandidates ?? [];
    const mappingExists = hasDefaultMediaTaggingMappingTable(state.mediaTagging.schemaTables ?? []);
    const mappingCandidate =
        candidates.find(candidate => candidate.tableName === MEDIA_TAGGING_DEFAULT_MAPPING_TABLE) ?? null;

    return `
    <section class="media-tagging-card shell-section">
      <div class="media-tagging-card__header">
        <div>
          <div class="media-tagging-card__eyebrow">3. Mapping</div>
          <h2 class="media-tagging-card__title">Join Table</h2>
        </div>
        <div class="flex flex-col items-end gap-3">
          <span class="status-badge ${mappingExists ? 'status-badge--success' : ''}">
            ${mappingExists ? 'Available' : 'Missing'}
          </span>
          <button
            class="standard-button"
            data-action="open-modal"
            data-modal="create-media-tagging-mapping-table"
            type="button"
          >
            Create Mapping Table
          </button>
        </div>
      </div>
      <div class="media-tagging-card__body media-tagging-card__body--mapping">
        <article class="media-tagging-mapping-card ${mappingCandidate ? 'is-selected' : ''}">
          <div class="font-headline text-sm uppercase tracking-[0.08em] text-primary-container">
            ${escapeHtml(MEDIA_TAGGING_DEFAULT_MAPPING_TABLE)}
          </div>
          ${
              mappingCandidate
                  ? `
                      <div class="mt-2 text-xs text-on-surface-variant/65">
                        Media FK:
                        ${escapeHtml(
                            mappingCandidate.mediaForeignKey.mappings
                                .map(mapping => `${mapping.from} -> ${mapping.to}`)
                                .join(', '),
                        )}
                      </div>
                      <div class="mt-1 text-xs text-on-surface-variant/65">
                        Tag FK:
                        ${escapeHtml(
                            mappingCandidate.tagForeignKey.mappings
                                .map(mapping => `${mapping.from} -> ${mapping.to}`)
                                .join(', '),
                        )}
                      </div>
                    `
                  : `
                      <div class="mt-2 text-xs text-on-surface-variant/65">
                        ${
                            mappingExists
                                ? `${MEDIA_TAGGING_DEFAULT_MAPPING_TABLE} exists, but it does not currently resolve as the active media-to-tag mapping.`
                                : `${MEDIA_TAGGING_DEFAULT_MAPPING_TABLE} is missing. Open the create flow to inspect the SQL and create it.`
                        }
                      </div>
                    `
          }
        </article>

        <div class="media-tagging-card__footer">
          <button
            class="signature-button w-full"
            data-action="save-media-tagging"
            type="button"
            ${state.mediaTagging.saving ? 'disabled' : ''}
          >
            ${state.mediaTagging.saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
      
    </section>
  `;
}

function renderWorkflowSection(state) {
    const workflow = state.mediaTagging.workflow ?? null;
    const selectedTagKeys = state.mediaTagging.selectedTagKeys ?? [];
    const selectedTagCount = selectedTagKeys.length;
    const selectableTags = (state.mediaTagging.tags ?? []).filter(tag => !tag.isParentTag);
    const canWrite = Boolean(workflow?.canWrite);
    const hasResetNotice = hasConfigResetNotice(state);
    const detailsVisible = state.mediaTagging.workflowMediaDetailsVisible !== false;
    const mediaTableName = String(state.mediaTagging.draft?.mediaTable ?? '').trim();
    const status = workflow?.status ?? {
        taggedCount: 0,
        remainingCount: 0,
        totalCount: 0,
        ratioLabel: '0 / 0',
    };

    return `
    <section class="media-tagging-card shell-section media-tagging-card--workflow">
      <div class="media-tagging-card__body media-tagging-card__body--workflow">
        ${
            hasResetNotice
                ? `
                <div class="media-tagging-inline-warning">
                  Changing mapping or tagging settings replaces the stored workflow configuration for this database.
                </div>
              `
                : ''
        }
        ${renderPreviewMedia(workflow?.currentItem ?? null, {
            detailsVisible,
            mediaTableName,
            rotationDegrees: state.mediaTagging.workflowMediaRotationDegrees,
            status,
        })}
        <div class="media-tagging-workflow-sidebar">
          <div class="media-tagging-tag-panel">
            <div class="media-tagging-tag-panel__header">
              <div class="media-tagging-tag-panel__header-row">
                <div>
                  <div class="media-tagging-field__label">Available Tags</div>
                  <div class="mt-2 text-xs uppercase tracking-[0.12em] text-on-surface-variant/45">
                    ${escapeHtml(formatNumber(selectableTags.length))} selectable tag(s)
                  </div>
                </div>
              </div>
              <label class="media-tagging-field mt-4">
                <span class="media-tagging-field__label">Search</span>
                <input
                  class="control-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
                  data-bind="media-tagging-tag-search"
                  placeholder="Filter available tags"
                  type="text"
                />
              </label>
            </div>
            ${renderTagList(selectableTags, selectedTagKeys)}
            <div class="media-tagging-tag-panel__footer">
              <div class="media-tagging-tag-panel__footer-main">
                <div class="media-tagging-tag-panel__remaining">
                  ${escapeHtml(formatNumber(workflow?.status?.remainingCount ?? 0))} remaining 
                </div>
                <div class="media-tagging-tag-panel__actions">
                  <button
                    class="standard-button"
                    data-action="skip-media-tagging-item"
                    type="button"
                    ${workflow?.currentItem && canWrite && !state.mediaTagging.previewLoading && !state.mediaTagging.applying ? '' : 'disabled'}
                  >
                    ${state.mediaTagging.applying ? 'Saving...' : 'Skip'}
                  </button>
                  <button
                    class="signature-button"
                    data-action="apply-media-tagging"
                    data-can-apply="${workflow?.currentItem && canWrite && !state.mediaTagging.applying ? 'true' : 'false'}"
                    type="button"
                    ${workflow?.currentItem && canWrite && !state.mediaTagging.applying && selectedTagCount > 0 ? '' : 'disabled'}
                  >
                    ${state.mediaTagging.applying ? 'Saving...' : `${selectedTagCount} tagged & next`}
                  </button>
                </div>
              </div>
              ${
                  workflow?.allRemainingSkipped
                      ? `
                      <button
                        class="standard-button"
                        data-action="reset-skipped-media-tagging"
                        type="button"
                      >
                        Show Skipped Items Again
                      </button>
                    `
                      : ''
              }
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderMediaTaggingView(state, { subView = 'setup' } = {}) {
    const showSetup = subView === 'setup';
    const showQueue = subView === 'queue';

    return {
        main: `
      <section class="view-surface media-tagging-view">
        <div class="media-tagging-shell">
          ${renderIssueList(state)}

          ${
              showSetup
                  ? `
          <div class="media-tagging-grid">
            ${renderTagsSection(state)}
            ${renderTaggingSection(state)}
            ${renderMappingSection(state)}
          </div>
          `
                  : ''
          }

          ${showQueue ? renderWorkflowSection(state) : ''}
        </div>
      </section>
    `,
        panel: '',
    };
}
