// Benchmarks measured in time are stored in seconds (unit "sek") but shown/entered
// as mm:ss so members aren't doing mental arithmetic on a 14-minute workout.

export function isTimeUnit(unit: string): boolean {
  return unit === "sek";
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Display a stored value with its unit (time units become mm:ss). */
export function formatMeasure(value: number, unit: string): string {
  if (isTimeUnit(unit)) return formatTime(value);
  return `${value} ${unit}`;
}

/** Parse user input — "mm:ss", "m:ss", or a plain number of seconds. */
export function parseTimeToSeconds(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const [mm, ss] = t.split(":");
    const m = parseInt(mm, 10);
    const s = parseInt(ss, 10);
    if (Number.isNaN(m) || Number.isNaN(s)) return null;
    return m * 60 + s;
  }
  const n = parseFloat(t.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}
