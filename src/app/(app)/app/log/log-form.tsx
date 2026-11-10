"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { trainingKcalForLog, type WorkoutLog } from "@/lib/nutrition/energy";

export const MACHINES: { value: string; label: string }[] = [
  { value: "assault_airbike", label: "Assault Airbike" },
  { value: "assault_runner", label: "Assault Runner" },
  { value: "concept2_row", label: "Concept2 Róður" },
  { value: "concept2_bike", label: "Concept2 Bike" },
  { value: "concept2_ski", label: "Concept2 Ski" },
  { value: "other", label: "Annað" },
];

// Machines a member can also log a distance (metres) for, alongside kcal.
export const DISTANCE_MACHINES = new Set(["assault_runner"]);

// Cardio ergs (Assault Airbike, Concept2 row/bike/ski) are ALWAYS logged as
// kcal — never sett × reps × kg — no matter where they appear in a workout.
// Map a movement name (from a prescription or the exercise catalog) to its
// machine value, or null when it's a weightable movement.
export function machineForExercise(name: string): string | null {
  const n = name.toLowerCase();
  // Assault Runner (curved treadmill) before the airbike rule — "Assault Runner"
  // also contains "assault", so match "runner" first.
  if (n.includes("runner") || n.includes("air runner")) return "assault_runner";
  // Assault Airbike (fan bike) next, so "airbike" isn't caught by the generic
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
  total_volume?: number | null;
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
  // "+ Sett" copies the previous set's reps + kg (see addPlannedSet), so logging
  // many similar sets is one tap each instead of retyping.
  const lastFilled = sets.some((s) => s.reps.trim() || s.kg.trim());
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
              placeholder={best ? `kg (met ${best})` : "kg"}
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
        {lastFilled ? "+ Sett (afritar síðasta)" : "+ Bæta við setti"}
      </button>
    </div>
  );
}

const LEVELS = ["MB1", "MB2", "MB3"] as const;

// Sentinel for "logged an alternative activity instead of the day's workout".
const OTHER = "__other__";

const DAYS_IS = [
  "Sunnudagur",
  "Mánudagur",
  "Þriðjudagur",
  "Miðvikudagur",
  "Fimmtudagur",
  "Föstudagur",
  "Laugardagur",
];

