"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { trainingKcalForLog, type WorkoutLog } from "@/lib/nutrition/energy";

export const MACHINES: { value: string; label: string }[] = [
  { value: "assault_airbike", label: "Assault Airbike" },
  { value: "concept2_row", label: "Concept2 Róður" },
  { value: "concept2_bike", label: "Concept2 Bike" },
  { value: "concept2_ski", label: "Concept2 Ski" },
  { value: "other", label: "Annað" },
];

// Cardio ergs (Assault Airbike, Concept2 row/bike/ski) are ALWAYS logged as
// kcal — never sett × reps × kg — no matter where they appear in a workout.
// Map a movement name (from a prescription or the exercise catalog) to its
// machine value, or null when it's a weightable movement.
export function machineForExercise(name: string): string | null {
  const n = name.toLowerCase();
  // Assault Airbike (fan bike) first, so "airbike" isn't caught by the generic
  // bike rules below.
  if (n.includes("assault") || n.includes("airbike") || n.includes("air bike"))
    return "assault_airbike";
  // SkiErg (incl. "Concept2 SkiErg").
  if (n.includes("skierg") || (n.includes("ski") && n.includes("erg")))
    return "concept2_ski";
  // Concept2 BikeErg (endurance/power often write just "BikeErg").
  if (n.includes("bikeerg") || n.includes("bike erg")) return "concept2_bike";
  // Concept2 RowErg / rower (just "RowErg", "Rower", "Róðravél"). NB: plain
  // "Róður"/"Row" stays a strength row — only the erg/machine spellings match.
  if (
    n.includes("rowerg") ||
    n.includes("row erg") ||
    n.includes("róðravél") ||
    n.includes("róðrarvél") ||
    n.includes("rower")
  )
    return "concept2_row";
  // Explicit Concept2 / C2 with a modality word.
  if (n.includes("concept") || n.includes("c2")) {
    if (n.includes("ski")) return "concept2_ski";
    if (n.includes("bike") || n.includes("hjól")) return "concept2_bike";
    return "concept2_row"; // "Róður" / "Row" / plain Concept2
  }
  return null;
}

// RPE = upplifað áreynslustig. Lýsingar byggðar á öndun / "talprófi".
const RPE_LABELS: Record<number, string> = {
  1: "Mjög létt — varla nokkur áreynsla",
  2: "Létt — get spjallað áreynslulaust",
  3: "Létt — þægilegt, tala í heilum setningum",
  4: "Rólegt miðlungs — farin/n að hitna",
  5: "Miðlungs — finn fyrir áreynslu en get talað",
  6: "Nokkuð erfitt — mæðin/n, styttri setningar",
  7: "Erfitt — mjög mæðin/n, fá orð í einu",
  8: "Mjög erfitt — get rétt svarað í orðum",
  9: "Næstum hámark — get varla talað",
  10: "Hámark — get ekki meira",
};

type WeekWorkout = {
  slot: number;
  structure_source_id: string;
  category: string;
  name: string;
  day: string | null;
  preview: string;
};

type RecentLog = {
  structure_source_id: string;
  level: string | null;
  logged_on: string;
  rpe: number | null;
  calories: number | null;
  weights: string | null;
};

// Pull the individual movements out of a structure's prescription text so the
// member can log a weight per exercise instead of typing them into a comment.
// Exercise lines start with an enumerator (1, 1a, 2b …); we strip that and the
// trailing rep/set scheme to get a clean movement name.
function parseExercises(preview: string): string[] {
  const text = preview ?? "";
  // Drop the intro paragraph (the first block); exercises live in later blocks.
  const blocks = text.split(/\n\s*\n/);
  const body = (blocks.length > 1 ? blocks.slice(1) : blocks).join("\n");
  const names: string[] = [];
  // Section/structure headers and pure-conditioning lines aren't weightable.
  const SKIP = /^(mín|min|sek|kcal|sett|umfer|tímaramm|hringur|supersett|þrísett|reps?|þol)/i;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    // Exercise lines are either enumerated ("1 …", "2a …") or a labelled main
    // lift ("Base: …" / "Grunnur: …") that carries no leading number.
    const m =
      line.match(/^\d+[a-z]?[.)]?\s+(.*)$/i) ||
      line.match(/^(?:base|grunnur)\s*[:\-]\s*(.*)$/i);
    if (!m) continue;
    let name = m[1].split(/\s[–—-]\s/)[0]; // cut a " – scheme" suffix
    // Cut from the first rep/set/kcal/time number onward.
    name = name
      .replace(/\s+\d[\d/.,x×:-]*\s*(reps?|sett|sek|kcal|mín|min|kg)?.*$/i, "")
      .trim();
    // Drop a trailing gender tag left on machine lines ("Assault Airbike KK").
    name = name.replace(/\s+(kk|kvk)$/i, "").trim();
    if (!name || SKIP.test(name)) continue;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

const CATEGORY_LABEL: Record<string, string> = {
  strength: "Strength",
  power_strength: "Power/Strength",
  power: "Power",
  endurance: "Endurance",
  burn: "Burn",
};

