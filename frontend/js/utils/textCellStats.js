const CHARACTER_COUNT_FORMATTER = new Intl.NumberFormat("en-US");

export function getTextCellCharacterCount(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return Array.from(value).length;
}

export function formatTextCellCharacterCount(count) {
  const numericCount = Number(count);

  if (!Number.isFinite(numericCount) || numericCount < 0) {
    return "";
  }

  const label = numericCount === 1 ? "char" : "chars";
  return `${CHARACTER_COUNT_FORMATTER.format(numericCount)} ${label}`;
}
