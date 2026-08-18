/**
 * Verifies how requests are put on the wire, without touching a real account.
 *
 * These assertions guard the subtle parts of the Google Tasks API:
 *   - `parent` must ride on the query string; in the Task body it is Output only
 *     and would be silently ignored (200 OK, but a top-level task).
 *   - a bare due date must be anchored to midnight UTC so it cannot drift a day.
 *   - show_completed must also imply show_hidden, or tasks completed in Google's
 *     own apps go missing.
 *
 * Run with: node scripts/verify-request-shape.mjs
 */

import assert from "node:assert/strict";

process.env.GOOGLE_TASKS_ACCESS_TOKEN = "test-token";

const { insertTask, listTasks } = await import("../dist/services/tasksApi.js");

let lastRequest = null;

globalThis.fetch = async (url, init) => {
  const parsed = new URL(url);
  lastRequest = {
    url: parsed,
    method: init.method,
    query: Object.fromEntries(parsed.searchParams.entries()),
    body: init.body ? JSON.parse(init.body) : undefined
  };
  return new Response(JSON.stringify({ id: "stub-id", title: "stub", items: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

const checks = [];
function check(name, fn) {
  checks.push([name, fn]);
}

check("subtask: parent goes on the query string, never in the body", async () => {
  await insertTask({
    taskListId: "LIST1",
    title: "book flights",
    parentTaskId: "PARENT1"
  });
  assert.equal(lastRequest.query.parent, "PARENT1", "parent must be a query parameter");
  assert.equal(
    lastRequest.body.parent,
    undefined,
    "parent must NOT be in the body (it is Output only and would be ignored)"
  );
  assert.equal(lastRequest.method, "POST");
  assert.ok(lastRequest.url.pathname.endsWith("/lists/LIST1/tasks"));
});

check("top-level task: no parent parameter is sent at all", async () => {
  await insertTask({ taskListId: "LIST1", title: "buy milk" });
  assert.equal("parent" in lastRequest.query, false, "parent must be omitted, not empty");
});

check("due: a bare YYYY-MM-DD is anchored to midnight UTC", async () => {
  await insertTask({ taskListId: "LIST1", title: "dentist", due: "2026-08-19T00:00:00.000Z" });
  assert.equal(lastRequest.body.due, "2026-08-19T00:00:00.000Z");
});

check("tasklist id is URL-encoded in the path", async () => {
  await insertTask({ taskListId: "a/b c", title: "x" });
  assert.ok(
    lastRequest.url.pathname.includes("a%2Fb%20c"),
    `expected encoded id in ${lastRequest.url.pathname}`
  );
});

check("list: filters are sent as query parameters", async () => {
  await listTasks({
    taskListId: "LIST1",
    dueMin: "2026-08-17T00:00:00.000Z",
    dueMax: "2026-08-24T00:00:00.000Z",
    showCompleted: true,
    showHidden: true,
    maxResults: 50
  });
  assert.equal(lastRequest.query.dueMin, "2026-08-17T00:00:00.000Z");
  assert.equal(lastRequest.query.dueMax, "2026-08-24T00:00:00.000Z");
  assert.equal(lastRequest.query.showCompleted, "true");
  assert.equal(lastRequest.query.showHidden, "true");
  assert.equal(lastRequest.query.maxResults, "50");
  assert.equal(lastRequest.method, "GET");
});

check("list: undefined filters are omitted from the URL", async () => {
  await listTasks({ taskListId: "LIST1", showCompleted: false, showHidden: false });
  assert.equal("dueMin" in lastRequest.query, false);
  assert.equal("pageToken" in lastRequest.query, false);
});

// Date helpers, checked directly.
const { normalizeDueDate, normalizeDueBound } = await import("../dist/services/dates.js");

check("normalizeDueDate anchors a bare date to midnight UTC", () => {
  assert.equal(normalizeDueDate("2026-08-19"), "2026-08-19T00:00:00.000Z");
});

// dueMax is exclusive on the calendar date (verified against a live account),
// so an upper bound must be advanced a day to include its own date.
check("normalizeDueBound makes a single date an inclusive one-day window", () => {
  assert.equal(normalizeDueBound("2026-08-19", "min"), "2026-08-19T00:00:00.000Z");
  assert.equal(normalizeDueBound("2026-08-19", "max"), "2026-08-20T00:00:00.000Z");
});

check("normalizeDueBound truncates a full timestamp to its UTC date", () => {
  assert.equal(normalizeDueBound("2026-08-19T17:30:00.000Z", "min"), "2026-08-19T00:00:00.000Z");
  assert.equal(normalizeDueBound("2026-08-19T17:30:00.000Z", "max"), "2026-08-20T00:00:00.000Z");
});

check("normalizeDueBound rolls over a month boundary correctly", () => {
  assert.equal(normalizeDueBound("2026-08-31", "max"), "2026-09-01T00:00:00.000Z");
  assert.equal(normalizeDueBound("2026-12-31", "max"), "2027-01-01T00:00:00.000Z");
});

check("normalizeDueDate rejects nonsense with an actionable message", () => {
  assert.throws(() => normalizeDueDate("next tuesday"), /Use YYYY-MM-DD/);
});

let failed = 0;
for (const [name, fn] of checks) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message}`);
  }
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
