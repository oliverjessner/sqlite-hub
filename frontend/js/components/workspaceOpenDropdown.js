import { renderDropdownButton } from "./dropdownButton.js";

function buildOpenItem({ disabled, icon, label, target, tableName }) {
  return {
    action: "navigate",
    dataAttributes: {
      to: target,
    },
    disabled,
    icon,
    label,
  };
}

export function renderWorkspaceOpenDropdown({
  align = "right",
  destinations = [],
  disabled = false,
  tableName = "",
} = {}) {
  const safeTableName = String(tableName ?? "").trim();
  const items = destinations.map((destination) => {
    if (destination.key === "sql-editor") {
      return {
        action: "open-table-in-sql-editor",
        dataAttributes: {
          tableName: safeTableName,
        },
        disabled: disabled || !safeTableName,
        icon: "terminal",
        label: "SQL Editor",
      };
    }

    return buildOpenItem({
      disabled: disabled || !safeTableName,
      icon: destination.icon,
      label: destination.label,
      target: destination.target(safeTableName),
      tableName: safeTableName,
    });
  });

  return renderDropdownButton({
    align,
    disabled: disabled || !safeTableName,
    icon: "open_in_new",
    items,
    label: "Open",
    title: safeTableName ? `Open ${safeTableName}` : "Open table",
  });
}
