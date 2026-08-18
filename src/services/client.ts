/** Authenticated HTTP client for the Google Tasks REST API. */

import { API_BASE_URL, REQUEST_TIMEOUT_MS, REQUIRED_SCOPE, TOKEN_HELP_URL } from "../constants.js";
import { getAccessToken, MissingTokenError, tokenFilePath } from "../auth.js";
import type { GoogleApiErrorBody } from "../types.js";

/** An error returned by the Google Tasks API, carrying the HTTP status. */
export class GoogleTasksApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly apiMessage?: string
  ) {
    super(message);
    this.name = "GoogleTasksApiError";
  }
}

/** Query string values; `undefined` entries are omitted from the URL. */
export type QueryParams = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** JSON request body. */
  body?: unknown;
  /** Query parameters appended to the URL. */
  query?: QueryParams | undefined;
}

function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Turns a failed response into an actionable error. */
async function toApiError(response: Response): Promise<GoogleTasksApiError> {
  let apiMessage: string | undefined;
  try {
    const body = (await response.json()) as GoogleApiErrorBody;
    apiMessage = body.error?.message;
  } catch {
    // Body was not JSON; fall back to the status alone.
  }

  const detail = apiMessage ? ` Google said: "${apiMessage}".` : "";
  const status = response.status;

  let message: string;
  switch (status) {
    case 400:
      message =
        `Bad request (400).${detail} Check the argument values — a due date must be ` +
        `YYYY-MM-DD or an RFC 3339 timestamp, and parent_task_id must be a task in the same task list.`;
      break;
    case 401:
      message =
        `Authentication failed (401).${detail} The access token is missing, malformed, or expired ` +
        `(OAuth Playground tokens last one hour). Get a fresh token at ${TOKEN_HELP_URL} and write it ` +
        `to ${tokenFilePath()} — the new token is picked up on the next call, no restart needed.`;
      break;
    case 403:
      message =
        `Permission denied (403).${detail} The token may lack the ${REQUIRED_SCOPE} scope, ` +
        `or you have exceeded a usage limit. Re-authorize with that scope enabled.`;
      break;
    case 404:
      message =
        `Not found (404).${detail} Check the identifier — call list_tasklists to get valid ` +
        `tasklist_id values, and list_tasks for valid task ids.`;
      break;
    case 429:
      message = `Rate limit exceeded (429).${detail} Wait a moment before retrying.`;
      break;
    default:
      message = `Google Tasks API request failed with status ${status}.${detail}`;
  }
  return new GoogleTasksApiError(message, status, apiMessage);
}

/**
 * Performs an authenticated request against the Google Tasks API.
 *
 * @throws {MissingTokenError} when no access token is configured.
 * @throws {GoogleTasksApiError} when the API responds with a non-2xx status.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query } = options;
  const token = getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), init);
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        `Request to the Google Tasks API timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Please try again.`
      );
    }
    throw new Error(
      `Could not reach the Google Tasks API: ${error instanceof Error ? error.message : String(error)}. ` +
        `Check your network connection.`
    );
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Converts any thrown value into a user-facing error message. */
export function describeError(error: unknown): string {
  if (error instanceof MissingTokenError || error instanceof GoogleTasksApiError) {
    return `Error: ${error.message}`;
  }
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  return `Error: ${String(error)}`;
}
