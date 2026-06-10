import { escapeHtml, formatCompactDateTime, formatNumber } from '../utils/format.js';
import { renderMarkdownPreview } from '../utils/markdownDocuments.js';

function renderMissingDatabase() {
    return `
      <section class="view-surface">
        <div class="view-frame flex min-h-full items-center justify-center">
          <div class="text-center">
            <span class="material-symbols-outlined mb-3 text-5xl text-on-surface-variant/25">database_off</span>
            <p class="font-headline text-xl font-black uppercase tracking-tight text-primary-container">
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
        class="documents-list-item ${isSelected ? 'is-selected' : ''}"
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

function renderDocumentsSidebar(documents) {
    const items = documents.items ?? [];

    return `
      <aside class="documents-view__sidebar">
        <div class="documents-view__sidebar-header">
          <div>
            <div class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/50">
              Documents
            </div>
            <div class="mt-1 font-mono text-xs text-primary-container">${formatNumber(items.length)} files</div>
          </div>
          <button
            class="icon-button"
            data-action="create-document"
            title="New document"
            type="button"
            ${documents.saving ? 'disabled aria-disabled="true"' : ''}
          >
            <span class="material-symbols-outlined">add</span>
          </button>
        </div>
        <div class="documents-view__sidebar-body custom-scrollbar">
          ${
              items.length
                  ? items.map(item => renderDocumentListItem(item, documents.selectedId)).join('')
                  : `<div class="documents-list-empty">No documents yet</div>`
          }
        </div>
      </aside>
    `;
}

function renderDocumentToolbar(documents) {
    const disabled = documents.saving || documents.detailLoading || !documents.selectedId;

    return `
      <div class="documents-toolbar">
        <label class="documents-filename-field">
          <span>Filename</span>
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
        <div class="documents-toolbar__actions">
          <input
            accept=".md,.markdown,text/markdown,text/plain"
            data-bind="document-import-file"
            hidden
            type="file"
          />
          <button
            class="standard-button"
            data-action="toggle-document-pane"
            data-pane="editor"
            type="button"
          >
            <span class="material-symbols-outlined">${documents.editorVisible ? 'visibility_off' : 'edit_note'}</span>
            ${documents.editorVisible ? 'Hide Editor' : 'Show Editor'}
          </button>
          <button
            class="standard-button"
            data-action="toggle-document-pane"
            data-pane="preview"
            type="button"
          >
            <span class="material-symbols-outlined">${documents.previewVisible ? 'visibility_off' : 'visibility'}</span>
            ${documents.previewVisible ? 'Hide Preview' : 'Show Preview'}
          </button>
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
            class="standard-button"
            data-action="open-document-insert-table-modal"
            type="button"
            ${disabled ? 'disabled aria-disabled="true"' : ''}
          >
            <span class="material-symbols-outlined">table_chart</span>
            Insert Table
          </button>
          <button
            class="standard-button"
            data-action="open-document-insert-note-modal"
            type="button"
            ${disabled ? 'disabled aria-disabled="true"' : ''}
          >
            <span class="material-symbols-outlined">note_add</span>
            Insert Note
          </button>
          <button
            class="standard-button"
            data-action="import-document-markdown"
            type="button"
            ${documents.saving ? 'disabled aria-disabled="true"' : ''}
          >
            <span class="material-symbols-outlined">upload_file</span>
            Import .md
          </button>
          <button
            class="standard-button"
            data-action="delete-document"
            type="button"
            ${disabled || documents.deleting ? 'disabled aria-disabled="true"' : ''}
          >
            <span class="material-symbols-outlined">delete</span>
            Delete
          </button>
          <button
            class="signature-button"
            data-action="save-document"
            type="button"
            ${disabled || !documents.dirty ? 'disabled aria-disabled="true"' : ''}
          >
            <span class="material-symbols-outlined">save</span>
            ${documents.saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    `;
}

function renderDocumentEditor(documents) {
    if (!documents.editorVisible) {
        return '';
    }

    return `
      <section class="documents-pane documents-pane--editor">
        <div class="documents-pane__header">
          <span>Editor</span>
          <span>${formatNumber(documents.draftContent.length)} chars</span>
        </div>
        <textarea
          class="documents-editor-input custom-scrollbar"
          data-bind="document-field"
          data-field="content"
          name="content"
          spellcheck="true"
          ${!documents.selectedId ? 'disabled' : ''}
        >${escapeHtml(documents.draftContent)}</textarea>
      </section>
    `;
}

function renderDocumentPreview(documents) {
    if (!documents.previewVisible) {
        return '';
    }

    return `
      <section class="documents-pane documents-pane--preview">
        <div class="documents-pane__header">
          <span>Preview</span>
          <span>${escapeHtml(documents.dirty ? 'unsaved' : 'saved')}</span>
        </div>
        <div class="document-markdown-preview custom-scrollbar" data-document-preview>
          ${renderMarkdownPreview(documents.draftContent)}
        </div>
      </section>
    `;
}

function renderEmptyDocumentsState(documents) {
    return `
      <div class="documents-empty-state">
        <span class="material-symbols-outlined">description</span>
        <p class="font-headline text-2xl font-black uppercase tracking-tight text-primary-container">
          No Documents
        </p>
        <button
          class="signature-button mt-4"
          data-action="create-document"
          type="button"
          ${documents.saving ? 'disabled aria-disabled="true"' : ''}
        >
          <span class="material-symbols-outlined">add</span>
          New Document
        </button>
      </div>
    `;
}

function renderDocumentDetail(documents) {
    if (documents.loading && !documents.items.length) {
        return `
          <main class="documents-view__detail">
            <div class="documents-empty-state">
              <span class="material-symbols-outlined">sync</span>
              <p class="font-headline text-2xl font-black uppercase tracking-tight text-primary-container">
                Loading Documents
              </p>
            </div>
          </main>
        `;
    }

    if (!documents.selectedId) {
        return `
          <main class="documents-view__detail">
            ${renderEmptyDocumentsState(documents)}
          </main>
        `;
    }

    const paneCount = Number(documents.editorVisible) + Number(documents.previewVisible);

    return `
      <main class="documents-view__detail">
        ${renderDocumentToolbar(documents)}
        ${documents.saveError ? `<div class="documents-error">${escapeHtml(documents.saveError.message)}</div>` : ''}
        <div class="documents-workspace ${paneCount > 1 ? 'documents-workspace--split' : ''}">
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

    return {
        main: `<div class="documents-view">
                ${renderDocumentsSidebar(documents)}
                ${renderDocumentDetail(documents)}
              </div>
            </div>`,
        panel: '',
    };
}
