import { escapeHtml } from "../utils/format.js";
import {
  compactPathForDisplay,
  detectFilePathValue,
  getPathTypeLabel,
} from "../utils/filePathPreview.js";
import {
  getTimestampPreviewForField,
  isProtectedKeyColumn,
} from "../utils/timestampPreview.js";
import {
  formatTextCellCharacterCount,
  getTextCellCharacterCount,
} from "../utils/textCellStats.js";
import { formatJsonPreview } from "../utils/jsonPreview.js";
import {
  getRowEditorValueState,
  getRowEditorValueStateLabel,
} from "../utils/rowEditorValues.js";

const URL_PATTERN = /^https?:\/\/[^\s<>"']+$/i;

function getUrlValue(value) {
  const text = String(value ?? "").trim();

  if (!URL_PATTERN.test(text)) {
    return null;
  }

  try {
    const url = new URL(text);

    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch (error) {
    return null;
  }
}

function withUrlBadge(badges = [], url) {
  if (!url) {
    return badges;
  }

  const hasUrlBadge = badges.some((badge) => {
    const label = typeof badge === "object" ? badge.label : badge;
    return String(label ?? "").toUpperCase() === "URL";
  });

  return hasUrlBadge ? badges : [...badges, { label: "URL", tone: "url" }];
}

function getAllowedValues(field) {
  const seen = new Set();

  return (Array.isArray(field.allowedValues) ? field.allowedValues : [])
    .map((value) => String(value))
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

function withCheckBadge(badges = [], allowedValues = []) {
  if (!allowedValues.length) {
    return badges;
  }

  const hasCheckBadge = badges.some((badge) => {
    const label = typeof badge === "object" ? badge.label : badge;
    return String(label ?? "").toUpperCase() === "CHECK";
  });

  return hasCheckBadge ? badges : [...badges, { label: "CHECK", tone: "check" }];
}

function withFilePathBadge(badges = [], filePathPreview) {
  if (!filePathPreview) {
    return badges;
  }

  const hasPathBadge = badges.some((badge) => {
    const label = typeof badge === "object" ? badge.label : badge;
    return String(label ?? "").toUpperCase() === "PATH";
  });

  return hasPathBadge ? badges : [...badges, { label: "PATH", tone: "filepath" }];
}

function renderOpenUrlButton(url) {
  if (!url) {
    return "";
  }

  return `
    <div class="mt-2" data-row-editor-url-action>
      <button
        class="standard-button"
        data-action="open-row-editor-url"
        data-url="${escapeHtml(url)}"
        type="button"
      >
        <span class="material-symbols-outlined text-sm">open_in_new</span>
        Open in tab
      </button>
    </div>
  `;
}

function renderAllowedValuesSelect(field, allowedValues) {
  const currentValue = String(field.value ?? "");
  const hasCurrentAllowedValue = allowedValues.includes(currentValue);
  const shouldRenderEmptyOption = field.notNull !== true;
  const shouldRenderCurrentOption =
    currentValue !== "" && !hasCurrentAllowedValue;
  const options = [
    shouldRenderEmptyOption
      ? `<option value="" ${currentValue === "" ? "selected" : ""}>Empty string</option>`
      : "",
    shouldRenderCurrentOption
      ? `<option value="${escapeHtml(currentValue)}" selected>${escapeHtml(currentValue)}</option>`
      : "",
    ...allowedValues.map(
      (value) =>
        `<option value="${escapeHtml(value)}" ${
          value === currentValue ? "selected" : ""
        }>${escapeHtml(value)}</option>`
    ),
  ].join("");

  return `
    <select
      class="w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
      data-row-editor-initial-value="${escapeHtml(currentValue)}"
      data-row-editor-text-source
      data-row-editor-timestamp-source
      data-row-editor-value-source
      name="field:${escapeHtml(field.name)}"
    >
      ${options}
    </select>
  `;
}

function getFieldColumnName(field = {}) {
  return String(field.sourceColumn ?? field.name ?? "");
}

function getFieldRawValue(field = {}) {
  return field.rawValue === undefined ? field.value : field.rawValue;
}

function getFieldTimestampPreview(field = {}, tableMeta = {}) {
  return getTimestampPreviewForField({
    columnName: getFieldColumnName(field),
    value: getFieldRawValue(field),
    tableMeta,
  });
}

function renderTimestampPreview(field = {}, tableMeta = {}) {
  const preview = getFieldTimestampPreview(field, tableMeta);

  if (preview.kind === "protected-key") {
    return `
      <div class="text-[11px] text-on-surface-variant/55">
        Key column - shown as raw value
      </div>
    `;
  }

  return `
    <div
      class="text-[11px] text-on-surface-variant/70"
      data-row-editor-timestamp-preview
      ${preview.kind === "timestamp" ? "" : "hidden"}
    >
      ${
        preview.kind === "timestamp"
          ? `Interpretiert als Datum: ${escapeHtml(preview.formatted)}`
          : ""
      }
    </div>
  `;
}

function renderTextCharacterCountBadge(value) {
  const count = getTextCellCharacterCount(value);

  return `
    <span
      class="border px-2 py-1 text-[9px] ${getFieldBadgeClassName("char-count")}"
      data-row-editor-char-count
      ${count === null ? "hidden" : ""}
    >
      ${count === null ? "" : escapeHtml(formatTextCellCharacterCount(count))}
    </span>
  `;
}

function renderFieldBadgesWithCharacterCount(badges = [], value) {
  const [typeBadge, ...remainingBadges] = badges;

  return [
    typeBadge ? renderFieldBadge(typeBadge) : "",
    renderTextCharacterCountBadge(value),
    ...remainingBadges.map((badge) => renderFieldBadge(badge)),
  ].join("");
}

function getFieldFilePathPreview(field = {}, tableMeta = {}) {
  return detectFilePathValue(getFieldRawValue(field), getFieldColumnName(field), tableMeta);
}

function renderFilePathPreview(field = {}, tableMeta = {}) {
  if (isProtectedKeyColumn(getFieldColumnName(field), tableMeta)) {
    return "";
  }

  const preview = getFieldFilePathPreview(field, tableMeta);

  return `
    <div
      class="border border-outline-variant/10 bg-surface-container px-4 py-4 text-xs text-on-surface"
      data-row-editor-filepath-preview
      ${preview ? "" : "hidden"}
    >
      <div class="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-primary-container/75">
        <span class="material-symbols-outlined text-sm">folder</span>
        Interpretiert als Filepath
      </div>
      <div class="mt-3 grid gap-2 font-mono text-[11px] leading-5">
        <div>
          <span class="text-on-surface-variant/55">Filename:</span>
          <span data-row-editor-filepath-filename>${escapeHtml(preview?.fileName ?? "N/A")}</span>
        </div>
        <div data-row-editor-filepath-directory-row ${preview?.directory ? "" : "hidden"}>
          <span class="text-on-surface-variant/55">Directory:</span>
          <span data-row-editor-filepath-directory title="${escapeHtml(preview?.directory ?? "")}">
            ${escapeHtml(preview?.directory ? compactPathForDisplay(preview.directory, 72) : "")}
          </span>
        </div>
        <div>
          <span class="text-on-surface-variant/55">Extension:</span>
          <span data-row-editor-filepath-extension>${escapeHtml(preview?.extension ?? "N/A")}</span>
        </div>
        <div>
          <span class="text-on-surface-variant/55">Type:</span>
          <span data-row-editor-filepath-type>${escapeHtml(preview ? getPathTypeLabel(preview.pathType) : "N/A")}</span>
        </div>
      </div>
    </div>
  `;
}

function renderJsonViewer(prettyJson, title = "JSON Viewer") {
  return `
    <div class="border border-outline-variant/10 bg-surface-container px-4 py-4">
      <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-primary-container/75">
        ${escapeHtml(title)}
      </div>
      <pre class="row-editor-json-preview custom-scrollbar mt-3 max-h-[18rem] overflow-auto border border-outline-variant/10 bg-surface-container-lowest px-4 py-4 font-mono text-xs leading-6 text-on-surface">${escapeHtml(
        prettyJson
      )}</pre>
    </div>
  `;
}

function renderReadonlyField(field = {}, tableMeta = {}) {
  const label = field.label ?? field.name;
  const value = field.value;
  const rawValue = getFieldRawValue(field);
  const columnName = getFieldColumnName(field);
  const protectedKeyColumn = isProtectedKeyColumn(columnName, tableMeta);
  const filePathPreview = getFieldFilePathPreview({ ...field, rawValue }, tableMeta);
  const url = getUrlValue(value);
  const badges = withFilePathBadge(withUrlBadge(Array.isArray(label?.badges) ? label.badges : [], url), filePathPreview);
  const displayLabel = typeof label === "object" ? label.label : label;
  const jsonPreview = formatJsonPreview(value);
  const valueState = getRowEditorValueState(rawValue);

  return `
    <div
      class="border border-outline-variant/10 bg-surface-container-lowest px-4 py-3"
      data-row-editor-column-name="${escapeHtml(columnName)}"
      data-row-editor-field
      data-row-editor-protected-key="${protectedKeyColumn ? "true" : "false"}"
      ${
      url ? "data-row-editor-url-field" : ""
    }>
      <div class="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
        <span>${escapeHtml(displayLabel)}</span>
        ${renderFieldBadgesWithCharacterCount(badges, rawValue)}
        ${renderValueStateBadge(valueState)}
      </div>
      ${
        jsonPreview
          ? `<div class="mt-2">${renderJsonViewer(jsonPreview)}</div>`
          : `<div class="mt-2 text-sm text-on-surface">${escapeHtml(value)}</div>`
      }
      ${renderTimestampPreview({ ...field, rawValue }, tableMeta)}
      ${renderFilePathPreview({ ...field, rawValue }, tableMeta)}
      ${renderOpenUrlButton(url)}
    </div>
  `;
}

function getValueStateBadgeClassName(state) {
  if (state === "null") {
    return "border-primary-container/35 bg-primary-container/15 text-primary-container";
  }

  if (state === "empty") {
    return "border-outline-variant/35 bg-surface-container-high text-on-surface-variant";
  }

  return "border-outline-variant/20 bg-surface-container text-on-surface-variant";
}

function renderValueStateBadge(state) {
  return `
    <span
      class="border px-2 py-1 text-[9px] ${getValueStateBadgeClassName(state)}"
      data-row-editor-value-state
      data-value-state="${escapeHtml(state)}"
    >${escapeHtml(getRowEditorValueStateLabel(state))}</span>
  `;
}

function renderEditableField(field, tableMeta = {}) {
  const columnName = getFieldColumnName(field);
  const protectedKeyColumn = isProtectedKeyColumn(columnName, tableMeta);
  const url = getUrlValue(field.value);
  const allowedValues = getAllowedValues(field);
  const filePathPreview = getFieldFilePathPreview(field, tableMeta);
  const baseBadges = withCheckBadge(Array.isArray(field.badges) ? field.badges : [], allowedValues);
  const badges = withFilePathBadge(withUrlBadge(baseBadges, url), filePathPreview);
  const jsonPreview = formatJsonPreview(field.value);
  const inputType = field.inputType === "number" ? "number" : "text";
  const numberStep = field.numberStep === "1" ? "1" : "any";
  const valueState = getRowEditorValueState(getFieldRawValue(field));

  return `
    <div
      class="block space-y-2"
      data-row-editor-column-name="${escapeHtml(columnName)}"
      data-row-editor-field
      data-row-editor-initial-state="${escapeHtml(valueState)}"
      data-row-editor-protected-key="${protectedKeyColumn ? "true" : "false"}"
      ${url ? "data-row-editor-url-field" : ""}
    >
      <span class="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/55">
        <span>${escapeHtml(field.label ?? field.name)}</span>
        ${renderFieldBadgesWithCharacterCount(badges, inputType === "number" ? null : field.value ?? "")}
        ${renderValueStateBadge(valueState)}
      </span>
      ${
        jsonPreview
          ? `<div data-row-editor-json-preview-container>${renderJsonViewer(jsonPreview, "JSON Preview")}</div>`
          : ""
      }
      ${
        allowedValues.length && !jsonPreview
          ? renderAllowedValuesSelect(field, allowedValues)
          : inputType === "number" && !jsonPreview
          ? `
              <input
                class="w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
                data-row-editor-initial-value="${escapeHtml(field.value ?? "")}"
                data-row-editor-timestamp-source
                data-row-editor-value-source
                name="field:${escapeHtml(field.name)}"
                step="${escapeHtml(numberStep)}"
                type="number"
                value="${escapeHtml(field.value ?? "")}"
              />
            `
          : url && !jsonPreview
            ? `
              <input
                class="w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
                data-row-editor-initial-value="${escapeHtml(field.value ?? "")}"
                data-row-editor-text-source
                data-row-editor-timestamp-source
                data-row-editor-value-source
                name="field:${escapeHtml(field.name)}"
                data-row-editor-url-input
                spellcheck="false"
                type="text"
                value="${escapeHtml(field.value ?? "")}"
              />
              ${renderOpenUrlButton(url)}
            `
          : `
              <textarea
                class="w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary-container ${
                  jsonPreview ? "min-h-[14rem] font-mono leading-6" : "min-h-[56px]"
                }"
                data-row-editor-initial-value="${escapeHtml(field.value ?? "")}"
                data-row-editor-text-source
                data-row-editor-timestamp-source
                data-row-editor-value-source
                name="field:${escapeHtml(field.name)}"
                spellcheck="false"
              >${escapeHtml(field.value ?? "")}</textarea>
            `
      }
      ${renderTimestampPreview(field, tableMeta)}
      ${renderFilePathPreview(field, tableMeta)}
    </div>
  `;
}

function getFieldBadgeClassName(tone) {
  if (tone === "primary-key") {
    return "border-primary-container/35 bg-primary-container/15 text-primary-container";
  }

  if (tone === "foreign-key") {
    return "border-tertiary-fixed-dim/35 bg-tertiary-fixed-dim/15 text-tertiary-fixed-dim";
  }

  if (tone === "url") {
    return "border-primary-container/35 bg-primary-container/15 text-primary-container";
  }

  if (tone === "check") {
    return "border-tertiary-fixed-dim/35 bg-tertiary-fixed-dim/15 text-tertiary-fixed-dim";
  }

  if (tone === "filepath") {
    return "border-outline-variant/30 bg-surface-container-high text-on-surface";
  }

  if (tone === "char-count") {
    return "border-outline-variant/25 bg-surface-container text-on-surface-variant";
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
  tableMeta = {},
  disabledMessage = "",
  saveError = null,
  saving = false,
  deleting = false,
  reloadAction = "",
  jsonActionsEnabled = false,
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
    jsonActionsEnabled
      ? [
          '<button class="standard-button" data-action="copy-row-editor-json" type="button">',
          '<span class="material-symbols-outlined text-sm">content_copy</span>',
          "Copy as JSON",
          "</button>",
          '<button class="standard-button" data-action="export-row-editor-json" type="button">',
          '<span class="material-symbols-outlined text-sm">download</span>',
          "Export as JSON",
          "</button>",
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
                              .map((field) => renderEditableField(field, tableMeta))
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
                      .map((field) => renderReadonlyField(field, tableMeta))
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
