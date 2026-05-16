const KEYWORD_PATTERN =
  /\b(WITH|SELECT|FROM|WHERE|AND|OR|ORDER|BY|ASC|DESC|AS|COUNT|FILTER|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|LIMIT|OFFSET|AVG|SUM|MIN|MAX|OVER|PARTITION|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA|VALUES|INTO|SET|BEGIN|COMMIT|ROLLBACK)\b/gi;

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});
const COMPACT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeStyle: "short",
});

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString("en-US") : "0";
}

export function formatBytes(value) {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDateTime(value) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : DATE_TIME_FORMATTER.format(date);
}

export function formatCompactDateTime(value) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : COMPACT_DATE_TIME_FORMATTER.format(date);
}

export function formatDurationMs(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return "N/A";
  }

  return `${numericValue.toLocaleString("en-US")} ms`;
}

export function formatRelativeBoolean(value) {
  return value ? "ENABLED" : "DISABLED";
}

export function formatIdentifierLabel(value = "") {
  return String(value || "unknown");
}

export function truncateMiddle(value = "", maxLength = 56) {
  const text = String(value);

  if (text.length <= maxLength) {
    return text;
  }

  const sliceLength = Math.floor((maxLength - 3) / 2);
  return `${text.slice(0, sliceLength)}...${text.slice(-sliceLength)}`;
}

export function highlightSql(query = "") {
  const lines = String(query).split("\n");

  return lines
    .map((line) => {
      if (line.trim().startsWith("--")) {
        return `<span class="sql-comment">${escapeHtml(line)}</span>`;
      }

      const parts = [];
      const tokenPattern = /'[^']*'|\b\d+(?:\.\d+)?\b/g;
      let cursor = 0;
      let match;

      while ((match = tokenPattern.exec(line))) {
        if (match.index > cursor) {
          parts.push({
            type: "plain",
            value: line.slice(cursor, match.index),
          });
        }

        parts.push({
          type: match[0].startsWith("'") ? "string" : "value",
          value: match[0],
        });

        cursor = match.index + match[0].length;
      }

      if (cursor < line.length) {
        parts.push({
          type: "plain",
          value: line.slice(cursor),
        });
      }

      return parts
        .map((part) => {
          if (part.type === "string") {
            return `<span class="sql-string">${escapeHtml(part.value)}</span>`;
          }

          if (part.type === "value") {
            return `<span class="sql-value">${escapeHtml(part.value)}</span>`;
          }

          return escapeHtml(part.value).replace(
            KEYWORD_PATTERN,
            '<span class="sql-keyword">$1</span>'
          );
        })
        .join("");
    })
    .join("<br/>");
}

export function isBlobPreview(value) {
  return Boolean(value && typeof value === "object" && value.__type === "blob");
}

export function formatBlobPreview(value) {
  if (!isBlobPreview(value)) {
    return "";
  }

  return `BLOB • ${formatBytes(value.sizeBytes)} • ${value.hexPreview || "binary"}`;
}

export function formatCellValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (isBlobPreview(value)) {
    return formatBlobPreview(value);
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

export function inferStatusTone(value) {
  const normalized = String(value ?? "").toLowerCase();

  if (["ok", "active", "enabled", "success", "primary", "on"].includes(normalized)) {
    return "success";
  }

  if (["warning", "locked", "readonly", "read_only", "alert"].includes(normalized)) {
    return "alert";
  }

  if (["critical", "error", "failed"].includes(normalized)) {
    return "alert";
  }

  return "muted";
}
