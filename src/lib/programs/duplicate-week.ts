// The DB trigger `weekly_plans_prevent_duplicate` (migration 39) rejects a
// second plan for the same station + week + level with
// `weekly_plan_exists:<id of the existing plan>` (SQLSTATE 23505).
// These helpers turn that into something the UI can act on.

type PgError = { code?: string | null; message?: string | null } | null | undefined;

export function existingWeekId(err: PgError): string | null {
  const m = err?.message?.match(/weekly_plan_exists:([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

export function isDuplicateWeek(err: PgError): boolean {
  return existingWeekId(err) !== null;
}

export function duplicateWeekMessage(level: string, weekStarting: string): string {
  const [y, m, d] = weekStarting.split("-").map(Number);
  const date = y && m && d ? `${d}.${m}.${y}` : weekStarting;
  return `Það er þegar til ${level} vika sem byrjar ${date}.`;
}
