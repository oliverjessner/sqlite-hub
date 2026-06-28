# SQLite Hub CLI

SQLite Hub ships with a built-in CLI that lets you start the app, inspect
imported databases, execute raw or saved SQL, export query results, and work
with Markdown documents from the terminal.

CLI commands are recorded in the local Access Log with their action, target,
database id when available, status, and duration. Raw SQL text is still handled
by Query History for executed queries and is not duplicated in the Access Log.

## Start The App

```bash
sqlite-hub                  # start on default port 4173
sqlite-hub --port:4174      # start on a custom port
sqlite-hub --open           # open SQLite Hub in the browser
sqlite-hub --info           # show port, URL, versions, and update status
sqlite-hub --help           # show help text
sqlite-hub --version        # show version number
```

`--config` is still accepted as a legacy alias for `--info`.

## Databases

List all imported databases:

```bash
sqlite-hub --database
sqlite-hub -d
```

The database list shows the name, file path, file size, last opened timestamp,
and read-only status for databases that have been opened in SQLite Hub.

Query details for one database by name or id:

```bash
sqlite-hub --database:Billly --path        # get the file path
sqlite-hub --database:Billly --size        # get the file size
sqlite-hub --database:Billly --lastopened  # get last opened timestamp
```

List all tables in a database:

```bash
sqlite-hub --database:Billly --tables
```

Inspect one table:

```bash
sqlite-hub --database:Billly --table:companies
```

Table inspection prints metadata such as columns, primary keys, foreign keys,
indexes, row count, and row identity strategy.

Generate application types from a table schema:

```bash
sqlite-hub --database:Unit-00 --table:users --types:typescript
sqlite-hub --database:Unit-00 --table:users --types:rust
sqlite-hub --database:Unit-00 --table:users --types:typescript --json
sqlite-hub --database:Unit-00 --table:users --types:typescript --output:User.ts
```

Aliases are available for common targets: `ts`, `rs`, and `kt`. Without
`--output` or `--json`, the CLI writes only generated code to stdout so shell
redirection works cleanly. Warnings are written to stderr. Use `--force` to
overwrite an existing output file.

Create a verified managed backup for a database:

```bash
sqlite-hub --database:Unit-00 --backups
sqlite-hub --database:Unit-00 --backup
sqlite-hub --database:Unit-00 --backup:"Before import" --backup-notes:"Before loading vendor data"
sqlite-hub --database:Unit-00 --backup:"Nightly checkpoint" --json
```

Backup creation uses the same SQLite backup API and verification path as the UI
Backup Manager. It works for read-only database connections because the source
database is only read. `--backups` lists the managed backups for the selected
database; add `--json` for structured output.

## SQL Editor

Execute raw SQL through the same SQL Editor execution path used by the app:

```bash
sqlite-hub --database:Unit-00 --query:"SELECT * FROM companies LIMIT 10"
sqlite-hub --database:Unit-00 --query:"SELECT * FROM companies LIMIT 10" --store:"Company Sample"
```

Raw CLI queries are recorded in Query History. Add `--store:"name"` to title the
history item and mark it as saved. Raw SQL execution is rejected when the target
database is marked read-only.

List all saved queries for a database:

```bash
sqlite-hub --database:Unit-00 --queries
```

Execute a specific saved query by name:

```bash
sqlite-hub --database:Unit-00 --execute:"15min Posting Buckets without id 96"
```

This searches the query history for the selected database, finds the matching
saved query by title, executes it, and returns results with metadata such as row
count, columns, timing, and data.

Show the saved query SQL without executing it:

```bash
sqlite-hub --database:Unit-00 --saved-query:"Stock Winners"
```

Show the saved notes for a query:

```bash
sqlite-hub --database:Unit-00 --notes:"TOP25 Loser and Winner EOD, T1, T3, T5"
```

Export a saved query using the same CSV, TSV, Markdown, and JSON export logic as
the SQL Editor:

```bash
sqlite-hub --database:Unit-00 --export:"Stock Winners" --format:csv
sqlite-hub --database:Unit-00 --export:"Stock Winners" --format:tsv
sqlite-hub --database:Unit-00 --export:"Stock Winners" --format:md
sqlite-hub --database:Unit-00 --export:"Stock Winners" --format:json
```

