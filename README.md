# sqlite-hub ⚡️

![](./frontend/assets/mockups/home.png)

A focused local-first app for browsing, editing, and querying SQLite databases.

SQLite Hub is built for developers and technical users who want a clean SQLite workflow without heavy database clients, cloud layers, or dashboard noise.

## Why SQLite Hub?

Many database tools are powerful, but feel oversized when all you want is to inspect a local SQLite file, edit a few rows, and run a query fast.

SQLite Hub keeps that workflow sharp:

- browse tables and rows
- inspect schema and structure
- edit records in place
- export tables and query results as CSV
- create simple local backups of the active database
- run SQL in a syntax-highlighted editor
- stay local and move fast

## Features

### Structure view

![](./frontend/assets/mockups/structure.png)

Inspect tables, columns, types, and schema details without losing pace. Visualized in a graph.

### Data browser

![](./frontend/assets/mockups/data.png)

Scan rows, sort fast, move through local data quickly, and export full tables as CSV.

### Row editing

![](./frontend/assets/mockups/data_row_editor.png)

Open one record, edit it in place, commit, continue.

### SQL editor

![](./frontend/assets/mockups/sql_editor.png)

Write queries in a syntax-highlighted editor, inspect results in the same workflow, and export result sets as CSV.

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
npm install -g sqlit-hub
```

## alternative port

```bash
sqlit-hub --port:4174
```

## CLI Interface

SQLite Hub ships with a built-in CLI that lets you start the app or query information about your imported databases directly from the terminal.

### Start the app

```bash
sqlite-hub                  # start on default port 4173
sqlite-hub --port:4174      # start on a custom port
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
sqlite-hub --database-path:Billly     # get the file path
sqlite-hub --database-size:Billly     # get the file size (human-readable)
sqlite-hub --database-lastopened:Billly  # get last opened timestamp
```

### List all tables in a database

```bash
sqlite-hub --database-tables:Billly
```

Opens the database in read-only mode and prints all table names, sorted alphabetically.

### SQL Editor - Saved Queries

List all saved queries for a database:

```bash
sqlite-hub --database:Unit-00 --sqleditor
```

Execute a specific saved query by name:

```bash
sqlite-hub --database:Unit-00 --sqleditor:"15min Posting Buckets withoud id 96"
```

This searches the query history for the given database, finds the matching saved query by title, executes it, and returns all results with metadata (row count, columns, timing, and data).

### Available flags

| Flag                                  | Description                           |
| ------------------------------------- | ------------------------------------- |
| `--help`, `-h`                        | Show help text                        |
| `--version`, `-v`                     | Show version number                   |
| `--port:PORT`                         | Start the server on a custom port     |
| `--database`, `-d`                    | List all imported databases           |
| `--database-path:name`                | Get the file path of a database       |
| `--database-size:name`                | Get the size of a database            |
| `--database-lastopened:name`          | Get the last opened timestamp         |
| `--database-tables:name`              | Get all table names from a database   |
| `--database:name --sqleditor`         | List all saved queries for a database |
| `--database:name --sqleditor:"query"` | Execute a saved query by name         |

### sqleditor

![](/frontend/assets/mockups/sql_editor_croped.png)

In the screenshot above, you can see a saved query from the SQL editor. You can create these queries using the graphical interface and execute them via the CLI if you want. To execute one, you would run:

```bash
sqlite-hub --database:Unit-00 --sqleditor:"Group by creation Year"
```

which returns

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

[Changelog](/changelog.md)
