const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let tableAdvisorViewModulePromise = null;

function loadTableAdvisorViewModule() {
  if (!tableAdvisorViewModulePromise) {
    tableAdvisorViewModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/views/tableAdvisor.js")).href
    );
  }

  return tableAdvisorViewModulePromise;
}

test("table advisor view renders table list, score, grouped issues, and copy SQL", async () => {
  const { renderTableAdvisorView } = await loadTableAdvisorViewModule();
  const rendered = renderTableAdvisorView({
    tableAdvisor: {
      tables: [
        { name: "users", columnCount: 3 },
        { name: "posts", columnCount: 5 },
      ],
      selectedTableName: "users",
      loading: false,
      analysisLoading: false,
      error: null,
      analysisError: null,
      result: {
        tableName: "users",
        score: 84,
        issueCount: 1,
        rowCount: 12,
        analyzedAt: "2026-06-28T10:00:00.000Z",
        issues: [
          {
            id: "constraints:email:missing-unique-index",
            severity: "warning",
            category: "constraints",
            title: "email looks unique but is not enforced",
            explanation: "No unique index exists.",
            evidence: "12 distinct values across 12 rows.",
            recommendation: "Add a UNIQUE index after review.",
            sql: 'CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email_unique" ON "users"("email");',
            risk: "medium",
          },
        ],
      },
    },
  });

  assert.match(rendered.main, /Table Advisor/);
  assert.match(rendered.main, /href="#\/table-advisor\/users"/);
  assert.match(rendered.main, /href="#\/table-advisor\/posts"/);
  assert.match(rendered.main, /Score/);
  assert.match(rendered.main, />84<\/div>/);
  assert.match(rendered.main, /Constraints/);
  assert.match(rendered.main, /email looks unique but is not enforced/);
  assert.match(rendered.main, /data-action="copy-table-advisor-sql"/);
  assert.match(rendered.main, /idx_users_email_unique/);
});
