/**
 * Calculates the start of the current day (00:00:00.000) in UTC+3 timezone.
 * Returns the Unix timestamp (milliseconds since epoch).
 * A new day starts at 00:00:00 UTC+3 (which is 21:00:00 UTC of the previous day).
 */
export function getStartOfTodayUTC3(nowMs: number = Date.now()): number {
  const UTC3_OFFSET_MS = 3 * 60 * 60 * 1000; // 3 hours
  const dateInUTC3 = new Date(nowMs + UTC3_OFFSET_MS);
  
  const year = dateInUTC3.getUTCFullYear();
  const month = dateInUTC3.getUTCMonth();
  const day = dateInUTC3.getUTCDate();
  
  // Midnight 00:00:00 UTC+3 in UTC timestamp
  return Date.UTC(year, month, day, 0, 0, 0, 0) - UTC3_OFFSET_MS;
}

export function parseTimestamp(rawTs: any): number {
  if (!rawTs) return 0;
  if (typeof rawTs === 'number') return rawTs;
  if (typeof rawTs?.seconds === 'number') return rawTs.seconds * 1000;
  if (typeof rawTs?._seconds === 'number') return rawTs._seconds * 1000;
  if (typeof rawTs?.toDate === 'function') {
    try { return rawTs.toDate().getTime(); } catch (e) {}
  }
  const parsed = new Date(rawTs).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

