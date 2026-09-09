const DEFAULT_MCP_STATUS = {
  enabled: true,
  serverRunning: false,
  connected: false,
  activeClientCount: 0,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastToolCallAt: null,
  lastToolName: null,
  transport: "unknown",
  exposedTools: [],
  error: null,
};

function normalizeToolNames(exposedTools = []) {
  return Array.from(
    new Set(
      (Array.isArray(exposedTools) ? exposedTools : [])
        .map((tool) => String(typeof tool === "string" ? tool : tool?.name ?? "").trim())
        .filter(Boolean)
    )
  );
}

class McpStatusService {
  constructor({ appStateStore, exposedTools = [], transport = "unknown" } = {}) {
    this.appStateStore = appStateStore;
    this.transport = transport;
    this.exposedTools = normalizeToolNames(exposedTools);
  }

  getDefaultStatus() {
    return {
      ...DEFAULT_MCP_STATUS,
      transport: this.transport,
      exposedTools: this.exposedTools,
    };
  }

  getStatus() {
    const status = this.appStateStore?.getMcpStatus?.(this.getDefaultStatus()) ?? this.getDefaultStatus();

    return {
      ...this.getDefaultStatus(),
      ...status,
      exposedTools: this.exposedTools.length ? this.exposedTools : normalizeToolNames(status.exposedTools),
    };
  }

  patchStatus(patch) {
    const nextStatus = this.appStateStore?.patchMcpStatus?.(
      {
        ...patch,
        exposedTools: this.exposedTools,
      },
      this.getDefaultStatus()
    ) ?? {
      ...this.getStatus(),
      ...patch,
      exposedTools: this.exposedTools,
    };

    return {
      ...this.getDefaultStatus(),
      ...nextStatus,
    };
  }

  markServerRunning() {
    return this.patchStatus({
      enabled: true,
      serverRunning: true,
      transport: this.transport,
      error: null,
    });
  }

  markConnected() {
    const current = this.getStatus();

    return this.patchStatus({
      enabled: true,
      serverRunning: true,
      connected: true,
      activeClientCount: Math.max(1, Number(current.activeClientCount ?? 0)),
      lastConnectedAt: new Date().toISOString(),
      transport: this.transport,
      error: null,
    });
  }

  markDisconnected() {
    const current = this.getStatus();
    const activeClientCount = Math.max(0, Number(current.activeClientCount ?? 0) - 1);

    return this.patchStatus({
      connected: activeClientCount > 0,
      serverRunning: activeClientCount > 0,
      activeClientCount,
      lastDisconnectedAt: new Date().toISOString(),
      transport: this.transport,
    });
  }

  markToolCall(toolName) {
    return this.patchStatus({
      enabled: true,
      serverRunning: true,
      connected: true,
      activeClientCount: Math.max(1, Number(this.getStatus().activeClientCount ?? 0)),
      lastToolCallAt: new Date().toISOString(),
      lastToolName: String(toolName ?? "") || null,
      transport: this.transport,
      error: null,
    });
  }

  markError(error) {
    return this.patchStatus({
      error: error?.message ?? String(error ?? "Unknown MCP error"),
      transport: this.transport,
    });
  }

  markRequestError(error, message = null) {
    const status = this.markError(error);
    const method = typeof message?.method === "string" ? message.method : null;
    const toolName = method === "tools/call" && typeof message?.params?.name === "string"
      ? message.params.name : null;
    const databaseId = method === "tools/call" && typeof message?.params?.arguments?.databaseId === "string"
      ? message.params.arguments.databaseId : null;

    // Log at the transport boundary so a tool failure creates one access entry.
    // Keep logging best effort, and avoid persisting request arguments.
    try {
      this.appStateStore?.recordAccessLog?.({
        source: "mcp",
        action: "mcp.request.error",
        databaseKey: databaseId,
        targetType: "mcp-method",
        targetName: method ?? "Invalid MCP message",
        status: "error",
        errorMessage: status.error,
        metadata: {
          transport: this.transport,
          method,
          requestId: typeof message?.id === "string" || typeof message?.id === "number" ? message.id : null,
          toolName,
          errorCode: error?.code ?? error?.name ?? "MCP_ERROR",
        },
      });
    } catch {
      // A logging failure must not replace the original MCP error response.
    }

    return status;
  }

  markStopped() {
    return this.patchStatus({
      serverRunning: false,
      connected: false,
      activeClientCount: 0,
      lastDisconnectedAt: new Date().toISOString(),
      transport: this.transport,
    });
  }
}

module.exports = {
  DEFAULT_MCP_STATUS,
  McpStatusService,
  normalizeToolNames,
};
