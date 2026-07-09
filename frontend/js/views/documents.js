import { renderDropdownButton } from '../components/dropdownButton.js';
import { escapeHtml, formatCompactDateTime, formatNumber } from '../utils/format.js';
import { renderMarkdownPreview } from '../utils/markdownDocuments.js';

function renderMissingDatabase() {
    return `
      <section class="view-surface">
        <div class="view-frame flex min-h-full items-center justify-center">
          <div class="text-center">
            <span class="material-symbols-outlined mb-3 text-5xl text-on-surface-variant/25">database_off</span>
            <p class="font-body text-xl font-black uppercase tracking-tight text-primary-container">
              No Active SQLite Database
            </p>
            <p class="mt-3 max-w-xl text-sm leading-7 text-on-surface-variant/65">
              Select a database before opening its document folder.
            </p>
          </div>
        </div>
      </section>
    `;
}

function renderDocumentListItem(item, selectedId) {
    const isSelected = String(item.id) === String(selectedId);

    return `
      <button
        class="documents-list-item subnavi-item ${isSelected ? 'is-selected' : ''}"
        data-action="select-document"
        data-document-id="${escapeHtml(item.id)}"
        type="button"
      >
        <span class="material-symbols-outlined documents-list-item__icon">description</span>
        <span class="documents-list-item__body">
          <span class="documents-list-item__title" title="${escapeHtml(item.filename)}">
            ${escapeHtml(item.filename)}
          </span>
          <span class="documents-list-item__meta" data-document-list-meta>
            ${escapeHtml(formatCompactDateTime(item.updatedAt))} // ${formatNumber(item.contentLength ?? 0)} chars
          </span>
        </span>
      </button>
    `;
}

function getFilteredDocuments(items, searchQuery) {
    const normalizedSearch = String(searchQuery ?? '')
        .trim()
        .toLowerCase();

    if (!normalizedSearch) {
        return items;
    }

    return items.filter(item =>
        [item.filename, item.title]
            .filter(Boolean)
            .some(value => String(value).toLowerCase().includes(normalizedSearch)),
    );
}

function renderDocumentsSearch(documents) {
    return `
      <label class="table-designer-sidebar__search">
        <span class="material-symbols-outlined text-sm text-on-surface-variant/55">search</span>
        <input
          class="table-designer-sidebar__search-input"
          data-bind="documents-search"
          placeholder="Search documents..."
          spellcheck="false"
          type="search"
          value="${escapeHtml(documents.searchQuery ?? '')}"
        />
      </label>
    `;
}

function renderDocumentsSidebar(documents) {
    const items = documents.items ?? [];
    const folders = documents.folders ?? [];
    const filteredItems = getFilteredDocuments(items, documents.searchQuery);
    const searchActive = Boolean(String(documents.searchQuery ?? '').trim());
    const rootItems = filteredItems.filter(item => !item.folderId);
    const renderFolderGroup = (label, groupItems, options = {}) => {
        if (searchActive && !groupItems.length) {
            return '';
        }

        return `
          <div class="documents-folder-group">
            <div class="px-3 pb-1 pt-3 text-[10px] font-mono uppercase tracking-[0.2em] text-on-surface-variant/55">
              ${escapeHtml(label)}
            </div>
            ${
                groupItems.length
                    ? groupItems.map(item => renderDocumentListItem(item, documents.selectedId)).join('')
                    : `<div class="documents-list-empty">${escapeHtml(options.emptyText ?? 'No documents')}</div>`
            }
          </div>
        `;
    };
    const folderGroups = folders
        .map(folder =>
            renderFolderGroup(
                folder.name,
                filteredItems.filter(item => String(item.folderId ?? '') === String(folder.id)),
                { emptyText: 'Empty folder' },
            ),
        )
        .join('');
    const rootGroup = renderFolderGroup('No Folder', rootItems, {
        emptyText: folders.length ? 'No root documents' : 'No documents yet',
    });
    const listMarkup = rootGroup || folderGroups
        ? `${rootGroup}${folderGroups}`
        : `<div class="documents-list-empty">${
              items.length ? 'No documents match the current search.' : 'No documents yet'
          }</div>`;

    return `
      <aside class="documents-view__sidebar subnavi-panel">
        <div class="documents-view__sidebar-header subnavi-header">
          <div>
            <div class="subnavi-header-title">Documents</div>
            <div class="subnavi-header-details">${formatNumber(items.length)} files</div>
          </div>
        </div>
        ${renderDocumentsSearch(documents)}
        <div class="documents-view__sidebar-body subnavi-list custom-scrollbar">
          ${listMarkup}
        </div>
      </aside>
    `;
}

