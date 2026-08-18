/** Helpers for building MCP tool results consistently. */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { describeError } from "../services/client.js";

/** A successful result carrying both a text rendering and structured data. */
export function successResult(
  text: string,
  structuredContent: Record<string, unknown>
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent
  };
}

/**
 * An error result.
 *
 * Marked `isError` so the client can distinguish failure from an empty result;
 * output-schema validation is skipped for these, so no structured payload is needed.
 */
export function errorResult(error: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: describeError(error) }],
    isError: true
  };
}
