const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let inputClearModulePromise = null;

function loadInputClearModule() {
  if (!inputClearModulePromise) {
    inputClearModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/utils/inputClear.js")).href
    );
  }

  return inputClearModulePromise;
}

test("escape clear helper clears text-like inputs and dispatches input event", async () => {
  const { clearInputForEscape } = await loadInputClearModule();
  const dispatched = [];
  const input = {
    disabled: false,
    readOnly: false,
    type: "search",
    value: "companies",
    dispatchEvent(event) {
      dispatched.push(event);
    },
  };

  const cleared = clearInputForEscape(input, () => ({ type: "input", bubbles: true }));

  assert.equal(cleared, true);
  assert.equal(input.value, "");
  assert.deepEqual(dispatched, [{ type: "input", bubbles: true }]);
});

test("escape clear helper ignores empty, readonly, and non-text inputs", async () => {
  const { clearInputForEscape, isEscapeClearableInput } = await loadInputClearModule();

  assert.equal(clearInputForEscape({ type: "text", value: "" }), false);
  assert.equal(isEscapeClearableInput({ type: "checkbox", value: "on" }), false);
  assert.equal(isEscapeClearableInput({ type: "text", value: "locked", readOnly: true }), false);
  assert.equal(isEscapeClearableInput({ type: "text", value: "disabled", disabled: true }), false);
});
