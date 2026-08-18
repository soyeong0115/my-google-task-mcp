/** Type definitions mirroring the Google Tasks REST v1 resources. */

/**
 * A Google Tasks task list.
 * @see https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists
 */
export interface TaskList {
  kind?: string;
  id: string;
  etag?: string;
  title: string;
  /** Output only. RFC 3339 timestamp of the last modification. */
  updated?: string;
  /** Output only. */
  selfLink?: string;
}

/**
 * A Google Tasks task.
 *
 * Fields marked "Output only" are assigned by the server and are ignored if
 * sent in a request body.
 * @see https://developers.google.com/workspace/tasks/reference/rest/v1/tasks
 */
export interface Task {
  kind?: string;
  id: string;
  etag?: string;
  title?: string;
  /** Output only. */
  updated?: string;
  /** Output only. */
  selfLink?: string;
  /**
   * Output only. The parent task id.
   *
   * IMPORTANT: this cannot be set through the request body. Creating a subtask
   * requires the `parent` *query parameter* on tasks.insert.
   */
  parent?: string;
  /** Output only. */
  position?: string;
  notes?: string;
  /** "needsAction" or "completed". */
  status?: string;
  /** RFC 3339 timestamp. Only the date part is stored; the time is discarded. */
  due?: string;
  /** RFC 3339 timestamp; present only when status is "completed". */
  completed?: string;
  deleted?: boolean;
  /** Output only. */
  hidden?: boolean;
  /** Output only. */
  webViewLink?: string;
}

/** Response envelope for tasklists.list. */
export interface TaskListsResponse {
  kind?: string;
  etag?: string;
  nextPageToken?: string;
  items?: TaskList[];
}

/** Response envelope for tasks.list. */
export interface TasksResponse {
  kind?: string;
  etag?: string;
  nextPageToken?: string;
  items?: Task[];
}

/** Shape of the error payload Google returns on a failed call. */
export interface GoogleApiErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}
