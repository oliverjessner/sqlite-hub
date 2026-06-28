const path = require("node:path");
const { AppStateStore } = require("../services/storage/appStateStore");
const { DatabaseCommandService } = require("../services/databaseCommandService");
const { McpStatusService } = require("../services/mcpStatusService");
const { MCP_TOOL_DEFINITIONS, McpToolService } = require("../services/mcpToolService");
const { resolveAppStatePaths } = require("../utils/appPaths");

const MCP_PROTOCOL_VERSION = "2024-11-05";

function createAppStateStore() {
  const packageRoot = path.resolve(__dirname, "../..");
  const {
    appStateDbPath,
    legacyStatePath,
    legacyDatabasePaths,
  } = resolveAppStatePaths(packageRoot);

  return new AppStateStore(appStateDbPath, {
    legacyFilePath: legacyStatePath,
    legacyDatabasePaths,
  });
}

function createMcpServices({ appStateStore = createAppStateStore(), transport = "stdio" } = {}) {
  const databaseService = new DatabaseCommandService({ appStateStore });
  const statusService = new McpStatusService({
    appStateStore,
    exposedTools: MCP_TOOL_DEFINITIONS,
    transport,
  });
  const toolService = new McpToolService({
    databaseService,
    statusService,
  });

  return {
    appStateStore,
    databaseService,
    statusService,
    toolService,
  };
}

function createJsonRpcResult(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function createJsonRpcError(id, error) {
  const code = error?.code === "MCP_TOOL_NOT_FOUND" ? -32601 : -32603;

  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message: error?.message ?? "MCP request failed.",
      data: {
        code: error?.code ?? error?.name ?? "MCP_ERROR",
      },
    },
  };
}

async function handleMcpRequest(message, services) {
  const { id, method, params = {} } = message ?? {};

  if (!method) {
    throw new Error("MCP JSON-RPC method is required.");
  }

  if (method === "initialize") {
    services.statusService.markConnected();

    return createJsonRpcResult(id, {
      protocolVersion: params.protocolVersion || MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "sqlite-hub",
        version: require("../../package.json").version,
      },
    });
  }

  if (method === "notifications/initialized") {
    services.statusService.markConnected();
    return null;
  }

  if (method === "ping") {
    return createJsonRpcResult(id, {});
  }

  if (method === "tools/list") {
    return createJsonRpcResult(id, {
      tools: services.toolService.listTools(),
    });
  }

  if (method === "tools/call") {
    const result = await services.toolService.callTool(params.name, params.arguments ?? {});

    return createJsonRpcResult(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      structuredContent: result,
    });
  }

  if (method === "shutdown") {
    services.statusService.markStopped();
    return createJsonRpcResult(id, {});
  }

  const error = new Error(`Unsupported MCP method: ${method}`);
  error.code = "MCP_METHOD_NOT_FOUND";
  throw error;
}

function encodeMessage(message) {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
}

function tryReadFramedMessage(buffer) {
  const headerSeparator = buffer.indexOf("\r\n\r\n");

  if (headerSeparator === -1) {
    return null;
  }

  const header = buffer.slice(0, headerSeparator).toString("ascii");
  const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);

  if (!lengthMatch) {
    throw new Error("MCP stdio message is missing Content-Length.");
  }

  const contentLength = Number(lengthMatch[1]);
  const bodyStart = headerSeparator + 4;
  const bodyEnd = bodyStart + contentLength;

  if (buffer.length < bodyEnd) {
    return null;
  }

  const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");

  return {
    message: JSON.parse(body),
    rest: buffer.slice(bodyEnd),
  };
}

function tryReadLineMessage(buffer) {
  if (/^Content-Length:/i.test(buffer.slice(0, Math.min(buffer.length, 32)).toString("ascii"))) {
    return null;
  }

  const newlineIndex = buffer.indexOf("\n");

  if (newlineIndex === -1) {
    return null;
  }

  const line = buffer.slice(0, newlineIndex).toString("utf8").trim();

  if (!line) {
    return {
      message: null,
      rest: buffer.slice(newlineIndex + 1),
    };
  }

  return {
    message: JSON.parse(line),
    rest: buffer.slice(newlineIndex + 1),
  };
}

async function startMcpStdioServer({ input = process.stdin, output = process.stdout, services = createMcpServices() } = {}) {
  let buffer = Buffer.alloc(0);
  let stopped = false;

  services.statusService.markServerRunning();

  async function processMessage(message) {
    if (!message) {
      return;
    }

    try {
      const response = await handleMcpRequest(message, services);

      if (response && message.id !== undefined) {
        output.write(encodeMessage(response));
      }
    } catch (error) {
      services.statusService.markError(error);

      if (message.id !== undefined) {
        output.write(encodeMessage(createJsonRpcError(message.id, error)));
      }
    }
  }

  async function drainBuffer() {
    while (buffer.length) {
      const framed = tryReadFramedMessage(buffer) ?? tryReadLineMessage(buffer);

      if (!framed) {
        return;
      }

      buffer = framed.rest;
      await processMessage(framed.message);
    }
  }

  input.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    drainBuffer().catch((error) => {
      services.statusService.markError(error);
      process.stderr.write(`SQLite Hub MCP error: ${error.message}\n`);
    });
  });

  function stop() {
    if (stopped) {
      return;
    }

    stopped = true;
    services.statusService.markStopped();
    services.appStateStore?.db?.close?.();
  }

  input.on("end", stop);
  process.once("SIGINT", () => {
    stop();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    stop();
    process.exit(0);
  });

  return {
    services,
    stop,
  };
}

module.exports = {
  MCP_PROTOCOL_VERSION,
  createAppStateStore,
  createMcpServices,
  createJsonRpcError,
  createJsonRpcResult,
  encodeMessage,
  handleMcpRequest,
  startMcpStdioServer,
};
