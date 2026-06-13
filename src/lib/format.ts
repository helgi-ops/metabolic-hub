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

/** Format a price stored in cents/aurar to a localized string, e.g. 249000 → "249.000 kr". */
export function formatPrice(cents: number, currency = "ISK"): string {
  if (cents <= 0) return "Frítt";
  const major = currency === "ISK" ? Math.round(cents / 100) : cents / 100;
  const grouped = major.toLocaleString("is-IS");
  return currency === "ISK" ? `${grouped} kr` : `${grouped} ${currency}`;
}

/** Lesson/video length in seconds → "12 mín" (or "1 klst 5 mín"). */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || totalSeconds <= 0) return "";
  const mins = Math.round(totalSeconds / 60);
  if (mins < 60) return `${mins} mín`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} klst ${m} mín` : `${h} klst`;
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
