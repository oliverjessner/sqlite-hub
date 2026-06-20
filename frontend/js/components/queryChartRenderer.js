import {
  buildBarChartOption,
  buildLineChartOption,
  buildPieChartOption,
  buildScatterChartOption,
} from "../lib/queryChartOptions.js";
import { analyzeQueryChartResult, validateQueryChartConfig } from "../lib/queryCharts.js";

const chartInstances = new Map();
const chartHosts = new Map();
const resizeObservers = new Map();

function getEchartsRuntime() {
  return window.echarts ?? null;
}

function getOptionBuilder(chartType) {
  if (chartType === "bar") {
    return buildBarChartOption;
  }

  if (chartType === "line") {
    return buildLineChartOption;
  }

  if (chartType === "pie") {
    return buildPieChartOption;
  }

  if (chartType === "scatter") {
    return buildScatterChartOption;
  }

  return null;
}

function disposeChart(chartId) {
  const instance = chartInstances.get(chartId);

  if (instance) {
    instance.dispose();
    chartInstances.delete(chartId);
  }

  chartHosts.delete(chartId);

  const observer = resizeObservers.get(chartId);

  if (observer) {
    observer.disconnect();
    resizeObservers.delete(chartId);
  }
}

export function teardownQueryChartRenderer() {
  Array.from(chartInstances.keys()).forEach((chartId) => disposeChart(chartId));
}

export function mountQueryChartRenderer(state) {
  const echartsRuntime = getEchartsRuntime();
  const charts = state.charts.detail?.charts ?? [];
  const result = state.charts.result;

  const activeChartIds = new Set(charts.map((chart) => String(chart.id)));

  Array.from(chartInstances.keys()).forEach((chartId) => {
    const host = chartHosts.get(chartId);

    if (!activeChartIds.has(chartId) || !(host instanceof HTMLElement) || !host.isConnected) {
      disposeChart(chartId);
    }
  });

  if (!echartsRuntime || !result || !charts.length) {
    return;
  }

  const analysis = analyzeQueryChartResult(result);

  charts.forEach((chart) => {
    const host = document.querySelector(`[data-query-chart-id="${CSS.escape(String(chart.id))}"]`);

    if (!(host instanceof HTMLElement)) {
      return;
    }

    const validation = validateQueryChartConfig(chart.chartType, chart.config, analysis);

    if (!validation.valid) {
      return;
    }

    const buildOption = getOptionBuilder(chart.chartType);

    if (!buildOption) {
      return;
    }

    const chartId = String(chart.id);
    const existingInstance = chartInstances.get(chartId);
    const existingHost = chartHosts.get(chartId);

    if (existingInstance && existingHost === host) {
      existingInstance.resize();
      return;
    }

    if (existingInstance) {
      disposeChart(chartId);
    }

    const instance = echartsRuntime.init(host);

    instance.setOption(buildOption(chart, result.rows ?? [], analysis), true);
    chartInstances.set(chartId, instance);
    chartHosts.set(chartId, host);

    const resizeObserver = new ResizeObserver(() => {
      instance.resize();
    });

    resizeObserver.observe(host);
    resizeObservers.set(chartId, resizeObserver);
  });
}

export function exportQueryChartAsPng(chartId) {
  const instance = chartInstances.get(String(chartId));

  if (!instance) {
    return false;
  }

  const link = document.createElement("a");
  const chartNode = document.querySelector(
    `[data-query-chart-id="${CSS.escape(String(chartId))}"]`
  );
  const fileName = chartNode?.dataset.chartExportName ?? `chart-${chartId}`;

  link.href = instance.getDataURL({
    type: "png",
    pixelRatio: 2,
    backgroundColor: "#131313",
  });
  link.download = `${fileName}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}
