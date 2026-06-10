# sqlite-hub ⚡️

![](./frontend/assets/mockups/home.png)

A focused local-first app for browsing, editing, and querying SQLite databases.

SQLite Hub is built for developers and technical users who want a clean SQLite workflow without heavy database clients, cloud layers, or dashboard noise.

## Why SQLite Hub?

Many database tools are powerful, but feel oversized when all you want is to inspect a local SQLite file, edit a few rows, and run a query fast.

SQLite Hub keeps that workflow sharp:

- browse tables and rows
- filter, sort, page through, and export table data
- inspect schema, structure, and relationships
- edit records in place with an SQL diff preview before saving
- export tables and query results as CSV, TSV, Markdown, or duplicate them as a table
- copy result columns with formatting, headers, first-10 previews, TXT export, and Markdown todo export
- keep database-scoped Markdown documents with previews, autosave, imports, exports, and saved-query inserts
- switch between recent databases with sidebar quick picks
- create simple local backups of the active database
- run and format SQL in a syntax-highlighted editor with history, messages, and performance metrics
- turn query-history results into local charts
- create and edit tables with a live SQL preview
- stay local and move fast

## Features

### Structure view

![](./frontend/assets/mockups/structure.png)

Inspect tables, columns, types, indexes, foreign keys, and schema details without losing pace. The graph view visualizes relationships, the table list is searchable, and SQLite Hub remembers the last selected table while you move between views.

### Data browser

![](./frontend/assets/mockups/data.png)

Scan rows, sort fast, move through local data quickly, and export full tables as CSV, TSV, or Markdown. The Data browser also supports duplicating exports as a new table, table search, page sizes up to 250 rows, and advanced filters with column/operator/value controls. Text filters support case-insensitive `contains`, `not contains`, and exact `equals` matching.

### Row editing

![](./frontend/assets/mockups/data_row_editor.png)

Open one record, edit it in place, preview the SQL diff, then commit. SQLite Hub only enables row edits when it can target a stable row identity safely.

### SQL editor

![](./frontend/assets/mockups/sql_editor.png)

Write queries in a syntax-highlighted editor, format SQL with the editor Format button, inspect results in the same workflow, and export result sets as CSV, TSV, Markdown, or duplicate them as a table. Query drafts survive reloads, query history can be searched and saved, and direct single-table `SELECT` results can be edited from the result grid.

Result column menus include copy actions for a full column, a column with header, or the first 10 values. The same modal can preview the output, copy it, export it as TXT, or turn a column into Markdown todo items.

The bottom panel keeps separate tabs for:

- Results
- Performance, including execution time, statement count, returned rows, affected rows, and serialized result memory size
- Messages, including the executed query and statement updates/errors

Potentially destructive statements are tracked in query history, and SQLite Hub keeps the active result tab instead of forcing you back to Results after every execution.

### Query history

SQLite Hub stores query history per database. You can search SQL, titles, and notes; mark useful queries as saved; re-run previous queries; and execute saved queries from the CLI.

### Documents

Documents are local Markdown notes scoped to the active database. SQLite Hub creates a document folder per database, keeps the sidebar fixed while the editor and preview panes scroll independently, and autosaves changes after a short debounce. You can create, rename, delete, import `.md` files, export the current document as Markdown, and toggle the editor or preview pane as needed.

The preview supports regular Markdown, ordered and unordered lists, tables, code blocks, links, and clickable task-list checkboxes. Documents can also pull context from saved SQL Editor queries:

- Insert Table opens a saved-query picker and inserts that query's result using the same Markdown table export logic as the SQL Editor.
- Insert Note opens saved queries that have notes and inserts the selected note directly into the document.
- Markdown Todo column exports from query results can create a new document without embedding the original SQL query.

### Charts

Create charts from chartable `SELECT` query-history entries. Charts can be saved per query, reopened later, and rendered from live query results.

### Table Designer

Create and edit SQLite tables from the UI. The Table Designer includes a searchable table list, column controls, CSV import drafting, and a live SQL preview that can be hidden or shown.

### Media Tagging

Configure a media table, tag table, and mapping table, then work through a tagging queue for image, video, and audio assets. The workflow supports preview controls, skipped items, parent tags, and applying selected tags to the current media row.

### UI preferences

SQLite Hub remembers common workspace preferences in local storage, including hidden panels, selected editor tabs, query drafts, chart panels, table row size, and Table Designer preview visibility.

### Database quick picks

The active database footer in the sidebar opens a quick-pick panel with the five most recent databases, so you can switch databases without going back to the Connections view.

### Simple backups

Create timestamped local backups of the active SQLite database in one click. Backups are stored as plain file copies in a local `backups` folder next to the database.

### Local-first

Built around local SQLite files, not hosted dashboards or team complexity.

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

## CLI Interface

SQLite Hub ships with a built-in CLI that lets you start the app or query information about your imported databases directly from the terminal.

### Start the app

```bash
sqlite-hub                  # start on default port 4173
sqlite-hub --port:4174      # start on a custom port
sqlite-hub --open           # open SQLite Hub in the browser
sqlite-hub --config         # show port, URL, app version, and SQLite version
sqlite-hub --help           # show help text
sqlite-hub --version        # show version number
```

### List all imported databases

