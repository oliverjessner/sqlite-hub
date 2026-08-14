# SQLite Hub CLI

## Command Structure

SQLite Hub uses resource and action subcommands:

```text
sqlite-hub <resource> <action> [arguments] [options]
```

Options use a separate value or the standard equals form:

```bash
sqlite-hub table list --db Unit-00
sqlite-hub table list --db=Unit-00
```

Run `sqlite-hub --help` for the top-level command list. Resources and actions have focused help pages:

```bash
sqlite-hub query --help
sqlite-hub query run --help
sqlite-hub types generate --help
```

Database-scoped commands consistently use `--db <database>`. A database can be selected by its SQLite Hub ID or label.

## Starting SQLite Hub

Running the CLI without a command starts the server on port `4173`:

```bash
sqlite-hub
```

The explicit server command supports a custom port and opening the default browser:

```bash
sqlite-hub serve
sqlite-hub serve --port 4174
sqlite-hub serve --open
sqlite-hub serve --port 4174 --open
```

Show application, SQLite runtime, URL, and version status:

```bash
sqlite-hub info
sqlite-hub info --port 4174
```

Global options:

```bash
sqlite-hub --help
sqlite-hub --version
```

Short forms `-h` and `-v` are also supported.

## Databases

List all imported databases:

```bash
sqlite-hub db list
sqlite-hub db list --json
```

Show the name, ID, file path, file size, last-opened timestamp, and read-only status of one database:

```bash
sqlite-hub db info Unit-00
sqlite-hub db info Unit-00 --json
```

## Tables

List tables in a database:

```bash
sqlite-hub table list --db Unit-00
sqlite-hub table list --db Unit-00 --json
```

Inspect columns, primary and foreign keys, indexes, row count, and row identity strategy:

```bash
sqlite-hub table info users --db Unit-00
sqlite-hub table info users --db Unit-00 --json
```

## Rows

Get one row by its primary key or `rowid`:

```bash
sqlite-hub row get companies 0a754aba373d34972998792a0be4333c --db Unit-00
```

The row is shaped through the same Row Editor service as the web app and is always printed as JSON. For a composite primary key, pass the key as a JSON object:

```bash
sqlite-hub row get order_items '{"order_id":42,"item_id":7}' --db Unit-00
```

## Queries

List saved SQL Editor queries:

```bash
sqlite-hub query list --db Unit-00
sqlite-hub query list --db Unit-00 --json
```

Run raw SQL through the SQL Editor execution path. The execution is recorded in Query History:

```bash
sqlite-hub query run "SELECT * FROM companies LIMIT 10" --db Unit-00
sqlite-hub query run "SELECT COUNT(*) AS total FROM companies" --db Unit-00 --json
```

Run raw SQL and save the resulting history entry under a name:

```bash
sqlite-hub query run "SELECT * FROM companies LIMIT 10" \
  --db Unit-00 \
  --save "Company Sample"
```

Save SQL without executing it. `--name` is required and `--notes` is optional:

```bash
sqlite-hub query save "SELECT * FROM companies ORDER BY name" \
  --db Unit-00 \
  --name "Company List" \
  --notes "Used by the weekly report"
```

Show a saved query's SQL and metadata:

```bash
sqlite-hub query show "Stock Winners" --db Unit-00
sqlite-hub query show "Stock Winners" --db Unit-00 --json
```

Execute an existing saved query:

```bash
sqlite-hub query exec "Stock Winners" --db Unit-00
sqlite-hub query exec "Stock Winners" --db Unit-00 --json
```

Export a saved query. Supported formats are `csv`, `tsv`, `md`, and `json`; the default is `csv`:

```bash
sqlite-hub query export "Stock Winners" --db Unit-00 --format csv
sqlite-hub query export "Stock Winners" --db Unit-00 --format json --output winners.json
```

Without `--output`, the generated filename is written to the current working directory.

## Documents

List Markdown documents:

```bash
sqlite-hub doc list --db Unit-00
sqlite-hub doc list --db Unit-00 --json
```

Show a document selected by ID, filename, title, or a unique partial match:

```bash
sqlite-hub doc show "Research Notes" --db Unit-00
sqlite-hub doc show "Research Notes" --db Unit-00 --json
```

Export a document as Markdown:

```bash
sqlite-hub doc export "Research Notes" --db Unit-00
sqlite-hub doc export "Research Notes" --db Unit-00 --output research-notes.md
```

Without `--output`, the document's generated filename is written to the current working directory.

## Backups

List managed backups:

```bash
sqlite-hub backup list --db Unit-00
sqlite-hub backup list --db Unit-00 --json
```

Create and verify a managed backup:

```bash
sqlite-hub backup create --db Unit-00
sqlite-hub backup create --db Unit-00 --name "Before import"
sqlite-hub backup create \
  --db Unit-00 \
  --name "Before import" \
  --notes "Before loading vendor data"
sqlite-hub backup create --db Unit-00 --name "Nightly" --json
```

## Type Generation

Generate application types from a table:

```bash
sqlite-hub types generate users --db Unit-00 --lang typescript
```

Supported language names and aliases are:

- TypeScript: `typescript`, `ts`
- Rust: `rust`, `rs`
- Kotlin: `kotlin`, `kt`
- Swift: `swift`
- Go: `go`, `golang`

Generation options:

| Option | Purpose |
| --- | --- |
| `--name NAME` | Override the generated type name |
| `--naming preserve\|camel\|pascal\|snake` | Set property naming |
| `--nullable native\|optional` | Set nullable-field handling |
| `--comments` | Include schema comments |
| `--defaults-as-comments` | Include SQL defaults as comments |
| `--json-type unknown\|record\|json-value` | Set the JSON column type |
| `--include-generated` | Include generated columns |
| `--include-hidden` | Include hidden columns |
| `--output FILE` | Write code to a file |
| `--force` | Replace an existing output file |
| `--json` | Print the complete generation result as JSON |

Example with customization:

```bash
sqlite-hub types generate users \
  --db Unit-00 \
  --lang ts \
  --name User \
  --naming camel \
  --nullable optional \
  --comments \
  --defaults-as-comments \
  --json-type unknown \
  --include-generated \
  --include-hidden \
  --output User.ts \
  --force
```

Without `--output` or `--json`, only generated code is written to standard output. Warnings are written to standard error, so shell redirection remains clean:

```bash
sqlite-hub types generate users --db Unit-00 --lang ts > User.ts
```

## JSON Output

Use `--json` on commands that expose structured output:

```bash
sqlite-hub db list --json
sqlite-hub table info users --db Unit-00 --json
sqlite-hub query show "Stock Winners" --db Unit-00 --json
sqlite-hub backup create --db Unit-00 --json
```

`row get` always outputs JSON. Query exports use `--format json` because they create an export file.

## Exit Codes

- `0`: command completed successfully
- `1`: invalid syntax, missing arguments, lookup failure, execution failure, or file-output failure

Syntax errors include the relevant command usage. Use the command's `--help` page for all accepted arguments and options.

## Examples

```bash
# Inspect a table
sqlite-hub table info users --db Unit-00

# Save a reusable query without running it
sqlite-hub query save "SELECT * FROM users WHERE active = 1" \
  --db Unit-00 \
  --name "Active Users"

# Execute the saved query and receive structured output
sqlite-hub query exec "Active Users" --db Unit-00 --json

# Create a checkpoint before changing data
sqlite-hub backup create --db Unit-00 --name "Before migration"

# Generate Go types in the current shell pipeline
sqlite-hub types generate users --db Unit-00 --lang go
```
