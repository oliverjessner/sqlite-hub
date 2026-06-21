import { escapeHtml } from "../utils/format.js";

export function renderMetricCard({
  label,
  value,
  subtext = "",
  accent = false,
  progress = "",
}) {
  return `
    <div class="metric-card ${accent ? "metric-card--accent" : ""}">
      <span class="text-[10px] font-mono text-on-surface/40 uppercase">${escapeHtml(label)}</span>
      <span class="text-3xl font-body font-bold text-on-surface">${escapeHtml(value)}</span>
      ${
        progress
          ? `
            <div class="w-full bg-surface-container-highest h-1 mt-2">
              <div class="bg-primary-container h-full" style="width: ${escapeHtml(progress)}"></div>
            </div>
          `
          : ""
      }
      ${
        subtext
          ? `<span class="text-[10px] ${accent ? "text-primary-container" : "text-on-surface/40"}">${escapeHtml(
              subtext
            )}</span>`
          : ""
      }
    </div>
  `;
}