function renderDocumentImportFileInput() {
    return `
      <input
        accept=".md,.markdown,text/markdown,text/plain"
        data-bind="document-import-file"
        hidden
        type="file"
      />
    `;
}

function renderNewDocumentDropdown(documents, className = '') {
    return `
      <div class="${escapeHtml(className)}">
        ${renderDropdownButton({
            disabled: documents.saving,
            icon: 'add',
            label: 'New',
            title: 'New',
            items: [
                {
                    action: 'create-document',
                    icon: 'draft',
                    label: 'New Document',
                },
                {
                    action: 'open-create-document-folder-modal',
                    icon: 'create_new_folder',
                    label: 'New Folder',
                },
            ],
        })}
      </div>
    `;
}

function renderDocumentsViewDropdown(documents) {
    const documentsVisible = documents.documentsVisible !== false;
    const editorVisible = documents.editorVisible !== false;
    const previewVisible = documents.previewVisible !== false;

    return renderDropdownButton({
        icon: 'visibility',
        label: 'View',
        title: 'View options',
        items: [
            {
                action: 'toggle-document-pane',
                dataAttributes: { pane: 'editor' },
                icon: editorVisible ? 'visibility_off' : 'edit_note',
                label: `${editorVisible ? 'Hide' : 'Show'} Editor`,
            },
            {
                action: 'toggle-document-pane',
                dataAttributes: { pane: 'preview' },
                icon: previewVisible ? 'visibility_off' : 'visibility',
                label: `${previewVisible ? 'Hide' : 'Show'} Preview`,
            },
            {
                action: 'toggle-documents-panel',
                icon: documentsVisible ? 'visibility_off' : 'description',
                label: `${documentsVisible ? 'Hide' : 'Show'} Documents`,
            },
        ],
    });
}

function renderDocumentsFileDropdown(documents) {
    const exportDisabled = documents.saving || documents.detailLoading || !documents.selectedId;

    return renderDropdownButton({
        disabled: documents.saving,
        icon: 'folder_open',
        label: 'File',
        title: 'File actions',
        items: [
            {
                action: 'import-document-markdown',
                icon: 'upload_file',
                label: 'Import MD',
            },
            {
                action: 'export-document-markdown',
                disabled: exportDisabled,
                icon: 'download',
                label: 'Export MD',
            },
        ],
    });
}

function renderDocumentsMoveDropdown(documents) {
    const folders = documents.folders ?? [];
    const selectedFolderId = String(documents.selected?.folderId ?? '');

    return renderDropdownButton({
        disabled: documents.saving || documents.detailLoading || !documents.selectedId,
        icon: 'drive_file_move',
        label: 'Move to',
        title: 'Move document to folder',
        items: [
            {
                action: 'move-document-to-folder',
                disabled: !selectedFolderId,
                icon: 'folder_off',
                label: 'No Folder',
            },
            ...folders.map(folder => ({
                action: 'move-document-to-folder',
                dataAttributes: { folderId: folder.id },
                disabled: selectedFolderId === String(folder.id),
                icon: 'folder',
                label: folder.name,
            })),
        ],
    });
}

function renderDocumentsTitlebar(documents, options = {}) {
    const { showDocumentActions = false, showFilename = true } = options;
    const disabled = documents.saving || documents.detailLoading || !documents.selectedId;

    return `
      <div class="documents-titlebar">
        ${
            showFilename
                ? `
                  <label class="documents-filename-field">
                    <input
                      class="control-input"
                      data-bind="document-field"
                      data-field="filename"
                      name="filename"
                      spellcheck="false"
                      type="text"
                      value="${escapeHtml(documents.draftFilename)}"
                      ${!documents.selectedId ? 'disabled' : ''}
                    />
                  </label>
                `
                : ''
        }
        ${renderNewDocumentDropdown(documents, 'documents-create-button')}
        ${
            showDocumentActions
                ? `
                  ${renderDropdownButton({
                      disabled,
                      icon: 'add_box',
                      label: 'Insert',
                      title: 'Insert content',
                      items: [
                          {
                              action: 'open-document-insert-table-modal',
                              icon: 'table_chart',
                              label: 'Insert Table',
                          },
                          {
                              action: 'open-document-insert-note-modal',
                              icon: 'note_add',
                              label: 'Insert Query Note',
                          },
                          {
                              action: 'open-document-insert-table-definition-modal',
                              icon: 'schema',
                              label: 'Insert Table Definition',
                          },
                          {
                              action: 'insert-document-saved-queries',
                              icon: 'bookmark',
                              label: 'Insert Saved Queries',
                          },
                          {
                              action: 'insert-document-time-metadata',
                              icon: 'schedule',
                              label: 'Insert Time Metadata',
                          },
                          {
                              action: 'insert-document-database-info',
                              icon: 'database',
                              label: 'Insert Database Info',
                          },
                      ],
                  })}
                  ${renderDocumentsViewDropdown(documents)}
                  ${renderDocumentsFileDropdown(documents)}
                  ${renderDocumentsMoveDropdown(documents)}
                  <button
                    class="delete-button"
                    data-action="delete-document"
                    type="button"
                    ${disabled || documents.deleting ? 'disabled aria-disabled="true"' : ''}
                  >
                    <span class="material-symbols-outlined">delete</span>
                    Delete
                  </button>
                `
                : `
                  ${renderDocumentsViewDropdown(documents)}
                  ${renderDocumentsFileDropdown(documents)}
                `
        }
      </div>
    `;
}

