import {
  escapeHtml,
  formatBytes,
  formatDateTime,
  truncateMiddle,
} from "../utils/format.js";
import { renderStatusBadge } from "./badges.js";
import { renderConnectionLogo } from "./connectionLogo.js";

function renderConnectionTags(tags = []) {
  const normalizedTags = Array.isArray(tags)
    ? tags.filter((tag) => String(tag?.name ?? "").trim())
    : [];

  if (!normalizedTags.length) {
    return "";
  }

  const visibleTags = normalizedTags.slice(0, 2);
  const hiddenCount = Math.max(0, normalizedTags.length - visibleTags.length);
  const title = normalizedTags.map((tag) => tag.name).join(", ");

  return [
    '<div class="connection-user-tags" title="',
    escapeHtml(title),
    '">',
    visibleTags
      .map(
        (tag) =>
          '<span class="connection-user-tag">' +
          escapeHtml(tag.name) +
          "</span>"
      )
      .join(""),
    hiddenCount
      ? '<span class="connection-user-tag connection-user-tag--more">+' +
        escapeHtml(String(hiddenCount)) +
        "</span>"
      : "",
    "</div>",
  ].join("");
}

export function renderConnectionCard(connection, activeConnectionId) {
  const isActive = activeConnectionId
    ? connection.id === activeConnectionId
    : Boolean(connection.isActive);
  const clipPath = "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)";
  const primaryActionLabel = isActive ? "Open Overview" : "Set Active";
  const connectionId = escapeHtml(connection.id);
  const logoMarkup = renderConnectionLogo(connection, {
    containerClass: [
      "clipped-corner flex h-10 w-10 items-center justify-center overflow-hidden transition-colors",
      isActive ? "bg-primary-container" : "bg-surface-container-highest",
    ].join(" "),
    containerAttributes: ['style="--clip-path: ', clipPath, ';"'].join(""),
    imageClassName: "h-full w-full object-cover",
    iconClassName: isActive ? "text-on-primary" : "text-outline-variant",
  });

  return [
    '<article class="connection-card clipped-corner ',
    isActive ? "is-active" : "",
    '" style="--clip-path: ',
    clipPath,
    ';">',
    '<div class="flex-1 p-6"><div class="mb-6 flex items-start justify-between">',
    logoMarkup,
    '<div class="flex items-center gap-2">',
    renderStatusBadge(isActive ? "ACTIVE" : "RECENT", isActive ? "primary" : "muted"),
    connection.readOnly ? renderStatusBadge("READ_ONLY", "alert") : "",
    "</div></div>",
    '<h3 class="mb-1 font-body text-xl font-bold uppercase ',
    isActive ? "text-[#FCE300]" : "text-on-surface",
    '">',
    escapeHtml(connection.label),
    "</h3>",
    '<p class="block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-outline-variant" title="',
    escapeHtml(connection.path),
    '">',
    escapeHtml(truncateMiddle(connection.path, 68)),
    "</p>",
    renderConnectionTags(connection.tags),
    '<div class="mt-8 grid grid-cols-2 gap-4">',
    '<div><div class="mb-1 text-[9px] font-mono uppercase text-outline-variant">Allocation</div><div class="text-xs font-bold text-on-surface">',
    escapeHtml(formatBytes(connection.sizeBytes)),
    "</div></div>",
    '<div><div class="mb-1 text-[9px] font-mono uppercase text-outline-variant">Last Modified</div><div class="text-xs font-bold text-on-surface">',
    escapeHtml(formatDateTime(connection.lastModifiedAt)),
    "</div></div>",
    '<div><div class="mb-1 text-[9px] font-mono uppercase text-outline-variant">Last Opened</div><div class="text-xs font-bold text-on-surface">',
    escapeHtml(formatDateTime(connection.lastOpenedAt)),
    "</div></div>",
    '<div><div class="mb-1 text-[9px] font-mono uppercase text-outline-variant">Mode</div><div class="text-xs font-bold ',
    connection.readOnly ? "text-primary-container" : "text-on-surface",
    '">',
    connection.readOnly ? "Read only" : "Read / Write",
    "</div></div></div></div>",
    '<div class="border-t border-outline-variant/10 bg-surface-container-low px-4 py-3">',
    '<div class="grid grid-cols-[minmax(0,1fr)_5.1rem_5.8rem] gap-2">',
    '<button class="signature-button" data-action="select-connection" data-connection-id="',
    connectionId,
    '" type="button" title="',
    primaryActionLabel,
    '">',
    primaryActionLabel,
    "</button>",
    '<button class="standard-button" data-action="edit-connection" data-connection-id="',
    connectionId,
    '" type="button">Edit</button>',
    '<button class="delete-button" data-action="remove-connection" data-connection-id="',
    connectionId,
    '" type="button">Remove</button>',
    "</div></div></article>",
  ].join("");
}
