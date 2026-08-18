/** Shared constants for the Google Tasks MCP server. */

/** Base URL for all Google Tasks REST v1 calls. */
export const API_BASE_URL = "https://tasks.googleapis.com/tasks/v1";

/** Maximum characters returned in a single tool response before truncation kicks in. */
export const CHARACTER_LIMIT = 25000;

/** Request timeout in milliseconds. */
export const REQUEST_TIMEOUT_MS = 30000;

/**
 * Default location of the access-token file.
 *
 * Deliberately outside the repository so a token can never be committed.
 * Override with the GOOGLE_TASKS_TOKEN_FILE environment variable.
 */
export const DEFAULT_TOKEN_FILENAME = ".google-tasks-token";

/** OAuth scope this server needs. */
export const REQUIRED_SCOPE = "https://www.googleapis.com/auth/tasks";

/** Where a user goes to mint a fresh token; referenced in error messages. */
export const TOKEN_HELP_URL = "https://developers.google.com/oauthplayground";
