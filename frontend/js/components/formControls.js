import { escapeHtml } from '../utils/format.js';

export const STANDARD_TEXT_INPUT_CLASS =
    'control-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/35 focus:border-primary-container';

export function renderTextInput({
    className = '',
    dataAttributes = {},
    disabled = false,
    maxlength = null,
    name = '',
    placeholder = '',
    readonly = false,
    spellcheck = null,
    type = 'text',
    value = '',
} = {}) {
    const attributes = [
        `class="${escapeHtml([STANDARD_TEXT_INPUT_CLASS, className].filter(Boolean).join(' '))}"`,
        name ? `name="${escapeHtml(name)}"` : '',
        placeholder ? `placeholder="${escapeHtml(placeholder)}"` : '',
        `type="${escapeHtml(type)}"`,
        `value="${escapeHtml(value)}"`,
        Number.isInteger(maxlength) ? `maxlength="${maxlength}"` : '',
        disabled ? 'disabled' : '',
        readonly ? 'readonly' : '',
        typeof spellcheck === 'boolean' ? `spellcheck="${spellcheck}"` : '',
        ...Object.entries(dataAttributes).map(([name, attributeValue]) => {
            const attributeName = `data-${String(name).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;

            return attributeValue === true
                ? attributeName
                : `${attributeName}="${escapeHtml(attributeValue)}"`;
        }),
    ].filter(Boolean);

    return `<input ${attributes.join(' ')} />`;
}
