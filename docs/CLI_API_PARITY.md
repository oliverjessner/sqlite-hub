# CLI / External API Parity

This document compares the public CLI (`sqlite-hub ...`) with the versioned external API (`/api/v1`). It does not treat the internal browser routes under `/api/*` as stable automation surfaces.

## Capability Matrix

| Capability | CLI | `/api/v1` | Parity | Notes |
| --- | --- | --- | --- | --- |
| App info | `sqlite-hub info` | `GET /api/v1/info` | Full | Both return app/runtime/version status. |
| Start/open app | `sqlite-hub serve [--port PORT] [--open]` | No | CLI only | API assumes the server is already running. |
| List known databases | `sqlite-hub db list [--json]` | No | CLI only | API tokens authorize one specific database. |
| Database detail | `sqlite-hub db info DATABASE [--json]` | `GET /databases/:databaseId` | Full | Both expose the registered database metadata. |
| List tables | `sqlite-hub table list --db DATABASE [--json]` | `GET /databases/:databaseId/tables` | Full | Both use the shared database service. |
| Inspect table | `sqlite-hub table info TABLE --db DATABASE [--json]` | `GET /databases/:databaseId/tables/:tableName` | Full | Both expose columns, keys, indexes, counts, and row identity. |
| Get one row | `sqlite-hub row get TABLE KEY --db DATABASE` | `POST /databases/:databaseId/tables/:tableName/row` | Full | Both reuse Row Editor shaping; composite keys are supported. |
| Raw SQL execution | `sqlite-hub query run SQL --db DATABASE [--json]` | `POST /api/v1/query` | Full | Both execute through SQL Editor and record Query History. |
| Run and save raw SQL | `sqlite-hub query run SQL --db DATABASE --save NAME` | `POST /api/v1/query` with `store` or `name` | Full | Both name and save the history entry. |
| Create stored query | `sqlite-hub query save SQL --db DATABASE --name NAME` | `POST /databases/:databaseId/queries` | Full | Both create or update a saved definition without executing it. |
| List saved queries | `sqlite-hub query list --db DATABASE [--json]` | `GET /databases/:databaseId/queries` | Full | Saved-query collection only. |
| Get saved query | `sqlite-hub query show QUERY --db DATABASE [--json]` | `GET /databases/:databaseId/queries/:queryName` | Full | Both return SQL and query metadata, including notes. |
| Get query notes only | Included in `query show` | `GET /databases/:databaseId/queries/:queryName/notes` | API only | The CLI intentionally has no notes-only action. |
| Execute saved query | `sqlite-hub query exec QUERY --db DATABASE [--json]` | `POST /databases/:databaseId/queries/:queryName/execute` | Full | Both return result metadata and rows. |
| Export saved query | `sqlite-hub query export QUERY --db DATABASE --format FORMAT` | `GET /databases/:databaseId/queries/:queryName/export?format=...` | Partial | Same formats; CLI writes a file while API returns content in JSON. |
| List documents | `sqlite-hub doc list --db DATABASE [--json]` | `GET /databases/:databaseId/documents` | Full | Read-only document listing. |
| Read document | `sqlite-hub doc show DOCUMENT --db DATABASE [--json]` | `GET /databases/:databaseId/documents/:documentName` | Full | Both use the shared document lookup. |
| Export document | `sqlite-hub doc export DOCUMENT --db DATABASE [--output FILE]` | `GET /databases/:databaseId/documents/:documentName/export` | Partial | CLI writes Markdown to disk; API returns content and filename. |
| Generate schema types | `sqlite-hub types generate TABLE --db DATABASE --lang LANGUAGE` | `POST /databases/:databaseId/tables/:tableName/types` | Partial | Same generator; CLI supports stdout/file output and aliases, API returns JSON. |
| List backups | `sqlite-hub backup list --db DATABASE [--json]` | `GET /databases/:databaseId/backups` | Full | Both return managed backups for one database. |
| Create backup | `sqlite-hub backup create --db DATABASE [--name NAME]` | `POST /databases/:databaseId/backups` | Full | Both create and verify through the same service. |

## Stable Surface Gaps

These UI features currently have no public CLI or `/api/v1` equivalent:

- Backups: verify, compare, restore, download, edit notes, delete, usage summary.
- Table Advisor: run deterministic table analysis and copy SQL recommendations.
- Synthetic Data: preview and insert generated rows.
- Table Designer: create/edit tables, CSV-seed drafts, apply SQL preview.
- Charts: create, edit, delete, resize, and export PNG.
- Logs: filtered access/query history inspection.
- Settings/API tokens: create, delete, inspect token usage.
- Connections: open/create databases, edit labels/paths/icons/read-only mode, remove registry entries.
- MCP note: `add_database` can now register an existing SQLite file or create a new empty database, but this remains unavailable through the public CLI and `/api/v1`.
- Documents mutation: create, edit, autosave, import, delete, insert saved-query tables/notes.
- Row editing and table data mutation through the Data Browser.
- Media Tagging setup and queue actions.
- Overview Finder action.

## Recommended Parity Order

1. **Table Advisor**: read-only, deterministic, low risk, useful for automation.
2. **Backups**: list and create are exposed; verify, restore, and download should follow.
3. **Logs**: read-only observability with filters.
4. **Synthetic Data**: useful for test automation; needs clear write safeguards.
5. **Table Designer**: powerful but schema-mutating, so it needs dry-run/preview-first API design.
6. **Charts**: lower priority for CLI, useful as API metadata/export later.

## Design Notes

- Keep `/api/v1` token-scoped by database.
- Keep write operations explicit and reject read-only databases consistently.
- Prefer JSON responses for API and file/stdout behavior for CLI.
- Reuse existing services where possible so UI, CLI, and API stay behaviorally aligned.
