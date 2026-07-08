const { ValidationError } = require("../utils/errors");

function objectSchema(properties = {}, required = []) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

function databaseIdProperty() {
  return {
    type: "string",
    description: "SQLite Hub database id or exact imported database label.",
  };
}

const MCP_TOOL_DEFINITIONS = [
  {
    name: "list_connections",
    description: "List imported SQLite Hub database connections without exposing API tokens.",
    inputSchema: objectSchema(),
  },
  {
    name: "get_database_overview",
    description: "Return operational overview, SQLite runtime metadata, and schema statistics for a database.",
    inputSchema: objectSchema({ databaseId: databaseIdProperty() }, ["databaseId"]),
  },
  {
    name: "list_tables",
    description: "List tables in a database with column counts.",
    inputSchema: objectSchema({ databaseId: databaseIdProperty() }, ["databaseId"]),
  },
  {
    name: "describe_table",
    description: "Describe one table including columns, indexes, foreign keys, triggers, and row count.",
    inputSchema: objectSchema(
      {
        databaseId: databaseIdProperty(),
        tableName: { type: "string" },
      },
      ["databaseId", "tableName"]
    ),
  },
  {
    name: "get_schema",
    description: "Return the database schema: tables, views, indexes, triggers, and schema entries.",
    inputSchema: objectSchema({ databaseId: databaseIdProperty() }, ["databaseId"]),
  },
  {
    name: "get_indexes",
    description: "Return all indexes or indexes for one table.",
    inputSchema: objectSchema({
      databaseId: databaseIdProperty(),
      tableName: { type: "string", description: "Optional table name." },
    }, ["databaseId"]),
  },
  {
    name: "get_foreign_keys",
    description: "Return all foreign-key metadata or foreign keys for one table.",
    inputSchema: objectSchema({
      databaseId: databaseIdProperty(),
      tableName: { type: "string", description: "Optional table name." },
    }, ["databaseId"]),
  },
  {
    name: "run_readonly_query",
    description: "Run a read-only SELECT, PRAGMA, or EXPLAIN query. Mutating SQL is blocked server-side.",
    inputSchema: objectSchema(
      {
        databaseId: databaseIdProperty(),
        sql: { type: "string" },
        maxRows: { type: "integer", minimum: 1, maximum: 5000, default: 500 },
      },
      ["databaseId", "sql"]
    ),
  },
  {
    name: "get_stored_queries",
    description: "List saved SQL Editor queries for a database. This is the MCP equivalent of `sqlite-hub --database:name --queries`.",
    inputSchema: objectSchema({
      databaseId: databaseIdProperty(),
      limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    }, ["databaseId"]),
  },
  {
    name: "execute_stored_query",
    description: "Execute a saved SQL Editor query by id, title, display title, or SQL fragment. This is the MCP equivalent of `sqlite-hub --database:name --execute:\"query\"`.",
    inputSchema: objectSchema(
      {
        databaseId: databaseIdProperty(),
        queryName: {
          type: "string",
          description: "Saved query id, title, display title, or SQL fragment.",
        },
      },
      ["databaseId", "queryName"]
    ),
  },
  {
    name: "explain_query_plan",
    description: "Run SQLite EXPLAIN QUERY PLAN for a read-only query and return structured plan rows.",
    inputSchema: objectSchema(
      {
        databaseId: databaseIdProperty(),
        sql: { type: "string" },
      },
      ["databaseId", "sql"]
    ),
  },
  {
    name: "read_documents",
    description: "Read database-scoped Markdown documents, optionally filtered by filename or title.",
    inputSchema: objectSchema({
      databaseId: databaseIdProperty(),
      documentName: { type: "string", description: "Optional document id, filename, or title." },
    }, ["databaseId"]),
  },
  {
    name: "create_backup",
    description: "Create and verify a managed SQLite Hub backup using the existing backup mechanism.",
    inputSchema: objectSchema({
      databaseId: databaseIdProperty(),
      name: { type: "string" },
      notes: { type: "string" },
    }, ["databaseId"]),
  },
  {
    name: "generate_types",
    description: "Generate TypeScript, Rust, Kotlin, or Swift types from one table or all tables.",
    inputSchema: objectSchema(
      {
        databaseId: databaseIdProperty(),
        tableName: { type: "string", description: "Optional table name. Omit when allTables is true." },
        allTables: { type: "boolean", default: false },
        target: { type: "string", enum: ["typescript", "rust", "kotlin", "swift"] },
        options: { type: "object", additionalProperties: true },
      },
      ["databaseId", "target"]
    ),
  },
  {
    name: "create_chart_from_query",
    description: "Create a saved SQLite Hub chart from a read-only SELECT query without writing export files.",
    inputSchema: objectSchema(
      {
        databaseId: databaseIdProperty(),
        sql: { type: "string" },
        name: { type: "string" },
        chartType: { type: "string", enum: ["bar", "line", "pie", "scatter"] },
        config: { type: "object", additionalProperties: true },
        resultColumns: { type: "array", items: { type: "object", additionalProperties: true } },
        tableVisible: { type: "boolean", default: true },
      },
      ["databaseId", "sql", "chartType", "config"]
    ),
  },
];

