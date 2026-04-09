import { escapeHtml, truncateMiddle } from "../utils/format.js";

function renderField({ label, name, type = "text", placeholder = "", value = "" }) {
  return `
    <label class="block space-y-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        ${escapeHtml(label)}
      </span>
      <input
        class="w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
        name="${escapeHtml(name)}"
        placeholder="${escapeHtml(placeholder)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value)}"
      />
    </label>
  `;
}

function renderCheckboxField({ label, name, checked = false, text }) {
  return `
    <label class="flex items-center gap-3 border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface">
      <input
        class="rounded-none border-outline bg-surface-container-lowest text-primary-container focus:ring-primary-container"
        ${checked ? "checked" : ""}
        name="${escapeHtml(name)}"
        type="checkbox"
      />
      ${escapeHtml(text || label)}
    </label>
  `;
}

function renderError(error) {
  if (!error) {
    return "";
  }

  return `
    <div class="border border-error/20 bg-error-container/20 px-4 py-3 text-sm text-error">
      <div class="font-headline text-xs font-bold uppercase tracking-[0.18em]">${escapeHtml(
        error.code || "Request failed"
      )}</div>
      <div class="mt-1 text-on-surface">${escapeHtml(error.message)}</div>
    </div>
  `;
}

function renderOpenConnectionForm(modal) {
  return `
    <form class="space-y-5" data-form="open-connection">
      ${renderField({
        label: "SQLite File Path",
        name: "path",
        placeholder: "/absolute/path/to/database.sqlite",
      })}
      ${renderField({
        label: "Label",
        name: "label",
        placeholder: "Optional display name",
      })}
      ${renderCheckboxField({
        label: "Open read-only",
        name: "readOnly",
        text: "Open read-only",
      })}
      ${renderError(modal.error)}
      <div class="flex items-center justify-end gap-3 pt-2">
        <button
          class="border border-outline-variant/20 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant hover:bg-surface-container-highest"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="bg-primary-container px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-on-primary"
          type="submit"
        >
          ${modal.submitting ? "Opening..." : "Open Database"}
        </button>
      </div>
    </form>
  `;
}

function renderEditConnectionForm(modal) {
  const connection = modal.connection ?? {};

  return `
    <form class="space-y-5" data-form="edit-connection">
      <input name="connectionId" type="hidden" value="${escapeHtml(connection.id ?? "")}" />
      ${renderField({
        label: "SQLite File Path",
        name: "path",
        placeholder: "/absolute/path/to/database.sqlite",
        value: connection.path ?? "",
      })}
      ${renderField({
        label: "Label",
        name: "label",
        placeholder: "Optional display name",
        value: connection.label ?? "",
      })}
      ${renderCheckboxField({
        label: "Open read-only",
        name: "readOnly",
        checked: Boolean(connection.readOnly),
        text: "Open read-only",
      })}
      ${renderError(modal.error)}
      <div class="flex items-center justify-end gap-3 pt-2">
        <button
          class="border border-outline-variant/20 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant hover:bg-surface-container-highest"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="bg-primary-container px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-on-primary"
          type="submit"
        >
          ${modal.submitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  `;
}

function renderCreateDatabaseForm(modal) {
  return `
    <form class="space-y-5" data-form="create-connection">
      ${renderField({
        label: "New SQLite File Path",
        name: "path",
        placeholder: "/absolute/path/to/new-database.sqlite",
      })}
      ${renderField({
        label: "Label",
        name: "label",
        placeholder: "Optional display name",
      })}
      ${renderError(modal.error)}
      <div class="flex items-center justify-end gap-3 pt-2">
        <button
          class="border border-outline-variant/20 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant hover:bg-surface-container-highest"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="bg-primary-container px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-on-primary"
          type="submit"
        >
          ${modal.submitting ? "Creating..." : "Create Database"}
        </button>
      </div>
    </form>
  `;
}

function renderImportTargetOptions(state) {
  const recentOptions = state.connections.recent
    .map(
      (connection) => `
        <option value="${escapeHtml(connection.id)}">
          ${escapeHtml(connection.label)} • ${escapeHtml(truncateMiddle(connection.path, 42))}
        </option>
      `
    )
    .join("");

  return `
    <label class="block space-y-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
        Import Target
      </span>
      <select
        class="w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
        name="targetMode"
      >
        ${
          state.connections.active
            ? '<option value="active">Use active database</option>'
            : ""
        }
        ${state.connections.recent.length ? '<option value="recent">Use recent connection</option>' : ""}
        <option value="create">Create new database from dump</option>
        <option value="path">Open explicit target path</option>
      </select>
    </label>
    ${
      state.connections.recent.length
        ? `
          <label class="block space-y-2">
            <span class="text-[10px] font-mono uppercase tracking-[0.22em] text-on-surface-variant/60">
              Recent Connection
            </span>
            <select
              class="w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
              name="targetConnectionId"
            >
              ${recentOptions}
            </select>
          </label>
        `
        : ""
    }
    ${renderField({
      label: "Target Path",
      name: "targetPath",
      placeholder: "/absolute/path/to/target.sqlite",
    })}
    ${renderField({
      label: "Target Label",
      name: "label",
      placeholder: "Optional display name",
    })}
  `;
}

