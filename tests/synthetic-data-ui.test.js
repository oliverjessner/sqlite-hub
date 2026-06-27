const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let syntheticDataModulePromise = null;

function loadSyntheticDataModule() {
  if (!syntheticDataModulePromise) {
    syntheticDataModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/utils/syntheticData.js")).href
    );
  }

  return syntheticDataModulePromise;
}

test("synthetic data mappings prefer existing values for single-column foreign keys", async () => {
  const { buildSyntheticDataMappings, getSyntheticGeneratorLabel } = await loadSyntheticDataModule();
  const mappings = buildSyntheticDataMappings(
    [
      {
        name: "user_id",
        visible: true,
        declaredType: "INTEGER",
        affinity: "INTEGER",
        notNull: true,
      },
    ],
    [
      {
        referencedTable: "users",
        mappings: [{ from: "user_id", to: "id" }],
      },
    ]
  );

  assert.equal(mappings[0].generator, "existingForeignKey");
  assert.equal(mappings[0].note, "Existing users.id");
  assert.equal(getSyntheticGeneratorLabel("existingForeignKey"), "Existing FK");
});

test("synthetic data mappings use integer check ranges as random integer defaults", async () => {
  const { buildSyntheticDataMappings } = await loadSyntheticDataModule();
  const mappings = buildSyntheticDataMappings([
    {
      name: "score",
      visible: true,
      declaredType: "INTEGER",
      affinity: "INTEGER",
      notNull: true,
      integerRange: { min: 5, max: 7 },
    },
  ]);

  assert.equal(mappings[0].generator, "randomInteger");
  assert.deepEqual(mappings[0].options, { min: 5, max: 7 });
});

test("synthetic data mappings treat numeric 0/1 checks as boolean defaults", async () => {
  const { buildSyntheticDataMappings } = await loadSyntheticDataModule();
  const mappings = buildSyntheticDataMappings([
    {
      name: "boolean_value",
      visible: true,
      declaredType: "INTEGER",
      affinity: "INTEGER",
      notNull: true,
      allowedValues: [0, 1],
    },
  ]);

  assert.equal(mappings[0].generator, "boolean");
  assert.deepEqual(mappings[0].options, { trueProbability: 50 });
});

test("synthetic data mappings do not randomize composite foreign key columns", async () => {
  const { buildSyntheticDataMappings } = await loadSyntheticDataModule();
  const mappings = buildSyntheticDataMappings(
    [
      {
        name: "tenant_id",
        visible: true,
        declaredType: "INTEGER",
        affinity: "INTEGER",
        notNull: true,
      },
      {
        name: "user_id",
        visible: true,
        declaredType: "INTEGER",
        affinity: "INTEGER",
        notNull: true,
      },
    ],
    [
      {
        referencedTable: "users",
        mappings: [
          { from: "tenant_id", to: "tenant_id" },
          { from: "user_id", to: "id" },
        ],
      },
    ]
  );

  assert.deepEqual(
    mappings.map((mapping) => [mapping.columnName, mapping.generator, mapping.note]),
    [
      ["tenant_id", "skip", "Composite FK unsupported"],
      ["user_id", "skip", "Composite FK unsupported"],
    ]
  );
});
