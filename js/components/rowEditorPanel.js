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
  reloadAction = "",
  submitLabel = "Save Row",
  emptyEditableMessage = "This row has no editable scalar columns.",
}) {
  const canSubmit = !disabledMessage && editableFields.length > 0;

  return `
    <section class="flex h-full min-h-0 flex-col bg-surface-low">
      <header class="border-b border-outline-variant/10 bg-surface-container px-6 py-5">
        <div class="flex items-start justify-between gap-4">
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
          <button
            class="border border-outline-variant/20 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface hover:bg-surface-container-highest"
            data-action="${escapeHtml(closeAction)}"
            type="button"
          >
            Close
          </button>
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
                <form class="space-y-6" data-form="${escapeHtml(formName)}">
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
                                      class="min-h-[112px] w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
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
                  <div class="flex items-center justify-end gap-3 border-t border-outline-variant/10 pt-6">
                    ${
                      reloadAction
                        ? `
                            <button
                              class="border border-outline-variant/20 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-on-surface hover:bg-surface-container-highest"
                              data-action="${escapeHtml(reloadAction)}"
                              type="button"
                            >
                              Reload
                            </button>
                          `
                        : ""
                    }
                    <button
                      class="bg-primary-container px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-on-primary disabled:cursor-default disabled:opacity-40"
                      type="submit"
                      ${canSubmit ? "" : "disabled"}
                    >
                      ${escapeHtml(saving ? "Saving..." : submitLabel)}
                    </button>
                  </div>
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
