import { isProtectedKeyColumn } from "./timestampPreview.js";

const MAX_FILEPATH_LENGTH = 2048;
const URL_SCHEME_PATTERN = /^(?:https?:\/\/|ftp:\/\/|mailto:|tel:)/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMERIC_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;
const WINDOWS_ABSOLUTE_PATTERN = /^[A-Za-z]:[\\/]/;
const HOME_PATH_PATTERN = /^~[\\/]/;
const UNIX_ABSOLUTE_PATTERN = /^\//;
const EXPLICIT_RELATIVE_PATTERN = /^(?:\.\.?[\\/])/;
const FILEPATH_COLUMN_PATTERN = /\b(?:path|filepath|file_path|filename|file|dir|directory|folder|location)\b/i;
const STRONG_FILENAME_COLUMN_PATTERN = /\b(?:filename|file_name|filepath|file_path|file)\b/i;
const KNOWN_EXTENSIONS = new Set([
  "sqlite",
  "sqlite3",
  "db",
  "json",
  "csv",
  "tsv",
  "txt",
  "log",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "pdf",
  "md",
  "html",
  "htm",
  "xml",
  "zip",
]);

function normalizeValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasSeparator(value) {
  return /[\\/]/.test(value);
}

function countSeparators(value) {
  return (value.match(/[\\/]/g) ?? []).length;
}

function getSeparator(value) {
  return value.includes("\\") && !value.includes("/") ? "\\" : "/";
}

function stripTrailingSeparators(value) {
  if (WINDOWS_ABSOLUTE_PATTERN.test(value) && value.length <= 3) {
    return value;
  }

  if (value === "/" || value === "~/" || value === "~\\") {
    return value;
  }

  return value.replace(/[\\/]+$/, "");
}

function isJsonString(value) {
  const text = normalizeValue(value);

  if (!text || !["{", "["].includes(text[0])) {
    return false;
  }

  try {
    const parsed = JSON.parse(text);
    return Boolean(parsed && typeof parsed === "object");
  } catch {
    return false;
  }
}

function getSegments(value) {
  return stripTrailingSeparators(value)
    .split(/[\\/]+/)
    .filter(Boolean);
}

function getColumnNameConfidence(columnName) {
  const normalized = String(columnName ?? "").trim();

  if (!normalized) {
    return 0;
  }

  if (FILEPATH_COLUMN_PATTERN.test(normalized.replaceAll("_", " "))) {
    return 0.25;
  }

  return 0;
}

function hasStrongFilenameColumnName(columnName) {
  return STRONG_FILENAME_COLUMN_PATTERN.test(String(columnName ?? "").replaceAll("_", " "));
}

export function getPathType(value) {
  const text = normalizeValue(value);

  if (HOME_PATH_PATTERN.test(text)) {
    return "home";
  }

  if (WINDOWS_ABSOLUTE_PATTERN.test(text)) {
    return "windows";
  }

  if (UNIX_ABSOLUTE_PATTERN.test(text)) {
    return "unix";
  }

  if (EXPLICIT_RELATIVE_PATTERN.test(text) || hasSeparator(text)) {
    return "relative";
  }

  return null;
}

export function extractFileName(value) {
  const text = normalizeValue(value);

  if (!text || /[\\/]$/.test(text)) {
    return null;
  }

  const segments = getSegments(text);
  return segments.at(-1) ?? null;
}

export function extractDirectory(value) {
  const text = normalizeValue(value);
  const fileName = extractFileName(text);

  if (!text || !fileName) {
    return stripTrailingSeparators(text) || null;
  }

  const separator = getSeparator(text);
  const directory = stripTrailingSeparators(text).slice(0, -fileName.length).replace(/[\\/]+$/, "");

  if (!directory) {
    return null;
  }

  if (directory === "~") {
    return `~${separator}`;
  }

  return directory;
}

