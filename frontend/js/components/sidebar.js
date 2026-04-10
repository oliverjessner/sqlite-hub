import { escapeHtml } from "../utils/format.js";
import { renderConnectionLogo } from "./connectionLogo.js";

const sidebarItems = [
  { label: "Connections", href: "#/connections", key: "connections", icon: "database" },
  { label: "Overview", href: "#/overview", key: "overview", icon: "dashboard" },
  { label: "Data", href: "#/data", key: "data", icon: "table_rows" },
  { label: "SQL Editor", href: "#/editor", key: "editor", icon: "terminal" },
  { label: "Structure", href: "#/structure", key: "structure", icon: "account_tree" },
  { label: "Settings", href: "#/settings", key: "settings", icon: "settings" },
];

function getActiveSidebarKey(routeName) {
  if (routeName === "landing") {
    return "connections";
  }

  if (routeName === "editorResults") {
    return "editor";
  }

  return routeName;
}

export function renderSidebar(state) {
  const activeKey = getActiveSidebarKey(state.route.name);
  const activeConnection = state.connections.active;

  return `
    <nav class="sidebar-links">
      ${sidebarItems
        .map(
          (item) => `
            <a class="sidebar-link ${item.key === activeKey ? "is-active" : ""}" href="${item.href}">
              <span class="material-symbols-outlined">${item.icon}</span>
              <span>${item.label}</span>
            </a>
          `
        )
        .join("")}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-footer-card">
        ${renderConnectionLogo(activeConnection, {
          containerClass:
            "sidebar-footer-mark overflow-hidden bg-primary-container text-on-primary",
          imageClassName: "h-full w-full object-cover",
          iconClassName: "text-[15px]",
          icon: "memory",
        })}
        <div class="min-w-0">
          <p class="truncate text-[10px] font-bold text-on-surface">
            ${escapeHtml(activeConnection?.label ?? "NO_ACTIVE_DATABASE")}
          </p>
          <p class="text-[8px] text-on-surface-variant/60">
            ${activeConnection?.readOnly ? "READ_ONLY" : "READ_WRITE"}
          </p>
        </div>
      </div>
    </div>
  `;
}
