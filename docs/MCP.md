# SQLite Hub MCP

SQLite Hub ships a local MCP server so agents can inspect and automate the same imported SQLite databases that the UI, CLI, and local API use.

The MCP server uses the shared SQLite Hub service layer. API, CLI, and MCP calls all go through the same database registry, query execution, type generation, backup, document, and chart logic.

## Start the STDIO Server

```bash
sqlite-hub mcp
sqlite-hub mcp --help
```

Your MCP client launches `sqlite-hub mcp` as a child process. It communicates using newline-delimited MCP JSON-RPC over stdin/stdout. All diagnostics go to stderr. The process stays alive while stdin is open and shuts down cleanly on EOF, SIGINT, or SIGTERM.

No HTTP server, tunnel, ngrok, or public endpoint is required. The SQLite Hub web app does not need to be running. Its normal web UI and API remain available through `sqlite-hub serve`; they do not host MCP.

The server uses the same per-user database registry as the web UI and CLI. Run the client under the same OS user as SQLite Hub to see the same configured databases. No separate database discovery or MCP-specific environment variables are needed.

## ChatGPT Desktop

Open **Settings → MCP servers → Add server**, then enter:

| Field | Value |
| --- | --- |
| Name | SQLite Hub |
| Type | STDIO |
| Command to launch | `/opt/homebrew/bin/sqlite-hub` |
| Arguments | `mcp` |

Use the actual executable path from your installation:

```bash
which sqlite-hub
```

The Homebrew path above is an example for Apple Silicon Macs; other installations may use `/usr/local/bin/sqlite-hub` or a different prefix. On Windows use `where sqlite-hub`. Save the server and restart its connection. See the [official ChatGPT Desktop MCP setup instructions](https://learn.chatgpt.com/docs/extend/mcp).

## Generic Local Client Configuration

```text
Command: sqlite-hub
Arguments: mcp
```

Use an absolute command path if the desktop client does not inherit your shell's PATH. Node.js must also be available to the executable's `#!/usr/bin/env node` launcher.

For Codex, add this to `~/.codex/config.toml`:

```toml
[mcp_servers.sqlitehub]
command = "sqlite-hub"
args = ["mcp"]
startup_timeout_sec = 10
tool_timeout_sec = 60
```

Or register it with:

```bash
codex mcp add sqlitehub -- sqlite-hub mcp
```

For Claude Desktop and other clients using `mcpServers` JSON:

```json
{
  "mcpServers": {
    "sqlitehub": {
      "command": "sqlite-hub",
      "args": ["mcp"]
    }
  }
}
```

For a local checkout, or when Node.js is missing from the desktop client's PATH, configure the absolute Node executable as the command and the CLI file plus `mcp` as arguments:

```toml
[mcp_servers.sqlitehub]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/sqlite-hub/bin/sqlite-hub.js", "mcp"]
startup_timeout_sec = 10
tool_timeout_sec = 60
```

The Settings **MCP** tab provides this configuration using the current installation's absolute paths. No HTTP transport is available. Existing URL-based configurations must be replaced; the separate `sqlite-hub-mcp` executable has been removed.

## Implementation and Verification

The server uses the official `@modelcontextprotocol/sdk` 1.30.0 `Server` and `StdioServerTransport` APIs. There was no MCP SDK dependency before this refactor. The SDK handles initialization, version negotiation, JSON-RPC validation, and STDIO framing; SQLite Hub registers its existing JSON Schema tool definitions and delegates to `McpToolService`.

Verify an installed package with:

```bash
which sqlite-hub
sqlite-hub --help
sqlite-hub mcp --help
```

In a checkout, run `node --test tests/mcp-stdio.test.js`. These tests launch the real CLI with an isolated registry, connect using the official SDK client, execute a query, reject network listeners, and check protocol-only stdout and clean shutdown. Starting `sqlite-hub mcp` manually waits silently for an MCP client to send messages; that is expected.

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
- `get_saved_queries`: list saved SQL Editor queries for a database, equivalent to `sqlite-hub query list --db <database>`.
- `explain_query_plan`: run `EXPLAIN QUERY PLAN` and return structured plan rows plus index hints when a table scan appears.
- `read_documents`: read database-scoped Markdown documents.

Controlled write tools:

- `add_database`: add an existing SQLite file to Connections or create and add a new empty `.db`, `.sqlite`, or `.sqlite3` database. It does not change the active UI connection.
- `create_stored_query`: create or update a saved SQL Editor query with a title and optional notes, without executing the SQL.
- `execute_stored_query`: execute a saved SQL Editor query by id, title, display title, or SQL fragment, equivalent to `sqlite-hub query exec <query> --db <database>`.
- `create_backup`: create a verified backup through SQLite Hub's existing backup mechanism.
- `generate_types`: generate TypeScript, Rust, Kotlin, Swift, or Go types from one table or all tables.
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

Backups are always created through SQLite Hub's managed backup service. `add_database` validates existing files as SQLite databases; in `create` mode it creates a new SQLite file and any missing parent directories at the requested local path. Stored-query creation and chart creation store SQLite Hub metadata only. `create_stored_query` never executes the supplied SQL or modifies the target database. The MCP server does not write arbitrary local files beyond the explicit database path supplied to `add_database` in `create` mode.

`execute_stored_query` intentionally follows the same behavior as the CLI and external API saved-query execution path. It executes the stored SQL as-is and records the run in Query History with `executedBy: "mcp"`.

STDIO grants the local client access to the existing MCP tools under your OS user's permissions. API tokens are not exposed through MCP tool responses.

## Settings Status

The Settings view has an `MCP` tab. It shows whether the MCP server is running, whether an agent is connected, active client count, the last connection time, last tool call, transport, exposed tools, and a copyable Codex config example.

Connection state is tracked from the SDK initialization handshake and tool calls in the spawned process. When the STDIO process exits cleanly, SQLite Hub marks the session as disconnected. Starting the web app alone does not start MCP.

Request and protocol errors are persisted under **Logs → MCP** with the method, request ID, transport, and error details, and are also written to stderr. Request arguments are not stored in MCP access-log metadata. Existing SQL Query History behavior remains unchanged. Errors without a database association appear as server-wide entries in the selected database's Logs view.

The status panel reflects the most recently updated process; it is not a per-client session monitor. Forced termination such as SIGKILL cannot record a clean disconnect. Local STDIO configuration applies to desktop/local clients, not ChatGPT web.

## Example Prompts

```text
Use SQLite Hub MCP to inspect my current database schema and suggest missing indexes.
```

```text
Use SQLite Hub MCP to create a backup before generating TypeScript types.
```

```text
Use SQLite Hub MCP to create a new database named "Research" at /absolute/path/research.sqlite.
```

```text
Use SQLite Hub MCP to explain the query plan for this SQL query.
```

```text
Use SQLite Hub MCP to list my saved queries and execute the one named "Company List".
```

```text
Use SQLite Hub MCP to save a query named "Company List" with the SQL SELECT id, name FROM companies ORDER BY name.
```
