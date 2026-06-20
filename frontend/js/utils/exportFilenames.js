export const TEXT_EXPORT_EXTENSIONS = {
  csv: "csv",
  tsv: "tsv",
  md: "md",
  json: "json",
  parquet: "parquet",
};

export function normalizeTextExportFormat(format = "csv") {
  const normalized = String(format ?? "csv").toLowerCase();
  return TEXT_EXPORT_EXTENSIONS[normalized] ? normalized : "csv";
}

function stripKnownTextExportExtension(value = "") {
  return String(value).replace(/\.(csv|tsv|md|json|parquet)$/i, "");
}

export function sanitizeExportFilenameBase(value, fallback = "export") {
  const sanitized = stripKnownTextExportExtension(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "");

  return (sanitized || fallback).slice(0, 120);
}

export function buildTextExportFilename(value, { format = "csv", fallback = "export" } = {}) {
  const normalizedFormat = normalizeTextExportFormat(format);
  const extension = TEXT_EXPORT_EXTENSIONS[normalizedFormat];
  const base = sanitizeExportFilenameBase(value, fallback);

  return `${base}.${extension}`;
}
