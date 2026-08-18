/**
 * Read-only live check against the real Google Tasks account.
 *
 * Creates nothing. Confirms the configured token works end to end through the
 * MCP protocol: client -> stdio -> tool -> Google Tasks API.
 *
 * Run with: node scripts/live-check.mjs
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: [new URL("../dist/index.js", import.meta.url).pathname]
});

const client = new Client({ name: "live-check", version: "1.0.0" });
await client.connect(transport);

const result = await client.callTool({ name: "list_tasklists", arguments: {} });

if (result.isError) {
  console.error(result.content[0].text);
  await client.close();
  process.exit(1);
}

console.log(result.content[0].text);
console.log("\n--- structuredContent ---");
console.log(JSON.stringify(result.structuredContent, null, 2));

await client.close();
