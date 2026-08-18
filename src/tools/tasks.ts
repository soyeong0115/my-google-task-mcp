/** Task tools: add_task and list_tasks. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getTaskList, insertTask, listTasks } from "../services/tasksApi.js";
import { normalizeDueBound, normalizeDueDate } from "../services/dates.js";
import { tasksToMarkdown, toTaskView, withCharacterLimit, type TaskView } from "../services/format.js";
import { errorResult, successResult } from "./result.js";

const taskShape = {
  id: z.string().describe("Task identifier"),
  title: z.string().describe("Task title"),
  status: z.string().describe('"needsAction" or "completed"'),
  completed: z.boolean().describe("True when the task is completed"),
  notes: z.string().optional().describe("Free-text notes attached to the task"),
  due: z.string().optional().describe("Due date as YYYY-MM-DD"),
  parent: z.string().optional().describe("Id of the parent task when this is a subtask"),
  web_view_link: z.string().optional().describe("Link to the task in the Google Tasks UI")
};

/** Resolves a list title for display, falling back to the id if it cannot be read. */
async function resolveListTitle(taskListId: string): Promise<string> {
  try {
    const list = await getTaskList(taskListId);
    return list.title;
  } catch {
    return taskListId;
  }
}

export function registerTaskTools(server: McpServer): void {
  server.registerTool(
    "add_task",
    {
      title: "Add a task to a Google Tasks list",
      description: `Add a task to a specific Google Tasks list, optionally as a subtask of an existing task.

This writes to the user's real Google Tasks account, so the task appears in their Google Tasks app immediately.

Args:
  - tasklist_id (string, required): Id of the list to add to. Get it from list_tasklists — this is the id, not the list's display name.
  - title (string, required): The task title, e.g. "Book a dentist appointment".
  - notes (string, optional): Longer free-text detail shown under the title.
  - due (string, optional): Due date as YYYY-MM-DD (e.g. "2026-08-19") or a full RFC 3339 timestamp. IMPORTANT: Google Tasks stores the DATE ONLY — any time of day is discarded, so a task cannot be given a specific time through this API.
  - parent_task_id (string, optional): Id of an existing task in the SAME list. When given, the new task is created as a subtask nested under that task. Get candidate ids from list_tasks.

Returns:
  {
    "id": string,             // Id of the newly created task
    "title": string,
    "status": string,         // "needsAction" for a new task
    "completed": boolean,     // false for a new task
    "notes": string,          // optional, present only if set
    "due": string,            // optional, YYYY-MM-DD as stored by Google
    "parent": string,         // optional, present only when created as a subtask
    "web_view_link": string   // optional, link to the task in the Google Tasks UI
  }

Examples:
  - Use when: "Add 'buy milk' to my Groceries list" -> tasklist_id=<Groceries id>, title="buy milk"
  - Use when: "Remind me to book a dentist appointment tomorrow" -> title="Book a dentist appointment", due="2026-08-19"
  - Use when: "Under 'Trip planning', add a subtask 'book flights'" -> parent_task_id=<id of "Trip planning" task>, title="book flights"
  - Don't use when: You need to create a whole new list (use create_tasklist instead)
  - Don't use when: You want to read existing tasks (use list_tasks instead)

Notes:
  - Subtasks nest one level only, and the parent must live in the same task list.
  - If the user names a list rather than giving an id, call list_tasklists first to resolve it.

Error Handling:
  - "Not found (404)" — the tasklist_id does not exist; call list_tasklists for valid ids.
  - "Bad request (400)" — usually an unparseable due date, or a parent_task_id from a different list.
  - "Authentication failed (401)" — the access token is missing or expired; a fresh one is needed.`,
      inputSchema: {
        tasklist_id: z
          .string()
          .trim()
          .min(1, "tasklist_id must not be empty")
          .describe("Id of the task list to add the task to (from list_tasklists)"),
        title: z
          .string()
          .trim()
          .min(1, "title must not be empty")
          .max(1024, "title must not exceed 1024 characters")
          .describe('Title of the task, e.g. "Book a dentist appointment"'),
        notes: z
          .string()
          .max(8192, "notes must not exceed 8192 characters")
          .optional()
          .describe("Optional free-text detail shown under the task title"),
        due: z
          .string()
          .optional()
          .describe(
            'Optional due date as YYYY-MM-DD (e.g. "2026-08-19") or RFC 3339. Google stores the date only; the time is discarded'
          ),
        parent_task_id: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "Optional id of an existing task in the same list; the new task becomes a subtask of it"
          )
      },
      outputSchema: taskShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async ({ tasklist_id, title, notes, due, parent_task_id }) => {
      try {
        const created = await insertTask({
          taskListId: tasklist_id,
          title,
          notes,
          due: due === undefined ? undefined : normalizeDueDate(due),
          parentTaskId: parent_task_id
        });

        const view = toTaskView(created);
        const parts = [`Added task "${view.title}" (id: ${view.id})`];
        if (view.due) parts.push(`due ${view.due}`);
        if (view.parent) parts.push(`as a subtask of ${view.parent}`);
        return successResult(`${parts.join(", ")}.`, { ...view });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks in a Google Tasks list",
      description: `List the tasks inside one Google Tasks list, with optional filtering by due date and completion state.

Read-only: this never changes anything. Subtasks are returned alongside their parents and carry a "parent" field pointing at the parent task's id.

Args:
  - tasklist_id (string, required): Id of the list to read. Get it from list_tasklists.
  - due_min (string, optional): Only tasks due ON OR AFTER this date, inclusive. YYYY-MM-DD or RFC 3339 (any time of day is ignored — only the date matters).
  - due_max (string, optional): Only tasks due ON OR BEFORE this date, inclusive. YYYY-MM-DD or RFC 3339. Setting due_min and due_max to the same date returns exactly that day's tasks.
  - show_completed (boolean, optional): Include completed tasks. Default false, so only open tasks come back.
  - show_hidden (boolean, optional): Include hidden tasks. Defaults to the value of show_completed, because tasks completed in the Google Tasks app are also marked hidden and would otherwise be missing even with show_completed=true.
  - max_results (number, optional): Tasks per page, 1-100. Default 50.
  - page_token (string, optional): Token from a previous response's next_page_token to fetch the next page.

Returns:
  {
    "tasklist_id": string,      // The list that was read
    "tasklist_title": string,   // Its display name
    "count": number,            // Number of tasks in this response
    "items": [
      {
        "id": string,
        "title": string,
        "status": string,       // "needsAction" or "completed"
        "completed": boolean,
        "notes": string,        // optional
        "due": string,          // optional, YYYY-MM-DD
        "parent": string,       // optional, present when the task is a subtask
        "web_view_link": string // optional
      }
    ],
    "has_more": boolean,        // True when another page is available
    "next_page_token": string,  // optional, pass as page_token to get the next page
    "truncated": boolean,       // optional, true if the response was trimmed to fit
    "truncation_message": string
  }

Examples:
  - Use when: "What's on my Groceries list?" -> tasklist_id=<Groceries id>
  - Use when: "What's due this week?" -> due_min="2026-08-17", due_max="2026-08-23"
  - Use when: "Show everything including what I've already done" -> show_completed=true
  - Don't use when: You need the list of lists themselves (use list_tasklists instead)

Notes:
  - Tasks with no due date at all are excluded whenever due_min or due_max is set — that is how the Google API filters.
  - If the user names a list rather than giving an id, call list_tasklists first to resolve it.

Error Handling:
  - "Not found (404)" — the tasklist_id does not exist; call list_tasklists for valid ids.
  - "Bad request (400)" — usually an unparseable due_min/due_max value.
  - "Authentication failed (401)" — the access token is missing or expired; a fresh one is needed.`,
      inputSchema: {
        tasklist_id: z
          .string()
          .trim()
          .min(1, "tasklist_id must not be empty")
          .describe("Id of the task list to read (from list_tasklists)"),
        due_min: z
          .string()
          .optional()
          .describe("Only tasks due on or after this date (YYYY-MM-DD or RFC 3339)"),
        due_max: z
          .string()
          .optional()
          .describe("Only tasks due on or before this date (YYYY-MM-DD or RFC 3339)"),
        show_completed: z
          .boolean()
          .optional()
          .describe("Include completed tasks (default false)"),
        show_hidden: z
          .boolean()
          .optional()
          .describe("Include hidden tasks (defaults to the value of show_completed)"),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Tasks per page, 1-100 (default 50)"),
        page_token: z
          .string()
          .optional()
          .describe("Token from a previous response's next_page_token")
      },
      outputSchema: {
        tasklist_id: z.string().describe("The list that was read"),
        tasklist_title: z.string().describe("Display name of the list"),
        count: z.number().int().describe("Number of tasks in this response"),
        items: z.array(z.object(taskShape)).describe("The tasks"),
        has_more: z.boolean().describe("True when another page is available"),
        next_page_token: z
          .string()
          .optional()
          .describe("Pass as page_token to fetch the next page"),
        truncated: z.boolean().optional().describe("True if the response was trimmed to fit"),
        truncation_message: z.string().optional().describe("Explains any truncation")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ tasklist_id, due_min, due_max, show_completed, show_hidden, max_results, page_token }) => {
      try {
        const showCompleted = show_completed ?? false;
        // Tasks completed in Google's own apps are also flagged hidden, so
        // showCompleted alone would silently omit them.
        const showHidden = show_hidden ?? showCompleted;

        const [{ tasks, nextPageToken }, tasklistTitle] = await Promise.all([
          listTasks({
            taskListId: tasklist_id,
            dueMin: due_min === undefined ? undefined : normalizeDueBound(due_min, "min"),
            dueMax: due_max === undefined ? undefined : normalizeDueBound(due_max, "max"),
            showCompleted,
            showHidden,
            maxResults: max_results ?? 50,
            pageToken: page_token
          }),
          resolveListTitle(tasklist_id)
        ]);

        const items: TaskView[] = tasks.map(toTaskView);
        const payload = {
          tasklist_id,
          tasklist_title: tasklistTitle,
          count: items.length,
          items,
          has_more: nextPageToken !== undefined,
          ...(nextPageToken ? { next_page_token: nextPageToken } : {})
        };

        const { text, payload: finalPayload } = withCharacterLimit(payload, (current) =>
          tasksToMarkdown(current.items, current.tasklist_title)
        );

        return successResult(text, { ...finalPayload });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
