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
          <span class="documents-list-item__meta">
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
    const filteredItems = getFilteredDocuments(items, documents.searchQuery);

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
          ${
              filteredItems.length
                  ? filteredItems.map(item => renderDocumentListItem(item, documents.selectedId)).join('')
                  : `<div class="documents-list-empty">${
                        items.length ? 'No documents match the current search.' : 'No documents yet'
                    }</div>`
          }
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
            label: 'New Document',
            title: 'New document',
            items: [
                {
                    action: 'create-document',
                    icon: 'draft',
                    label: 'Blank Page',
                },
                {
                    action: 'import-document-markdown',
                    icon: 'upload_file',
                    label: 'Import .md',
                },
            ],
        })}
      </div>
    `;
}

function renderDocumentsPanelToggle(documents) {
    const visible = documents.documentsVisible !== false;

    return `
      <button
        class="standard-button panel-toggle-button ${visible ? '' : 'is-active'}"
        aria-pressed="${visible ? 'false' : 'true'}"
        data-action="toggle-documents-panel"
        type="button"
      >
        <span class="material-symbols-outlined">${visible ? 'visibility_off' : 'visibility'}</span>
        ${visible ? 'Hide Documents' : 'Show Documents'}
      </button>
    `;
}

function renderDocumentPaneToggle(documents, pane) {
    const isEditor = pane === 'editor';
    const visible = isEditor ? documents.editorVisible : documents.previewVisible;
    const label = `${visible ? 'Hide' : 'Show'} ${isEditor ? 'Editor' : 'Preview'}`;
    const icon = visible ? 'visibility_off' : isEditor ? 'edit_note' : 'visibility';

    return `
      <button
        class="standard-button panel-toggle-button documents-pane__toggle ${visible ? '' : 'is-active'}"
        aria-pressed="${visible ? 'false' : 'true'}"
        data-action="toggle-document-pane"
        data-pane="${escapeHtml(pane)}"
        type="button"
      >
        <span class="material-symbols-outlined">${icon}</span>
        ${label}
      </button>
    `;
}

function renderDocumentsTitlebar(documents, options = {}) {
    const { showDocumentActions = false, showFilename = true } = options;
    const disabled = documents.saving || documents.detailLoading || !documents.selectedId;

    return `
      <div class="documents-titlebar">
        ${renderDocumentsPanelToggle(documents)}
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
                              label: 'Insert Note',
                          },
                      ],
                  })}
                  <button
                    class="standard-button"
                    data-action="export-document-markdown"
                    type="button"
                    ${disabled ? 'disabled aria-disabled="true"' : ''}
                  >
                    <span class="material-symbols-outlined">download</span>
                    Export .md
                  </button>
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
                : ''
        }
      </div>
    `;
}

function renderDocumentEditor(documents) {
    return `
      <section class="documents-pane documents-pane--editor ${documents.editorVisible ? '' : 'documents-pane--collapsed'}">
        <div class="documents-pane__header">
          ${renderDocumentPaneToggle(documents, 'editor')}
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
    return `
      <section class="documents-pane documents-pane--preview ${documents.previewVisible ? '' : 'documents-pane--collapsed'}">
        <div class="documents-pane__header">
          ${renderDocumentPaneToggle(documents, 'preview')}
          <span class="documents-pane__meta">${escapeHtml(documents.dirty ? 'unsaved' : 'saved')}</span>
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
