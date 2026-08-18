/** Thin, typed wrappers over the four Google Tasks endpoints this server uses. */

import { apiRequest, type QueryParams } from "./client.js";
import type { Task, TaskList, TaskListsResponse, TasksResponse } from "../types.js";

/** tasklists.insert — creates a new task list. */
export async function createTaskList(title: string): Promise<TaskList> {
  return apiRequest<TaskList>("/users/@me/lists", {
    method: "POST",
    body: { title }
  });
}

/**
 * tasklists.list — returns every task list, following pagination to the end.
 *
 * A user may hold up to 2000 lists; maxResults caps at 1000 per page, so a
 * second page is possible and is fetched here rather than exposed to the caller.
 */
export async function listAllTaskLists(): Promise<TaskList[]> {
  const lists: TaskList[] = [];
  let pageToken: string | undefined;

  do {
    const page = await apiRequest<TaskListsResponse>("/users/@me/lists", {
      query: { maxResults: 1000, pageToken }
    });
    lists.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return lists;
}

/** tasklists.get — used to resolve a list title for nicer output. */
export async function getTaskList(taskListId: string): Promise<TaskList> {
  return apiRequest<TaskList>(`/users/@me/lists/${encodeURIComponent(taskListId)}`);
}

export interface InsertTaskOptions {
  taskListId: string;
  title: string;
  notes?: string | undefined;
  /** RFC 3339 timestamp; Google keeps only the date part. */
  due?: string | undefined;
  /** Id of the task this one nests under. */
  parentTaskId?: string | undefined;
}

/**
 * tasks.insert — adds a task, optionally as a subtask.
 *
 * `parent` is a QUERY PARAMETER, not a body field: in the Task resource `parent`
 * is marked "Output only", so a parent sent in the body is silently ignored and
 * the API still returns 200 with a top-level task. Passing it on the URL is what
 * actually nests the task.
 * @see https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/insert
 */
export async function insertTask(options: InsertTaskOptions): Promise<Task> {
  const body: Record<string, string> = { title: options.title };
  if (options.notes !== undefined) body.notes = options.notes;
  if (options.due !== undefined) body.due = options.due;

  return apiRequest<Task>(`/lists/${encodeURIComponent(options.taskListId)}/tasks`, {
    method: "POST",
    body,
    query: { parent: options.parentTaskId }
  });
}

export interface ListTasksOptions {
  taskListId: string;
  dueMin?: string | undefined;
  dueMax?: string | undefined;
  showCompleted?: boolean | undefined;
  showHidden?: boolean | undefined;
  maxResults?: number | undefined;
  pageToken?: string | undefined;
}

/** tasks.list — returns one page of tasks from a list. */
export async function listTasks(
  options: ListTasksOptions
): Promise<{ tasks: Task[]; nextPageToken?: string }> {
  const query: QueryParams = {
    dueMin: options.dueMin,
    dueMax: options.dueMax,
    showCompleted: options.showCompleted,
    showHidden: options.showHidden,
    maxResults: options.maxResults,
    pageToken: options.pageToken
  };

  const page = await apiRequest<TasksResponse>(
    `/lists/${encodeURIComponent(options.taskListId)}/tasks`,
    { query }
  );

  return {
    tasks: page.items ?? [],
    ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {})
  };
}