function renderDocumentEditor(documents) {
    return `
      <section class="documents-pane documents-pane--editor ${documents.editorVisible ? '' : 'documents-pane--collapsed'}">
        <div class="documents-pane__header">
          <span class="documents-pane__meta">${formatNumber(documents.draftContent.length)} chars</span>
        </div>
        ${
            documents.editorVisible
                ? `
                  <textarea
                    class="documents-editor-input custom-scrollbar"
                    data-bind="document-field"
                    data-field="content"
                    name="content"
                    spellcheck="true"
                    ${!documents.selectedId ? 'disabled' : ''}
                  >${escapeHtml(documents.draftContent)}</textarea>
                `
                : ''
        }
      </section>
    `;
}

function renderDocumentPreview(documents) {
    const saveState = documents.dirty ? 'unsaved' : 'saved';

    return `
      <section class="documents-pane documents-pane--preview ${documents.previewVisible ? '' : 'documents-pane--collapsed'}">
        <div class="documents-pane__header">
          <span class="documents-pane__meta" data-document-save-state="${saveState}">${escapeHtml(saveState)}</span>
        </div>
        ${
            documents.previewVisible
                ? `
                  <div class="document-markdown-preview custom-scrollbar" data-document-preview>
                    ${renderMarkdownPreview(documents.draftContent)}
                  </div>
                `
                : ''
        }
      </section>
    `;
}

function renderEmptyDocumentsState(documents) {
    return `
      <div class="documents-empty-state">
        <span class="material-symbols-outlined">description</span>
        <p class="font-body text-2xl font-black uppercase tracking-tight text-primary-container">
          No Documents
        </p>
        ${renderNewDocumentDropdown(documents, 'mt-4')}
      </div>
    `;
}

function renderDocumentDetail(documents) {
    if (documents.loading && !documents.items.length) {
        return `
          <main class="documents-view__detail">
            ${renderDocumentsTitlebar(documents, { showFilename: false })}
            <div class="documents-empty-state">
              <span class="material-symbols-outlined">sync</span>
              <p class="font-body text-2xl font-black uppercase tracking-tight text-primary-container">
                Loading Documents
              </p>
            </div>
          </main>
        `;
    }

    if (!documents.selectedId) {
        return `
          <main class="documents-view__detail">
            ${renderDocumentsTitlebar(documents, { showFilename: false })}
            ${renderEmptyDocumentsState(documents)}
          </main>
        `;
    }

    const workspaceClasses = [
        'documents-workspace',
        documents.editorVisible && documents.previewVisible ? 'documents-workspace--split' : '',
        !documents.editorVisible ? 'documents-workspace--editor-collapsed' : '',
        !documents.previewVisible ? 'documents-workspace--preview-collapsed' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return `
      <main class="documents-view__detail">
        ${renderDocumentsTitlebar(documents, { showDocumentActions: true })}
        ${documents.saveError ? `<div class="documents-error">${escapeHtml(documents.saveError.message)}</div>` : ''}
        <div class="${workspaceClasses}">
          ${renderDocumentEditor(documents)}
          ${renderDocumentPreview(documents)}
        </div>
      </main>
    `;
}

export function renderDocumentsView(state) {
    if (!state.connections.active) {
        return {
            main: renderMissingDatabase(),
            panel: '',
        };
    }

    const documents = state.documents;
    const documentsVisible = documents.documentsVisible !== false;

    return {
        main: `<div class="documents-view ${documentsVisible ? 'documents-view--with-subnavi' : ''}">
                ${renderDocumentImportFileInput()}
                ${documentsVisible ? renderDocumentsSidebar(documents) : ''}
                ${renderDocumentDetail(documents)}
              </div>`,
        panel: '',
    };
}