export function extractExtension(value) {
  const fileName = extractFileName(value);

  if (!fileName || fileName.startsWith(".") && fileName.indexOf(".", 1) === -1) {
    return null;
  }

  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

function hasKnownExtension(value) {
  const extension = extractExtension(value);
  return Boolean(extension && KNOWN_EXTENSIONS.has(extension));
}

function looksLikeExcludedValue(value) {
  const text = normalizeValue(value);

  return (
    !text ||
    text.length > MAX_FILEPATH_LENGTH ||
    URL_SCHEME_PATTERN.test(text) ||
    EMAIL_PATTERN.test(text) ||
    NUMERIC_PATTERN.test(text) ||
    ["true", "false"].includes(text.toLowerCase()) ||
    isJsonString(text)
  );
}

export function isLikelyFilePath(value) {
  const text = normalizeValue(value);

  if (looksLikeExcludedValue(text)) {
    return false;
  }

  return Boolean(getPathType(text));
}

function getFilePathConfidence(value, columnName) {
  const text = normalizeValue(value);
  const pathType = getPathType(text);
  const extension = extractExtension(text);
  const separatorCount = countSeparators(text);
  let confidence = 0;

  if (pathType === "unix" || pathType === "windows" || pathType === "home") {
    confidence += 0.55;
  } else if (EXPLICIT_RELATIVE_PATTERN.test(text)) {
    confidence += 0.45;
  } else if (pathType === "relative") {
    confidence += 0.4;
  } else if (extension && hasStrongFilenameColumnName(columnName)) {
    confidence += 0.25;
  }

  confidence += getColumnNameConfidence(columnName);

  if (extension && KNOWN_EXTENSIONS.has(extension)) {
    confidence += 0.25;
  } else if (extension) {
    confidence += 0.15;
  }

  if (separatorCount >= 2) {
    confidence += 0.15;
  } else if (separatorCount === 1) {
    confidence += 0.05;
  }

  if (!extension && separatorCount >= 2) {
    confidence += 0.05;
  }

  return Math.min(1, Number(confidence.toFixed(2)));
}

export function detectFilePathValue(value, columnName, tableMeta = {}) {
  if (isProtectedKeyColumn(columnName, tableMeta)) {
    return null;
  }

  const rawValue = normalizeValue(value);

  if (looksLikeExcludedValue(rawValue)) {
    return null;
  }

  const pathType = getPathType(rawValue);
  const extension = extractExtension(rawValue);

  if (!pathType && !(extension && hasStrongFilenameColumnName(columnName))) {
    return null;
  }

  if (!hasSeparator(rawValue) && !(extension && hasStrongFilenameColumnName(columnName))) {
    return null;
  }

  const confidence = getFilePathConfidence(rawValue, columnName);

  if (confidence < 0.7) {
    return null;
  }

  return {
    type: "filepath",
    pathType: pathType ?? "relative",
    rawValue,
    fileName: extractFileName(rawValue),
    directory: extractDirectory(rawValue),
    extension,
    confidence,
  };
}

export function compactPathForDisplay(value, maxLength = 42) {
  const text = normalizeValue(value);

  if (text.length <= maxLength) {
    return text;
  }

  const separator = getSeparator(text);
  const fileName = extractFileName(text);
  const directory = extractDirectory(text);
  const directorySegments = directory ? getSegments(directory) : [];
  const parent = directorySegments.at(-1);
  const compact = [parent, fileName].filter(Boolean).join(separator);
  const candidate = compact ? `...${separator}${compact}` : `...${text.slice(-(maxLength - 3))}`;

  if (candidate.length <= maxLength) {
    return candidate;
  }

  return `...${candidate.slice(-(maxLength - 3))}`;
}

export function getPathTypeLabel(pathType) {
  if (pathType === "unix") {
    return "unix path";
  }

  if (pathType === "windows") {
    return "windows path";
  }

  if (pathType === "home") {
    return "home path";
  }

  return "relative path";
}
