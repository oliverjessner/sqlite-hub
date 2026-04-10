import { escapeHtml } from "../utils/format.js";

export function renderBottomTabs(activeTab, counts = {}) {
  const tabs = [
    { key: "results", label: "results", meta: counts.resultRows ?? 0 },
    { key: "messages", label: "messages", meta: counts.messages ?? 0 },
    { key: "performance", label: "performance", meta: counts.statementCount ?? 0 },
  ];

  return `
    <div class="flex items-center justify-between border-b border-outline-variant/5 bg-surface-container-low/50 px-4 h-10">
      <div class="flex items-center gap-6">
        ${tabs
          .map(
            (tab) => `
              <button
                class="bottom-tab ${activeTab === tab.key ? "is-active" : ""}"
                data-action="set-editor-tab"
                data-tab="${tab.key}"
                type="button"
              >
                ${tab.label}
                <span class="ml-2 text-[9px] opacity-50">${escapeHtml(String(tab.meta))}</span>
              </button>
            `
          )
          .join("")}
      </div>
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-xs text-on-surface-variant/30">database</span>
        <span class="text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant/45">
          sqlite
        </span>
      </div>
    </div>
  `;
}
