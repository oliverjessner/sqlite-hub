# sqlite-hub ⚡️

[![SQLite Hub database overview](./frontend/assets/mockups/overview_1_1920.webp)](./frontend/assets/mockups/overview_1_1920.webp)

A focused local-first app for browsing, editing, and querying SQLite databases.

SQLite Hub is built for developers and technical users who want a clean SQLite workflow without heavy database clients, cloud layers, or dashboard noise.

## Install

### Homebrew

```bash
brew tap oliverjessner/tap
brew install sqlite-hub
```

### NPM

```bash
npm install -g sqlite-hub
```

## Alternative port

```bash
sqlite-hub --port:4174
```

## Why SQLite Hub?

Many database tools are powerful, but feel oversized when all you want is to inspect a local SQLite file, edit a few rows, and run a query fast.

SQLite Hub keeps that workflow sharp:

- browse tables and rows
- open existing databases or create new SQLite files with a native save dialog
- manage recent connections with labels, custom icons, and read-only mode
- inspect database health, storage metrics, and schema connectivity from one overview
- filter, sort, page through, and export table data
- inspect schema, structure, and relationships
- analyze individual tables with a deterministic local advisor
- generate TypeScript, Rust, Kotlin, or Swift types from table schemas
- edit records in place with typed value previews and an SQL diff preview before saving
- export tables and query results as CSV, TSV, Markdown, JSON, Parquet, or duplicate them as a table
- copy result columns with formatting, headers, first-10 previews, TXT export, and Markdown todo export
- keep database-scoped Markdown documents with previews, autosave, imports, exports, and saved-query inserts
- switch between recent databases with sidebar quick picks
- create verified local backups of the active database and get safety prompts before risky operations
- run and format SQL in a syntax-highlighted editor with history, messages, and performance metrics
- keep large interactive query results bounded while full exports remain available
- turn query-history results into local charts
- create and edit tables with a live SQL preview
- stay local and move fast

## Features

### Structure view

[![SQLite Hub relationship graph](./frontend/assets/mockups/structure_1_1920.webp)](./frontend/assets/mockups/structure_1_1920.webp)

Inspect tables, views, indexes, triggers, columns, declared types, primary keys, nullability, foreign keys, and DDL without losing pace. The searchable object list and relationship graph support fit, relayout, selection clearing, direct navigation to table data, and a hideable inspector/sidebar. Clicking a relationship edge opens a join preview with the mapped columns and a copyable SQL `JOIN` snippet.

### Generate Types

<p>
  <a href="./frontend/assets/mockups/structure_2_generate_types_modal_1920.webp"><img src="./frontend/assets/mockups/structure_2_generate_types_modal_1920.webp" alt="SQLite Hub generate types for selected table" width="49%"></a>
  <a href="./frontend/assets/mockups/structure_3_generate_types_modal_1920.webp"><img src="./frontend/assets/mockups/structure_3_generate_types_modal_1920.webp" alt="SQLite Hub generate types for all tables" width="49%"></a>
</p>

Generate application types directly from the Structure toolbar for the selected table or for every table in the database. The `Generate Types` dropdown lets you choose `Selected table` or `All tables`; the preview modal supports TypeScript, Rust, Kotlin, and Swift. When all tables are selected, SQLite Hub creates one generated file per table.

Type generation uses SQLite's declared column types plus schema constraints such as primary keys, foreign keys, `NOT NULL`, generated columns, defaults, and simple `CHECK (... IN (...))` value sets.

The same generator is available through the [CLI](./docs/CLI.md) and [local API](./docs/API.md) for automation.

### Table Advisor

The Table Advisor analyzes one table at a time and produces a deterministic, local health report. It does not call an external service; the result is derived from SQLite schema metadata, indexes, foreign keys, row counts, and column profiles from the active database.

For each table, SQLite Hub calculates a score, lists findings by severity, shows the evidence behind each finding, and includes copyable SQL suggestions where a direct fix is useful. The advisor can flag missing primary keys, foreign-key-like columns without constraints, join/filter columns without indexes, likely-unique values without a UNIQUE index, enum-like columns that could use a `CHECK` constraint, mostly-null columns, empty strings mixed with nullable text, timestamp columns that need defaults or update logic, and generic column names that hide intent.

### Data browser

[![SQLite Hub data browser](./frontend/assets/mockups/data_1_1920.webp)](./frontend/assets/mockups/data_1_1920.webp)

Scan rows, sort columns, move through local data quickly, and export full tables as CSV, TSV, Markdown, JSON, or Parquet.

Use `Generate` in the Data browser to create local synthetic test rows from the current table schema. The generator respects required columns, foreign keys, simple `CHECK` constraints, and shows a preview before insertion.

