function getOwnValue(row, columnName) {
  if (!row || !Object.prototype.hasOwnProperty.call(row, columnName)) {
    return undefined;
  }

  return row[columnName];
}

function normalizeColumnName(column) {
  return String(typeof column === "object" ? column?.name : column ?? "").trim();
}

export function buildDataRowEditorJsonObject({ row, columns = [] } = {}) {
  const names = columns.map(normalizeColumnName).filter((name) => name && name !== "__identity");
  const sourceNames = names.length
    ? names
    : Object.keys(row ?? {}).filter((name) => name !== "__identity");

  return Object.fromEntries(
    sourceNames
      .map((name) => [name, getOwnValue(row, name)])
      .filter(([, value]) => value !== undefined)
  );
}

export function getUniqueEditorRowColumns(columns = []) {
  const uniqueColumns = [];
  const seen = new Set();

  for (const column of columns) {
    const sourceColumn = String(column?.sourceColumn ?? "").trim();

    if (!sourceColumn || seen.has(sourceColumn)) {
      continue;
    }

    seen.add(sourceColumn);
    uniqueColumns.push(column);
  }

  return uniqueColumns;
}

export function buildEditorRowEditorJsonObject({ row, editingColumns = [], resultColumns = [] } = {}) {
  const uniqueColumns = getUniqueEditorRowColumns(editingColumns).filter((column) => column.visible !== false);

  if (!uniqueColumns.length) {
    return buildDataRowEditorJsonObject({ row, columns: resultColumns });
  }

  return Object.fromEntries(
    uniqueColumns
      .map((column) => {
        const sourceColumn = String(column.sourceColumn ?? "").trim();
        const resultName = String(column.resultName ?? sourceColumn).trim();

        return [sourceColumn, getOwnValue(row, resultName)];
      })
      .filter(([name, value]) => name && name !== "__identity" && value !== undefined)
  );
}

export function stringifyRowEditorJson(rowObject) {
  return JSON.stringify(rowObject ?? {}, null, 2);
}
