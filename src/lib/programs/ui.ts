// Shared display helpers for the program pages (library, week view, builder).

export const CATEGORY_LABEL: Record<string, string> = {
  strength: "Strength",
  power_strength: "Power/Strength",
  power: "Power",
  endurance: "Endurance",
  burn: "Burn",
};

// One colour per category — readable on the dark background.
export const CATEGORY_COLOR: Record<string, string> = {
  strength: "#60a5fa",
  power_strength: "#a78bfa",
  power: "#fbbf24",
  endurance: "#34d399",
  burn: "#fb7185",
};

export const DAY_SHORT = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];
const DAY_LONG_TO_SHORT: Record<string, string> = {
  Mánudagur: "Mán",
  Þriðjudagur: "Þri",
  Miðvikudagur: "Mið",
  Fimmtudagur: "Fim",
  Föstudagur: "Fös",
  Laugardagur: "Lau",
  Sunnudagur: "Sun",
};
export function shortDay(day: string | undefined, index: number): string {
  if (day && DAY_LONG_TO_SHORT[day]) return DAY_LONG_TO_SHORT[day];
  return DAY_SHORT[index] ?? `Tími ${index + 1}`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];
export const DAY_MS = 86_400_000;

// A setup used within this many days counts as "in the current 4-week cycle".
export const CYCLE_DAYS = 28;

export function parseISO(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

export function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "2026-11-09" (+offset days) → "9. nóv" */
export function shortDate(iso: string, offsetDays = 0): string {
  const d = new Date(parseISO(iso) + offsetDays * DAY_MS);
  return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
}

/** Monday (ISO date) of the week containing `ms`. */
export function mondayOf(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  return toISO(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

/** ISO week number of the week starting at `iso`. */
export function isoWeek(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
}

/** Strip the "L3 (Var D)" suffix for a cleaner workout title. */
export function cleanTitle(name: string): string {
  return name.replace(/\s*L[123]\b.*$/i, "").trim() || name;
}

/** Weekday index (Mán = 0) of a stored day name, or null. */
export function dayIndex(day: string | undefined): number | null {
  if (!day) return null;
  const i = Object.keys(DAY_LONG_TO_SHORT).indexOf(day);
  return i === -1 ? null : i;
}

// Short labels for the periodization focus texts stored on week slots.
const FOCUS_SHORT: Record<string, string> = {
  "Power (low force / high velocity) og Strength endurance (12-20 reps)":
    "Low force · 12–20 reps",
  "Power (moderate force / high velocity) og Hypertrophy zone (8-12 reps)":
    "Moderate force · 8–12 reps",
  "Power (high force / high velocity) og Strength zone (below 6 reps)":
    "High force · undir 6 reps",
  "Endurance – stuttur til miðlungs vinnutími með svipaðan work:rest ratio":
    "Svipað work:rest",
  "Endurance – stuttur til miðlungs vinnutími með svipaðan eða lengri hvíldartíma":
    "Hvíld jöfn eða lengri en vinna",
  "Endurance – hvíldartíminn styttri en vinnutími, eða langur vinnutími":
    "Hvíld styttri en vinna / löng vinna",
  "Burn tími – work capacity dagur": "Work capacity",
};
export function shortFocus(focus: string | undefined): string {
  if (!focus) return "";
  return FOCUS_SHORT[focus] ?? focus;
}
