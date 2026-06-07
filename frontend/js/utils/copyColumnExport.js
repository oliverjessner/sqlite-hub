export const COPY_COLUMN_MODE_VALUES = ["column", "column-with-header", "first-10", "markdown-todo"];

export function normalizeCopyColumnMode(mode) {
  const normalizedMode = String(mode ?? "").trim();
  return COPY_COLUMN_MODE_VALUES.includes(normalizedMode) ? normalizedMode : "column";
}

export function isMarkdownTodoCopyColumnMode(mode) {
  return normalizeCopyColumnMode(mode) === "markdown-todo";
}

export function getCopyColumnActionLabel(copyMode) {
  const normalizedMode = normalizeCopyColumnMode(copyMode);

  if (normalizedMode === "column-with-header") {
    return "Copy column with header";
  }

  if (normalizedMode === "first-10") {
    return "Copy first 10";
  }

  if (normalizedMode === "markdown-todo") {
    return "Export as Markdown Todo";
  }

  return "Copy column";
}

export function getCopyColumnExportMetadata(copyMode) {
  return isMarkdownTodoCopyColumnMode(copyMode)
    ? {
        extension: "md",
        label: "Markdown",
        mimeType: "text/markdown;charset=utf-8",
        suffix: "markdown-todo",
      }
    : {
        extension: "txt",
        label: "TXT",
        mimeType: "text/plain;charset=utf-8",
        suffix: normalizeCopyColumnMode(copyMode).replaceAll("-", "_"),
      };
}

function stringifyCopyColumnValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function formatDelimitedCopyColumnValue(value, wrapper) {
  const text = stringifyCopyColumnValue(value);
  const normalizedWrapper = String(wrapper ?? "");

  if (!normalizedWrapper) {
    return text;
  }

  return `${normalizedWrapper}${text
    .split(normalizedWrapper)
    .join(`${normalizedWrapper}${normalizedWrapper}`)}${normalizedWrapper}`;
}

function formatMarkdownTodoValue(value) {
  return stringifyCopyColumnValue(value).replace(/\r\n|\r|\n/g, " ");
}

function getCopyColumnSourceRows(result, copyMode) {
  const rows = result?.rows ?? [];
  return normalizeCopyColumnMode(copyMode) === "first-10" ? rows.slice(0, 10) : rows;
}

export function buildCopyColumnText({
  result,
  columnName,
  copyMode = "column",
  separator = ",",
  wrapper = "",
} = {}) {
  const normalizedMode = normalizeCopyColumnMode(copyMode);
  const sourceRows = getCopyColumnSourceRows(result, normalizedMode);
  const values = sourceRows.map((row) => row?.[columnName]);

  if (normalizedMode === "markdown-todo") {
    return {
      text: values.map((value) => `- [ ] ${formatMarkdownTodoValue(value)}`).join("\n"),
      valueCount: values.length,
    };
  }

  const outputValues = normalizedMode === "column-with-header" ? [columnName, ...values] : values;

  return {
    text: outputValues.map((value) => formatDelimitedCopyColumnValue(value, wrapper)).join(separator),
    valueCount: values.length,
  };
}

export function buildCopyColumnPreviewText({
  result,
  columnName,
  copyMode = "column",
  separator = ",",
  wrapper = "",
  maxRows = 4,
} = {}) {
  const limitedRows = {
    rows: getCopyColumnSourceRows(result, copyMode).slice(0, Math.max(0, Number(maxRows) || 0)),
  };

  return buildCopyColumnText({
    result: limitedRows,
    columnName,
    copyMode: normalizeCopyColumnMode(copyMode) === "first-10" ? "column" : copyMode,
    separator,
    wrapper,
  }).text;
}
