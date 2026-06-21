const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const CHARTS_HEIGHT_STORAGE_KEY = "sqlite_hub_charts_height_preset";

function createMockStorage(initialValues = {}) {
  const entries = new Map(Object.entries(initialValues));

  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
  };
}

async function importStoreWithMockStorage(storage) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });

  const moduleUrl = pathToFileURL(path.resolve(__dirname, "../frontend/js/store.js")).href;
  const store = await import(`${moduleUrl}?charts-height=${Date.now()}`);

  return {
    restore() {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "localStorage", originalDescriptor);
      } else {
        delete globalThis.localStorage;
      }
    },
    store,
  };
}

test("charts height preset is read from and written to localStorage", async () => {
  const storage = createMockStorage({
    [CHARTS_HEIGHT_STORAGE_KEY]: "large",
  });
  const { restore, store } = await importStoreWithMockStorage(storage);

  try {
    assert.equal(store.getState().charts.chartHeightPreset, "large");

    store.setChartsHeightPreset("small");

    assert.equal(store.getState().charts.chartHeightPreset, "small");
    assert.equal(storage.getItem(CHARTS_HEIGHT_STORAGE_KEY), "small");
  } finally {
    restore();
  }
});
