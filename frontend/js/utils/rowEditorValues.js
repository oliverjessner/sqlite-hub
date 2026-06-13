export function getRowEditorValueState(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  return String(value) === "" ? "empty" : "value";
}

export function getRowEditorValueStateLabel(state) {
  if (state === "null") {
    return "NULL";
  }

  if (state === "empty") {
    return "EMPTY STRING";
  }

  return "VALUE";
}

export function buildRowEditorSubmittedValues(formData, fieldMetadata = {}) {
  const fieldNames = new Set();

  for (const [key] of formData.entries()) {
    if (key.startsWith("field:")) {
      fieldNames.add(key.slice("field:".length));
    }
  }

  return Object.fromEntries(
    [...fieldNames].map((fieldName) => {
      const valueKey = `field:${fieldName}`;
      const value = String(formData.get(valueKey) ?? "");
      const metadata = fieldMetadata[fieldName] ?? {};
      const keepInitialNull =
        metadata.initialState === "null" && metadata.dirty !== true && value === "";

      return [fieldName, keepInitialNull ? null : value];
    })
  );
}
