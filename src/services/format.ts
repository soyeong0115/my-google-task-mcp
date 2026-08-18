/** Shared response shaping: format selection, projection, and truncation. */

import { CHARACTER_LIMIT } from "../constants.js";
import { formatDueDate } from "./dates.js";
import type { Task, TaskList } from "../types.js";

/** Output format supported by every read tool. */
export const RESPONSE_FORMATS = ["markdown", "json"] as const;
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

/** A task list projected down to the fields an agent actually needs. */
export interface TaskListView {
  id: string;
  title: string;
  updated?: string;
}

/** A task projected down to the fields an agent actually needs. */
export interface TaskView {
  id: string;
  title: string;
  status: string;
  completed: boolean;
  notes?: string;
  due?: string;
  parent?: string;
  web_view_link?: string;
}

export function toTaskListView(list: TaskList): TaskListView {
  return {
    id: list.id,
    title: list.title,
    ...(list.updated ? { updated: list.updated } : {})
  };
}

export function toTaskView(task: Task): TaskView {
  const due = formatDueDate(task.due);
  return {
    id: task.id,
    title: task.title ?? "(untitled)",
    status: task.status ?? "needsAction",
    completed: task.status === "completed",
    ...(task.notes ? { notes: task.notes } : {}),
    ...(due ? { due } : {}),
    ...(task.parent ? { parent: task.parent } : {}),
    ...(task.webViewLink ? { web_view_link: task.webViewLink } : {})
  };
}

/** Renders task lists as Markdown. */
export function taskListsToMarkdown(lists: TaskListView[]): string {
  if (lists.length === 0) {
    return "No task lists found. Use create_tasklist to make one.";
  }
  const lines = [`# Task lists (${lists.length})`, ""];
  for (const list of lists) {
    lines.push(`- **${list.title}** — \`${list.id}\``);
  }
  return lines.join("\n");
}

/**
 * Renders tasks as Markdown, nesting subtasks under their parent.
 *
 * Parents are matched within the returned page only; a subtask whose parent is
 * absent is rendered at the top level so nothing is silently dropped.
 */
export function tasksToMarkdown(tasks: TaskView[], listTitle: string): string {
  if (tasks.length === 0) {
    return `No tasks found in "${listTitle}" matching the given filters.`;
  }

  const byParent = new Map<string, TaskView[]>();
  const present = new Set(tasks.map((task) => task.id));
  const roots: TaskView[] = [];

  for (const task of tasks) {
    if (task.parent && present.has(task.parent)) {
      const siblings = byParent.get(task.parent) ?? [];
      siblings.push(task);
      byParent.set(task.parent, siblings);
    } else {
      roots.push(task);
    }
  }

  const lines = [`# Tasks in "${listTitle}" (${tasks.length})`, ""];

  const render = (task: TaskView, depth: number): void => {
    const indent = "  ".repeat(depth);
    const box = task.completed ? "[x]" : "[ ]";
    const suffix: string[] = [];
    if (task.due) suffix.push(`due ${task.due}`);
    suffix.push(`\`${task.id}\``);
    lines.push(`${indent}- ${box} ${task.title} — ${suffix.join(", ")}`);
    if (task.notes) {
      lines.push(`${indent}  > ${task.notes.replace(/\n/g, `\n${indent}  > `)}`);
    }
    for (const child of byParent.get(task.id) ?? []) {
      render(child, depth + 1);
    }
  };

  for (const root of roots) {
    render(root, 0);
  }
  return lines.join("\n");
}

/**
 * Serializes a payload for the text channel, trimming oversized item arrays.
 *
 * Returns the text to send plus the (possibly trimmed) structured payload, so
 * both channels stay consistent.
 */
export function withCharacterLimit<T extends { items: unknown[] }>(
  payload: T,
  renderText: (payload: T) => string
): { text: string; payload: T & { truncated?: boolean; truncation_message?: string } } {
  let text = renderText(payload);
  if (text.length <= CHARACTER_LIMIT) {
    return { text, payload };
  }

  const originalCount = payload.items.length;
  let kept = payload.items;
  let trimmed = { ...payload };

  while (text.length > CHARACTER_LIMIT && kept.length > 1) {
    kept = kept.slice(0, Math.max(1, Math.floor(kept.length / 2)));
    trimmed = {
      ...payload,
      items: kept,
      count: kept.length,
      truncated: true,
      truncation_message:
        `Response truncated from ${originalCount} to ${kept.length} items. ` +
        `Narrow the results with due_min/due_max or a smaller max_results, or page ` +
        `through them with page_token.`
    } as T & { truncated: boolean; truncation_message: string };
    text = renderText(trimmed);
  }

  return { text, payload: trimmed as T & { truncated?: boolean; truncation_message?: string } };
}
