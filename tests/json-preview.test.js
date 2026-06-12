const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let jsonPreviewModulePromise = null;

function loadJsonPreviewModule() {
  if (!jsonPreviewModulePromise) {
    const source = readFileSync(
      path.resolve(__dirname, "../frontend/js/utils/jsonPreview.js"),
      "utf8"
    );
    const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

    jsonPreviewModulePromise = import(url);
  }

  return jsonPreviewModulePromise;
}

test("JSON preview formats objects and arrays with line breaks and indentation", async () => {
  const { formatJsonPreview } = await loadJsonPreviewModule();

  assert.equal(
    formatJsonPreview('{"event":"created","metadata":{"source":"api"}}'),
    [
      "{",
      '  "event": "created",',
      '  "metadata": {',
      '    "source": "api"',
      "  }",
      "}",
    ].join("\n")
  );
  assert.equal(
    formatJsonPreview([1, { active: true }]),
    ["[", "  1,", "  {", '    "active": true', "  }", "]"].join("\n")
  );
});

test("JSON preview ignores invalid JSON and scalar values", async () => {
  const { formatJsonPreview } = await loadJsonPreviewModule();

  assert.equal(formatJsonPreview("plain text"), null);
  assert.equal(formatJsonPreview("{invalid"), null);
  assert.equal(formatJsonPreview("42"), null);
  assert.equal(formatJsonPreview(null), null);
});
