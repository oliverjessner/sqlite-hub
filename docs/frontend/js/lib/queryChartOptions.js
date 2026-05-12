import {
  coerceDatetimeChartValue,
  coerceNumericChartValue,
  formatTimeOfDayAxisValue,
  formatQueryChartAxisValue,
  getAnalysisColumn,
  sortQueryChartRows,
  sortQueryChartRowsByNumericColumn,
} from "./queryCharts.js";

const CHART_PALETTE = ["#FCE300", "#2DFAFF", "#FFB4AB", "#CDC7AB", "#7DD3FC", "#86EFAC"];

function buildCommonOption() {
  return {
    animationDuration: 220,
    backgroundColor: "transparent",
    color: CHART_PALETTE,
    textStyle: {
      color: "#e5e2e1",
      fontFamily: "Inter, sans-serif",
    },
    tooltip: {
      backgroundColor: "#201f1f",
      borderColor: "rgba(252, 227, 0, 0.14)",
      textStyle: {
        color: "#e5e2e1",
      },
    },
    grid: {
      left: 48,
      right: 24,
      top: 36,
      bottom: 48,
      containLabel: true,
    },
  };
}

function buildAxisLabel(color = "#cdc7ab") {
  return {
    color,
    fontFamily: "Roboto Mono, monospace",
    fontSize: 11,
  };
}

function buildLineLabelConfig(enabled) {
  return enabled
    ? {
        show: true,
        color: "#e5e2e1",
        fontFamily: "Roboto Mono, monospace",
        fontSize: 10,
      }
    : { show: false };
}

export function buildBarChartOption(chart, rows) {
  const sortedRows =
    chart.config.sort_by === "y"
      ? sortQueryChartRowsByNumericColumn(rows, chart.config.y_column, chart.config.sort_direction)
      : sortQueryChartRows(rows, chart.config.x_column, chart.config.sort_direction);

  return {
    ...buildCommonOption(),
    legend: {
      show: chart.config.show_legend,
      textStyle: { color: "#cdc7ab" },
    },
    xAxis: {
      type: "category",
      data: sortedRows.map((row) => formatQueryChartAxisValue(row[chart.config.x_column])),
      axisLabel: buildAxisLabel(),
      axisLine: { lineStyle: { color: "rgba(205, 199, 171, 0.28)" } },
    },
    yAxis: {
      type: "value",
      axisLabel: buildAxisLabel(),
      splitLine: { lineStyle: { color: "rgba(205, 199, 171, 0.12)" } },
    },
    series: [
      {
        name: chart.name,
        type: "bar",
        label: buildLineLabelConfig(chart.config.show_labels),
        emphasis: { focus: "series" },
        data: sortedRows.map((row) => coerceNumericChartValue(row[chart.config.y_column]) ?? 0),
      },
    ],
  };
}

export function buildLineChartOption(chart, rows) {
  const sortedRows = sortQueryChartRows(rows, chart.config.x_column, chart.config.sort_direction);

  return {
    ...buildCommonOption(),
    legend: {
      show: chart.config.show_legend,
      textStyle: { color: "#cdc7ab" },
    },
    xAxis: {
      type: "category",
      data: sortedRows.map((row) => formatQueryChartAxisValue(row[chart.config.x_column])),
      axisLabel: buildAxisLabel(),
      axisLine: { lineStyle: { color: "rgba(205, 199, 171, 0.28)" } },
    },
    yAxis: {
      type: "value",
      axisLabel: buildAxisLabel(),
      splitLine: { lineStyle: { color: "rgba(205, 199, 171, 0.12)" } },
    },
    series: [
      {
        name: chart.name,
        type: "line",
        smooth: chart.config.smooth,
        showSymbol: sortedRows.length < 60,
        symbolSize: 8,
        lineStyle: {
          width: 3,
        },
        label: buildLineLabelConfig(chart.config.show_labels),
        data: sortedRows.map((row) => coerceNumericChartValue(row[chart.config.y_column]) ?? 0),
      },
    ],
  };
}

