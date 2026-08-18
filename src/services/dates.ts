/**
 * Due-date handling.
 *
 * The Google Tasks API takes RFC 3339 timestamps but stores only the date part:
 * "Only date information is recorded; the time portion of the timestamp is
 * discarded when setting this field." Accepting a plain YYYY-MM-DD and anchoring
 * it to midnight UTC therefore avoids timezone drift that would otherwise push a
 * task onto the neighbouring day.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Raised when a caller supplies an unparseable date. */
export class InvalidDateError extends Error {
  constructor(field: string, value: string) {
    super(
      `Invalid ${field}: "${value}". Use YYYY-MM-DD (e.g. "2026-08-19") or a full ` +
        `RFC 3339 timestamp (e.g. "2026-08-19T00:00:00.000Z").`
    );
    this.name = "InvalidDateError";
  }
}

/**
 * Normalizes a due date for writing to the API.
 *
 * A bare YYYY-MM-DD becomes midnight UTC on that day. A full timestamp is passed
 * through after validation — Google discards its time component regardless.
 */
export function normalizeDueDate(value: string, field = "due"): string {
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidDateError(field, value);
  }
  return parsed.toISOString();
}

const MS_PER_DAY = 86_400_000;

/** Reduces any accepted date form to midnight UTC on that calendar day. */
function toUtcMidnight(value: string, field: string): Date {
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidDateError(field, value);
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

/**
 * Normalizes a due-date filter bound so that both ends are inclusive.
 *
 * The API's actual behaviour differs from the reference docs, and was pinned
 * down against a live account: both bounds are truncated to a calendar date,
 * `dueMin` compares inclusively, but `dueMax` compares EXCLUSIVELY. For a task
 * due 2026-08-19, `dueMax=2026-08-19T23:59:59.999Z` returns nothing while
 * `dueMax=2026-08-20T00:00:00.000Z` returns the task.
 *
 * So an upper bound is advanced by one day. That makes `due_min` and `due_max`
 * set to the same date return exactly that day's tasks, which is what the tool
 * description promises.
 */
export function normalizeDueBound(value: string, bound: "min" | "max"): string {
  const field = bound === "min" ? "due_min" : "due_max";
  const midnight = toUtcMidnight(value, field);
  if (bound === "min") {
    return midnight.toISOString();
  }
  return new Date(midnight.getTime() + MS_PER_DAY).toISOString();
}

/** Renders a stored due timestamp as the plain date users think in (YYYY-MM-DD). */
export function formatDueDate(due: string | undefined): string | undefined {
  if (!due) return undefined;
  const parsed = new Date(due);
  if (Number.isNaN(parsed.getTime())) return due;
  return parsed.toISOString().slice(0, 10);
}