// Per-exercise set editor: one row per set (Reps × kg) so varied loads and reps
// (e.g. a wave 2-4-6 with rising kg) can be logged. Add/remove sets freely.
function SetsEditor({
  sets,
  best,
  onChange,
  onAdd,
  onRemove,
}: {
  sets: SetEntry[];
  best?: number;
  onChange: (si: number, field: "reps" | "kg", value: string) => void;
  onAdd: () => void;
  onRemove: (si: number) => void;
}) {
  const cell =
    "w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
  return (
    <div className="mt-1.5 space-y-1.5">
      {sets.map((s, si) => {
        const kg = parseFloat((s.kg || "").replace(",", ".")) || 0;
        const isPr = kg > 0 && (best == null || kg > best);
        return (
          <div key={si} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">
              {si + 1}
            </span>
            <input
              inputMode="numeric"
              value={s.reps}
              onChange={(e) => onChange(si, "reps", e.target.value)}
              placeholder="Reps"
              className={cell}
            />
            <span className="shrink-0 text-xs text-muted-foreground">×</span>
            <input
              inputMode="decimal"
              value={s.kg}
              onChange={(e) => onChange(si, "kg", e.target.value)}
              placeholder="kg"
              className={isPr ? cell.replace("border-border", "border-accent") : cell}
            />
            {sets.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(si)}
                aria-label="Fjarlægja sett"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        className="text-xs text-accent hover:underline"
      >
        + Bæta við setti
      </button>
    </div>
  );
}

const LEVELS = ["MB1", "MB2", "MB3"] as const;

// Sentinel for "logged an alternative activity instead of the day's workout".
const OTHER = "__other__";

// One logged set of an exercise: reps done in that set and the weight used.
// A list of these lets a member log varied weights/reps (e.g. a wave 2-4-6).
type SetEntry = { reps: string; kg: string };
const emptySet = (): SetEntry => ({ reps: "", kg: "" });

export function LogForm({
  userId,
  today,
  todayDay,
  weekByLevel,
  loggedSourceIds,
  exerciseBests,
  exerciseCatalog,
  weightKg,
  isFirstLog,
  recent,
}: {
  userId: string;
  today: string;
  todayDay: string;
  weekByLevel: Record<string, WeekWorkout[]>;
  loggedSourceIds: string[];
  exerciseBests: Record<string, number>;
  exerciseCatalog: Record<string, string[]>;
  weightKg: number | null;
  isFirstLog: boolean;
  recent: RecentLog[];
}) {
  const router = useRouter();
  // Names of workouts the member hasn't logged yet stay hidden — you only find
  // out what the workout was after you've done it and given it an RPE.
  const loggedSet = new Set(loggedSourceIds);

  // The member chooses which level they did today (they can move between
  // MB1/MB2/MB3 each session). Default to the first level that has a plan.
  const availableLevels = LEVELS.filter(
    (l) => (weekByLevel[l]?.length ?? 0) > 0,
  );
  const [level, setLevel] = useState<string>(availableLevels[0] ?? "MB1");
  const workouts = weekByLevel[level] ?? [];
  const todays = workouts.find((w) => w.day === todayDay) ?? null;

  const [loggedOn, setLoggedOn] = useState(today);
  const [workoutId, setWorkoutId] = useState<string>(
    todays?.structure_source_id ?? "",
  );

  function changeLevel(l: string) {
    setLevel(l);
    const t = (weekByLevel[l] ?? []).find((w) => w.day === todayDay) ?? null;
    setWorkoutId(t?.structure_source_id ?? "");
    setExSets({});
    setSwaps({});
    setSwapOpen(null);
    setMachineKcal({});
    setManualExercises([]);
  }

  function addManualExercise() {
    const name = exerciseSel.trim();
    if (!name) return;
    // Duplicates allowed — each pick is its own row with its own set list.
    setManualExercises((p) => [
      ...p,
      { name, kcal: "", sets: [emptySet()] },
    ]);
    setExerciseSel("");
  }

  function removeManualExercise(i: number) {
    setManualExercises((p) => p.filter((_, idx) => idx !== i));
  }

  function setManualKcal(i: number, value: string) {
    setManualExercises((p) =>
      p.map((m, idx) => (idx === i ? { ...m, kcal: value } : m)),
    );
  }

  function setManualSet(
    i: number,
    si: number,
    field: "reps" | "kg",
    value: string,
  ) {
    setManualExercises((p) =>
      p.map((m, idx) =>
        idx === i
          ? {
              ...m,
              sets: m.sets.map((s, sj) =>
                sj === si ? { ...s, [field]: value } : s,
              ),
            }
          : m,
      ),
    );
  }

  function addManualSet(i: number) {
    setManualExercises((p) =>
      p.map((m, idx) =>
        idx === i
          ? { ...m, sets: [...m.sets, { ...(m.sets[m.sets.length - 1] ?? emptySet()) }] }
          : m,
      ),
    );
  }

  function removeManualSet(i: number, si: number) {
    setManualExercises((p) =>
      p.map((m, idx) =>
        idx === i && m.sets.length > 1
          ? { ...m, sets: m.sets.filter((_, sj) => sj !== si) }
          : m,
      ),
    );
  }

  // Planned strength exercise sets (keyed by effective movement name).
  const setsForEx = (name: string): SetEntry[] => exSets[name] ?? [emptySet()];

  function setPlannedSet(
    name: string,
    si: number,
    field: "reps" | "kg",
    value: string,
  ) {
    setExSets((p) => {
      const cur = p[name] ?? [emptySet()];
      return {
        ...p,
        [name]: cur.map((s, j) => (j === si ? { ...s, [field]: value } : s)),
      };
    });
  }

  function addPlannedSet(name: string) {
    setExSets((p) => {
      const cur = p[name] ?? [emptySet()];
      return { ...p, [name]: [...cur, { ...cur[cur.length - 1] }] };
    });
  }

  function removePlannedSet(name: string, si: number) {
    setExSets((p) => {
      const cur = p[name] ?? [emptySet()];
      if (cur.length <= 1) return p;
      return { ...p, [name]: cur.filter((_, j) => j !== si) };
    });
  }

  const [activity, setActivity] = useState("");
  // Per exercise (keyed by movement name parsed from the prescription): sets,
  // reps and kg → volume = sets × reps × kg.
  // Each planned strength exercise → a list of sets (varied reps/kg allowed),
  // keyed by the effective (post-swap) movement name. Volume = Σ (reps × kg).
  const [exSets, setExSets] = useState<Record<string, SetEntry[]>>({});
  // Swap a prescribed movement the member can't do for another from the same
  // category (e.g. Stiffur → another Mjaðmir exercise). Keyed by the original
  // parsed name → chosen replacement name. Inputs then key by the effective
  // (replacement) name so volume/bests attach to what was actually done.
  const [swaps, setSwaps] = useState<Record<string, string>>({});
  const [swapOpen, setSwapOpen] = useState<string | null>(null);
  const [swapCat, setSwapCat] = useState("");
  const [swapEx, setSwapEx] = useState("");

  // Drop any sets typed under a name (used when the effective name of a slot
  // changes so no orphan values are submitted).
  function clearInputsFor(name: string) {
    setExSets((p) => {
      const n = { ...p };
      delete n[name];
      return n;
    });
  }

  function applySwap(original: string) {
    if (!swapEx) return;
    clearInputsFor(swaps[original] ?? original);
    setSwaps((p) => ({ ...p, [original]: swapEx }));
    setSwapOpen(null);
    setSwapCat("");
    setSwapEx("");
  }

  function revertSwap(original: string) {
    clearInputsFor(swaps[original] ?? original);
    setSwaps((p) => {
      const n = { ...p };
      delete n[original];
      return n;
    });
    setSwapOpen(null);
    setSwapCat("");
    setSwapEx("");
  }

  // kcal per machine (endurance / önnur æfing): member rotates through the ergs,
  // keyed by machine value (assault_airbike, concept2_row, …).
  const [machineKcal, setMachineKcal] = useState<Record<string, string>>({});
  // "Önnur æfing": exercises the member picked via movement-pattern → exercise.
  // Each pick is its own row (duplicates allowed), with its own sets/reps/kg.
  const [manualExercises, setManualExercises] = useState<
    { name: string; kcal: string; sets: SetEntry[] }[]
  >([]);
  const [patternSel, setPatternSel] = useState("");
  const [exerciseSel, setExerciseSel] = useState("");
  const [rpe, setRpe] = useState<number | null>(null);
  const [hoverRpe, setHoverRpe] = useState<number | null>(null);
  const [weights, setWeights] = useState("");
  const [calories, setCalories] = useState("");
  const [machine, setMachine] = useState("");
  const [notes, setNotes] = useState("");
  // Bodyweight for the calorie-burn estimate. Prefer the profile value; if none,
  // the member can type it here (and it's saved to their profile on submit).
  const [weightInput, setWeightInput] = useState("");
  // Optional session length (minutes) — sharpens the estimate vs the assumed
  // class length.
  const [durationMin, setDurationMin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Post-save celebration: new exercise PRs and/or the member's first-ever log.
  const [celebration, setCelebration] = useState<{
    first: boolean;
    prs: { name: string; kg: number }[];
  } | null>(null);

  const isOther = workoutId === OTHER;
  const selected =
    !isOther && workoutId
      ? workouts.find((w) => w.structure_source_id === workoutId)
      : undefined;
  const exercises = selected ? parseExercises(selected.preview) : [];
  // Split a planned workout's movements: cardio ergs are logged as kcal, the
  // rest as sett × reps × kg.
  const strengthExercises = exercises.filter((ex) => !machineForExercise(ex));
  const cardioExercises = exercises.filter((ex) => machineForExercise(ex));
  // Endurance sessions are logged per machine (kcal), not per-exercise kg.
  const isEndurance = selected?.category === "endurance";
  const CARDIO_MACHINES = MACHINES.filter((m) => m.value !== "other");
  // "Last time" = most recent prior log of this workout, preferring the same level.
  const last =
    !isOther && workoutId
      ? (recent.find(
          (r) => r.structure_source_id === workoutId && r.level === level,
        ) ?? recent.find((r) => r.structure_source_id === workoutId))
      : undefined;

  // Effective bodyweight for the burn estimate: the profile value, else what the
  // member typed in the fallback field below.
  const typedWeight = parseFloat(weightInput.replace(",", ".")) || 0;
  const effWeight = weightKg ?? (typedWeight > 0 ? typedWeight : null);

  // Category the burn estimate should use. Planned workouts carry their real
  // category; "önnur æfing" has none, so infer: if any strength movement was
  // picked → strength (adds a MET estimate); otherwise treat it as endurance so
  // only the logged erg kcal counts (no spurious strength estimate for pure
  // cardio).
  const otherHasStrength = manualExercises.some(
    (m) =>
      !machineForExercise(m.name) &&
      m.sets.some(
        (s) =>
          (parseFloat((s.reps || "").replace(",", ".")) || 0) > 0 ||
          (parseFloat((s.kg || "").replace(",", ".")) || 0) > 0,
      ),
  );
  const estCategory = isOther
    ? otherHasStrength
      ? "strength"
      : "endurance"
    : (selected?.category ?? null);

  // Build a WorkoutLog-shaped view of the current form for the burn estimate,
  // reusing the exact nutrition logic (measured erg kcal wins, else MET × RPE).
  function currentEstLog(): WorkoutLog {
    const machinesMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(machineKcal)) {
      const n = parseFloat(v.replace(",", ".")) || 0;
      if (n > 0) machinesMap[k] = String(n);
    }
    for (const m of manualExercises) {
      const mv = machineForExercise(m.name);
      if (!mv) continue;
      const n = parseFloat((m.kcal ?? "").replace(",", ".")) || 0;
      if (n > 0)
        machinesMap[mv] = String((parseFloat(machinesMap[mv] ?? "0") || 0) + n);
    }
    const singleCal =
      !isEndurance && !isOther && cardioExercises.length === 0
        ? parseFloat(calories.replace(",", ".")) || 0
        : 0;
    return {
      calories: singleCal > 0 ? singleCal : null,
      machine: singleCal > 0 && machine ? machine : null,
      machines_json: Object.keys(machinesMap).length ? machinesMap : null,
      rpe,
      scheduled_category: estCategory,
      duration_min: parseFloat(durationMin.replace(",", ".")) || null,
    };
  }
  const estLog = currentEstLog();
  const hasErgKcal = estLog.machines_json != null || estLog.calories != null;
  const estimate =
    effWeight != null ? trainingKcalForLog(estLog, effWeight) : null;
  // Only surface a number once there's something to base it on (RPE or erg kcal).
  const showEstimate =
    estimate != null && estimate.kcal > 0 && (rpe != null || hasErgKcal);
  const estLabel =
    estimate == null
      ? ""
      : estimate.measured > 0 && estimate.estimated
        ? "mælt + áætlað"
        : estimate.estimated
          ? "áætlað"
          : "mælt";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cal = calories.trim() ? parseFloat(calories.replace(",", ".")) : null;
    const activityName = isOther ? activity.trim() : "";

    // Per-exercise sets. Planned workouts fill exSets (keyed by effective
    // movement name); "önnur æfing" adds manualExercises (each its own row with
    // its own set list). Each set has its own reps + kg so varied loads/reps
    // (e.g. a wave) are captured. Volume = Σ (reps × kg) over the sets.
    const num = (v: string) => parseFloat(v.replace(",", ".")) || 0;

    type LoggedSet = { reps: number; kg: number };
    type Ex = { name: string; sets: LoggedSet[] };
    const collected: Ex[] = [];
    const gather = (name: string, sets: SetEntry[]) => {
      const parsed = sets
        .map((s) => ({ reps: num(s.reps), kg: num(s.kg) }))
        .filter((s) => s.reps > 0 || s.kg > 0);
      if (parsed.length) collected.push({ name, sets: parsed });
    };
    for (const [name, sets] of Object.entries(exSets)) gather(name, sets);
    for (const m of manualExercises) {
      // Cardio ergs are logged as kcal (handled with the machine map), never as
      // sett × reps × kg — skip them here.
      if (machineForExercise(m.name)) continue;
      if (m.name) gather(m.name, m.sets);
    }

    const exVolume = (e: Ex) =>
      e.sets.reduce((a, s) => a + (s.reps > 0 && s.kg > 0 ? s.reps * s.kg : 0), 0);
    const exMaxKg = (e: Ex) => e.sets.reduce((a, s) => Math.max(a, s.kg), 0);

    // weights_json (name → max kg) drives exercise-bests + last-time recall.
    const jsonMap: Record<string, string> = {};
    for (const e of collected) {
      const mx = exMaxKg(e);
      if (mx > 0 && (!jsonMap[e.name] || mx > num(jsonMap[e.name])))
        jsonMap[e.name] = String(mx);
    }
    const weightsJson = Object.keys(jsonMap).length ? jsonMap : null;

    // volume_json (name → {sets:[{reps,kg}], volume}); duplicate names merge.
    const volMap: Record<
      string,
      { sets: LoggedSet[]; volume: number }
    > = {};
    let totalVolume = 0;
    for (const e of collected) {
      const volume = exVolume(e);
      if (volMap[e.name]) {
        volMap[e.name].sets.push(...e.sets);
        volMap[e.name].volume += volume;
      } else {
        volMap[e.name] = { sets: [...e.sets], volume };
      }
      totalVolume += volume;
    }
    const volumeJson = Object.keys(volMap).length ? volMap : null;
    const totalVol = totalVolume > 0 ? Math.round(totalVolume) : null;

    const composed = collected
      .map((e) => {
        const setStrs = e.sets.map((s) =>
          s.kg > 0 && s.reps > 0
            ? `${s.kg}kg×${s.reps}`
            : s.kg > 0
              ? `${s.kg}kg`
              : `${s.reps} reps`,
        );
        const v = exVolume(e);
        const volStr = v > 0 ? ` (${Math.round(v)}kg)` : "";
        return `${e.name} ${setStrs.join(", ")}${volStr}`.trim();
      })
      .join(" · ");
    const weightsText =
      [composed, weights.trim()].filter(Boolean).join(" · ") || null;

    // Per-machine kcal → a json map { machine: kcal } plus a total that feeds
    // the normal calorie displays. Sources: the endurance / inline-planned kcal
    // fields (machineKcal) AND any cardio erg picked in "önnur æfing" (its row
    // kcal). Same machine from two sources sums. Each machine still counts on
    // its own leaderboard because kcal_leaderboard unnests machines_json.
    const machineTotals: Record<string, number> = {};
    for (const [k, v] of Object.entries(machineKcal)) {
      const n = parseFloat(v.replace(",", "."));
      if (!Number.isNaN(n) && n > 0)
        machineTotals[k] = (machineTotals[k] ?? 0) + n;
    }
    for (const m of manualExercises) {
      const mv = machineForExercise(m.name);
      if (!mv) continue;
      const n = parseFloat((m.kcal ?? "").replace(",", "."));
      if (!Number.isNaN(n) && n > 0)
        machineTotals[mv] = (machineTotals[mv] ?? 0) + n;
    }
    const machineEntries = Object.entries(machineTotals).filter(
      ([, v]) => v > 0,
    );
    const machinesJson = machineEntries.length
      ? Object.fromEntries(machineEntries.map(([k, v]) => [k, String(v)]))
      : null;
    const machinesTotal = machineEntries.reduce((sum, [, v]) => sum + v, 0);

    if (
      !rpe &&
      !weightsText &&
      cal == null &&
      !machinesJson &&
      !notes.trim() &&
      !activityName
    ) {
      setError("Skráðu að minnsta kosti eitt atriði.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    // Tag the log with the workout the member picked (from this week's plan) so
    // it can be compared next time the same workout comes up. "Önnur æfing"
    // logs an alternative activity instead and is not tied to a plan workout.
    const picked = isOther
      ? undefined
      : workouts.find((w) => w.structure_source_id === workoutId);
    const tag = picked
      ? {
          structure_source_id: picked.structure_source_id,
          scheduled_day: picked.day ?? null,
          scheduled_category: picked.category,
          level,
        }
      : {};
    // With a per-machine breakdown the total is the sum and there's no single
    // "machine" — otherwise fall back to the single calories + machine fields.
    const totalCalories = machinesJson ? machinesTotal : cal;
    // Estimated total burn for the session — measured erg kcal wins, else a
    // MET × RPE estimate. Stored in its own column so it never affects the
    // leaderboard/Afrek (which read calories/machine/machines_json).
    const singleMachine =
      !machinesJson && cal != null && machine ? machine : null;
    const durMin = parseFloat(durationMin.replace(",", ".")) || 0;
    const est =
      effWeight != null
        ? trainingKcalForLog(
            {
              calories: totalCalories,
              machine: singleMachine,
              machines_json: machinesJson,
              rpe,
              scheduled_category: estCategory,
              duration_min: durMin > 0 ? durMin : null,
            },
            effWeight,
          ).kcal
        : 0;
    const estCalories = est > 0 ? Math.round(est) : null;
    const { error: insertError } = await supabase.from("workout_logs").insert({
      user_id: userId,
      logged_on: loggedOn,
      activity: activityName || null,
      rpe: rpe,
      weights: weightsText,
      weights_json: weightsJson,
      volume_json: volumeJson,
      total_volume: totalVol,
      calories: totalCalories,
      machine: singleMachine,
      machines_json: machinesJson,
      est_calories: estCalories,
      duration_min: durMin > 0 ? durMin : null,
      notes: notes.trim() || null,
      ...tag,
    });
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }
    // First time a weight was entered (no profile value) → remember it so the
    // estimate keeps working next time without re-typing.
    if (weightKg == null && typedWeight > 0) {
      await supabase
        .from("nutrition_profile")
        .upsert({ user_id: userId, weight_kg: typedWeight }, { onConflict: "user_id" });
    }
    setRpe(null);
    setActivity("");
    setExSets({});
    setSwaps({});
    setSwapOpen(null);
    setSwapCat("");
    setSwapEx("");
    setMachineKcal({});
    setManualExercises([]);
    setWeights("");
    setCalories("");
    setMachine("");
    setDurationMin("");
    setNotes("");
    setSaving(false);

    // Celebrate new PRs (beat an existing best) and/or the first-ever log.
    const prMap = new Map<string, number>();
    for (const e of collected) {
      const mx = exMaxKg(e);
      const best = exerciseBests[e.name];
      if (mx > 0 && best != null && mx > best) {
        prMap.set(e.name, Math.max(prMap.get(e.name) ?? 0, mx));
      }
    }
    const prs = [...prMap.entries()].map(([name, kg]) => ({ name, kg }));
    if (prs.length || isFirstLog) {
      setCelebration({ first: isFirstLog, prs });
    } else {
      router.refresh();
    }
  }

  function closeCelebration() {
    setCelebration(null);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-border bg-muted p-5"
    >
      <h2 className="font-semibold">Skrá æfingu</h2>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">
            Dagsetning
          </span>
          <input
            type="date"
            value={loggedOn}
            max={today}
            onChange={(e) => setLoggedOn(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent sm:w-auto"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Veldu fyrri dagsetningu til að skrá æfingu aftur í tímann — bæði
            Metabolic-æfingu og önnur æfing.
          </span>
        </label>

        <div>
          <span className="mb-1 block text-sm text-muted-foreground">
            Hvaða stig tókstu?
          </span>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((l) => {
              const has = (weekByLevel[l]?.length ?? 0) > 0;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => changeLevel(l)}
                  className={`rounded-full border px-4 py-1.5 text-sm transition ${
                    level === l
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l}
                  {!has && (
                    <span className="ml-1 text-[10px] opacity-60">(ekkert plan)</span>
                  )}
                </button>
              );
            })}
          </div>
          {todays && !isOther && (
            <div className="mt-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
              <span className="font-medium">Æfing dagsins ({level}):</span>{" "}
              {todayDay} ·{" "}
              {CATEGORY_LABEL[todays.category] ?? todays.category}
              {!loggedSet.has(todays.structure_source_id) &&
                " · 🔒 nafn birtist eftir skráningu"}
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">
            Hvaða æfingu varstu að gera?
          </span>
          <select
            value={workoutId}
            onChange={(e) => {
              setWorkoutId(e.target.value);
              setExSets({});
              setSwaps({});
              setSwapOpen(null);
              setMachineKcal({});
              setManualExercises([]);
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">— ekki tengt æfingu —</option>
            {workouts.map((w) => {
              const revealed = loggedSet.has(w.structure_source_id);
              const prefix = `${w.day ? `${w.day} · ` : ""}${
                CATEGORY_LABEL[w.category] ?? w.category
              }`;
              return (
                <option key={w.slot} value={w.structure_source_id}>
                  {revealed
                    ? `${prefix} – ${w.name}`
                    : `${prefix} · 🔒 (nafn birtist eftir skráningu)`}
                </option>
              );
            })}
            <option value={OTHER}>
              🚲 Önnur æfing / hreyfing (t.d. hjól, hlaup, sund)
            </option>
          </select>
          {workouts.length > 0 && !isOther && (
            <span className="mt-1 block text-xs text-muted-foreground">
              Þú sérð ekki æfinguna fyrirfram — nafnið birtist fyrst eftir að þú
              hefur skráð hana og gefið RPE. Tengir líka skráninguna við æfinguna
              svo þú getir borið þig saman næst.
            </span>
          )}
        </label>

        {last && (
          <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Síðast</span> (
            {last.logged_on}
            {last.level ? ` · ${last.level}` : ""}):{" "}
            {last.rpe != null ? `RPE ${last.rpe}/10` : "ekkert RPE"}
            {last.calories != null ? ` · ${last.calories} kcal` : ""}
            {last.weights ? ` · ${last.weights}` : ""}
          </div>
        )}

        {selected && !isEndurance && exercises.length > 0 && (
          <div className="space-y-3">
            {strengthExercises.length > 0 && (
              <div>
                <span className="mb-1 block text-sm text-muted-foreground">
                  Sett, reps og þyngd — kerfið reiknar heildar-álag (volume)
                </span>
                <div className="space-y-2">
                  {strengthExercises.map((ex) => {
                    const eff = swaps[ex] ?? ex;
                    const swapped = eff !== ex;
                    const open = swapOpen === ex;
                    const best = exerciseBests[eff];
                    const sets = setsForEx(eff);
                    const vol = sets.reduce((a, s) => {
                      const r = parseFloat((s.reps || "").replace(",", ".")) || 0;
                      const k = parseFloat((s.kg || "").replace(",", ".")) || 0;
                      return a + (r > 0 && k > 0 ? r * k : 0);
                    }, 0);
                    const maxKg = sets.reduce(
                      (a, s) => Math.max(a, parseFloat((s.kg || "").replace(",", ".")) || 0),
                      0,
                    );
                    const isPr = maxKg > 0 && (best == null || maxKg > best);
                    return (
                      <div key={ex} className="rounded-md border border-border bg-background p-2">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate">
                            {eff}
                            {swapped && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (í stað {ex})
                              </span>
                            )}
                            {best != null && (
                              <span className="ml-2 text-xs text-muted-foreground">met: {best} kg</span>
                            )}
                            {isPr && (
                              <span className="ml-2 text-xs font-medium text-accent">🎉 Nýtt met!</span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {vol > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {Math.round(vol).toLocaleString("is-IS")} kg
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (open) setSwapOpen(null);
                                else {
                                  setSwapOpen(ex);
                                  setSwapCat("");
                                  setSwapEx("");
                                }
                              }}
                              title="Skipta út fyrir aðra æfingu úr sama flokki"
                              className={`rounded border px-1.5 py-0.5 text-xs transition ${
                                open || swapped
                                  ? "border-accent text-accent"
                                  : "border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              ⇄ Skipta
                            </button>
                          </span>
                        </div>
                        <SetsEditor
                          sets={sets}
                          best={best}
                          onChange={(si, f, v) => setPlannedSet(eff, si, f, v)}
                          onAdd={() => addPlannedSet(eff)}
                          onRemove={(si) => removePlannedSet(eff, si)}
                        />
                        {open && (
                          <div className="mt-2 space-y-2 rounded-md border border-border bg-muted p-2">
                            <span className="block text-xs text-muted-foreground">
                              Getur ekki gert {ex}? Veldu aðra æfingu úr sama
                              flokki.
                            </span>
                            <div className="flex flex-wrap gap-2">
                              <select
                                value={swapCat}
                                onChange={(e) => {
                                  setSwapCat(e.target.value);
                                  setSwapEx("");
                                }}
                                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                              >
                                <option value="">Flokkur</option>
                                {Object.keys(exerciseCatalog).map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={swapEx}
                                onChange={(e) => setSwapEx(e.target.value)}
                                disabled={!swapCat}
                                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                              >
                                <option value="">Æfing</option>
                                {(exerciseCatalog[swapCat] ?? []).map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => applySwap(ex)}
                                disabled={!swapEx}
                                className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
                              >
                                Velja
                              </button>
                            </div>
                            {swapped && (
                              <button
                                type="button"
                                onClick={() => revertSwap(ex)}
                                className="text-xs text-muted-foreground hover:text-foreground"
                              >
                                ↩ Til baka í {ex}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const total = strengthExercises.reduce((a, ex) => {
                    const eff = swaps[ex] ?? ex;
                    return (
                      a +
                      setsForEx(eff).reduce((b, s) => {
                        const r = parseFloat((s.reps || "").replace(",", ".")) || 0;
                        const k = parseFloat((s.kg || "").replace(",", ".")) || 0;
                        return b + (r > 0 && k > 0 ? r * k : 0);
                      }, 0)
                    );
                  }, 0);
                  return total > 0 ? (
                    <div className="mt-2 flex items-center justify-between rounded-md bg-accent/10 px-3 py-2 text-sm">
                      <span className="font-medium">Heildar-álag æfingar</span>
                      <span className="font-semibold text-accent">
                        {Math.round(total).toLocaleString("is-IS")} kg
                      </span>
                    </div>
                  ) : null;
                })()}
                <span className="mt-1 block text-xs text-muted-foreground">
                  Eitt sett í hverri línu — reps × þyngd. Ólíkar þyngdir/reps eru
                  í lagi (t.d. wave 2-4-6). „+ Bæta við setti" fyrir fleiri sett;
                  volume = samtala (reps × þyngd) allra settanna.
                </span>
              </div>
            )}

            {cardioExercises.length > 0 && (
              <div>
                <span className="mb-1 block text-sm text-muted-foreground">
                  Þolæfing / tæki — skráð í kcal (taktu það sem þú notaðir)
                </span>
                <div className="space-y-1.5">
                  {CARDIO_MACHINES.map((m) => (
                    <div key={m.value} className="flex items-center gap-2">
                      <span className="flex-1 text-sm">{m.label}</span>
                      <input
                        inputMode="decimal"
                        value={machineKcal[m.value] ?? ""}
                        onChange={(e) =>
                          setMachineKcal((p) => ({ ...p, [m.value]: e.target.value }))
                        }
                        placeholder="kcal"
                        className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  ))}
                </div>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Sumir taka Concept2 í stað Assault Airbike — skráðu bara tækið
                  sem þú notaðir. Þessi tæki eru alltaf í kcal (ekki
                  sett/reps/þyngd) og hvert telur á Brennslu-leaderboardinu.
                </span>
              </div>
            )}
          </div>
        )}

        {((selected && isEndurance) || isOther) && (
          <div>
            <span className="mb-1 block text-sm text-muted-foreground">
              Kaloríur á hverju tæki — fylltu inn það sem þú tókst
            </span>
            <div className="space-y-1.5">
              {CARDIO_MACHINES.map((m) => (
                <div key={m.value} className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{m.label}</span>
                  <input
                    inputMode="decimal"
                    value={machineKcal[m.value] ?? ""}
                    onChange={(e) =>
                      setMachineKcal((p) => ({ ...p, [m.value]: e.target.value }))
                    }
                    placeholder="kcal"
                    className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              ))}
            </div>
            <span className="mt-1 block text-xs text-muted-foreground">
              Skildu eftir autt tæki sem þú notaðir ekki. Hvert tæki telur sér á
              Brennslu-leaderboardinu.
            </span>
          </div>
        )}

        {isOther && (
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">
              Hvað gerðir þú?
            </span>
            <input
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="t.d. Hjól, Hlaup, Sund, Ganga, Heimaæfing"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Skráð sem aukaæfing í stað æfingar dagsins. Þú getur líka skráð RPE
              hér að neðan.
            </span>
          </label>
        )}

        {isOther && (
          <div>
            <span className="mb-1 block text-sm text-muted-foreground">
              Æfingar — veldu hreyfiflokk og æfingu
            </span>
            <div className="flex flex-wrap gap-2">
              <select
                value={patternSel}
                onChange={(e) => {
                  setPatternSel(e.target.value);
                  setExerciseSel("");
                }}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Hreyfiflokkur</option>
                {Object.keys(exerciseCatalog).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={exerciseSel}
                onChange={(e) => setExerciseSel(e.target.value)}
                disabled={!patternSel}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="">Æfing</option>
                {(exerciseCatalog[patternSel] ?? []).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addManualExercise}
                disabled={!exerciseSel}
                className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
              >
                Bæta við
              </button>
            </div>
            {manualExercises.length > 0 && (
              <div className="mt-2 space-y-2">
                {manualExercises.map((ex, i) => {
                  const mv = machineForExercise(ex.name);
                  const best = exerciseBests[ex.name];
                  const vol = ex.sets.reduce((a, s) => {
                    const r = parseFloat((s.reps || "").replace(",", ".")) || 0;
                    const k = parseFloat((s.kg || "").replace(",", ".")) || 0;
                    return a + (r > 0 && k > 0 ? r * k : 0);
                  }, 0);
                  const maxKg = ex.sets.reduce(
                    (a, s) => Math.max(a, parseFloat((s.kg || "").replace(",", ".")) || 0),
                    0,
                  );
                  const isPr = !mv && maxKg > 0 && (best == null || maxKg > best);
                  return (
                    <div key={i} className="rounded-md border border-border bg-background p-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => removeManualExercise(i)}
                            aria-label="Fjarlægja æfingu"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            ✕
                          </button>
                          <span className="truncate">
                            {ex.name}
                            {!mv && best != null && (
                              <span className="ml-2 text-xs text-muted-foreground">met: {best} kg</span>
                            )}
                            {isPr && (
                              <span className="ml-2 text-xs font-medium text-accent">🎉 Nýtt met!</span>
                            )}
                          </span>
                        </span>
                        {!mv && vol > 0 && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {Math.round(vol).toLocaleString("is-IS")} kg
                          </span>
                        )}
                      </div>
                      {mv ? (
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="flex-1 text-xs text-muted-foreground">
                            Tæki — skráð í kcal
                          </span>
                          <input
                            inputMode="decimal"
                            value={ex.kcal}
                            onChange={(e) => setManualKcal(i, e.target.value)}
                            placeholder="kcal"
                            className="w-24 rounded-md border border-border bg-muted px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                      ) : (
                        <SetsEditor
                          sets={ex.sets}
                          best={best}
                          onChange={(si, f, v) => setManualSet(i, si, f, v)}
                          onAdd={() => addManualSet(i)}
                          onRemove={(si) => removeManualSet(i, si)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {(() => {
              const total = manualExercises.reduce((a, ex) => {
                if (machineForExercise(ex.name)) return a;
                return (
                  a +
                  ex.sets.reduce((b, s) => {
                    const r = parseFloat((s.reps || "").replace(",", ".")) || 0;
                    const k = parseFloat((s.kg || "").replace(",", ".")) || 0;
                    return b + (r > 0 && k > 0 ? r * k : 0);
                  }, 0)
                );
              }, 0);
              return total > 0 ? (
                <div className="mt-2 flex items-center justify-between rounded-md bg-accent/10 px-3 py-2 text-sm">
                  <span className="font-medium">Heildar-álag</span>
                  <span className="font-semibold text-accent">
                    {Math.round(total).toLocaleString("is-IS")} kg
                  </span>
                </div>
              ) : null;
            })()}
            <span className="mt-1 block text-xs text-muted-foreground">
              Veldu hreyfiflokk, svo æfingu, og „Bæta við". Hvert sett í sinni
              línu (reps × þyngd) — ólíkar þyngdir/reps eru í lagi. Volume og met
              reiknast sjálfkrafa.
            </span>
          </div>
        )}

        <div>
          <span className="mb-1 block text-sm text-muted-foreground">
            Hversu erfið var æfingin? (RPE — upplifað áreynslustig)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRpe(rpe === n ? null : n)}
                onMouseEnter={() => setHoverRpe(n)}
                onMouseLeave={() => setHoverRpe(null)}
                title={`${n} — ${RPE_LABELS[n]}`}
                className={`h-9 w-9 rounded-md border text-sm transition ${
                  rpe === n
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {/* Live description of the hovered/selected value */}
          <div className="mt-2 min-h-[1.25rem] text-xs">
            {hoverRpe ?? rpe ? (
              <span>
                <span className="font-semibold text-foreground">
                  {hoverRpe ?? rpe}
                </span>{" "}
                <span className="text-muted-foreground">
                  · {RPE_LABELS[(hoverRpe ?? rpe) as number]}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                Veldu tölu — eða sjáðu skalann hér fyrir neðan.
              </span>
            )}
          </div>
          {/* Quick zone reference */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              <b className="text-foreground">1–3</b> Létt
            </span>
            <span>
              <b className="text-foreground">4–6</b> Miðlungs
            </span>
            <span>
              <b className="text-foreground">7–8</b> Erfitt
            </span>
            <span>
              <b className="text-foreground">9–10</b> Hámark
            </span>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">
            {exercises.length > 0
              ? "Aðrar þyngdir (valfrjálst)"
              : "Þyngdir sem þú notaðir"}
          </span>
          <input
            value={weights}
            onChange={(e) => setWeights(e.target.value)}
            placeholder="Aðeins þyngdir — t.d. Goblet 24kg, Deadlift 80kg"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>

        {/* Endurance, "önnur æfing", and any workout that already shows the
            per-machine kcal inputs above log kcal there — hide this single
            field then to avoid a redundant/duplicate entry. */}
        {!isEndurance && !isOther && cardioExercises.length === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">
                Kaloríur
              </span>
              <input
                inputMode="decimal"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="t.d. 85"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">
                Tæki
              </span>
              <select
                value={machine}
                onChange={(e) => setMachine(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Veldu tæki</option>
                {MACHINES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">
            Athugasemd / aukaæfing (valfrjálst)
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="t.d. góð orka í dag · tók líka 3×10 upphífingar"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>

        {/* Bodyweight fallback — only when we can't estimate yet and the member
            has started logging something burn-relevant. */}
        {effWeight == null && (rpe != null || hasErgKcal) && (
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">
              Líkamsþyngd (kg) — til að áætla brennslu
            </span>
            <input
              inputMode="decimal"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder="t.d. 80"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent sm:w-40"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Geymist í prófílnum þínum svo þú þarft ekki að slá hana inn aftur.
            </span>
          </label>
        )}

        {/* Optional session length — sharpens the MET estimate vs the assumed
            ~45 min class length. */}
        {(rpe != null || hasErgKcal) && (
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">
              Tímalengd (mín) — valfrjálst, skerpir áætlunina
            </span>
            <input
              inputMode="numeric"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="t.d. 45"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent sm:w-40"
            />
          </label>
        )}

        {/* Live estimated calorie burn for the session (while wearables aren't
            connected). Same model as the nutrition energy need. */}
        {showEstimate && estimate && (
          <div>
            <div className="flex items-center justify-between rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
              <span className="font-medium">🔥 Brennsla á æfingunni</span>
              <span className="font-semibold text-accent">
                {estimate.estimated ? "~" : ""}
                {estimate.kcal.toLocaleString("is-IS")} kcal
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {estLabel}
                </span>
              </span>
            </div>
            {estimate.estimated && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {estimate.measured > 0
                  ? "Mæld þoltækja-kcal + áætlaður styrktarhluti (flokkur, RPE, þyngd, tímalengd). "
                  : "Áætlun m.v. flokk, RPE, þyngd og tímalengd (annars ~45 mín). "}
                Verður nákvæmara þegar úr tengist.
              </span>
            )}
          </div>
        )}
      </div>

      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
      <button
        type="submit"
        disabled={saving}
        className="mt-4 rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
      >
        {saving ? "Vista…" : "Vista færslu"}
      </button>

      {celebration && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeCelebration}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-accent/50 bg-background p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-5xl">🎉</div>
            {celebration.first && (
              <>
                <p className="mt-3 text-lg font-semibold">
                  Fyrsta æfingin skráð!
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vel gert — þú ert komin/n af stað. 💪
                </p>
              </>
            )}
            {celebration.prs.length > 0 && (
              <>
                <p
                  className={`text-lg font-semibold text-accent ${celebration.first ? "mt-4" : "mt-3"}`}
                >
                  🏆 Nýtt met!
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {celebration.prs.map((p) => (
                    <li key={p.name}>
                      <span className="font-medium">{p.name}</span> — {p.kg} kg
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Þyngsta sem þú hefur lyft í þessari æfingu. Frábært! 🔥
                </p>
              </>
            )}
            <button
              type="button"
              onClick={closeCelebration}
              className="mt-5 w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
            >
              Flott!
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