```bash
sqlite-hub --database
sqlite-hub -d
```

Shows an overview of all databases that have been opened in SQLite Hub, including:

- database name/label
- file path
- file size
- last opened timestamp
- read-only status

### Query specific database details

Retrieve details about a single database by its name (case-insensitive):

```bash
sqlite-hub --database:Billly --path        # get the file path
sqlite-hub --database:Billly --size        # get the file size
sqlite-hub --database:Billly --lastopened  # get last opened timestamp
```

### List all tables in a database

```bash
sqlite-hub --database:Billly --tables
```

Opens the database in read-only mode and prints all table names, sorted alphabetically.

### Inspect a table

```bash
sqlite-hub --database:Billly --table:companies
```

Prints table metadata such as columns, primary keys, foreign keys, indexes, row count, and row identity strategy.

### SQL Editor - Saved Queries

List all saved queries for a database:

```bash
sqlite-hub --database:Unit-00 --queries
```

Execute a specific saved query by name:

```bash
sqlite-hub --database:Unit-00 --execute:"15min Posting Buckets without id 96"
```

This searches the query history for the given database, finds the matching saved query by title, executes it, and returns all results with metadata (row count, columns, timing, and data).

Show the saved query SQL without executing it:

```bash
sqlite-hub --database:Unit-00 --query:"Stock Winners"
```

Show the saved notes for a query:

```bash
sqlite-hub --database:Unit-00 --notes:"TOP25 Loser and Winner EOD, T1, T3, T5"
```

Export a saved query using the same CSV, TSV, and Markdown export logic as the SQL Editor:

```bash
sqlite-hub --database:Unit-00 --export:"Stock Winners" --format:csv
sqlite-hub --database:Unit-00 --export:"Stock Winners" --format:tsv
sqlite-hub --database:Unit-00 --export:"Stock Winners" --format:md
```

The export is written to the current working directory using the generated query export filename.

### Documents CLI

List all Markdown documents stored for a database:

```bash
sqlite-hub --database:Unit-00 --documents
```

Print one document's Markdown content:

```bash
sqlite-hub --database:Unit-00 --documents:"Research Notes"
```

Export one document as a `.md` file into the current working directory:

```bash
sqlite-hub --database:Unit-00 --documents:"Research Notes" --export
sqlite-hub --database:Unit-00 --documents:"Research Notes--export"
```

Documents can be matched by id, filename, title, or a partial filename/title match.

### Row JSON export

Export a single row as JSON by primary key or rowid, using the same row-shaping logic as the Row Editor:

```bash
sqlite-hub --database:Unit-00 --table:companies --export:0a754aba373d34972998792a0be4333c
```

### Available flags

| Flag                                                     | Description                                     |
| -------------------------------------------------------- | ----------------------------------------------- |
| `--help`, `-h`                                           | Show help text                                  |
| `--version`, `-v`                                        | Show version number                             |
| `--config`                                               | Show port, URL, app version, and SQLite version |
| `--open`                                                 | Open SQLite Hub in the browser                  |
| `--port:PORT`                                            | Start the server on a custom port               |
| `--database`, `-d`                                       | List all imported databases                     |
| `--database:name`                                        | Select a database by name or id                 |
| `--database:name --path`                                 | Get the file path of a database                 |
| `--database:name --size`                                 | Get the size of a database                      |
| `--database:name --lastopened`                           | Get the last opened timestamp                   |
| `--database:name --tables`                               | Get all table names from a database             |
| `--database:name --queries`                              | List saved queries for a database               |
| `--database:name --execute:"query"`                      | Execute a saved query by name                   |
| `--database:name --query:"query"`                        | Print a saved query by name                     |
| `--database:name --notes:"query"`                        | Print saved notes for a query                   |
| `--database:name --export:"query" --format:csv\|tsv\|md` | Set query export format                         |
| `--database:name --documents`                            | List Markdown documents for a database          |
| `--database:name --documents:"document"`                 | Print a document's Markdown content             |
| `--database:name --documents:"document" --export`        | Export a document as Markdown                   |
| `--database:name --table:"table"`                        | Print table metadata                            |
| `--database:name --table:"table" --export:"pk"`          | Export one row as JSON                          |

Legacy aliases such as `--database-path:name`, `--database-size:name`, `--database-lastopened:name`, `--database-tables:name`, and `--database:name --sqleditor:"query"` still work.

### SQL editor CLI example

![](/frontend/assets/mockups/sql_editor_croped.png)

In the screenshot above, you can see a saved query from the SQL editor. You can create these queries using the graphical interface and execute them via the CLI if you want. To execute one, you would run:

```bash
sqlite-hub --database:Unit-00 --execute:"Group by creation Year"
```

Example output:

```bash
Executing: Group by creation Year
SQL: SELECT STRFTIME('%Y', creation_time, 'unixepoch') AS creation_year, COUNT(*) AS channel_count FROM channels WHERE creation_time IS NOT NU...
────────────────────────────────────────────────────────────

Statement count: 1
Timing: 1ms

Statement 1 (resultSet):
Rows: 3
Columns: creation_year, channel_count

Results:
  [0] 2024 | 11
  [1] 2025 | 47
  [2] 2026 | 40
```

## Changelog

[Changelog](./docs/changelog.md)
