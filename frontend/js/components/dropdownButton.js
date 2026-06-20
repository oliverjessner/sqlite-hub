import { escapeHtml } from "../utils/format.js";

function renderDataAttributes(attributes = {}) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => {
      const attributeName = key
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/_/g, "-")
        .toLowerCase();

      return value === true
        ? `data-${attributeName}`
        : `data-${attributeName}="${escapeHtml(value)}"`;
    })
    .join(" ");
}

function renderDropdownItem(item = {}) {
  const dataAttributes = renderDataAttributes(item.dataAttributes);
  const actionAttribute = item.actionAttribute || "data-action";
  const actionMarkup =
    item.action === undefined || item.action === null
      ? ""
      : `${escapeHtml(actionAttribute)}="${escapeHtml(item.action)}"`;
  const disabled = item.disabled ? 'disabled aria-disabled="true"' : "";
  const iconMarkup = item.icon
    ? `<span class="material-symbols-outlined">${escapeHtml(item.icon)}</span>`
    : "";

  return `
    <button
      class="dropdown-button__item ${item.danger ? "dropdown-button__item--danger" : ""}"
      ${actionMarkup}
      ${dataAttributes}
      ${disabled}
      role="menuitem"
      type="button"
    >
      ${iconMarkup}
      <span>${escapeHtml(item.label)}</span>
    </button>
  `;
}

export function renderDropdownButton({
  align = "right",
  disabled = false,
  icon = "more_horiz",
  items = [],
  label,
  title = label,
} = {}) {
  const iconMarkup = icon
    ? `<span class="material-symbols-outlined">${escapeHtml(icon)}</span>`
    : "";
  const buttonLabel = escapeHtml(label);
  const chevron = '<span class="material-symbols-outlined dropdown-button__chevron">expand_more</span>';

  if (disabled) {
    return `
      <button
        aria-disabled="true"
        class="standard-button dropdown-button__toggle"
        disabled
        title="${escapeHtml(title)}"
        type="button"
      >
        ${iconMarkup}
        ${buttonLabel}
        ${chevron}
      </button>
    `;
  }

  return `
    <details class="dropdown-button dropdown-button--align-${escapeHtml(align)}" data-dropdown-button>
      <summary
        aria-label="${escapeHtml(title)}"
        class="standard-button dropdown-button__toggle"
        title="${escapeHtml(title)}"
      >
        ${iconMarkup}
        ${buttonLabel}
        ${chevron}
      </summary>
      <div class="dropdown-button__panel" role="menu">
        ${items.map((item) => renderDropdownItem(item)).join("")}
      </div>
    </details>
  `;
}
