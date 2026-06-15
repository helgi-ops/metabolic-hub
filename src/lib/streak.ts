// Consistency helpers — a "streak" is the number of consecutive calendar weeks
// (Mon–Sun) with at least one logged workout, ending at the current or previous
// week (so the streak survives until a full week is missed).

function mondayOf(d: Date): Date {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};

export function weekKey(dateStr: string): string {
  return iso(mondayOf(new Date(`${dateStr}T00:00:00Z`)));
}

/** Current consecutive-week streak from a list of activity dates (YYYY-MM-DD). */
export function currentWeekStreak(dates: string[], today?: Date): number {
  if (!dates.length) return 0;
  const weeks = new Set(dates.map(weekKey));
  let cursor = mondayOf(today ?? new Date());
  if (!weeks.has(iso(cursor))) {
    cursor = addDays(cursor, -7); // current week empty → anchor on last week
    if (!weeks.has(iso(cursor))) return 0;
  }
  let streak = 0;
  while (weeks.has(iso(cursor))) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

/** The previous full calendar week (Mon–Sun) as ISO date strings. */
export function lastWeekRange(today?: Date): { start: string; end: string } {
  const start = addDays(mondayOf(today ?? new Date()), -7);
  return { start: iso(start), end: iso(addDays(start, 6)) };
}

/** Whole days since a date (YYYY-MM-DD); null if no date. */
export function daysSince(dateStr: string | null, today?: Date): number | null {
  if (!dateStr) return null;
  const now = today ?? new Date();
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d = new Date(`${dateStr}T00:00:00Z`);
  const b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.max(0, Math.round((a - b) / 86400000));
}