The Data browser also supports duplicating exports as a new table, searchable and hideable table navigation, page sizes up to 250 rows, and advanced filters with column/operator/value controls. Text filters support case-insensitive `contains`, `not contains`, and exact `equals` matching.

Wide tables keep their horizontal scroll position when sorting causes the grid to re-render. Cells use compact previews for long values, BLOBs, and detected file paths, while exports retain complete BLOB content.

[![SQLite Hub data export modal](./frontend/assets/mockups/data_3_data_export_modal_1920.webp)](./frontend/assets/mockups/data_3_data_export_modal_1920.webp)

### Row editing

[![SQLite Hub row editor](./frontend/assets/mockups/data_2_roweditor_1920.webp)](./frontend/assets/mockups/data_2_roweditor_1920.webp)

Open one record, edit it in place, preview the generated SQL and changed values, then commit or delete the row with confirmation. SQLite Hub only enables row edits when it can target a stable primary-key or rowid identity safely.

The Row Editor adds contextual previews without changing the stored raw value:

- visible `NULL`, `EMPTY STRING`, and `VALUE` states, with untouched `NULL` values preserved on save
- formatted JSON object and array previews with indentation and line breaks
- full-row JSON preview with copy and `.json` export actions
- clickable HTTP/HTTPS URL detection
- file-path detection with filename, directory, extension, and path type
- timestamp interpretation for plausible numeric, ISO, and SQLite datetime values while protecting key columns
- character counts for non-empty text values
- select controls for simple string `CHECK (... IN (...))` constraints

### SQL editor

[![SQLite Hub SQL editor](./frontend/assets/mockups/sql_editor_1_1920.webp)](./frontend/assets/mockups/sql_editor_1_1920.webp)

Write queries in a syntax-highlighted editor, execute them with the Run button or `Shift + Enter`, format SQL with the editor Format button, inspect results in the same workflow, and export result sets as CSV, TSV, Markdown, JSON, Parquet, or duplicate them as a table.

Query drafts survive reloads, query history can be searched and saved, and direct single-table `SELECT` results can be edited or deleted from the result grid when a stable row identity is available.

[![SQLite Hub query export](./frontend/assets/mockups/sql_editor_3_query_export_modal_1920.webp)](./frontend/assets/mockups/sql_editor_3_query_export_modal_1920.webp)

Result column menus include copy actions for a full column, a column with header, or the first 10 values. The same modal can preview the output, copy it, export it as TXT, or turn a column into Markdown todo items.

The bottom panel keeps separate tabs for:

- Results
- Performance, including execution time, statement count, returned rows, affected rows, and serialized result memory size
- Messages, including the executed query and statement updates/errors

Potentially destructive statements are tracked in query history, and SQLite Hub keeps the active result tab instead of forcing you back to Results after every execution.

Multi-statement SQL is reported statement by statement, including returned rows, affected rows, truncation warnings, executed SQL, errors, timing, and serialized result size.

### Query history

[![SQLite Hub query history details](./frontend/assets/mockups/sql_editor_2_query_detail_1920.webp)](./frontend/assets/mockups/sql_editor_2_query_detail_1920.webp)

SQLite Hub stores query history per database. You can browse recent and saved tabs, search SQL, titles, and notes, assign titles and notes, mark useful queries as saved, delete history entries, load older entries, re-run previous queries, reopen them in the editor, and execute saved queries from the CLI.

### Documents

[![SQLite Hub Markdown documents](./frontend/assets/mockups/documents_1_1920.webp)](./frontend/assets/mockups/documents_1_1920.webp)

Documents are local Markdown notes scoped to the active database. SQLite Hub creates a document folder per database. You can import `.md` files, export the current document as Markdown.

The preview supports regular Markdown, ordered and unordered lists, tables, code blocks, links, and clickable task-list checkboxes. Documents can also pull context from saved SQL Editor queries:

- Insert Table opens a saved-query picker and inserts that query's result using the same Markdown table export logic as the SQL Editor.
- Insert Note opens saved queries that have notes and inserts the selected note directly into the document.
- Markdown Todo column exports from query results can create a new document without embedding the original SQL query.

<p>
  <a href="./frontend/assets/mockups/documents_2_document_insert_table_modal_1920.webp"><img src="./frontend/assets/mockups/documents_2_document_insert_table_modal_1920.webp" alt="SQLite Hub insert saved query table into a document" width="49%"></a>
  <a href="./frontend/assets/mockups/documents_3_document_insert_note_modal_1920.webp"><img src="./frontend/assets/mockups/documents_3_document_insert_note_modal_1920.webp" alt="SQLite Hub insert saved query note into a document" width="49%"></a>
</p>

### Charts

