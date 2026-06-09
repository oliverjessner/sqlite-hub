import { escapeHtml } from '../utils/format.js';

export function renderPageHeader({ eyebrow = '', title, subtitle = '', actions = '' }) {
    return `
    <div class="mb-10 flex flex-wrap items-end justify-between gap-6">
      <div>
        ${
            eyebrow
                ? `
              <div class="page-eyebrow">
                <span class="text-[#FCE300] text-xs font-mono font-bold tracking-widest uppercase">${escapeHtml(
                    eyebrow,
                )}</span>
                <div class="page-eyebrow-line"></div>
              </div>
            `
                : ''
        }
        <h1 class="text-5xl font-headline font-bold text-[#FCE300] tracking-tighter uppercase">${escapeHtml(title)}</h1>
        ${
            subtitle
                ? `<p class="text-xs font-mono text-on-surface/40 mt-1 uppercase tracking-widest">${escapeHtml(
                      subtitle,
                  )}</p>`
                : ''
        }
      </div>
      ${actions ? `<div class="flex gap-3">${actions}</div>` : ''}
    </div>
  `;
}
