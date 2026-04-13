const { ValidationError } = require("../../utils/errors");

const SUPPORTED_QUERY_HISTORY_CHART_TYPES = ["bar", "line", "pie", "scatter"];
const SUPPORTED_RESULT_COLUMN_TYPES = ["number", "text", "datetime", "unknown"];

function normalizeChartName(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeChartType(value = "") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!SUPPORTED_QUERY_HISTORY_CHART_TYPES.includes(normalized)) {
    throw new ValidationError(`Unsupported chart type: ${value}`);
  }

  return normalized;
}

function normalizeBooleanFlag(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(
    String(value)
      .trim()
      .toLowerCase()
  );
}

function normalizeOptionalColumn(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeRequiredColumn(value, label) {
  const normalized = normalizeOptionalColumn(value);

  if (!normalized) {
    throw new ValidationError(`${label} is required.`);
  }

  return normalized;
}

function normalizeSortDirection(value, fallback = "asc") {
  return String(value ?? "").trim().toLowerCase() === "desc" ? "desc" : fallback;
}

function normalizeChartConfig(chartType, config = {}) {
  const source =
    config && typeof config === "object" && !Array.isArray(config) ? config : {};

  switch (normalizeChartType(chartType)) {
    case "bar":
      return {
        x_column: normalizeRequiredColumn(source.x_column, "Bar chart x column"),
        y_column: normalizeRequiredColumn(source.y_column, "Bar chart y column"),
        show_legend: normalizeBooleanFlag(source.show_legend, true),
        show_labels: normalizeBooleanFlag(source.show_labels, false),
        sort_direction: normalizeSortDirection(source.sort_direction, "asc"),
      };
    case "line":
      return {
        x_column: normalizeRequiredColumn(source.x_column, "Line chart x column"),
        y_column: normalizeRequiredColumn(source.y_column, "Line chart y column"),
        show_legend: normalizeBooleanFlag(source.show_legend, true),
        show_labels: normalizeBooleanFlag(source.show_labels, false),
        sort_direction: normalizeSortDirection(source.sort_direction, "asc"),
        smooth: normalizeBooleanFlag(source.smooth, false),
      };
    case "pie":
      return {
        label_column: normalizeRequiredColumn(source.label_column, "Pie chart label column"),
        value_column: normalizeRequiredColumn(source.value_column, "Pie chart value column"),
        show_legend: normalizeBooleanFlag(source.show_legend, true),
        show_labels: normalizeBooleanFlag(source.show_labels, true),
        donut: normalizeBooleanFlag(source.donut, false),
      };
    case "scatter":
      return {
        x_column: normalizeRequiredColumn(source.x_column, "Scatter chart x column"),
        y_column: normalizeRequiredColumn(source.y_column, "Scatter chart y column"),
        size_column: normalizeOptionalColumn(source.size_column),
        series_column: normalizeOptionalColumn(source.series_column),
        show_legend: normalizeBooleanFlag(source.show_legend, true),
      };
    default:
      throw new ValidationError(`Unsupported chart type: ${chartType}`);
  }
}

function normalizeResultColumns(resultColumns = []) {
  if (!Array.isArray(resultColumns)) {
    return [];
  }

  const seen = new Set();

  return resultColumns
    .map((column) => {
      if (!column || typeof column !== "object") {
        return null;
      }

      const name = String(column.name ?? "").trim();

      if (!name || seen.has(name)) {
        return null;
      }

      seen.add(name);

      const type = SUPPORTED_RESULT_COLUMN_TYPES.includes(column.type)
        ? column.type
        : "unknown";

      return { name, type };
    })
    .filter(Boolean);
}

function buildDefaultChartName(chartType, queryName) {
  const normalizedType = normalizeChartType(chartType);
  const normalizedQueryName = normalizeChartName(queryName) || "Query";
  return `${normalizedType[0].toUpperCase()}${normalizedType.slice(1)}_${normalizedQueryName}`;
}

module.exports = {
  SUPPORTED_QUERY_HISTORY_CHART_TYPES,
  buildDefaultChartName,
  normalizeChartConfig,
  normalizeChartName,
  normalizeChartType,
  normalizeResultColumns,
};