[![SQLite Hub charts](./frontend/assets/mockups/charts_1_1920.webp)](./frontend/assets/mockups/charts_1_1920.webp)

Create bar, line, pie/donut, and scatter charts from chartable `SELECT` query-history entries. Charts can be saved per query, edited, deleted, resized, reopened later, rendered from live query results, and exported as PNG. Chart configuration supports compatible column selection, sorting, labels, legends, line smoothing, scatter series, and optional scatter point sizing.

<p>
  <a href="./frontend/assets/mockups/charts_2_query_detail_1920.webp"><img src="./frontend/assets/mockups/charts_2_query_detail_1920.webp" alt="SQLite Hub chart query detail drawer" width="49%"></a>
  <a href="./frontend/assets/mockups/charts_3_create_query_chart_modal_1920.webp"><img src="./frontend/assets/mockups/charts_3_create_query_chart_modal_1920.webp" alt="SQLite Hub create chart modal" width="49%"></a>
</p>

<p>
  <a href="./frontend/assets/mockups/charts_4_edit_query_chart_modal_1920.webp"><img src="./frontend/assets/mockups/charts_4_edit_query_chart_modal_1920.webp" alt="SQLite Hub edit chart modal" width="49%"></a>
  <a href="./frontend/assets/mockups/charts_5_delete_query_chart_modal_1920.webp"><img src="./frontend/assets/mockups/charts_5_delete_query_chart_modal_1920.webp" alt="SQLite Hub delete chart modal" width="49%"></a>
</p>

[![SQLite Hub chart column copy modal](./frontend/assets/mockups/charts_6_copy_column_modal_1920.webp)](./frontend/assets/mockups/charts_6_copy_column_modal_1920.webp)

### Table Designer

[![SQLite Hub Table Designer](./frontend/assets/mockups/table_designer_1_1920.webp)](./frontend/assets/mockups/table_designer_1_1920.webp)

Create and edit SQLite tables from the UI. The Table Designer includes a searchable table list, validation and migration warnings, and controls for column names, SQLite types, `NOT NULL`, `UNIQUE`, primary keys, SQL defaults, foreign-key tables/columns, and check constraints. Existing composite unique constraints are surfaced as schema metadata.

CSV files can seed a new table draft and optionally fill the created table with imported rows. Every change produces a copyable live SQL preview that can be hidden or shown before the schema operation is applied.

[![SQLite Hub Table Designer constraints](./frontend/assets/mockups/table_designer_2_table_designer_constraints_modal_1920.webp)](./frontend/assets/mockups/table_designer_2_table_designer_constraints_modal_1920.webp)

### Media Tagging

[![SQLite Hub Media Tagging setup](./frontend/assets/mockups/media_tagging_setup_1_1920.webp)](./frontend/assets/mockups/media_tagging_setup_1_1920.webp)

Configure a media table, path/status columns, tag table, mapping table, and the SQL queries that drive tagged and untagged queues. SQLite Hub can create the default tag and mapping tables, validate the setup, reset default queries, and preview image, video, and audio assets from paths scoped to the active database directory.

<p>
  <a href="./frontend/assets/mockups/media_tagging_setup_2_create_media_tagging_tag_table_modal_1920.webp"><img src="./frontend/assets/mockups/media_tagging_setup_2_create_media_tagging_tag_table_modal_1920.webp" alt="SQLite Hub create media tagging tag table modal" width="49%"></a>
  <a href="./frontend/assets/mockups/media_tagging_setup_3_create_media_tagging_mapping_table_modal_1920.webp"><img src="./frontend/assets/mockups/media_tagging_setup_3_create_media_tagging_mapping_table_modal_1920.webp" alt="SQLite Hub create media tagging mapping table modal" width="49%"></a>
</p>

The queue supports tag search, tag creation/removal, parent tags, copying tags from the previous item, applying selected tags, skipping items, resetting skipped items, rotating visual media, hiding/showing media details, and opening the current row in Data or Structure. `Shift + Enter` applies the selected tags and advances to the next item.

[![SQLite Hub tagging queue](./frontend/assets/mockups/media_tagging_queue_1_1920.webp)](./frontend/assets/mockups/media_tagging_queue_1_1920.webp)

### Settings

[![SQLite Hub settings](./frontend/assets/mockups/settings_1_1920.webp)](./frontend/assets/mockups/settings_1_1920.webp)

The Settings view reports the installed SQLite Hub version and the actual SQLite runtime version used to execute queries.

### Backup Manager

[![SQLite Hub backups](./frontend/assets/mockups/backups_1_1920.webp)](./frontend/assets/mockups/backups_1_1920.webp)

