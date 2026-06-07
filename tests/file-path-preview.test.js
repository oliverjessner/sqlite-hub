const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let filePathPreviewModulePromise = null;

function loadFilePathPreviewModule() {
  if (!filePathPreviewModulePromise) {
    const timestampPreviewSource = readFileSync(
      path.resolve(__dirname, "../frontend/js/utils/timestampPreview.js"),
      "utf8"
    );
    const timestampPreviewUrl = `data:text/javascript;base64,${Buffer.from(timestampPreviewSource).toString("base64")}`;
    const filePathPreviewSource = readFileSync(
      path.resolve(__dirname, "../frontend/js/utils/filePathPreview.js"),
      "utf8"
    ).replace(
      'import { isProtectedKeyColumn } from "./timestampPreview.js";',
      `import { isProtectedKeyColumn } from "${timestampPreviewUrl}";`
    );
    const filePathPreviewUrl = `data:text/javascript;base64,${Buffer.from(filePathPreviewSource).toString("base64")}`;

    filePathPreviewModulePromise = import(filePathPreviewUrl);
  }

  return filePathPreviewModulePromise;
}

function createTableMeta() {
  return {
    columns: [
      { name: "id", primaryKeyPosition: 1 },
      { name: "parent_id", primaryKeyPosition: 0 },
      { name: "file_path", primaryKeyPosition: 0 },
      { name: "filename", primaryKeyPosition: 0 },
      { name: "note", primaryKeyPosition: 0 },
    ],
    foreignKeys: [
      {
        mappings: [{ from: "parent_id", to: "id" }],
      },
    ],
  };
}

test("filepath preview detects supported path styles", async () => {
  const { detectFilePathValue } = await loadFilePathPreviewModule();
  const tableMeta = createTableMeta();
  const cases = [
    {
      value: "/Users/oli/project/file.txt",
      pathType: "unix",
      fileName: "file.txt",
      directory: "/Users/oli/project",
      extension: "txt",
    },
    {
      value: "/home/oli/data/app.sqlite",
      pathType: "unix",
      fileName: "app.sqlite",
      directory: "/home/oli/data",
      extension: "sqlite",
    },
    {
      value: "C:\\Users\\Oliver\\Desktop\\file.pdf",
      pathType: "windows",
      fileName: "file.pdf",
      directory: "C:\\Users\\Oliver\\Desktop",
      extension: "pdf",
    },
    {
      value: "./data/export.csv",
      pathType: "relative",
      fileName: "export.csv",
      directory: "./data",
      extension: "csv",
    },
    {
      value: "../logs/app.log",
      pathType: "relative",
      fileName: "app.log",
      directory: "../logs",
      extension: "log",
    },
    {
      value: "~/Documents/report.md",
      pathType: "home",
      fileName: "report.md",
      directory: "~/Documents",
      extension: "md",
    },
    {
      value: "data/images/avatar.png",
      pathType: "relative",
      fileName: "avatar.png",
      directory: "data/images",
      extension: "png",
    },
  ];

  for (const item of cases) {
    const preview = detectFilePathValue(item.value, "file_path", tableMeta);

    assert.equal(preview?.type, "filepath");
    assert.equal(preview.pathType, item.pathType);
    assert.equal(preview.fileName, item.fileName);
    assert.equal(preview.directory, item.directory);
    assert.equal(preview.extension, item.extension);
    assert.ok(preview.confidence >= 0.7);
  }
});

test("filepath preview does not detect URLs, primitive text, JSON, emails, or weak filenames", async () => {
  const { detectFilePathValue } = await loadFilePathPreviewModule();
  const tableMeta = createTableMeta();
  const rejectedValues = [
    "https://example.com/file.txt",
    "http://localhost:3000/test",
    "mailto:oliver@example.com",
    "tel:+431234567",
    "ftp://example.com/file.txt",
    "oliver@example.com",
    "1717682400",
    "true",
    "false",
    '{"path":"/tmp/file.txt"}',
    "hello world",
    "file",
    "invoice.pdf",
  ];

  for (const value of rejectedValues) {
    assert.equal(detectFilePathValue(value, "note", tableMeta), null);
  }
});

test("filepath preview protects primary keys and foreign keys", async () => {
  const { detectFilePathValue } = await loadFilePathPreviewModule();
  const tableMeta = createTableMeta();

  assert.equal(detectFilePathValue("/Users/oli/project/file.txt", "id", tableMeta), null);
  assert.equal(detectFilePathValue("/Users/oli/project/file.txt", "parent_id", tableMeta), null);
});

test("filepath preview allows bare filenames only for strong file columns", async () => {
  const { detectFilePathValue } = await loadFilePathPreviewModule();
  const tableMeta = createTableMeta();

  assert.equal(detectFilePathValue("invoice.pdf", "note", tableMeta), null);

  const preview = detectFilePathValue("invoice.pdf", "filename", tableMeta);

  assert.equal(preview?.pathType, "relative");
  assert.equal(preview.fileName, "invoice.pdf");
  assert.equal(preview.directory, null);
  assert.equal(preview.extension, "pdf");
});

test("filepath preview compacts long paths while preserving filename", async () => {
  const { compactPathForDisplay } = await loadFilePathPreviewModule();
  const display = compactPathForDisplay("/Users/oli/projects/sqlite-hub/data/app.sqlite", 24);

  assert.equal(display, ".../data/app.sqlite");
});
