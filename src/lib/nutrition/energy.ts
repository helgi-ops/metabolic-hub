// Estimated energy need (TDEE) tied to logged activity. Pure + isomorphic
// (no imports) so both the server page and client card can use it.

export type Sex = "kk" | "kvk";
export type BaseActivity = "sedentary" | "light" | "moderate" | "active";
export type Goal = "maintain" | "cut" | "gain";

// Base lifestyle factors — EXCLUDING structured training, which we add on top
// from the logs (so we don't double-count exercise).
export const BASE_FACTORS: Record<BaseActivity, number> = {
  sedentary: 1.2,
  light: 1.35,
  moderate: 1.45,
  active: 1.55,
};

export const ACTIVITY_LABEL: Record<BaseActivity, string> = {
  sedentary: "Kyrrseta (lítil dagleg hreyfing)",
  light: "Létt (á fótum, létt vinna)",
  moderate: "Miðlungs (á ferðinni stóran hluta dags)",
  active: "Mikil (líkamleg vinna)",
};

export const GOAL_LABEL: Record<Goal, string> = {
  maintain: "Halda þyngd",
  cut: "Létta mig",
  gain: "Bæta á mig",
};

const CARDIO = ["assault_airbike", "concept2_row", "concept2_bike", "concept2_ski"];

// METs by workout category for the strength/power estimate (no duration is
// stored, so we assume a ~45 min class and scale by RPE).
const MET: Record<string, number> = {
  strength: 5,
  power: 6,
  power_strength: 6,
  burn: 7,
  endurance: 7,
};
const CLASS_MIN = 45;

/** Mifflin-St Jeor basal metabolic rate (kcal/day). */
export function bmr(
  sex: Sex,
  age: number,
  heightCm: number,
  weightKg: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === "kk" ? 5 : -161));
}

export function ageFromBirthYear(birthYear: number, now = new Date()): number {
  return Math.max(0, now.getFullYear() - birthYear);
}

export type WorkoutLog = {
  calories: number | null;
  machine: string | null;
  machines_json: Record<string, string> | null;
  rpe: number | null;
  scheduled_category: string | null;
  // Optional logged duration (minutes). When set it sharpens the estimate; else
  // we fall back to the assumed class length.
  duration_min?: number | null;
};

/** Measured kcal on the ergs for one log (legacy single machine or per-machine). */
function measuredKcal(l: WorkoutLog): number {
  let k = 0;
  if (l.machine && CARDIO.includes(l.machine) && l.calories != null) {
    k += Number(l.calories) || 0;
  }
  if (l.machines_json) {
    for (const [m, v] of Object.entries(l.machines_json)) {
      if (CARDIO.includes(m)) k += Number(v) || 0;
    }
  }
  return k;
}

/**
 * Energy for one workout log. Depends on the workout type:
 * - Endurance / conditioning happens entirely on the ergs, so the measured erg
 *   kcal IS the workout; we only estimate (MET) when nothing was logged.
 * - Strength / power / burn: a MET estimate for the class (duration × RPE ×
 *   bodyweight) PLUS any measured erg kcal on top (these classes often finish
 *   with an erg piece).
 * Returns `measured` (the erg portion) and `estimated` (true when the number
 * contains a guessed component) so callers can label it precisely.
 */
export function trainingKcalForLog(
  l: WorkoutLog,
  weightKg: number,
): { kcal: number; estimated: boolean; measured: number } {
  const measured = Math.round(measuredKcal(l));
  const cat = l.scheduled_category ?? "strength";
  const rpeMult = l.rpe ? l.rpe / 6 : 1;
  const minutes =
    l.duration_min && l.duration_min > 0 ? l.duration_min : CLASS_MIN;

  if (cat === "endurance") {
    if (measured > 0) return { kcal: measured, estimated: false, measured };
    const kcal = ((MET.endurance ?? 7) * 3.5 * weightKg) / 200 * minutes * rpeMult;
    return { kcal: Math.round(kcal), estimated: true, measured: 0 };
  }

  const met = MET[cat] ?? 5;
  const estPortion = (met * 3.5 * weightKg) / 200 * minutes * rpeMult;
  return {
    kcal: Math.round(estPortion + measured),
    estimated: estPortion > 0,
    measured,
  };
}

/** Sum training energy across a day's logs. */
export function trainingKcalForDay(
  logs: WorkoutLog[],
  weightKg: number,
): { kcal: number; estimated: boolean } {
  let total = 0;
  let anyEst = false;
  for (const l of logs) {
    const r = trainingKcalForLog(l, weightKg);
    total += r.kcal;
    if (r.estimated && r.kcal > 0) anyEst = true;
  }
  return { kcal: Math.round(total), estimated: anyEst };
}

export type Profile = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  base_activity: BaseActivity;
  goal: Goal;
};

/** Base (non-training) maintenance. */
export function baseMaintenance(p: Profile): number {
  const b = bmr(p.sex, p.age, p.heightCm, p.weightKg);
  return Math.round(b * (BASE_FACTORS[p.base_activity] ?? 1.35));
}

/** Suggested macro targets from a TDEE + goal. */
export function suggestTargets(
  tdee: number,
  goal: Goal,
  weightKg: number,
): { kcal: number; protein_g: number; carbs_g: number; fat_g: number } {
  const kcal = Math.round(
    tdee * (goal === "cut" ? 0.85 : goal === "gain" ? 1.1 : 1.0),
  );
  const protein_g = Math.round(weightKg * (goal === "cut" ? 2.0 : 1.8));
  const fat_g = Math.round((kcal * 0.25) / 9);
  const carbs_g = Math.max(
    0,
    Math.round((kcal - protein_g * 4 - fat_g * 9) / 4),
  );
  return { kcal, protein_g, carbs_g, fat_g };
}
