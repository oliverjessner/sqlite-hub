import { escapeHtml } from './format.js';

const FENCED_CODE_PATTERN = /^\s*(```|~~~)/;
const TASK_LINE_PATTERN = /^(\s*)([-*+])\s+\[([ xX])\]\s+(.*?)(\r?)$/;

function decodeBasicHtmlEntities(value = '') {
    return String(value)
        .replace(/&colon;/gi, ':')
        .replace(/&#58;/g, ':')
        .replace(/&#x3a;/gi, ':')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}

function sanitizeRenderedMarkdown(html = '') {
    return String(html).replace(/\s(href|src)=("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (match, attribute, raw, doubleQuoted, singleQuoted, bare) => {
        const value = doubleQuoted ?? singleQuoted ?? bare ?? '';
        const decodedValue = decodeBasicHtmlEntities(value).trim();

        if (/^(javascript|data|vbscript):/i.test(decodedValue)) {
            return ` ${attribute}="#"`;
        }

        return match;
    });
}

function renderFallbackMarkdown(markdown = '') {
    const lines = String(markdown).split(/\r?\n/);
    const html = [];
    let listItems = [];

    const flushList = () => {
        if (!listItems.length) {
            return;
        }

        html.push(`<ul>${listItems.map(item => `<li>${item}</li>`).join('')}</ul>`);
        listItems = [];
    };

    for (const line of lines) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);

        if (headingMatch) {
            flushList();
            const level = Math.min(6, headingMatch[1].length);
            html.push(`<h${level}>${escapeHtml(headingMatch[2])}</h${level}>`);
            continue;
        }

        if (unorderedMatch) {
            listItems.push(escapeHtml(unorderedMatch[1]));
            continue;
        }

        flushList();

        if (line.trim()) {
            html.push(`<p>${escapeHtml(line)}</p>`);
        }
    }

    flushList();
    return html.join('\n');
}

function renderMarkdownBlock(markdown = '') {
    const source = escapeHtml(markdown);
    const markedRuntime = globalThis.marked;
    const parser = typeof markedRuntime?.parse === 'function' ? markedRuntime.parse.bind(markedRuntime) : null;

    if (!parser) {
        return renderFallbackMarkdown(markdown);
    }

    return sanitizeRenderedMarkdown(
        parser(source, {
            async: false,
            breaks: false,
            gfm: true,
        }),
    );
}

function renderMarkdownInline(markdown = '') {
    const source = escapeHtml(markdown);
    const markedRuntime = globalThis.marked;
    const parser =
        typeof markedRuntime?.parseInline === 'function' ? markedRuntime.parseInline.bind(markedRuntime) : null;

    if (!parser) {
        return source;
    }

    return sanitizeRenderedMarkdown(
        parser(source, {
            async: false,
            breaks: false,
            gfm: true,
        }),
    );
}

function renderTaskList(items = []) {
    if (!items.length) {
        return '';
    }

    return `
      <ul class="document-markdown-task-list">
        ${items
            .map(item => {
                const checked = item.checked;

                return `
                  <li class="document-markdown-task-item ${checked ? 'is-checked' : ''}">
                    <label class="document-markdown-task-label">
                      <input
                        ${checked ? 'checked' : ''}
                        class="document-markdown-task-checkbox"
                        data-action="toggle-document-todo"
                        data-line-index="${escapeHtml(String(item.lineIndex))}"
                        type="checkbox"
                      />
                      <span class="document-markdown-task-text">${renderMarkdownInline(item.text)}</span>
                    </label>
                  </li>
                `;
            })
            .join('')}
      </ul>
    `;
}

export function renderMarkdownPreview(markdown = '') {
    const lines = String(markdown ?? '').split('\n');
    const blocks = [];
    let markdownLines = [];
    let taskItems = [];
    let inFence = false;

    const flushMarkdown = () => {
        if (!markdownLines.length) {
            return;
        }

        blocks.push(renderMarkdownBlock(markdownLines.join('\n')));
        markdownLines = [];
    };

    const flushTasks = () => {
        if (!taskItems.length) {
            return;
        }

        blocks.push(renderTaskList(taskItems));
        taskItems = [];
    };

    lines.forEach((line, lineIndex) => {
        const fenceLine = FENCED_CODE_PATTERN.test(line);

        if (fenceLine) {
            flushTasks();
            markdownLines.push(line);
            inFence = !inFence;
            return;
        }

        if (!inFence) {
            const taskMatch = line.match(TASK_LINE_PATTERN);

            if (taskMatch) {
                flushMarkdown();
                taskItems.push({
                    checked: taskMatch[3].toLowerCase() === 'x',
                    lineIndex,
                    text: taskMatch[4],
                });
                return;
            }
        }

        flushTasks();
        markdownLines.push(line);
    });

    flushTasks();
    flushMarkdown();

    return blocks.join('\n').trim() || '<p class="document-markdown-empty">Empty document</p>';
}

function isLineInsideFencedCode(lines, lineIndex) {
    let inFence = false;

    for (let index = 0; index < lineIndex; index += 1) {
        if (FENCED_CODE_PATTERN.test(lines[index] ?? '')) {
            inFence = !inFence;
        }
    }

    return inFence;
}

export function toggleMarkdownTodoLine(markdown = '', lineIndex) {
    const lines = String(markdown ?? '').split('\n');
    const numericLineIndex = Number(lineIndex);

    if (!Number.isInteger(numericLineIndex) || numericLineIndex < 0 || numericLineIndex >= lines.length) {
        return String(markdown ?? '');
    }

    if (isLineInsideFencedCode(lines, numericLineIndex)) {
        return String(markdown ?? '');
    }

    const line = lines[numericLineIndex];
    const match = line.match(TASK_LINE_PATTERN);

    if (!match) {
        return String(markdown ?? '');
    }

    const nextMarker = match[3].toLowerCase() === 'x' ? ' ' : 'x';
    lines[numericLineIndex] = `${match[1]}${match[2]} [${nextMarker}] ${match[4]}${match[5]}`;

    return lines.join('\n');
}
