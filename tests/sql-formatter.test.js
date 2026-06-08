const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let sqlFormatterModulePromise = null;

function loadSqlFormatterModule() {
  if (!sqlFormatterModulePromise) {
    const source = readFileSync(
      path.resolve(__dirname, "../frontend/js/utils/sqlFormatter.js"),
      "utf8"
    );
    const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

    sqlFormatterModulePromise = import(url);
  }

  return sqlFormatterModulePromise;
}

test("SQL formatter uppercases keywords and formats common clauses", async () => {
  const { formatSqlQuery } = await loadSqlFormatterModule();

  assert.equal(
    formatSqlQuery("select id,name from users where status='active' and age>=18 order by name desc;"),
    [
      "SELECT id,",
      "  name",
      "",
      "FROM users",
      "",
      "WHERE status = 'active'",
      "  AND age >= 18",
      "",
      "ORDER BY name DESC;",
    ].join("\n")
  );
});

test("SQL formatter keeps string literals and comments untouched", async () => {
  const { formatSqlQuery } = await loadSqlFormatterModule();

  assert.equal(
    formatSqlQuery("-- select from comment\nselect 'from where' as note, name from users"),
    [
      "-- select from comment",
      "SELECT 'from where' AS note,",
      "  name",
      "",
      "FROM users",
    ].join("\n")
  );
});

test("SQL formatter formats joins on separate readable lines", async () => {
  const { formatSqlQuery } = await loadSqlFormatterModule();

  assert.equal(
    formatSqlQuery("select * from users left join posts on posts.user_id=users.id where users.id=1"),
    [
      "SELECT *",
      "",
      "FROM users",
      "",
      "LEFT JOIN posts",
      "  ON posts.user_id = users.id",
      "",
      "WHERE users.id = 1",
    ].join("\n")
  );
});

test("SQL formatter does not break function arguments as select columns", async () => {
  const { formatSqlQuery } = await loadSqlFormatterModule();

  assert.equal(
    formatSqlQuery("select coalesce(first_name,last_name) as display_name, id from users"),
    [
      "SELECT coalesce(first_name, last_name) AS display_name,",
      "  id",
      "",
      "FROM users",
    ].join("\n")
  );
});

test("SQL formatter indents AS parenthesis blocks", async () => {
  const { formatSqlQuery } = await loadSqlFormatterModule();

  assert.equal(
    formatSqlQuery("with recent as(select id,name from users where active=1) select * from recent"),
    [
      "WITH recent AS (",
      "  SELECT id,",
      "    name",
      "",
      "  FROM users",
      "",
      "  WHERE active = 1",
      ")",
      "",
      "SELECT *",
      "",
      "FROM recent",
    ].join("\n")
  );
});

test("SQL formatter does not treat non-parenthesized AS keywords as blocks", async () => {
  const { formatSqlQuery } = await loadSqlFormatterModule();

  assert.equal(
    formatSqlQuery("select cast(value as integer) as value_int from metrics"),
    [
      "SELECT CAST(value AS INTEGER) AS value_int",
      "",
      "FROM metrics",
    ].join("\n")
  );
});

test("SQL formatter expands CASE expressions into readable blocks", async () => {
  const { formatSqlQuery } = await loadSqlFormatterModule();

  assert.equal(
    formatSqlQuery(
      "select upload_date,case when upload_date is null then null else substr(cast(upload_date as text),1,4)||'-'||substr(cast(upload_date as text),5,2)||'-'||substr(cast(upload_date as text),7,2) end as upload_date_readable from white_house_live_streams"
    ),
    [
      "SELECT upload_date,",
      "  CASE",
      "    WHEN upload_date IS NULL THEN NULL",
      "    ELSE",
      "      substr(CAST(upload_date AS TEXT), 1, 4) || '-' ||",
      "      substr(CAST(upload_date AS TEXT), 5, 2) || '-' ||",
      "      substr(CAST(upload_date AS TEXT), 7, 2)",
      "  END AS upload_date_readable",
      "",
      "FROM white_house_live_streams",
    ].join("\n")
  );
});

test("SQL formatter separates window functions and join blocks", async () => {
  const { formatSqlQuery } = await loadSqlFormatterModule();

  assert.equal(
    formatSqlQuery(
      "with winners as(select w.window_label,row_number() over(partition by w.window_label order by w.delta_return desc) as winner_rank from windowed w join mention_impact mi on mi.id=w.mention_impact_id order by w.window_label,winner_rank) select * from winners"
    ),
    [
      "WITH winners AS (",
      "  SELECT w.window_label,",
      "    ROW_NUMBER() OVER (",
      "      PARTITION BY w.window_label",
      "      ORDER BY w.delta_return DESC",
      "    ) AS winner_rank",
      "",
      "  FROM windowed w",
      "",
      "  JOIN mention_impact mi",
      "    ON mi.id = w.mention_impact_id",
      "",
      "  ORDER BY w.window_label, winner_rank",
      ")",
      "",
      "SELECT *",
      "",
      "FROM winners",
    ].join("\n")
  );
});
