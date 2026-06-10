const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let markdownModulePromise = null;

function loadMarkdownModule() {
  if (!markdownModulePromise) {
    markdownModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/utils/markdownDocuments.js")).href
    );
  }

  return markdownModulePromise;
}

test("markdown preview renders clickable todo checkboxes with source line indexes", async () => {
  const { renderMarkdownPreview } = await loadMarkdownModule();
  const html = renderMarkdownPreview(["# Tasks", "- [ ] item1", "- [x] item2", "```", "- [ ] code", "```"].join("\n"));

  assert.match(html, /document-markdown-task-list/);
  assert.match(html, /data-action="toggle-document-todo"/);
  assert.match(html, /data-line-index="1"/);
  assert.match(html, /data-line-index="2"/);
  assert.doesNotMatch(html, /data-line-index="4"/);
});

test("markdown todo toggle updates only real task lines", async () => {
  const { toggleMarkdownTodoLine } = await loadMarkdownModule();
  const markdown = ["- [ ] item1", "```", "- [ ] code", "```", "- [x] item2"].join("\n");

  assert.equal(toggleMarkdownTodoLine(markdown, 0).split("\n")[0], "- [x] item1");
  assert.equal(toggleMarkdownTodoLine(markdown, 2), markdown);
  assert.equal(toggleMarkdownTodoLine(markdown, 4).split("\n")[4], "- [ ] item2");
});

test("markdown preview fallback renders unordered and ordered lists", async () => {
  const { renderMarkdownPreview } = await loadMarkdownModule();
  const previousMarked = globalThis.marked;

  globalThis.marked = undefined;

  try {
    const html = renderMarkdownPreview(["- alpha", "- beta", "", "1. first", "2. second"].join("\n"));

    assert.match(html, /<ul><li>alpha<\/li><li>beta<\/li><\/ul>/);
    assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  } finally {
    globalThis.marked = previousMarked;
  }
});

test("markdown preview escapes raw html content", async () => {
  const { renderMarkdownPreview } = await loadMarkdownModule();
  const html = renderMarkdownPreview('<img src=x onerror="alert(1)">\n- [ ] <script>alert(1)</script>');

  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;script&gt;/);
});

test("markdown preview strips executable link targets from rendered markdown", async () => {
  const { renderMarkdownPreview } = await loadMarkdownModule();
  const previousMarked = globalThis.marked;

  globalThis.marked = {
    parse: () => '<p><a href="javascript:alert(1)">unsafe</a></p>',
  };

  try {
    const html = renderMarkdownPreview("[unsafe](javascript:alert(1))");

    assert.doesNotMatch(html, /href="javascript:/i);
    assert.match(html, /href="#"/);
  } finally {
    globalThis.marked = previousMarked;
  }
});
