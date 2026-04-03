function escapeCsvCell(value, delimiter) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue =
    typeof value === "object" ? JSON.stringify(value) : String(value);

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

function rowsToCsv({ columns, rows, delimiter = "," }) {
  const header = columns.map((column) => escapeCsvCell(column, delimiter)).join(delimiter);
  const body = rows.map((row) =>
    columns
      .map((column) => escapeCsvCell(row[column], delimiter))
      .join(delimiter)
  );

  return [header, ...body].join("\n");
}

module.exports = {
  rowsToCsv,
};
