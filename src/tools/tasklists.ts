/** Task-list tools: create_tasklist and list_tasklists. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createTaskList, listAllTaskLists } from "../services/tasksApi.js";
import { taskListsToMarkdown, toTaskListView } from "../services/format.js";
import { errorResult, successResult } from "./result.js";

const taskListShape = {
  id: z.string().describe("Task list identifier, used as tasklist_id in the task tools"),
  title: z.string().describe("Display name of the task list"),
  updated: z.string().optional().describe("RFC 3339 timestamp of the last modification")
};

export function registerTaskListTools(server: McpServer): void {
  server.registerTool(
    "create_tasklist",
    {
      title: "Create a Google Tasks task list",
      description: `Create a new task list in the authenticated user's Google Tasks account.

A task list is the top-level container that holds tasks — the named lists shown in the Google Tasks app and sidebar (for example "My Tasks", "Groceries", "Work"). This creates a real list on the user's own Google account.

Args:
  - title (string, required): Name for the new task list, 1-1024 characters (e.g. "Groceries").

Returns:
  {
    "id": string,       // Identifier of the new list; pass this as tasklist_id to add_task / list_tasks
    "title": string,    // Name as stored by Google
    "updated": string   // RFC 3339 timestamp of creation (optional)
  }

Examples:
  - Use when: "Make a new list called Groceries" -> title="Groceries"
  - Use when: "I need somewhere to track my trip planning" -> title="Trip planning"
  - Don't use when: You want to add a task to an existing list (use add_task instead)
  - Don't use when: You only want to see which lists exist (use list_tasklists instead)

Notes:
  - Titles are not required to be unique; calling this twice with the same title creates two separate lists. Call list_tasklists first if you need to reuse an existing list.
  - A user can hold up to 2000 task lists.

Error Handling:
  - "Authentication failed (401)" — the access token is missing or expired; a fresh one is needed.
  - "Permission denied (403)" — the token lacks the Google Tasks scope.`,
      inputSchema: {
        title: z
          .string()
          .trim()
          .min(1, "title must not be empty")
          .max(1024, "title must not exceed 1024 characters")
          .describe('Name for the new task list, e.g. "Groceries"')
      },
      outputSchema: taskListShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async ({ title }) => {
      try {
        const created = await createTaskList(title);
        const view = toTaskListView(created);
        const text = `Created task list "${view.title}" (id: ${view.id}).`;
        return successResult(text, { ...view });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "list_tasklists",
    {
      title: "List Google Tasks task lists",
      description: `List all task lists in the authenticated user's Google Tasks account.

Use this to discover the tasklist_id values that add_task and list_tasks require. It is read-only and changes nothing. All lists are returned — pagination is handled internally, so there is no page token to follow.

Args:
  (none)

Returns:
  {
    "count": number,          // Number of task lists returned
    "items": [
      {
        "id": string,         // Task list identifier; pass as tasklist_id to the task tools
        "title": string,      // Display name, e.g. "My Tasks"
        "updated": string     // RFC 3339 timestamp of last modification (optional)
      }
    ]
  }

Examples:
  - Use when: "What task lists do I have?"
  - Use when: You were given a list name like "Groceries" and need its id before calling add_task or list_tasks.
  - Don't use when: You need the tasks inside a list (use list_tasks instead)

Notes:
  - Every account has a default list, usually titled "My Tasks". If the user does not name a list, that is the sensible default.
  - Returns an empty items array with a message if the account has no lists.

Error Handling:
  - "Authentication failed (401)" — the access token is missing or expired; a fresh one is needed.
  - "Permission denied (403)" — the token lacks the Google Tasks scope.`,
      inputSchema: {},
      outputSchema: {
        count: z.number().int().describe("Number of task lists returned"),
        items: z.array(z.object(taskListShape)).describe("The user's task lists")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async () => {
      try {
        const lists = (await listAllTaskLists()).map(toTaskListView);
        const payload = { count: lists.length, items: lists };
        return successResult(taskListsToMarkdown(lists), payload);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
