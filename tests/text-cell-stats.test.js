const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let textCellStatsModulePromise = null;

function loadTextCellStatsModule() {
  if (!textCellStatsModulePromise) {
    const source = readFileSync(
      path.resolve(__dirname, "../frontend/js/utils/textCellStats.js"),
      "utf8"
    );
    const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

    textCellStatsModulePromise = import(url);
  }

  return textCellStatsModulePromise;
}

test("text cell character count only returns counts for non-empty strings", async () => {
  const { getTextCellCharacterCount } = await loadTextCellStatsModule();

  assert.equal(getTextCellCharacterCount(""), null);
  assert.equal(getTextCellCharacterCount(null), null);
  assert.equal(getTextCellCharacterCount(123), null);
  assert.equal(getTextCellCharacterCount("hello"), 5);
  assert.equal(getTextCellCharacterCount("a\nb"), 3);
});

test("text cell character count label is readable", async () => {
  const { formatTextCellCharacterCount } = await loadTextCellStatsModule();

  assert.equal(formatTextCellCharacterCount(1), "1 char");
  assert.equal(formatTextCellCharacterCount(25), "25 chars");
  assert.equal(formatTextCellCharacterCount(1200), "1,200 chars");
});
