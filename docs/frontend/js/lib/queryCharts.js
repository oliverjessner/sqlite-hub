const QUERY_CHART_TYPES = ["bar", "line", "pie", "scatter"];
const QUERY_CHART_TYPE_LABELS = {
  bar: "Bar",
  line: "Line",
  pie: "Pie",
  scatter: "Scatter",
};
const TIME_ONLY_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumericString(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  return trimmed !== "" && Number.isFinite(Number(trimmed));
}

function parseTimeOnlyValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(TIME_ONLY_PATTERN);

  if (!match) {
    return null;
  }

  const [, hoursText, minutesText, secondsText = "0", millisecondsText = "0"] = match;
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);
  const milliseconds = Number(millisecondsText.padEnd(3, "0"));

  return (((hours * 60 + minutes) * 60 + seconds) * 1000) + milliseconds;
}

function isDatetimeLikeValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  if (parseTimeOnlyValue(trimmed) !== null) {
    return true;
  }

  if (!/[-/:T.Z]/.test(trimmed) && !/\b\d{4}\b/.test(trimmed)) {
    return false;
  }

  return !Number.isNaN(Date.parse(trimmed));
}

function getDatetimeKind(value) {
  if (parseTimeOnlyValue(value) !== null) {
    return "time";
  }

  if (isDatetimeLikeValue(value)) {
    return "datetime";
  }

  return null;
}

function inferDatetimeKindFromSamples(values = []) {
  const kinds = values
    .map((value) => getDatetimeKind(value))
    .filter(Boolean);

  if (!kinds.length) {
    return "datetime";
  }

  return kinds.every((kind) => kind === "time") ? "time" : "datetime";
}

