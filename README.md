# sqlite-hub ⚡️

![](/assets/mockups/home.png)

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

![](/assets/mockups/graph_visualize.png)

Inspect tables, columns, types, and schema details without losing pace. Visualized in a graph.

### Data browser

![](/assets/mockups/data.png)

Scan rows, sort fast, move through local data quickly, and export full tables as CSV.

### Row editing

![](/assets/mockups/data_edit.png)

Open one record, edit it in place, commit, continue.

### SQL editor

![](/assets/mockups/sql_editor.png)

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

## Changelog

[](changelog.md)
