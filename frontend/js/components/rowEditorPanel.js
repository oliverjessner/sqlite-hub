import { escapeHtml } from "../utils/format.js";

function getJsonPreview(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  const text = String(value).trim();

  if (!text || !["{", "["].includes(text[0])) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    return null;
  }
}

function renderJsonViewer(prettyJson, title = "JSON Viewer") {
  return `
    <div class="border border-outline-variant/10 bg-surface-container px-4 py-4">
      <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-primary-container/75">
        ${escapeHtml(title)}
      </div>
      <pre class="custom-scrollbar mt-3 max-h-[18rem] overflow-auto whitespace-pre-wrap break-words border border-outline-variant/10 bg-surface-container-lowest px-4 py-4 font-mono text-xs leading-6 text-on-surface">${escapeHtml(
        prettyJson
      )}</pre>
    </div>
  `;
}

function renderReadonlyField(label, value) {
  const jsonPreview = getJsonPreview(value);

  return `
    <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">
      <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
        ${escapeHtml(label)}
      </div>
      ${
        jsonPreview
          ? `<div class="mt-2">${renderJsonViewer(jsonPreview)}</div>`
          : `<div class="mt-2 text-sm text-on-surface">${escapeHtml(value)}</div>`
      }
    </div>
  `;
}

function renderEditableField(field) {
  const jsonPreview = getJsonPreview(field.value);

  return `
    <label class="block space-y-2">
      <span class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
        ${escapeHtml(field.label ?? field.name)}
      </span>
      ${
        jsonPreview
          ? renderJsonViewer(jsonPreview, "JSON Preview")
          : ""
      }
      <textarea
        class="w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container ${
          jsonPreview ? "min-h-[14rem] font-mono leading-6" : "min-h-[56px]"
        }"
        name="field:${escapeHtml(field.name)}"
        spellcheck="false"
      >${escapeHtml(field.value ?? "")}</textarea>
    </label>
  `;
}

export function renderRowEditorPanel({
  title,
  sectionLabel = "Row Editor",
  subtitle = "",
  closeAction,
  formName,
  hiddenFields = [],
  editableFields = [],
  readonlyFields = [],
  disabledMessage = "",
  saveError = null,
  saving = false,
  deleting = false,
  reloadAction = "",
  submitLabel = "Save",
  deleteAction = "",
  deleteRowIndex = null,
  deleteLabel = "Delete Row",
  deleteEnabled = false,
  emptyEditableMessage = "This row has no editable scalar columns.",
}) {
  const canSubmit = !disabledMessage && editableFields.length > 0;
  const canDelete = !disabledMessage && deleteEnabled;
  const formId = `${formName}-panel-form`;

  return `
    <section class="flex h-full min-h-0 flex-col bg-surface-low">
      <header class="border-b border-outline-variant/10 bg-surface-container px-6 py-5">
        <div class="space-y-4">
          <div>
            <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">
              ${escapeHtml(sectionLabel)}
            </div>
            <h2 class="mt-2 font-headline text-3xl font-black uppercase tracking-tight text-primary-container">
              ${escapeHtml(title)}
            </h2>
            ${
              subtitle
                ? `
                    <div class="mt-2 text-[10px] font-mono uppercase tracking-[0.16em] text-on-surface-variant/55">
                      ${escapeHtml(subtitle)}
                    </div>
                  `
                : ""
            }
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            ${
              reloadAction
                ? `
                    <button
                      class="border border-outline-variant/20 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface hover:bg-surface-container-highest"
                      data-action="${escapeHtml(reloadAction)}"
                      type="button"
                    >
                      Reload
                    </button>
                  `
                : ""
            }
            ${
              canSubmit
                ? `
                    <button
                      class="bg-primary-container px-5 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-on-primary disabled:cursor-default disabled:opacity-40"
                      form="${escapeHtml(formId)}"
                      type="submit"
                      ${saving || deleting ? "disabled" : ""}
                    >
                      ${escapeHtml(saving ? "Saving..." : submitLabel)}
                    </button>
                  `
                : ""
            }
            ${
              canDelete
                ? `
                    <button
                      class="border border-error/25 bg-error-container/10 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-error transition-colors hover:bg-error-container/20 disabled:cursor-default disabled:opacity-40"
                      data-action="${escapeHtml(deleteAction)}"
                      data-row-index="${escapeHtml(String(deleteRowIndex ?? ""))}"
                      type="button"
                      ${saving || deleting ? "disabled" : ""}
                    >
                      ${escapeHtml(deleting ? "Deleting..." : deleteLabel)}
                    </button>
                  `
                : ""
            }
            <button
              aria-label="Close panel"
              class="flex h-11 w-11 items-center justify-center border border-outline-variant/20 text-on-surface hover:bg-surface-container-highest"
              data-action="${escapeHtml(closeAction)}"
              type="button"
            >
              <span class="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>
      </header>
      <div class="custom-scrollbar flex-1 overflow-auto px-6 py-6">
        ${
          disabledMessage
            ? `
                <div class="border border-error/20 bg-error-container/10 px-4 py-4 text-sm text-on-surface">
                  ${escapeHtml(disabledMessage)}
                </div>
              `
            : `
                <form class="space-y-6" data-form="${escapeHtml(formName)}" id="${escapeHtml(formId)}">
                  ${hiddenFields
                    .map(
                      (field) => `
                        <input
                          name="${escapeHtml(field.name)}"
                          type="hidden"
                          value="${escapeHtml(field.value ?? "")}"
                        />
                      `
                    )
                    .join("")}
                  ${
                    editableFields.length
                      ? `
                          <div class="space-y-4">
                            ${editableFields
                              .map((field) => renderEditableField(field))
                              .join("")}
                          </div>
                        `
                      : `<div class="text-sm text-on-surface-variant/55">${escapeHtml(
                          emptyEditableMessage
                        )}</div>`
                  }
                  ${
                    saveError
                      ? `
                          <div class="border border-error/20 bg-error-container/10 px-4 py-4 text-sm text-on-surface">
                            <div class="font-headline text-xs font-bold uppercase tracking-[0.18em] text-error">
                              ${escapeHtml(saveError.code)}
                            </div>
                            <div class="mt-2">${escapeHtml(saveError.message)}</div>
                          </div>
                        `
                      : ""
                  }
                </form>
              `
        }
        ${
          readonlyFields.length
            ? `
                <div class="mt-8 space-y-3">
                  <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-container">
                    Locked Fields
                  </div>
                  <div class="space-y-3">
                    ${readonlyFields
                      .map((field) => renderReadonlyField(field.label ?? field.name, field.value))
                      .join("")}
                  </div>
                </div>
              `
            : ""
        }
      </div>
    </section>
  `;
}
