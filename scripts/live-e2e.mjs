/**
 * End-to-end live test against the real Google Tasks account.
 *
 * WRITES REAL DATA: creates one task list and three tasks (one of them a
 * subtask). Everything it makes is reported at the end so it can be removed.
 *
 * The point of the subtask step is to prove the `parent` query-parameter
 * handling works against the real API — sending `parent` in the body would also
 * return 200 here, but the task would come back with no parent at all.
 *
 * Run with: node scripts/live-e2e.mjs
 */

import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: [new URL("../dist/index.js", import.meta.url).pathname]
});

const client = new Client({ name: "live-e2e", version: "1.0.0" });
await client.connect(transport);

/** Calls a tool and fails loudly if it returned an error result. */
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    throw new Error(`${name} failed: ${result.content[0].text}`);
  }
  return result;
}

const TOMORROW = "2026-08-19";
const created = [];

try {
  // 1. Create a list.
  const listRes = await call("create_tasklist", { title: "MCP 실습" });
  const listId = listRes.structuredContent.id;
  created.push(`task list "MCP 실습" (${listId})`);
  console.log("1. create_tasklist ->", listRes.content[0].text);

  // 2. Add a task with a due date.
  const hospital = await call("add_task", {
    tasklist_id: listId,
    title: "병원 예약",
    notes: "오전 중으로",
    due: TOMORROW
  });
  console.log("2. add_task (due) ->", hospital.content[0].text);
  assert.equal(
    hospital.structuredContent.due,
    TOMORROW,
    "due date should round-trip as the same calendar day"
  );

  // 3. Add a parent task.
  const trip = await call("add_task", { tasklist_id: listId, title: "여행 준비" });
  const tripId = trip.structuredContent.id;
  console.log("3. add_task (parent) ->", trip.content[0].text);

  // 4. Add a subtask -- the critical check.
  const flight = await call("add_task", {
    tasklist_id: listId,
    title: "항공권 예약",
    parent_task_id: tripId
  });
  console.log("4. add_task (subtask) ->", flight.content[0].text);
  assert.equal(
    flight.structuredContent.parent,
    tripId,
    "subtask must come back with parent set -- if this is undefined, `parent` was " +
      "sent in the body (Output only) instead of on the query string"
  );

  // 5. Read it all back.
  const all = await call("list_tasks", { tasklist_id: listId });
  console.log("\n5. list_tasks ->");
  console.log(all.content[0].text);
  assert.equal(all.structuredContent.count, 3, "should see all three tasks");

  const subtask = all.structuredContent.items.find((t) => t.id === flight.structuredContent.id);
  assert.equal(subtask.parent, tripId, "subtask should still report its parent when listed");

  // 6. Filter by due date.
  const dueTomorrow = await call("list_tasks", {
    tasklist_id: listId,
    due_min: TOMORROW,
    due_max: TOMORROW
  });
  console.log("\n6. list_tasks filtered to", TOMORROW, "->");
  console.log(dueTomorrow.content[0].text);
  assert.equal(dueTomorrow.structuredContent.count, 1, "only 병원 예약 is due tomorrow");
  assert.equal(dueTomorrow.structuredContent.items[0].title, "병원 예약");

  // 7. A window that matches nothing.
  const empty = await call("list_tasks", {
    tasklist_id: listId,
    due_min: "2020-01-01",
    due_max: "2020-01-02"
  });
  assert.equal(empty.structuredContent.count, 0, "old window should match nothing");
  console.log("\n7. empty window ->", empty.content[0].text);

  console.log("\nAll live checks passed.");
} finally {
  console.log("\nCreated in the real account:");
  for (const item of created) console.log(`  - ${item}`);
  await client.close();
}
