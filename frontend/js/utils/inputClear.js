const ESCAPE_CLEARABLE_INPUT_TYPES = new Set([
    '',
    'email',
    'number',
    'password',
    'search',
    'tel',
    'text',
    'url',
]);

export function isEscapeClearableInput(input) {
    const type = String(input?.type ?? 'text').trim().toLowerCase();

    return (
        Boolean(input) &&
        typeof input.value === 'string' &&
        !input.disabled &&
        !input.readOnly &&
        ESCAPE_CLEARABLE_INPUT_TYPES.has(type)
    );
}

export function clearInputForEscape(input, createInputEvent = () => new Event('input', { bubbles: true })) {
    if (!isEscapeClearableInput(input) || input.value === '') {
        return false;
    }

    input.value = '';

    if (typeof input.dispatchEvent === 'function') {
        input.dispatchEvent(createInputEvent());
    }

    return true;
}