The export is written to the current working directory using the generated query
export filename.

## Documents

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

Documents can be matched by id, filename, title, or a partial filename/title
match.

## Row JSON Export

Export a single row as JSON by primary key or rowid, using the same row-shaping
logic as the Row Editor:

```bash
sqlite-hub --database:Unit-00 --table:companies --export:0a754aba373d34972998792a0be4333c
```

## Available Flags

| Flag                                                            | Description                                     |
| --------------------------------------------------------------- | ----------------------------------------------- |
| `--help`, `-h`                                                  | Show help text                                  |
| `--version`, `-v`                                               | Show version number                             |
| `--info`                                                        | Show port, URL, versions, and update status     |
| `--open`                                                        | Open SQLite Hub in the browser                  |
| `--port:PORT`                                                   | Start the server on a custom port               |
| `--database`, `-d`                                              | List all imported databases                     |
| `--database:name`                                               | Select a database by name or id                 |
| `--database:name --path`                                        | Get the file path of a database                 |
| `--database:name --size`                                        | Get the size of a database                      |
| `--database:name --lastopened`                                  | Get the last opened timestamp                   |
| `--database:name --tables`                                      | Get all table names from a database             |
| `--database:name --queries`                                     | List saved queries for a database               |
| `--database:name --query:"sql"`                                 | Execute raw SQL and record it in Query History  |
| `--database:name --query:"sql" --store:"name"`                  | Save a raw query in Query History with a name   |
| `--database:name --execute:"query"`                             | Execute a saved query by name                   |
| `--database:name --saved-query:"query"`                         | Print a saved query by name                     |
| `--database:name --notes:"query"`                               | Print saved notes for a query                   |
| `--database:name --export:"query" --format:csv\|tsv\|md\|json` | Set query export format                         |
| `--database:name --documents`                                   | List Markdown documents for a database          |
| `--database:name --documents:"document"`                        | Print a document's Markdown content             |
| `--database:name --documents:"document" --export`               | Export a document as Markdown                   |
| `--database:name --backups`                                     | List managed backups for a database             |
| `--database:name --backup`                                      | Create and verify a managed backup              |
| `--database:name --backup:"name"`                               | Create a managed backup with a custom name      |
| `--backup-notes:"text"`                                         | Add notes to a backup created by `--backup`     |
| `--database:name --table:"table"`                               | Print table metadata                            |
| `--database:name --table:"table" --export:"pk"`                 | Export one row as JSON                          |
| `--database:name --table:"table" --types:typescript\|ts\|rust\|rs\|kotlin\|kt\|swift` | Generate application types |
| `--type-name:"name"`                                            | Override generated type name                    |
| `--naming:preserve\|camel\|pascal\|snake`                       | Select property naming                          |
| `--nullable:native\|optional`                                   | Select nullable handling                        |
| `--comments`                                                    | Include schema comments                         |
| `--defaults-as-comments`                                        | Include default values as comments              |
| `--json-type:unknown\|record\|json-value`                       | Select TypeScript JSON mapping                  |
| `--include-generated`                                           | Include generated columns                       |
| `--include-hidden`                                              | Include hidden columns                          |
| `--output:"file"`                                               | Write generated types to a file                 |
| `--json`                                                        | Print generated type result as JSON             |
| `--force`                                                       | Overwrite existing `--output` file              |

Legacy aliases such as `--config`, `--database-path:name`,
`--database-size:name`, `--database-lastopened:name`, `--database-tables:name`,
and `--database:name --sqleditor:"query"` still work.

## Example

Saved queries created in the graphical SQL Editor can also be executed through
the CLI. To execute one, run:

```bash
sqlite-hub --database:Unit-00 --execute:"Group by creation Year"
```

Example output:

```bash
Executing: Group by creation Year
SQL: SELECT STRFTIME('%Y', creation_time, 'unixepoch') AS creation_year, COUNT(*) AS channel_count FROM channels WHERE creation_time IS NOT NU...
------------------------------------------------------------

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