export function coerceDatetimeChartValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const timeOnlyValue = parseTimeOnlyValue(trimmed);

  if (timeOnlyValue !== null) {
    return timeOnlyValue;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function compareValues(left, right) {
  if (left === right) {
    return 0;
  }

  if (left === null || left === undefined) {
    return -1;
  }

  if (right === null || right === undefined) {
    return 1;
  }

  if (isFiniteNumber(left) && isFiniteNumber(right)) {
    return left - right;
  }

  const leftDate = isDatetimeLikeValue(left) ? coerceDatetimeChartValue(left) : null;
  const rightDate = isDatetimeLikeValue(right) ? coerceDatetimeChartValue(right) : null;

  if (leftDate !== null && rightDate !== null) {
    return leftDate - rightDate;
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function isBlobValue(value) {
  return Boolean(value && typeof value === "object" && value.__type === "blob");
}

function getColumnNameSignal(columnName = "") {
  const normalized = String(columnName ?? "").trim().toLowerCase();

  return {
    looksNumeric:
      /(count|total|sum|avg|amount|score|size|value|price|cost|rate|percent|pct|number)/.test(
        normalized
      ),
    looksDatetime:
      /(date|time|day|week|month|quarter|year|bucket|hour|minute|second|at)/.test(normalized),
  };
}

function inferColumnTypeFromSamples(columnName, values) {
  const samples = values.filter(
    (value) => value !== null && value !== undefined && !isBlobValue(value)
  );
  const nameSignal = getColumnNameSignal(columnName);

  if (!samples.length) {
    if (nameSignal.looksDatetime) {
      return "datetime";
    }

    if (nameSignal.looksNumeric) {
      return "number";
    }

    return "unknown";
  }

  const numericValues = samples.filter((value) => isFiniteNumber(value) || isNumericString(value));

  if (numericValues.length === samples.length) {
    return "number";
  }

  const datetimeValues = samples.filter((value) => isDatetimeLikeValue(value));

  if (datetimeValues.length === samples.length) {
    return "datetime";
  }

  if (samples.every((value) => typeof value === "string")) {
    return "text";
  }

  return "unknown";
}

function collectDistinctValues(rows, columnName, limit = 25) {
  const values = [];
  const seen = new Set();

  for (const row of rows ?? []) {
    const value = row?.[columnName];

    if (value === null || value === undefined || isBlobValue(value)) {
      continue;
    }

    const key = JSON.stringify(value);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    values.push(value);

    if (values.length >= limit) {
      break;
    }
  }

  return values;
}

export function coerceNumericChartValue(value) {
  if (isFiniteNumber(value)) {
    return value;
  }

  if (isNumericString(value)) {
    return Number(value);
  }

  return null;
}

export function analyzeQueryChartResult(result) {
  const rows = result?.rows ?? [];
  const columns = (result?.columns ?? []).map((columnName) => {
    const distinctValues = collectDistinctValues(rows, columnName);

    return {
      name: columnName,
      type: inferColumnTypeFromSamples(columnName, distinctValues),
      datetimeKind: inferDatetimeKindFromSamples(distinctValues),
      distinctValues,
    };
  });
  const columnsByName = new Map(columns.map((column) => [column.name, column]));

  return {
    rows,
    columns,
    columnsByName,
    numberColumns: columns.filter((column) => column.type === "number"),
    textColumns: columns.filter((column) => column.type === "text"),
    datetimeColumns: columns.filter((column) => column.type === "datetime"),
    unknownColumns: columns.filter((column) => column.type === "unknown"),
  };
}

export function buildQueryChartResultColumns(analysis) {
  return (analysis?.columns ?? []).map((column) => ({
    name: column.name,
    type: column.type,
  }));
}

export function getAnalysisColumn(analysis, columnName) {
  return analysis?.columnsByName?.get(columnName) ?? null;
}

export function getQueryChartTypeLabel(chartType) {
  return QUERY_CHART_TYPE_LABELS[chartType] ?? String(chartType ?? "").trim();
}

export function buildDefaultQueryChartName(chartType, queryName) {
  const normalizedQueryName = String(queryName ?? "").replace(/\s+/g, " ").trim() || "Query";
  return `${getQueryChartTypeLabel(chartType)}_${normalizedQueryName}`;
}

export function resolveUniqueQueryChartName(baseName, existingCharts = [], excludeChartId = null) {
  const normalizedBaseName = String(baseName ?? "").replace(/\s+/g, " ").trim() || "Chart";
  const existingNames = new Set(
    (existingCharts ?? [])
      .filter((chart) => Number(chart.id) !== Number(excludeChartId))
      .map((chart) => chart.name)
  );

  if (!existingNames.has(normalizedBaseName)) {
    return normalizedBaseName;
  }

  let suffix = 2;

  while (existingNames.has(`${normalizedBaseName}_${suffix}`)) {
    suffix += 1;
  }

  return `${normalizedBaseName}_${suffix}`;
}

function getFirstColumn(columns, predicate) {
  return (columns ?? []).find((column) => predicate(column)) ?? null;
}

function getNextNumericColumn(analysis, excludedNames = []) {
  const excluded = new Set(excludedNames);
  const candidates = (analysis?.numberColumns ?? []).filter((column) => !excluded.has(column.name));

  if (!candidates.length) {
    return null;
  }

  const scoredCandidates = candidates
    .map((column, index) => ({
      column,
      index,
      score: getNumericMeasureScore(column.name),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return scoredCandidates[0]?.column ?? null;
}

function getNumericMeasureScore(columnName = "") {
  const normalized = String(columnName ?? "")
    .trim()
    .toLowerCase();

  let score = 0;

  if (
    /(count|total|sum|avg|average|amount|score|size|value|price|cost|rate|percent|pct|percentage|number)/.test(
      normalized
    )
  ) {
    score += 20;
  }

  if (/(^|_)(id|uuid|pk|key)$/.test(normalized) || /(^|_)id$/.test(normalized)) {
    score -= 40;
  }

  return score;
}

function getPrimaryDimensionColumn(analysis) {
  return (
    getFirstColumn(analysis?.datetimeColumns, () => true) ??
    getFirstColumn(analysis?.textColumns, () => true) ??
    getFirstColumn(analysis?.unknownColumns, () => true)
  );
}

function getTimeDimensionColumn(analysis) {
  return (
    getFirstColumn(analysis?.datetimeColumns, () => true) ??
    getFirstColumn(analysis?.columns, (column) => getColumnNameSignal(column.name).looksDatetime)
  );
}

function shouldPreferPie(analysis) {
  const dimensionColumn = getPrimaryDimensionColumn(analysis);
  const numericColumn = getNextNumericColumn(analysis);

  if (!dimensionColumn || !numericColumn) {
    return false;
  }

  const distinctCount = dimensionColumn.distinctValues?.length ?? 0;
  return distinctCount > 0 && distinctCount <= 8 && (analysis?.numberColumns?.length ?? 0) === 1;
}

export function suggestQueryChartType(analysis) {
  if ((analysis?.numberColumns?.length ?? 0) >= 2 && !(analysis?.textColumns?.length ?? 0)) {
    return "scatter";
  }

  if (getTimeDimensionColumn(analysis) && getNextNumericColumn(analysis)) {
    return "line";
  }

  if (shouldPreferPie(analysis)) {
    return "pie";
  }

  if (getPrimaryDimensionColumn(analysis) && getNextNumericColumn(analysis)) {
    return "bar";
  }

  if ((analysis?.numberColumns?.length ?? 0) >= 2) {
    return "scatter";
  }

  return "bar";
}

export function buildSuggestedChartConfig(chartType, analysis) {
  const type = QUERY_CHART_TYPES.includes(chartType) ? chartType : "bar";
  const primaryDimension = getPrimaryDimensionColumn(analysis);
  const timeDimension = getTimeDimensionColumn(analysis);
  const firstNumeric = getNextNumericColumn(analysis);
  const secondNumeric = getNextNumericColumn(analysis, [firstNumeric?.name]);

  switch (type) {
    case "line":
      return {
        x_column: timeDimension?.name ?? primaryDimension?.name ?? "",
        y_column: firstNumeric?.name ?? "",
        show_legend: true,
        show_labels: false,
        sort_direction: "asc",
        smooth: false,
      };
    case "pie":
      return {
        label_column: primaryDimension?.name ?? "",
        value_column: firstNumeric?.name ?? "",
        show_legend: true,
        show_labels: true,
        donut: false,
      };
    case "scatter":
      return {
        x_column: firstNumeric?.name ?? "",
        y_column: secondNumeric?.name ?? firstNumeric?.name ?? "",
        size_column: null,
        series_column: primaryDimension?.name ?? null,
        show_legend: true,
      };
    case "bar":
    default:
      return {
        x_column: primaryDimension?.name ?? timeDimension?.name ?? "",
        y_column: firstNumeric?.name ?? "",
        show_legend: true,
        show_labels: false,
        sort_by: "y",
        sort_direction: "desc",
      };
  }
}

function getColumn(analysis, columnName) {
  return getAnalysisColumn(analysis, columnName);
}

function ensureColumnExists(analysis, columnName, label, errors) {
  if (!columnName) {
    errors.push(`${label} is required.`);
    return null;
  }

  const column = getColumn(analysis, columnName);

  if (!column) {
    errors.push(`${label} "${columnName}" is missing from the current result set.`);
    return null;
  }

  return column;
}

function validateNumericColumn(column, label, errors) {
  if (!column) {
    return;
  }

  if (column.type !== "number") {
    errors.push(`${label} "${column.name}" must be numeric.`);
  }
}

function validateScatterAxisColumn(column, label, errors) {
  if (!column) {
    return;
  }

  if (!["number", "datetime"].includes(column.type)) {
    errors.push(`${label} "${column.name}" must be numeric or datetime.`);
  }
}

export function validateQueryChartConfig(chartType, config, analysis) {
  const errors = [];
  const type = QUERY_CHART_TYPES.includes(chartType) ? chartType : null;

  if (!type) {
    return {
      valid: false,
      errors: [`Unsupported chart type "${chartType}".`],
    };
  }

  if (!analysis?.columns?.length) {
    return {
      valid: false,
      errors: ["The query result has no columns available for chart mapping."],
    };
  }

  switch (type) {
    case "bar": {
      ensureColumnExists(analysis, config?.x_column, "Bar x column", errors);
      ensureColumnExists(analysis, config?.y_column, "Bar y column", errors);
      validateNumericColumn(getColumn(analysis, config?.y_column), "Bar y column", errors);
      break;
    }
    case "line": {
      ensureColumnExists(analysis, config?.x_column, "Line x column", errors);
      ensureColumnExists(analysis, config?.y_column, "Line y column", errors);
      validateNumericColumn(getColumn(analysis, config?.y_column), "Line y column", errors);
      break;
    }
    case "pie": {
      ensureColumnExists(analysis, config?.label_column, "Pie label column", errors);
      ensureColumnExists(analysis, config?.value_column, "Pie value column", errors);
      validateNumericColumn(getColumn(analysis, config?.value_column), "Pie value column", errors);
      break;
    }
    case "scatter": {
      const xColumn = ensureColumnExists(analysis, config?.x_column, "Scatter x column", errors);
      const yColumn = ensureColumnExists(analysis, config?.y_column, "Scatter y column", errors);
      validateScatterAxisColumn(xColumn, "Scatter x column", errors);
      validateScatterAxisColumn(yColumn, "Scatter y column", errors);

      if (config?.size_column) {
        validateNumericColumn(
          ensureColumnExists(analysis, config.size_column, "Scatter size column", errors),
          "Scatter size column",
          errors
        );
      }

      if (config?.series_column) {
        ensureColumnExists(analysis, config.series_column, "Scatter series column", errors);
      }
      break;
    }
    default:
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function sortQueryChartRows(rows, columnName, direction = "asc") {
  const multiplier = direction === "desc" ? -1 : 1;

  return [...(rows ?? [])].sort(
    (left, right) => compareValues(left?.[columnName], right?.[columnName]) * multiplier
  );
}

export function sortQueryChartRowsByNumericColumn(rows, columnName, direction = "asc") {
  const multiplier = direction === "desc" ? -1 : 1;

  return [...(rows ?? [])].sort((left, right) => {
    const leftValue = coerceNumericChartValue(left?.[columnName]);
    const rightValue = coerceNumericChartValue(right?.[columnName]);

    return compareValues(leftValue, rightValue) * multiplier;
  });
}

export function formatQueryChartAxisValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  return String(value);
}

export function formatTimeOfDayAxisValue(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value ?? "");
  }

  const totalMilliseconds = Math.max(0, Math.round(numericValue));
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (seconds) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export {
  QUERY_CHART_TYPE_LABELS,
  QUERY_CHART_TYPES,
};
