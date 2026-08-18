/**
 * Access-token resolution.
 *
 * The token is never stored in source. It is read, in order, from:
 *   1. the GOOGLE_TASKS_ACCESS_TOKEN environment variable, or
 *   2. a token file (GOOGLE_TASKS_TOKEN_FILE, default ~/.google-tasks-token).
 *
 * The file is re-read on every request. OAuth Playground tokens expire after an
 * hour, so this lets a refreshed token take effect by editing the file alone —
 * no server or agent restart needed.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { DEFAULT_TOKEN_FILENAME, TOKEN_HELP_URL } from "./constants.js";

/** Raised when no usable token can be found. */
export class MissingTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingTokenError";
  }
}

/** Absolute path of the token file this server reads. */
export function tokenFilePath(): string {
  return process.env.GOOGLE_TASKS_TOKEN_FILE ?? join(homedir(), DEFAULT_TOKEN_FILENAME);
}

/**
 * Returns the current access token.
 *
 * @throws {MissingTokenError} when neither source yields a non-empty token.
 */
export function getAccessToken(): string {
  const fromEnv = process.env.GOOGLE_TASKS_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const path = tokenFilePath();
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    throw new MissingTokenError(
      `No access token found. Create the token file at ${path} containing only your ` +
        `Google Tasks access token, or set GOOGLE_TASKS_ACCESS_TOKEN. ` +
        `Get a token at ${TOKEN_HELP_URL} (enable the Google Tasks API v1 scope).`
    );
  }

  const token = contents.trim();
  if (!token) {
    throw new MissingTokenError(
      `The token file at ${path} is empty. Paste a Google Tasks access token into it ` +
        `(get one at ${TOKEN_HELP_URL}).`
    );
  }
  return token;
}