// Monday (ISO week start) for a YYYY-MM-DD date — used to tell whether a chosen
// log date falls in the current week or an earlier one.
function weekStartISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// YYYY-MM-DD shifted by n days — for the "Í gær" quick-log button.
function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

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
  lastSets,
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
  lastSets: Record<string, { reps: number; kg: number }[]>;
  weightKg: number | null;
  isFirstLog: boolean;
  recent: RecentLog[];
}) {
  const router = useRouter();
  // Names of workouts the member hasn't logged yet stay hidden — you only find
  // out what the workout was after you've done it and given it an RPE.
  const loggedSet = new Set(loggedSourceIds);

  // The member chooses which level they did (they can move between MB1/MB2/MB3
  // each session). Default to the first level that has a plan this week.
  const availableLevels = LEVELS.filter(
    (l) => (weekByLevel[l]?.length ?? 0) > 0,
  );
  const initialLevel = availableLevels[0] ?? "MB1";
  const [level, setLevel] = useState<string>(initialLevel);
  const [loggedOn, setLoggedOn] = useState(today);

  // Backdating to a previous week: load that week's plan so the exact planned
  // workout is still selectable and the log ties to the right structure. Null =
  // the selected date is in the current week → use the server-provided prop.
  const [pastWeek, setPastWeek] = useState<Record<string, WeekWorkout[]> | null>(
    null,
  );
  const [loadingWeek, setLoadingWeek] = useState(false);
  const inCurrentWeek = weekStartISO(loggedOn) === weekStartISO(today);
  const effectiveWeekByLevel = inCurrentWeek ? weekByLevel : pastWeek ?? {};
  const workouts = effectiveWeekByLevel[level] ?? [];
  // The plan day matching the selected date (its weekday name).
  const selectedDayName = DAYS_IS[new Date(`${loggedOn}T00:00:00`).getDay()];
  const todays = workouts.find((w) => w.day === selectedDayName) ?? null;

  const [workoutId, setWorkoutId] = useState<string>(
    () =>
      (weekByLevel[initialLevel] ?? []).find((w) => w.day === todayDay)
        ?.structure_source_id ?? "",
  );

  function changeLevel(l: string) {
    setLevel(l);
    const t =
      (effectiveWeekByLevel[l] ?? []).find((w) => w.day === selectedDayName) ??
      null;
    setWorkoutId(t?.structure_source_id ?? "");
    setExSets({});
    setSwaps({});
    setSwapOpen(null);
    setMachineKcal({});
    setMachineDist({});
    setManualExercises([]);
  }

  // Load the selected date's week plan when it isn't the current week.
  useEffect(() => {
    let alive = true;
    if (weekStartISO(loggedOn) === weekStartISO(today)) {
      setPastWeek(null);
      setLoadingWeek(false);
      return;
    }
    setLoadingWeek(true);
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("plans_by_level_for_date", {
        target: loggedOn,
      });
      if (!alive) return;
      const byLevel: Record<string, WeekWorkout[]> = {};
      for (const r of (data ?? []) as {
        level: string;
        slot: number;
        structure_source_id: string;
        category: string;
        name: string;
        day: string | null;
        preview: string | null;
      }[]) {
        (byLevel[r.level] ??= []).push({
          slot: r.slot,
          structure_source_id: r.structure_source_id,
          category: r.category,
          name: r.name,
          day: r.day,
          preview: r.preview ?? "",
        });
      }
      setPastWeek(byLevel);
      setLoadingWeek(false);
    })();
    return () => {
      alive = false;
    };
  }, [loggedOn, today]);

  // Keep the workout selection valid for the current week/level — if the chosen
  // workout isn't in the effective list (e.g. after switching to another week),
  // fall back to the one matching the selected day.
  const workoutsKey = workouts.map((w) => w.structure_source_id).join(",");
  useEffect(() => {
    if (workoutId === OTHER) return;
    const ids = new Set(workouts.map((w) => w.structure_source_id));
    if (workoutId && ids.has(workoutId)) return;
    const match = workouts.find((w) => w.day === selectedDayName) ?? null;
    setWorkoutId(match?.structure_source_id ?? "");
    setExSets({});
    setSwaps({});
    setSwapOpen(null);
    setMachineKcal({});
    setMachineDist({});
    setManualExercises([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutsKey, selectedDayName]);

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

  // "Sama og síðast": fill an exercise's sets (reps + kg) from the last time it
  // was logged, so the member confirms/tweaks instead of typing from scratch.
  function fillFromLast(name: string) {
    const prev = lastSets[name];
    if (!prev?.length) return;
    setExSets((p) => ({
      ...p,
      [name]: prev.map((s) => ({ reps: String(s.reps), kg: String(s.kg) })),
    }));
  }
  // The planned strength exercises that have last-time data to fill.
  const fillableExercises = () =>
    strengthExercises
      .map((ex) => swaps[ex] ?? ex)
      .filter((eff) => (lastSets[eff]?.length ?? 0) > 0);

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
  // Explicit expand/collapse overrides per planned exercise (keyed by original
  // parsed name). Default: collapsed when sets were auto-filled from last time
  // (just confirm), expanded when there's no history to fill (type it in).
  const [expOverride, setExpOverride] = useState<Record<string, boolean>>({});

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
  // Distance in metres per machine (only DISTANCE_MACHINES show a field), e.g.
  // { assault_runner: "2000" }. Logged alongside the machine's kcal.
  const [machineDist, setMachineDist] = useState<Record<string, string>>({});
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
  // Which screen of the flow is showing: today's card → exercises → RPE → done.
  const [step, setStep] = useState<"start" | "exercises" | "rpe" | "done">("start");
  // Post-save summary: the workout's (now revealed) name, new PRs, first-ever
  // log, and a comparison with the last time this workout was logged.
  const [celebration, setCelebration] = useState<{
    first: boolean;
    prs: { name: string; kg: number }[];
    name: string | null;
    rpe: number | null;
    volume: number | null;
    kcal: number | null;
    prev: RecentLog | null;
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

  // Auto-fill planned strength sets from the last time each movement was logged,
  // so logging is confirm/tweak instead of typing. Non-destructive: only fills
  // slots not already in exSets, so it never clobbers edits (or a cleared set).
  // Runs whenever the effective movement list changes (workout/level/swaps).
  const strengthEffKey = strengthExercises.map((ex) => swaps[ex] ?? ex).join("|");
  useEffect(() => {
    const effNames = strengthExercises.map((ex) => swaps[ex] ?? ex);
    setExSets((p) => {
      let changed = false;
      const next = { ...p };
      for (const eff of effNames) {
        if (next[eff]) continue;
        const prev = lastSets[eff];
        if (prev?.length) {
          next[eff] = prev.map((s) => ({ reps: String(s.reps), kg: String(s.kg) }));
          changed = true;
        }
      }
      return changed ? next : p;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strengthEffKey]);

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
    // Enter in a field mid-flow moves on instead of saving early.
    if (step === "exercises") return setStep("rpe");
    if (step !== "rpe") return;
    await submitLog();
  }

  // attendance = one-tap "I showed up and did the day's workout": logs the picked
  // workout with a marker note (and whatever RPE is set), so no weights/sets are
  // needed. Everything else is the normal submit path.
  async function submitLog(opts?: { attendance?: boolean }) {
    setError(null);
    const cal = calories.trim() ? parseFloat(calories.replace(",", ".")) : null;
    const activityName = isOther ? activity.trim() : "";
    const noteText =
      notes.trim() || (opts?.attendance ? "Mæting skráð" : "");

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
    // Only the currently-effective planned movements — never a slot that was
    // auto-filled then swapped out (its stale entry lingers in exSets).
    const effStrengthNames = new Set(
      strengthExercises.map((ex) => swaps[ex] ?? ex),
    );
    for (const [name, sets] of Object.entries(exSets)) {
      if (effStrengthNames.has(name)) gather(name, sets);
    }
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

    // Distance (metres) for machines that track it (Assault Runner). Only
    // positive values are kept; stored per machine alongside the kcal.
    const distEntries = Object.entries(machineDist)
      .map(([k, v]) => [k, Math.round(parseFloat(v.replace(",", ".")) || 0)] as const)
      .filter(([k, v]) => v > 0 && DISTANCE_MACHINES.has(k));
    const machineDistanceJson = distEntries.length
      ? Object.fromEntries(distEntries.map(([k, v]) => [k, String(v)]))
      : null;

    if (
      !rpe &&
      !weightsText &&
      cal == null &&
      !machinesJson &&
      !machineDistanceJson &&
      !noteText &&
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
      machine_distance_json: machineDistanceJson,
      est_calories: estCalories,
      duration_min: durMin > 0 ? durMin : null,
      notes: noteText || null,
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
    const savedRpe = rpe;
    const savedPrev = last;
    setRpe(null);
    setActivity("");
    setExSets({});
    setSwaps({});
    setSwapOpen(null);
    setSwapCat("");
    setSwapEx("");
    setMachineKcal({});
    setMachineDist({});
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
    setCelebration({
      first: isFirstLog,
      prs,
      name: picked?.name ?? (activityName || null),
      rpe: savedRpe,
      volume: totalVol,
      kcal: estCalories ?? totalCalories,
      prev: savedPrev ?? null,
    });
    setStep("done");
    // Refresh the server data (history, stats) underneath the done screen.
    router.refresh();
  }

  function closeCelebration() {
    setCelebration(null);
    setStep("start");
    setWorkoutId(todays?.structure_source_id ?? "");
  }

  // Start logging: today's planned workout, or "something else".
  function startLog(other = false) {
    if (other) {
      setWorkoutId(OTHER);
      setExSets({});
      setSwaps({});
      setMachineKcal({});
      setMachineDist({});
      setManualExercises([]);
    }
    setError(null);
    setStep("exercises");
  }


  const shownRpe = hoverRpe ?? rpe;
  const rpeColor = (n: number) =>
    n >= 9 ? "#fb7185" : n >= 7 ? "#fb923c" : n >= 5 ? "#fbbf24" : "#34d399";
  const pickedWorkout = isOther
    ? null
    : workouts.find((w) => w.structure_source_id === workoutId) ?? null;
  // The workout shown on the start card: what's picked, else the day's plan.
  const cardW = pickedWorkout ?? todays;
  const pickedRevealed = pickedWorkout ? loggedSet.has(pickedWorkout.structure_source_id) : false;
  const dateLabel =
    loggedOn === today
      ? "Í dag"
      : loggedOn === addDaysISO(today, -1)
        ? "Í gær"
        : new Date(`${loggedOn}T00:00:00`).toLocaleDateString("is-IS", {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
  const pill = (on: boolean) =>
    `rounded-full border px-3.5 py-2 text-sm transition ${
      on
        ? "border-accent bg-accent/15 font-semibold text-orange-400"
        : "border-border bg-background text-muted-foreground hover:text-foreground"
    }`;

  return (
    <form
      onSubmit={onSubmit}
      className="overflow-hidden rounded-2xl border border-border bg-muted"
    >
      {/* ---------- 1. Today's workout ---------- */}
      {step === "start" && (
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setLoggedOn(today)} className={pill(loggedOn === today)}>
              Í dag
            </button>
            <button
              type="button"
              onClick={() => setLoggedOn(addDaysISO(today, -1))}
              className={pill(loggedOn === addDaysISO(today, -1))}
            >
              Í gær
            </button>
            <input
              type="date"
              value={loggedOn}
              max={today}
              onChange={(e) => e.target.value && setLoggedOn(e.target.value)}
              aria-label="Skrá eldri dag"
              className="h-10 rounded-full border border-border bg-background px-3 text-sm [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="rounded-xl border border-accent bg-background/60 p-4">
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {selectedDayName} · {dateLabel}
              </span>
              {cardW && (
                <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-foreground uppercase">
                  {CATEGORY_LABEL[cardW.category] ?? cardW.category}
                </span>
              )}
            </div>
            <div className="mt-2 text-xl font-bold">
              {cardW
                ? loggedSet.has(cardW.structure_source_id)
                  ? cardW.name
                  : "Tími dagsins"
                : "Enginn tími á plani"}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {loadingWeek
                ? "Sæki plan þeirrar viku…"
                : cardW
                  ? loggedSet.has(cardW.structure_source_id)
                    ? "Þú hefur skráð þennan tíma áður."
                    : "Nafn tímans birtist eftir að þú skráir hann."
                  : "Veldu annan tíma úr vikunni eða skráðu aðra æfingu."}
            </p>
            <div className="mt-3 flex gap-2" role="group" aria-label="Stig">
              {LEVELS.map((l) => {
                const has = (effectiveWeekByLevel[l]?.length ?? 0) > 0;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => changeLevel(l)}
                    aria-pressed={level === l}
                    title={has ? undefined : "Ekkert plan á þessu stigi"}
                    className={`h-11 flex-1 rounded-lg border text-sm font-semibold transition ${
                      level === l
                        ? "border-accent bg-accent/15 text-orange-400"
                        : `border-border bg-background ${has ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/40"}`
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => startLog(false)}
              disabled={!workoutId}
              className="mt-3 h-[52px] w-full rounded-xl bg-accent text-base font-bold text-accent-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              Skrá tímann
            </button>
            {workoutId && workoutId !== OTHER && (
              <button
                type="button"
                onClick={() => submitLog({ attendance: true })}
                disabled={saving}
                className="mt-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {saving ? "Vista…" : "Bara merkja mætingu"}
              </button>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
            <button type="button" onClick={() => startLog(true)} className="text-muted-foreground hover:text-foreground">
              Ég gerði annað (hjól, hlaup, sund…)
            </button>
          </div>

          {workouts.length > 1 && (
            <details className="rounded-lg border border-border bg-background/40 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-muted-foreground">Annar tími úr vikunni</summary>
              <div className="mt-3">
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
                    setMachineDist({});
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
              </div>
            </details>
          )}
          {error && <div className="text-sm text-red-400">{error}</div>}
        </div>
      )}

      {/* Step header (exercises + RPE) */}
      {(step === "exercises" || step === "rpe") && (
        <div className="border-b border-border px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(step === "rpe" ? "exercises" : "start")}
              aria-label="Til baka"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-background hover:border-accent"
            >
              ←
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-muted-foreground">
                {dateLabel} · {isOther ? "Önnur æfing" : `${level}${pickedWorkout ? ` · ${CATEGORY_LABEL[pickedWorkout.category] ?? pickedWorkout.category}` : ""}`}
                {pickedRevealed && pickedWorkout ? ` · ${pickedWorkout.name}` : ""}
              </div>
              <div className="font-bold">
                {step === "exercises" ? (isOther ? "Hvað gerðir þú?" : "Hvað tókstu?") : "Hversu erfitt var það?"}
              </div>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {step === "exercises" ? 1 : 2}/2
            </span>
          </div>
          <div aria-hidden="true" className="mt-3 flex gap-1">
            <span className="h-1 flex-1 rounded-full bg-accent" />
            <span className={`h-1 flex-1 rounded-full ${step === "rpe" ? "bg-accent" : "bg-border"}`} />
          </div>
        </div>
      )}

      {/* ---------- 2. Exercises ---------- */}
      {step === "exercises" && (
        <>
          <div className="space-y-4 p-4 sm:p-5">
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
                      Sett, reps og þyngd{" "}
                      <span className="text-foreground/60">(valfrjálst)</span> — ýttu á
                      æfingu til að opna hana. Þyngdir frá síðustu skráningu fyllast
                      sjálfkrafa. Slepptu þessu ef þú trackar annars staðar; RPE eitt
                      dugar.
                    </span>
                    {fillableExercises().length > 0 && (
                      <button
                        type="button"
                        onClick={() => fillableExercises().forEach(fillFromLast)}
                        className="mb-2 rounded-md border border-accent px-3 py-1 text-xs font-medium text-accent transition hover:bg-accent/10"
                      >
                        ↺ Sama og síðast (öll æfingin)
                      </button>
                    )}
                    <div className="space-y-2">
                      {strengthExercises.map((ex) => {
                        const eff = swaps[ex] ?? ex;
                        const swapped = eff !== ex;
                        const open = swapOpen === ex;
                        const best = exerciseBests[eff];
                        const sets = setsForEx(eff);
                        const maxKg = sets.reduce(
                          (a, s) => Math.max(a, parseFloat((s.kg || "").replace(",", ".")) || 0),
                          0,
                        );
                        const isPr = maxKg > 0 && (best == null || maxKg > best);
                        const hasHistory = (lastSets[eff]?.length ?? 0) > 0;
                        // Collapsed by default always, so a long plan stays short;
                        // tap a row to open it and enter/confirm sets.
                        const expandedNow = expOverride[ex] ?? false;
                        const filledCount = sets.filter(
                          (s) =>
                            (parseFloat((s.reps || "").replace(",", ".")) || 0) > 0 ||
                            (parseFloat((s.kg || "").replace(",", ".")) || 0) > 0,
                        ).length;
                        const summary = filledCount
                          ? `${filledCount} sett${maxKg > 0 ? ` · ${maxKg} kg` : ""}`
                          : "+ skrá sett";
                        return (
                          <div key={ex} className="rounded-md border border-border bg-background">
                            {/* Collapsed by default when sets were auto-filled from
                                last time — tap to open and tweak. */}
                            <button
                              type="button"
                              onClick={() =>
                                setExpOverride((p) => ({
                                  ...p,
                                  [ex]: !(p[ex] ?? false),
                                }))
                              }
                              className="flex w-full items-center gap-2 p-2 text-left text-sm"
                            >
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {expandedNow ? "▾" : "▸"}
                              </span>
                              <span className="min-w-0 truncate">
                                {eff}
                                {swapped && (
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    (í stað {ex})
                                  </span>
                                )}
                              </span>
                              {best != null && (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  met: {best} kg
                                </span>
                              )}
                              {isPr && (
                                <span className="shrink-0 text-xs font-medium text-accent">
                                  🎉
                                </span>
                              )}
                              {!expandedNow && (
                                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                  {summary}
                                </span>
                              )}
                            </button>
                            {expandedNow && (
                              <div className="px-2 pb-2">
                                <div className="mb-1.5 flex flex-wrap gap-2">
                                  {hasHistory && (
                                    <button
                                      type="button"
                                      onClick={() => fillFromLast(eff)}
                                      title="Fylla reps + kg frá síðustu æfingu"
                                      className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground transition hover:text-foreground"
                                    >
                                      ↺ Síðast
                                    </button>
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
                          {DISTANCE_MACHINES.has(m.value) && (
                            <input
                              inputMode="numeric"
                              value={machineDist[m.value] ?? ""}
                              onChange={(e) =>
                                setMachineDist((p) => ({ ...p, [m.value]: e.target.value }))
                              }
                              placeholder="metrar"
                              aria-label={`${m.label} — vegalengd í metrum`}
                              className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                          )}
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
                      {DISTANCE_MACHINES.has(m.value) && (
                        <input
                          inputMode="numeric"
                          value={machineDist[m.value] ?? ""}
                          onChange={(e) =>
                            setMachineDist((p) => ({ ...p, [m.value]: e.target.value }))
                          }
                          placeholder="metrar"
                          aria-label={`${m.label} — vegalengd í metrum`}
                          className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                      )}
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
            {!isOther && exercises.length === 0 && !isEndurance && (
              <p className="text-sm text-muted-foreground">
                Engar æfingar til að skrá fyrir þennan tíma — farðu bara áfram og gefðu RPE.
              </p>
            )}
          </div>
          <div className="sticky bottom-0 border-t border-border bg-muted/95 p-4 backdrop-blur">
            <button
              type="button"
              onClick={() => setStep("rpe")}
              className="h-[52px] w-full rounded-xl bg-accent text-base font-bold text-accent-foreground hover:opacity-90"
            >
              Áfram – hversu erfitt?
            </button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Þyngdir eru valfrjálsar — RPE eitt dugar.
            </p>
          </div>
        </>
      )}

      {/* ---------- 3. RPE + save ---------- */}
      {step === "rpe" && (
        <>
          <div className="space-y-5 p-4 sm:p-5">
            <div className="pt-2 text-center">
              <div
                className="text-6xl leading-none font-bold"
                style={{ color: shownRpe ? rpeColor(shownRpe) : "var(--muted-foreground)" }}
              >
                {shownRpe ?? "–"}
              </div>
              <div className="mt-2 min-h-[1.25rem] text-sm text-muted-foreground">
                {shownRpe ? RPE_LABELS[shownRpe] : "Veldu tölu frá 1 (mjög létt) upp í 10 (hámark)"}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2" role="group" aria-label="RPE">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRpe(rpe === n ? null : n)}
                  onMouseEnter={() => setHoverRpe(n)}
                  onMouseLeave={() => setHoverRpe(null)}
                  aria-pressed={rpe === n}
                  title={`${n} — ${RPE_LABELS[n]}`}
                  className="h-[52px] rounded-xl border text-lg font-bold transition"
                  style={
                    rpe === n
                      ? { borderColor: rpeColor(n), background: `${rpeColor(n)}22`, color: rpeColor(n), borderWidth: 2 }
                      : undefined
                  }
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Létt</span>
              <span>Miðlungs</span>
              <span>Erfitt</span>
              <span>Hámark</span>
            </div>
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
          <div className="sticky bottom-0 border-t border-border bg-muted/95 p-4 backdrop-blur">
            {error && <div className="mb-2 text-sm text-red-400">{error}</div>}
            <button
              type="submit"
              disabled={saving}
              className="h-[52px] w-full rounded-xl bg-accent text-base font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Vista…" : "Skrá æfingu"}
            </button>
          </div>
        </>
      )}

      {/* ---------- 4. Done ---------- */}
      {step === "done" && celebration && (
        <div className="space-y-4 p-5">
          <div className="flex flex-col items-center gap-1.5 pt-2 text-center">
            <div
              aria-hidden="true"
              className="grid h-16 w-16 place-items-center rounded-full bg-emerald-400/15 text-3xl text-emerald-400"
            >
              ✓
            </div>
            <div className="text-2xl font-bold">
              {celebration.first ? "Fyrsta æfingin skráð!" : "Vel gert!"}
            </div>
            {celebration.name && (
              <div className="text-sm text-muted-foreground">
                Þú tókst <span className="font-semibold text-foreground">{celebration.name}</span>
              </div>
            )}
          </div>

          {celebration.prs.length > 0 && (
            <section className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
              <div className="font-bold text-amber-300">
                {celebration.prs.length === 1 ? "Nýtt met" : `${celebration.prs.length} ný met`}
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {celebration.prs.map((p) => (
                  <li key={p.name} className="flex justify-between gap-3">
                    <span>{p.name}</span>
                    <span className="font-mono">
                      {p.kg} kg
                      {exerciseBests[p.name] != null && (
                        <span className="text-muted-foreground"> (var {exerciseBests[p.name]})</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {celebration.prev && (
            <section className="space-y-2 rounded-xl border border-border bg-background/60 p-4 text-sm">
              <div className="font-semibold">
                Miðað við síðast ({new Date(`${celebration.prev.logged_on}T00:00:00`).toLocaleDateString("is-IS", { day: "numeric", month: "short" })})
              </div>
              {celebration.volume != null && celebration.prev.total_volume != null && (
                <CompareRow
                  label="Heildarálag"
                  now={`${celebration.volume.toLocaleString("is-IS")} kg`}
                  diff={celebration.volume - celebration.prev.total_volume}
                  unit=" kg"
                />
              )}
              <CompareRow
                label="RPE"
                now={celebration.rpe != null ? String(celebration.rpe) : "—"}
                note={celebration.prev.rpe != null ? `var ${celebration.prev.rpe}` : undefined}
              />
              {celebration.kcal != null && celebration.prev.calories != null && (
                <CompareRow
                  label="kcal"
                  now={String(Math.round(celebration.kcal))}
                  note={`var ${celebration.prev.calories}`}
                />
              )}
            </section>
          )}

          <button
            type="button"
            onClick={closeCelebration}
            className="h-[52px] w-full rounded-xl bg-accent text-base font-bold text-accent-foreground hover:opacity-90"
          >
            Loka
          </button>
        </div>
      )}
    </form>
  );
}

function CompareRow({
  label,
  now,
  diff,
  unit = "",
  note,
}: {
  label: string;
  now: string;
  diff?: number;
  unit?: string;
  note?: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>
        {now}{" "}
        {diff != null && diff !== 0 && (
          <span className={diff > 0 ? "text-emerald-400" : "text-muted-foreground"}>
            {diff > 0 ? "+" : ""}
            {Math.round(diff).toLocaleString("is-IS")}
            {unit}
          </span>
        )}
        {note && <span className="text-muted-foreground">{note}</span>}
      </span>
    </div>
  );
}