function renderImportSqlForm(modal, state) {
  return `
    <form class="space-y-5" data-form="import-sql">
      ${renderField({
        label: "SQL Dump Path",
        name: "sqlFilePath",
        placeholder: "/absolute/path/to/dump.sql",
      })}
      ${renderImportTargetOptions(state)}
      <p class="text-[11px] leading-6 text-on-surface-variant/60">
        Use an absolute filesystem path. Browsers do not expose local file paths, so SQLite Hub imports by
        explicit path instead of file upload.
      </p>
      ${renderError(modal.error)}
      <div class="flex items-center justify-end gap-3 pt-2">
        <button
          class="border border-outline-variant/20 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant hover:bg-surface-container-highest"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="bg-primary-container px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-on-primary"
          type="submit"
        >
          ${modal.submitting ? "Importing..." : "Import SQL Dump"}
        </button>
      </div>
    </form>
  `;
}

function renderDeleteRowConfirmForm(modal) {
  const rowPreview = modal.rowPreview ?? [];

  return `
    <form class="space-y-5" data-form="delete-row-confirm">
      <div class="space-y-3">
        <p class="text-sm leading-7 text-on-surface">
          Delete this row from <span class="font-bold text-primary-container">${escapeHtml(
            modal.tableName ?? "the current table"
          )}</span>?
        </p>
        <p class="text-sm leading-7 text-on-surface-variant/65">
          This action cannot be undone.
        </p>
        ${
          modal.rowLabel
            ? `
                <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
                  ${escapeHtml(modal.rowLabel)}
                </div>
              `
            : ""
        }
        ${
          rowPreview.length
            ? `
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  ${rowPreview
                    .map(
                      (field) => `
                        <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">
                          <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
                            ${escapeHtml(field.label)}
                          </div>
                          <div
                            class="mt-2 text-sm text-on-surface"
                            title="${escapeHtml(field.fullValue ?? field.value ?? "")}"
                          >
                            ${escapeHtml(field.value ?? "")}
                          </div>
                        </div>
                      `
                    )
                    .join("")}
                </div>
              `
            : ""
        }
      </div>
      ${renderError(modal.error)}
      <div class="flex items-center justify-end gap-3 pt-2">
        <button
          class="border border-outline-variant/20 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant hover:bg-surface-container-highest"
          data-action="close-modal"
          type="button"
        >
          Cancel
        </button>
        <button
          class="border border-error/25 bg-error-container/10 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-error"
          type="submit"
        >
          ${modal.submitting ? "Deleting..." : "Delete Row"}
        </button>
      </div>
    </form>
  `;
}

export function renderModal(state) {
  const modal = state.modal;

  if (!modal) {
    return "";
  }

  const contentByKind = {
    "open-connection": {
      eyebrow: "Filesystem // Open existing SQLite database",
      title: "Connect Database",
      body: renderOpenConnectionForm(modal),
    },
    "create-connection": {
      eyebrow: "Filesystem // Create a new SQLite database",
      title: "Create Database",
      body: renderCreateDatabaseForm(modal),
    },
    "import-sql": {
      eyebrow: "Import // Execute SQL dump into SQLite",
      title: "Import SQL Dump",
      body: renderImportSqlForm(modal, state),
    },
    "edit-connection": {
      eyebrow: "Registry // Update saved SQLite target",
      title: "Edit Connection",
      body: renderEditConnectionForm(modal),
    },
    "delete-row": {
      eyebrow: "Mutation // Confirm row deletion",
      title: "Delete Row",
      body: renderDeleteRowConfirmForm(modal),
    },
  };

  const config = contentByKind[modal.kind];

  if (!config) {
    return "";
  }

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-4 backdrop-blur-sm">
      <div class="w-full max-w-xl border border-outline-variant/20 bg-surface-container shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div class="flex items-start justify-between gap-4 border-b border-outline-variant/10 bg-surface-container-low px-6 py-5">
          <div>
            <div class="text-[10px] font-mono uppercase tracking-[0.26em] text-primary-container/70">
              ${escapeHtml(config.eyebrow)}
            </div>
            <h2 class="mt-2 font-headline text-3xl font-black uppercase tracking-tight text-primary-container">
              ${escapeHtml(config.title)}
            </h2>
          </div>
          <button
            class="flex h-10 w-10 items-center justify-center border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-highest hover:text-primary-container"
            data-action="close-modal"
            type="button"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="space-y-5 px-6 py-6">${config.body}</div>
      </div>
    </div>
  `;
}