Create verified local backups of the active SQLite database, review backup metadata, edit backup notes, download backup files, restore verified backups, and delete managed backups from the Backups view. SQLite Hub stores backup files under its local app-state backup directory by connection id and keeps a `manifest.json` beside each database's backup files. Each backup is created through SQLite's backup API, hashed with SHA-256, and verified with `PRAGMA quick_check` before it is marked as verified.

SQLite Hub also proposes a safety backup before operations that can be hard to undo:

- SQL Editor execution when the statement set contains `DROP TABLE`, `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX`, `CREATE VIEW`, `CREATE TRIGGER`, `DROP INDEX`, `DROP VIEW`, `DROP TRIGGER`, `REINDEX`, or `VACUUM`.
- SQL Editor execution with multiple schema-affecting statements in one run; this is treated as a migration and suggests a `Before migration` backup.
- SQL import into the currently active database when the dump is larger than 5 MB or contains more than 1,000 parsed SQL statements.
- Restore from a managed backup, because the current active database file will be replaced.

The safety dialog lets you create the backup and continue, continue without creating one, or cancel the operation.

<p>
  <a href="./frontend/assets/mockups/backups_2_create_backup_modal_1920.webp"><img src="./frontend/assets/mockups/backups_2_create_backup_modal_1920.webp" alt="SQLite Hub create backup modal" width="49%"></a>
  <a href="./frontend/assets/mockups/backups_3_edit_backup_modal_1920.webp"><img src="./frontend/assets/mockups/backups_3_edit_backup_modal_1920.webp" alt="SQLite Hub edit backup modal" width="49%"></a>
</p>

<p>
  <a href="./frontend/assets/mockups/backups_4_restore_backup_modal_1920.webp"><img src="./frontend/assets/mockups/backups_4_restore_backup_modal_1920.webp" alt="SQLite Hub restore backup modal" width="49%"></a>
  <a href="./frontend/assets/mockups/backups_5_delete_backup_modal_1920.webp"><img src="./frontend/assets/mockups/backups_5_delete_backup_modal_1920.webp" alt="SQLite Hub delete backup modal" width="49%"></a>
</p>

### Overview

The database overview combines operational and schema information for the active database:

- file size, page count, table/view counts, index/trigger counts, journal mode, and foreign-key status
- largest tables by row count and estimated size
- database path, modification time, SQLite version, page size, freelist count, and encoding
- schema-map statistics for foreign-key links, connected clusters, and isolated tables
- integrity and quick-check results, access mode, user version, and schema version
- shortcuts to the SQL Editor, Structure view, and the database location in Finder

### Connections

[![SQLite Hub connections](./frontend/assets/mockups/connections_1_1920.webp)](./frontend/assets/mockups/connections_1_1920.webp)

Recent connections show file size, modification time, last-opened time, and access mode. Connections can be activated, relabeled, moved to another path, opened read-only, assigned a PNG/JPG/WEBP icon, reset to the default icon, or removed from the recent-connections registry without deleting the database file.

<p>
  <a href="./frontend/assets/mockups/connections_2_create_connection_modal_1920.webp"><img src="./frontend/assets/mockups/connections_2_create_connection_modal_1920.webp" alt="SQLite Hub create connection modal" width="49%"></a>
  <a href="./frontend/assets/mockups/connections_3_open_connection_modal_1920.webp"><img src="./frontend/assets/mockups/connections_3_open_connection_modal_1920.webp" alt="SQLite Hub open connection modal" width="49%"></a>
</p>

### Local-first

Built around local SQLite files, not hosted dashboards or team complexity. The server binds explicitly to the IPv4 loopback interface, and API middleware rejects foreign hosts and cross-origin mutations while still allowing same-origin browser and local CLI requests.

## CLI

SQLite Hub ships with a built-in CLI for starting the app, inspecting imported
databases, executing raw or saved SQL, exporting query results, exporting single
rows as JSON, generating schema types, and working with Markdown documents. See the
[CLI documentation](./docs/CLI.md) for commands, flags, and examples.

## API

SQLite Hub also provides a local JSON API for app info, database metadata, tables, saved queries, exports, documents, and schema type generation. `/api/v1/info` returns the same app/version status as `sqlite-hub --info`; database data is protected by database-specific API tokens created in Settings. See the [API documentation](./docs/API.md) for authentication, endpoints, and examples.

## MCP

SQLite Hub includes a local MCP server for agents such as Codex. When SQLite Hub is running, the MCP endpoint is available at `/mcp`; a stdio fallback is also available through `sqlite-hub-mcp`. It exposes the shared API/CLI service layer as guarded tools for schema inspection, read-only queries, query-plan explanation, backups, type generation, documents, and chart creation. See the [MCP documentation](./docs/MCP.md) for setup, tool names, and security boundaries.

## Changelog

[Changelog](./docs/changelog.md)
