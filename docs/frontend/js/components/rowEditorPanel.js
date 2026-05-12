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
  const badges = Array.isArray(label?.badges) ? label.badges : [];
  const displayLabel = typeof label === "object" ? label.label : label;
  const jsonPreview = getJsonPreview(value);

  return `
    <div class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3">
      <div class="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
        <span>${escapeHtml(displayLabel)}</span>
        ${badges.map((badge) => renderFieldBadge(badge)).join("")}
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
  const badges = Array.isArray(field.badges) ? field.badges : [];
  const jsonPreview = getJsonPreview(field.value);
  const inputType = field.inputType === "number" ? "number" : "text";
  const numberStep = field.numberStep === "1" ? "1" : "any";

  return `
    <label class="block space-y-2">
      <span class="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
        <span>${escapeHtml(field.label ?? field.name)}</span>
        ${badges.map((badge) => renderFieldBadge(badge)).join("")}
      </span>
      ${
        jsonPreview
          ? renderJsonViewer(jsonPreview, "JSON Preview")
          : ""
      }
      ${
        inputType === "number" && !jsonPreview
          ? `
              <input
                class="w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
                name="field:${escapeHtml(field.name)}"
                step="${escapeHtml(numberStep)}"
                type="number"
                value="${escapeHtml(field.value ?? "")}"
              />
            `
          : `
              <textarea
                class="w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container ${
                  jsonPreview ? "min-h-[14rem] font-mono leading-6" : "min-h-[56px]"
                }"
                name="field:${escapeHtml(field.name)}"
                spellcheck="false"
              >${escapeHtml(field.value ?? "")}</textarea>
            `
      }
    </label>
  `;
}

function getFieldBadgeClassName(tone) {
  if (tone === "primary-key") {
    return "border-primary-container/35 bg-primary-container/15 text-primary-container";
  }

  if (tone === "foreign-key") {
    return "border-tertiary-fixed-dim/35 bg-tertiary-fixed-dim/15 text-tertiary-fixed-dim";
  }

  return "border-outline-variant/20 bg-surface-container text-on-surface-variant";
}

function renderFieldBadge(badge) {
  const label = typeof badge === "object" ? badge.label : badge;
  const tone = typeof badge === "object" ? badge.tone : "";

  return `
    <span class="border px-2 py-1 text-[9px] ${getFieldBadgeClassName(tone)}">
      ${escapeHtml(label)}
    </span>
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
  const formId = [formName, "-panel-form"].join("");
  const headerActions = [
    reloadAction
      ? [
          '<button class="standard-button" data-action="',
          escapeHtml(reloadAction),
          '" type="button">Reload</button>',
        ].join("")
      : "",
    canSubmit
      ? [
          '<button class="standard-button" form="',
          escapeHtml(formId),
          '" type="submit" ',
          saving || deleting ? "disabled" : "",
          ">",
          escapeHtml(saving ? "Saving..." : submitLabel),
          "</button>",
        ].join("")
      : "",
    canDelete
      ? [
          '<button class="delete-button" data-action="',
          escapeHtml(deleteAction),
          '" ',
          deleteRowIndex === null
            ? ""
            : ['data-row-index="', escapeHtml(String(deleteRowIndex)), '"'].join(""),
          ' type="button" ',
          saving || deleting ? "disabled" : "",
          ">",
          escapeHtml(deleting ? "Deleting..." : deleteLabel),
          "</button>",
        ].join("")
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <section class="flex h-full min-h-0 flex-col bg-surface-low">
      <header class="border-b border-outline-variant/10 bg-surface-container px-6 py-5">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
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
            aria-label="Close panel"
            class="query-history-icon-button shrink-0"
            data-action="${escapeHtml(closeAction)}"
            type="button"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        ${
          headerActions
            ? `
                <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
                  ${headerActions}
                </div>
              `
            : ""
        }
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
