// Pure expiry helpers — no I/O, unit-testable.
// Dates are YYYY-MM-DD calendar dates; daysLeft is counted in whole days
// against the *local* date (midnight-to-midnight), so a fridge item expiring
// "today" is 0 days away no matter what time it is.

export type Urgency = "expired" | "critical" | "stirring" | "resting";

/** Parse a YYYY-MM-DD string as a local-midnight Date, or null if invalid. */
export function parseExpiryDate(expiryDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiryDate);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  // Reject impossible calendar dates (e.g. 2026-02-30 rolls over to Mar 2).
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

/** True when `value` is a real YYYY-MM-DD calendar date. */
export function isValidExpiryDate(value: unknown): value is string {
  return typeof value === "string" && parseExpiryDate(value) !== null;
}

function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Whole days from `now` until `expiryDate`.
 * 0 = expires today, 1 = tomorrow, negative = already expired.
 */
export function daysLeft(expiryDate: string, now: Date = new Date()): number {
  const expiry = parseExpiryDate(expiryDate);
  if (!expiry) return NaN;
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = localMidnight(expiry).getTime() - localMidnight(now).getTime();
  // Both sides are local midnights, so the diff is an exact multiple of a day
  // except across DST transitions; round to the nearest whole day.
  return Math.round(diff / msPerDay);
}

/** Urgency band for a daysLeft value. */
export function urgencyFor(days: number): Urgency {
  if (days < 0) return "expired";
  if (days <= 2) return "critical";
  if (days <= 5) return "stirring";
  return "resting";
}

/** New array sorted by expiryDate ascending (earliest expiry first). */
export function sortByExpiry<T extends { expiryDate: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}
