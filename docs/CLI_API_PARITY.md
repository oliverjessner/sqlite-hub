# CLI / External API Parity

This document compares the public CLI (`sqlite-hub ...`) with the versioned external API (`/api/v1`). It does not treat the internal browser routes under `/api/*` as stable automation surfaces.

## Capability Matrix

| Capability            | CLI                                                    | `/api/v1`                                                         | Parity   | Notes                                                                                             |
| --------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| App info              | `sqlite-hub --info`                                    | `GET /api/v1/info`                                                | Full     | Both return app/runtime/version status.                                                           |
| Start/open app        | `sqlite-hub`, `--port`, `--open`                       | No                                                                | CLI only | API assumes the server is already running.                                                        |
| List known databases  | `--database`                                           | No                                                                | CLI only | API requires a specific database id and token.                                                    |
| Database detail       | `--database:name --path/--size/--lastopened`           | `GET /databases/:databaseId`                                      | Partial  | API returns structured detail for one authorized database. CLI can discover databases by name/id. |
| List tables           | `--database:name --tables`                             | `GET /databases/:databaseId/tables`                               | Full     | Output format differs: terminal text vs JSON.                                                     |
| Inspect table         | `--database:name --table:name`                         | `GET /databases/:databaseId/tables/:tableName`                    | Full     | Both expose columns, keys, indexes, counts, and identity metadata.                                |
| Raw SQL execution     | `--query:"SQL"`                                        | `POST /api/v1/query`                                              | Full     | Both use SQL Editor execution and write Query History.                                            |
| Save raw query        | `--query:"SQL" --store:"Name"`                         | `POST /api/v1/query` with `store` or `name`                       | Full     | Both title the history item and mark it saved.                                                    |
| List saved queries    | `--queries`                                            | `GET /databases/:databaseId/queries`                              | Full     | Saved query collection only.                                                                      |
| Get saved query SQL   | `--saved-query:"Name"`                                 | `GET /databases/:databaseId/queries/:queryName`                   | Full     | API returns structured query metadata.                                                            |
| Get saved query notes | `--notes:"Name"`                                       | `GET /databases/:databaseId/queries/:queryName/notes`             | Full     | Same saved-query lookup behavior.                                                                 |
| Execute saved query   | `--execute:"Name"`                                     | `POST /databases/:databaseId/queries/:queryName/execute`          | Full     | Both return result metadata and rows.                                                             |
| Export saved query    | `--export:"Name" --format:csv\|tsv\|md\|json`          | `GET /databases/:databaseId/queries/:queryName/export?format=...` | Partial  | Same formats. CLI writes a file; API returns content in JSON.                                     |
| List documents        | `--documents`                                          | `GET /databases/:databaseId/documents`                            | Full     | Read-only document listing.                                                                       |
| Read document         | `--documents:"Name"`                                   | `GET /databases/:databaseId/documents/:documentName`              | Full     | API returns the document object.                                                                  |
| Export document       | `--documents:"Name" --export`                          | `GET /databases/:databaseId/documents/:documentName/export`       | Partial  | CLI writes Markdown to disk; API returns content and filename.                                    |
| Row JSON export       | `--table:name --export:"pk"`                           | `POST /databases/:databaseId/tables/:tableName/row`               | Full     | API body supports scalar or composite key objects.                                                |
| Generate schema types | `--table:name --types:typescript\|rust\|kotlin\|swift` | `POST /databases/:databaseId/tables/:tableName/types`             | Partial  | Same generator. CLI supports stdout/file output and aliases; API returns JSON.                    |
| List backups          | `--backups`                                            | `GET /databases/:databaseId/backups`                              | Full     | Both return managed backups for one database.                                                     |
| Create backup         | `--backup`, `--backup:"name"`                          | `POST /databases/:databaseId/backups`                             | Full     | Both create and verify a managed backup through the same service.                                 |

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