export function buildPieChartOption(chart, rows) {
  return {
    ...buildCommonOption(),
    legend: {
      show: chart.config.show_legend,
      orient: "vertical",
      right: 0,
      top: "middle",
      textStyle: { color: "#cdc7ab" },
    },
    series: [
      {
        name: chart.name,
        type: "pie",
        radius: chart.config.donut ? ["42%", "70%"] : "70%",
        center: chart.config.show_legend ? ["36%", "50%"] : ["50%", "50%"],
        label: {
          show: chart.config.show_labels,
          color: "#e5e2e1",
          formatter: "{b}: {c}",
          fontSize: 11,
        },
        data: rows.map((row) => ({
          name: formatQueryChartAxisValue(row[chart.config.label_column]),
          value: coerceNumericChartValue(row[chart.config.value_column]) ?? 0,
        })),
      },
    ],
  };
}

function resolveScatterAxisType(column) {
  if (column?.type === "datetime") {
    return column.datetimeKind === "time" ? "time-of-day" : "time";
  }

  return "value";
}

function buildScatterAxisConfig(column, columnName) {
  const axisType = resolveScatterAxisType(column);
  const baseConfig = {
    axisLabel: buildAxisLabel(),
    splitLine: { lineStyle: { color: "rgba(205, 199, 171, 0.12)" } },
    name: columnName,
    nameTextStyle: buildAxisLabel("#FCE300"),
  };

  if (axisType === "time") {
    return {
      ...baseConfig,
      type: "time",
    };
  }

  if (axisType === "time-of-day") {
    return {
      ...baseConfig,
      type: "value",
      axisLabel: {
        ...buildAxisLabel(),
        formatter: (value) => formatTimeOfDayAxisValue(value),
      },
    };
  }

  return {
    ...baseConfig,
    type: "value",
  };
}

function coerceScatterAxisValue(value, axisType) {
  if (axisType === "time" || axisType === "time-of-day") {
    return coerceDatetimeChartValue(value);
  }

  return coerceNumericChartValue(value);
}

function buildScatterSeries(chart, rows, analysis) {
  const groups = new Map();
  const xColumn = getAnalysisColumn(analysis, chart.config.x_column);
  const yColumn = getAnalysisColumn(analysis, chart.config.y_column);
  const xAxisType = resolveScatterAxisType(xColumn);
  const yAxisType = resolveScatterAxisType(yColumn);
  const sizeValues = rows
    .map((row) => coerceNumericChartValue(row[chart.config.size_column]))
    .filter((value) => value !== null);
  const minSize = sizeValues.length ? Math.min(...sizeValues) : 0;
  const maxSize = sizeValues.length ? Math.max(...sizeValues) : 0;

  function resolveSymbolSize(sizeValue) {
    if (sizeValue === null || sizeValue === undefined) {
      return 14;
    }

    if (maxSize <= minSize) {
      return 20;
    }

    return 10 + ((sizeValue - minSize) / (maxSize - minSize)) * 24;
  }

  rows.forEach((row) => {
    const seriesName = chart.config.series_column
      ? formatQueryChartAxisValue(row[chart.config.series_column])
      : chart.name;
    const x = coerceScatterAxisValue(row[chart.config.x_column], xAxisType);
    const y = coerceScatterAxisValue(row[chart.config.y_column], yAxisType);

    if (x === null || y === null) {
      return;
    }

    const point = {
      value: [
        x,
        y,
        chart.config.size_column ? coerceNumericChartValue(row[chart.config.size_column]) : null,
      ],
      symbolSize: resolveSymbolSize(
        chart.config.size_column ? coerceNumericChartValue(row[chart.config.size_column]) : null
      ),
    };

    if (!groups.has(seriesName)) {
      groups.set(seriesName, []);
    }

    groups.get(seriesName).push(point);
  });

  return Array.from(groups.entries()).map(([seriesName, data]) => ({
    name: seriesName,
    type: "scatter",
    data,
    symbolSize(value, params) {
      return params?.data?.symbolSize ?? resolveSymbolSize(value?.[2] ?? null);
    },
  }));
}

export function buildScatterChartOption(chart, rows, analysis = null) {
  const xColumn = getAnalysisColumn(analysis, chart.config.x_column);
  const yColumn = getAnalysisColumn(analysis, chart.config.y_column);

  return {
    ...buildCommonOption(),
    legend: {
      show: chart.config.show_legend,
      textStyle: { color: "#cdc7ab" },
    },
    xAxis: buildScatterAxisConfig(xColumn, chart.config.x_column),
    yAxis: buildScatterAxisConfig(yColumn, chart.config.y_column),
    series: buildScatterSeries(chart, rows, analysis),
  };
}
