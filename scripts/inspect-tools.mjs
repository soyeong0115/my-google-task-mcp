import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/Users/soyeong/my-google-task-mcp/dist/index.js"],
  env: { ...process.env, GOOGLE_TASKS_ACCESS_TOKEN: "dummy-token-for-schema-check" }
});

const client = new Client({ name: "smoke-test", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`\n=== ${tools.length} tools ===\n`);
for (const t of tools) {
  const required = t.inputSchema?.required ?? [];
  const props = Object.keys(t.inputSchema?.properties ?? {});
  console.log(`${t.name}  (name length: ${t.name.length})`);
  console.log(`  title: ${t.title ?? "(none)"}`);
  console.log(`  annotations: ${JSON.stringify(t.annotations ?? {})}`);
  console.log(`  input props: ${props.join(", ") || "(none)"}`);
  console.log(`  required: ${required.join(", ") || "(none)"}`);
  console.log(`  outputSchema: ${t.outputSchema ? "yes" : "no"}`);
  console.log(`  description: ${t.description?.length ?? 0} chars`);
  console.log();
}

// Verify error path is clean (dummy token -> 401 with actionable message)
const res = await client.callTool({ name: "list_tasklists", arguments: {} });
console.log("=== list_tasklists with a bad token ===");
console.log("isError:", res.isError);
console.log(res.content[0].text);

await client.close();
