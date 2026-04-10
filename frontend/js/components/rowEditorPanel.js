import { escapeHtml } from "../utils/format.js";

function renderReadonlyField(label, value) {
  return `
    <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">
      <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
        ${escapeHtml(label)}
      </div>
      <div class="mt-2 text-sm text-on-surface">${escapeHtml(value)}</div>
    </div>
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
                              .map(
                                (field) => `
                                  <label class="block space-y-2">
                                    <span class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
                                      ${escapeHtml(field.label ?? field.name)}
                                    </span>
                                    <textarea
                                      class="min-h-[56px] w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
                                      name="field:${escapeHtml(field.name)}"
                                    >${escapeHtml(field.value ?? "")}</textarea>
                                  </label>
                                `
                              )
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
