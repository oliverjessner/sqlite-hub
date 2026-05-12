export function renderActionBar({ left = "", right = "", className = "" }) {
  return `
    <div class="flex items-center justify-between gap-4 ${className}">
      <div class="flex items-center gap-4">${left}</div>
      <div class="flex items-center gap-3">${right}</div>
    </div>
  `;
}
