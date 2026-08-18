#!/usr/bin/env node
/**
 * MCP server for Google Tasks.
 *
 * Exposes four tools over stdio — create_tasklist, list_tasklists, add_task and
 * list_tasks — backed by the Google Tasks REST v1 API.
 *
 * Authentication uses an OAuth access token read from the environment or a
 * token file; see src/auth.ts. Nothing is logged to stdout, which stdio
 * transports reserve for protocol traffic.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerTaskListTools } from "./tools/tasklists.js";
import { registerTaskTools } from "./tools/tasks.js";
import { tokenFilePath } from "./auth.js";

const SERVER_NAME = "google-tasks-mcp-server";
const SERVER_VERSION = "1.0.0";

function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTaskListTools(server);
  registerTaskTools(server);
  return server;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    // Usage text goes to stdout only in this non-protocol mode.
    console.log(
      [
        `${SERVER_NAME} v${SERVER_VERSION}`,
        "",
        "An MCP server for Google Tasks, speaking the stdio transport.",
        "",
        "Tools: create_tasklist, list_tasklists, add_task, list_tasks",
        "",
        "Authentication (checked in this order):",
        "  GOOGLE_TASKS_ACCESS_TOKEN   OAuth access token",
        `  GOOGLE_TASKS_TOKEN_FILE     path to a file holding the token`,
        `                              (default: ${tokenFilePath()})`,
        "",
        "The token file is re-read on every request, so a refreshed token takes",
        "effect without restarting the server."
      ].join("\n")
    );
    return;
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

main().catch((error: unknown) => {
  console.error("Fatal error starting the server:", error);
  process.exit(1);
});