function redactConnection(connection = {}) {
  return {
    id: connection.id,
    label: connection.label,
    readOnly: Boolean(connection.readOnly),
    sizeBytes: connection.sizeBytes ?? null,
    lastOpenedAt: connection.lastOpenedAt ?? null,
    lastModifiedAt: connection.lastModifiedAt ?? null,
  };
}

function redactOverview(overview = {}) {
  return {
    ...overview,
    connection: redactConnection(overview.connection ?? {}),
    file: {
      filename: overview.file?.filename ?? overview.connection?.label ?? null,
      sizeBytes: overview.file?.sizeBytes ?? null,
      lastModifiedAt: overview.file?.lastModifiedAt ?? null,
    },
  };
}

function summarizeBackup(backup = {}) {
  return {
    backupId: backup.id,
    id: backup.id,
    createdAt: backup.createdAt ?? null,
    databaseId: backup.connectionId ?? null,
    sizeBytes: backup.sizeBytes ?? null,
    verified: backup.status === "verified",
    status: backup.status,
    name: backup.name,
  };
}

class McpToolService {
  constructor({ databaseService, statusService } = {}) {
    this.databaseService = databaseService;
    this.statusService = statusService;
    this.toolDefinitions = MCP_TOOL_DEFINITIONS;
    this.toolNames = this.toolDefinitions.map((tool) => tool.name);
  }

  listTools() {
    return this.toolDefinitions;
  }

  requireTool(name) {
    const tool = this.toolDefinitions.find((definition) => definition.name === name);

    if (!tool) {
      throw new ValidationError(`Unknown MCP tool: ${name}`, { code: "MCP_TOOL_NOT_FOUND" });
    }

    return tool;
  }

  async callTool(name, args = {}) {
    this.requireTool(name);
    this.statusService?.markToolCall?.(name);

    try {
      switch (name) {
        case "list_connections":
          return {
            items: this.databaseService.listDatabases().map(redactConnection),
          };
        case "get_database_overview":
          return redactOverview(this.databaseService.getDatabaseOverview(args.databaseId));
        case "list_tables":
          return {
            items: this.databaseService.listTables(args.databaseId),
          };
        case "describe_table":
          return this.databaseService.getTable(args.databaseId, args.tableName);
        case "get_schema":
          return this.databaseService.getSchema(args.databaseId);
        case "get_indexes":
          return {
            items: this.databaseService.getIndexes(args.databaseId, args.tableName),
          };
        case "get_foreign_keys":
          return {
            items: this.databaseService.getForeignKeys(args.databaseId, args.tableName),
          };
        case "run_readonly_query":
          return this.databaseService.executeReadOnlyQuery(args.databaseId, args.sql, {
            executedBy: "mcp",
            maxRows: args.maxRows,
          });
        case "get_stored_queries":
          return this.databaseService.listSavedQueries(args.databaseId, args.limit);
        case "execute_stored_query":
          return this.databaseService.executeSavedQuery(args.databaseId, args.queryName, {
            executedBy: "mcp",
          });
        case "explain_query_plan":
          return this.databaseService.explainQueryPlan(args.databaseId, args.sql);
        case "read_documents":
          return this.databaseService.readDocuments(args.databaseId, args.documentName);
        case "create_backup":
          return summarizeBackup(
            await this.databaseService.createBackup(args.databaseId, {
              name: args.name,
              notes: args.notes,
              context: "mcp",
            })
          );
        case "generate_types":
          return this.databaseService.generateTypes(args.databaseId, {
            tableName: args.tableName,
            allTables: Boolean(args.allTables),
            target: args.target,
            options: args.options ?? {},
          });
        case "create_chart_from_query":
          return this.databaseService.createChartFromQuery(args.databaseId, {
            sql: args.sql,
            name: args.name,
            chartType: args.chartType,
            config: args.config,
            resultColumns: args.resultColumns,
            tableVisible: args.tableVisible,
          });
        default:
          throw new ValidationError(`Unknown MCP tool: ${name}`, { code: "MCP_TOOL_NOT_FOUND" });
      }
    } catch (error) {
      this.statusService?.markError?.(error);
      throw error;
    }
  }
}

module.exports = {
  MCP_TOOL_DEFINITIONS,
  McpToolService,
  redactConnection,
  redactOverview,
  summarizeBackup,
};
