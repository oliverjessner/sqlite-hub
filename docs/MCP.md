# SQLite Hub MCP

SQLite Hub ships a local MCP server so agents can inspect and automate the same imported SQLite databases that the UI, CLI, and local API use.

The MCP server uses the shared SQLite Hub service layer. API, CLI, and MCP calls all go through the same database registry, query execution, type generation, backup, document, and chart logic.

## Start

When SQLite Hub is installed from npm, use:

```bash
sqlite-hub-mcp
```

For a local checkout, point Codex at the script directly:

```toml
[mcp_servers.sqlitehub]
command = "node"
args = ["/absolute/path/to/sqlite-hub/bin/sqlite-hub-mcp.js"]
startup_timeout_sec = 10
tool_timeout_sec = 60
```

The server uses stdio transport. It is intended for local agents running on the same machine as SQLite Hub. It does not expose a network listener and does not require API tokens for local stdio use.

## Tools

Read-only and safe tools:

- `list_connections`: list imported SQLite Hub database ids and labels.
- `get_database_overview`: inspect database health, SQLite metadata, table counts, and schema-map statistics.
- `list_tables`: list database tables.
- `describe_table`: inspect columns, indexes, foreign keys, triggers, and row counts for one table.
- `get_schema`: return tables, views, indexes, triggers, and raw schema entries.
- `get_indexes`: return all indexes or indexes for one table.
- `get_foreign_keys`: return all foreign keys or foreign keys for one table.
- `run_readonly_query`: execute a read-only `SELECT`, `PRAGMA`, or `EXPLAIN` query.
- `explain_query_plan`: run `EXPLAIN QUERY PLAN` and return structured plan rows plus index hints when a table scan appears.
- `read_documents`: read database-scoped Markdown documents.

Controlled write tools:

- `create_backup`: create a verified backup through SQLite Hub's existing backup mechanism.
- `generate_types`: generate TypeScript, Rust, Kotlin, or Swift types from one table or all tables.
- `create_chart_from_query`: create a saved chart from a read-only `SELECT` query. It writes chart metadata to SQLite Hub but does not export files.

## Security

`run_readonly_query` validates SQL server-side before execution. Only `SELECT`, `PRAGMA`, and `EXPLAIN` statements that return rows are allowed.

These statements are blocked in `run_readonly_query`:

- `INSERT`
- `UPDATE`
- `DELETE`
- `DROP`
- `ALTER`
- `CREATE`
- `ATTACH`
- `DETACH`
- `VACUUM`
- other non-reader or mutating statements

Backups are always created through SQLite Hub's managed backup service. Chart creation stores chart metadata only. The MCP server does not write arbitrary local files.

## Settings Status

The Settings view has an `MCP` tab. It shows whether the MCP server is running, whether an agent is connected, active client count, the last connection time, last tool call, transport, exposed tools, and a copyable Codex config example.

For stdio, connection state is tracked from MCP `initialize` and tool calls. When the MCP process exits cleanly, SQLite Hub marks the session as disconnected.

## Example Prompts

```text
Use SQLite Hub MCP to inspect my current database schema and suggest missing indexes.
```

```text
Use SQLite Hub MCP to create a backup before generating TypeScript types.
```

```text
Use SQLite Hub MCP to explain the query plan for this SQL query.
```
