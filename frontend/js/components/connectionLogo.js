import { escapeHtml } from "../utils/format.js";

export function renderConnectionLogo(
  connection,
  {
    containerClass = "",
    containerAttributes = "",
    imageClassName = "h-full w-full object-cover",
    iconClassName = "",
    icon = "database",
  } = {}
) {
  const logoUrl = connection?.logoUrl ?? null;
  const label = connection?.label ?? "Database";

  if (logoUrl) {
    return `
      <div ${containerAttributes} class="${containerClass}">
        <img
          alt="${escapeHtml(`${label} logo`)}"
          class="${imageClassName}"
          src="${escapeHtml(logoUrl)}"
        />
      </div>
    `;
  }

  return `
    <div ${containerAttributes} class="${containerClass}">
      <span class="material-symbols-outlined ${iconClassName}">${escapeHtml(icon)}</span>
    </div>
  `;
}
