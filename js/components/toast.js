import { escapeHtml } from "../utils/format.js";

export function renderToasts(toasts = []) {
  if (!toasts.length) {
    return "";
  }

  return `
    <div class="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-3">
      ${toasts
        .map(
          (toast) => `
            <div
              class="pointer-events-auto border border-outline-variant/20 bg-surface-container px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)] ${
                toast.tone === "success"
                  ? "border-primary-container/30"
                  : toast.tone === "alert"
                    ? "border-error/30"
                    : ""
              }"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="text-sm text-on-surface">${escapeHtml(toast.message)}</div>
                <button
                  class="text-on-surface-variant hover:text-primary-container"
                  data-action="dismiss-toast"
                  data-toast-id="${escapeHtml(toast.id)}"
                  type="button"
                >
                  <span class="material-symbols-outlined text-base">close</span>
                </button>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}
