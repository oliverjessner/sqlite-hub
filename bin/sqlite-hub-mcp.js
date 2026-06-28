#!/usr/bin/env node

const { startMcpStdioServer } = require("../server/mcp/stdioServer");

startMcpStdioServer().catch((error) => {
  process.stderr.write(`SQLite Hub MCP failed to start: ${error.message}\n`);
  process.exitCode = 1;
});
