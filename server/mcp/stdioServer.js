const path = require("node:path");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } = require("@modelcontextprotocol/sdk/types.js");
const { AppStateStore } = require("../services/storage/appStateStore");
const { DatabaseCommandService } = require("../services/databaseCommandService");
const { McpStatusService } = require("../services/mcpStatusService");
const { MCP_TOOL_DEFINITIONS, McpToolService } = require("../services/mcpToolService");
const { resolveAppStatePaths } = require("../utils/appPaths");

function createAppStateStore() {
  const packageRoot = path.resolve(__dirname, "../..");
  const { appStateDbPath, legacyStatePath, legacyDatabasePaths } = resolveAppStatePaths(packageRoot);
  return new AppStateStore(appStateDbPath, {
    legacyFilePath: legacyStatePath,
    legacyDatabasePaths,
  });
}

function createMcpServices({ appStateStore = createAppStateStore() } = {}) {
  const databaseService = new DatabaseCommandService({ appStateStore });
  const statusService = new McpStatusService({ appStateStore, exposedTools: MCP_TOOL_DEFINITIONS });
  const toolService = new McpToolService({ databaseService, statusService });
  return { appStateStore, databaseService, statusService, toolService };
}

function createMcpServer({ services }) {
  // The SDK's low-level Server accepts the existing JSON Schema tool definitions.
  const server = new Server(
    { name: "sqlite-hub", version: require("../../package.json").version },
    { capabilities: { tools: {} } }
  );
  const activeCalls = new Set();
  server.oninitialized = () => services.statusService.markConnected();
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: services.toolService.listTools() }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const call = Promise.resolve().then(() => services.toolService.callTool(request.params.name, request.params.arguments ?? {}));
    activeCalls.add(call);
    try {
      const result = await call;
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      const code = error?.code === "MCP_TOOL_NOT_FOUND" ? ErrorCode.MethodNotFound : ErrorCode.InternalError;
      throw new McpError(code, error.message, { code: error?.code ?? error?.name ?? "MCP_ERROR" });
    } finally {
      activeCalls.delete(call);
    }
  });
  server.fallbackRequestHandler = async (request) => {
    // Some clients probe resource discovery even though only tools are advertised.
    if (request.method === "resources/list") return { resources: [] };
    if (request.method === "resources/templates/list") return { resourceTemplates: [] };
    throw new McpError(ErrorCode.MethodNotFound, `Unsupported MCP method: ${request.method}`, { code: "MCP_METHOD_NOT_FOUND" });
  };
  return { server, activeCalls };
}

async function startMcpStdioServer({ input = process.stdin, output = process.stdout, diagnostics = process.stderr, services = createMcpServices() } = {}) {
  const { server, activeCalls } = createMcpServer({ services });
  const transport = new StdioServerTransport(input, output);
  const requests = new Map();
  let stopping = null;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });

  function reportError(error, request = null) {
    try {
      services.statusService.markRequestError(error, request);
    } catch {
      // Diagnostics still reach stderr if the state database is unavailable.
    }
    diagnostics.write(`SQLite Hub MCP error${request?.method ? ` (${request.method})` : ""}: ${error.message}\n`);
  }

  // Observe the SDK transport without implementing framing or JSON-RPC dispatch.
  // Only retain the context needed by the error log, never SQL or tool arguments.
  function finishRequest(id) {
    requests.get(id)?.resolve();
    requests.delete(id);
  }
  transport.onmessage = (message) => {
    if (message.method && message.id !== undefined) {
      let resolve;
      const done = new Promise((finished) => { resolve = finished; });
      requests.set(message.id, {
        done,
        resolve,
        message: {
          id: message.id,
          method: message.method,
          params: { name: message.params?.name, arguments: { databaseId: message.params?.arguments?.databaseId } },
        },
      });
    }
    if (message.method === "notifications/cancelled") finishRequest(message.params?.requestId);
  };
  const send = transport.send.bind(transport);
  transport.send = async (message) => {
    const isResponse = message.id !== undefined && !message.method;
    if (isResponse && message.error) {
      reportError(
        { message: message.error.message, code: message.error.data?.code ?? message.error.code },
        requests.get(message.id)?.message
      );
    }
    try {
      await send(message);
    } finally {
      if (isResponse) finishRequest(message.id);
    }
  };
  server.onerror = reportError;

  function stop() {
    if (stopping) return stopping;
    stopping = (async () => {
      input.off("end", onEnd);
      input.off("close", onEnd);
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      input.pause();
      // Drain responses as well as tool work; closing the SDK first would cancel replies.
      await Promise.allSettled([...requests.values()].map((request) => request.done));
      // A cancelled request may still have a queued tool callback in the SDK.
      await new Promise((resolve) => setImmediate(resolve));
      await Promise.allSettled([...activeCalls]);
      await server.close();
      output.off("error", onOutputError);
      requests.clear();
      try {
        services.statusService.markStopped();
      } finally {
        services.appStateStore?.db?.close?.();
      }
    })().finally(resolveClosed);
    return stopping;
  }
  function onEnd() { stop().catch(reportError); }
  function onSignal() { stop().catch(reportError); }
  function onTransportClosed() {
    for (const id of requests.keys()) finishRequest(id);
    onEnd();
  }
  function onOutputError(error) { reportError(error); onTransportClosed(); }
  server.onclose = onTransportClosed;
  input.once("end", onEnd);
  input.once("close", onEnd);
  output.on("error", onOutputError);
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    services.statusService.markServerRunning();
    await server.connect(transport);
    if (input.readableEnded || input.destroyed) await stop();
  } catch (error) {
    reportError(error);
    await stop();
    throw error;
  }
  return { server, services, stop, closed };
}

module.exports = { createAppStateStore, createMcpServices, createMcpServer, startMcpStdioServer };
