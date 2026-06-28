const express = require("express");
const {
  createJsonRpcError,
  handleMcpRequest,
  MCP_PROTOCOL_VERSION,
} = require("./stdioServer");

function isJsonRpcBatch(message) {
  return Array.isArray(message);
}

async function handleHttpMcpMessage(message, services) {
  try {
    return await handleMcpRequest(message, services);
  } catch (error) {
    services.statusService?.markError?.(error);
    return createJsonRpcError(message?.id, error);
  }
}

async function handleHttpMcpBatch(messages, services) {
  const responses = await Promise.all(
    messages.map((message) => handleHttpMcpMessage(message, services))
  );

  return responses.filter(Boolean);
}

function createMcpHttpRouter({ services }) {
  if (!services?.toolService || !services?.statusService) {
    throw new Error("MCP HTTP router requires MCP services.");
  }

  const router = express.Router();

  services.statusService.markServerRunning();

  router.get("/", (req, res) => {
    res
      .set({
        Allow: "POST, OPTIONS",
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      })
      .status(405)
      .json({
        error: "SQLite Hub MCP uses Streamable HTTP POST requests.",
      });
  });

  router.options("/", (req, res) => {
    res
      .set({
        Allow: "POST, OPTIONS",
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      })
      .status(204)
      .end();
  });

  router.post("/", async (req, res) => {
    const message = req.body;

    res.set({
      "Content-Type": "application/json",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    });

    if (isJsonRpcBatch(message)) {
      const responses = await handleHttpMcpBatch(message, services);

      if (!responses.length) {
        res.status(202).end();
        return;
      }

      res.json(responses);
      return;
    }

    const response = await handleHttpMcpMessage(message, services);

    if (!response) {
      res.status(202).end();
      return;
    }

    res.json(response);
  });

  return router;
}

module.exports = {
  createMcpHttpRouter,
};
