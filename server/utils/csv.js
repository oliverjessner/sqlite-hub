function stringifyDelimitedCell(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function escapeCsvCell(value, delimiter) {
  const stringValue = stringifyDelimitedCell(value);

  if (
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r") ||
    stringValue.includes(delimiter)
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

function rowsToDelimitedText({ columns, rows, delimiter = "," }) {
  const header = columns.map((column) => escapeCsvCell(column, delimiter)).join(delimiter);
  const body = rows.map((row) =>
    columns
      .map((column) => escapeCsvCell(row[column], delimiter))
      .join(delimiter)
  );

  return [header, ...body].join("\n");
}

function rowsToCsv({ columns, rows, delimiter = "," }) {
  return rowsToDelimitedText({ columns, rows, delimiter });
}

function escapeMarkdownCell(value) {
  return stringifyDelimitedCell(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replace(/\r\n|\r|\n/g, "<br>");
}

function rowsToMarkdownTable({ columns, rows }) {
  const header = `| ${columns.map(escapeMarkdownCell).join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) => `| ${columns.map((column) => escapeMarkdownCell(row[column])).join(" | ")} |`
  );

  return [header, separator, ...body].join("\n");
}

module.exports = {
  rowsToCsv,
  rowsToDelimitedText,
  rowsToMarkdownTable,
};
