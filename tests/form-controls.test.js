const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

let formControlsModulePromise = null;

function loadFormControlsModule() {
    if (!formControlsModulePromise) {
        formControlsModulePromise = import(
            pathToFileURL(path.resolve(__dirname, '../frontend/js/components/formControls.js')).href
        );
    }

    return formControlsModulePromise;
}

test('standard text input uses the shared application styling', async () => {
    const { renderTextInput } = await loadFormControlsModule();
    const markup = renderTextInput({
        className: 'flex-1',
        dataAttributes: { tokenName: true },
        maxlength: 80,
        placeholder: 'Token name',
    });

    assert.match(markup, /control-input/);
    assert.match(markup, /border-outline-variant\/20/);
    assert.match(markup, /bg-surface-container-lowest/);
    assert.match(markup, /placeholder:text-on-surface-variant\/35/);
    assert.match(markup, /focus:border-primary-container/);
    assert.match(markup, /data-token-name/);
    assert.match(markup, /maxlength="80"/);
});
