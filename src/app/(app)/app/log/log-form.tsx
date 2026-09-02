"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  if (n.includes("assault") || n.includes("airbike") || n.includes("air bike"))
    return "assault_airbike";
  if (n.includes("skierg") || (n.includes("ski") && n.includes("erg")))
    return "concept2_ski";
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

const LEVELS = ["MB1", "MB2", "MB3"] as const;

// Sentinel for "logged an alternative activity instead of the day's workout".
const OTHER = "__other__";

export function LogForm({
  userId,
  today,
  todayDay,
  weekByLevel,
  loggedSourceIds,
  exerciseBests,
  exerciseCatalog,
  recent,
}: {
  userId: string;
  today: string;
  todayDay: string;
  weekByLevel: Record<string, WeekWorkout[]>;
  loggedSourceIds: string[];
  exerciseBests: Record<string, number>;
  exerciseCatalog: Record<string, string[]>;
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
    setPerExercise({});
    setPerSets({});
    setPerReps({});
    setSwaps({});
    setSwapOpen(null);
    setMachineKcal({});
    setManualExercises([]);
  }

  function addManualExercise() {
    const name = exerciseSel.trim();
    if (!name) return;
    // Duplicates allowed — each pick is its own set/row.
    setManualExercises((p) => [
      ...p,
      { name, sets: "", reps: "", kg: "", kcal: "" },
    ]);
    setExerciseSel("");
  }

  function removeManualExercise(i: number) {
    setManualExercises((p) => p.filter((_, idx) => idx !== i));
  }

  function setManualField(
    i: number,
    field: "sets" | "reps" | "kg" | "kcal",
    value: string,
  ) {
    setManualExercises((p) =>
      p.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)),
    );
  }

  const [activity, setActivity] = useState("");
  // Per exercise (keyed by movement name parsed from the prescription): sets,
  // reps and kg → volume = sets × reps × kg.
  const [perExercise, setPerExercise] = useState<Record<string, string>>({});
  const [perSets, setPerSets] = useState<Record<string, string>>({});
  const [perReps, setPerReps] = useState<Record<string, string>>({});
  // Swap a prescribed movement the member can't do for another from the same
  // category (e.g. Stiffur → another Mjaðmir exercise). Keyed by the original
  // parsed name → chosen replacement name. Inputs then key by the effective
  // (replacement) name so volume/bests attach to what was actually done.
  const [swaps, setSwaps] = useState<Record<string, string>>({});
  const [swapOpen, setSwapOpen] = useState<string | null>(null);
  const [swapCat, setSwapCat] = useState("");
  const [swapEx, setSwapEx] = useState("");

  // Drop any sett/reps/kg typed under a name (used when the effective name of a
  // slot changes so no orphan values are submitted).
  function clearInputsFor(name: string) {
    setPerExercise((p) => {
      const n = { ...p };
      delete n[name];
      return n;
    });
    setPerSets((p) => {
      const n = { ...p };
      delete n[name];
      return n;
    });
    setPerReps((p) => {
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
    { name: string; sets: string; reps: string; kg: string; kcal: string }[]
  >([]);
  const [patternSel, setPatternSel] = useState("");
  const [exerciseSel, setExerciseSel] = useState("");
  const [rpe, setRpe] = useState<number | null>(null);
  const [hoverRpe, setHoverRpe] = useState<number | null>(null);
  const [weights, setWeights] = useState("");
  const [calories, setCalories] = useState("");
  const [machine, setMachine] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cal = calories.trim() ? parseFloat(calories.replace(",", ".")) : null;
    const activityName = isOther ? activity.trim() : "";

    // Per-exercise weights. Planned workouts fill perExercise (keyed by movement
    // name); "önnur æfing" adds manualExercises (each its own row, duplicates
    // allowed). For weights_json we keep the max kg per name (drives exercise
    // bests + last-time recall); the readable string keeps every set.
    const num = (v: string) => parseFloat(v.replace(",", ".")) || 0;

    // Gather each exercise's sets / reps / kg from the planned inputs and the
    // "önnur æfing" manual rows. Volume = sets × reps × kg.
    type Ex = { name: string; sets: number; reps: number; kg: number };
    const collected: Ex[] = [];
    for (const [name, kgStr] of Object.entries(perExercise)) {
      const kg = num(kgStr);
      const sets = num(perSets[name] ?? "");
      const reps = num(perReps[name] ?? "");
      if (kg > 0 || sets > 0 || reps > 0)
        collected.push({ name, sets, reps, kg });
    }
    for (const m of manualExercises) {
      // Cardio ergs are logged as kcal (handled with the machine map), never as
      // sett × reps × kg — skip them here.
      if (machineForExercise(m.name)) continue;
      const kg = num(m.kg);
      const sets = num(m.sets);
      const reps = num(m.reps);
      if (m.name && (kg > 0 || sets > 0 || reps > 0))
        collected.push({ name: m.name, sets, reps, kg });
    }

    // weights_json (name → max kg) drives exercise-bests + last-time recall.
    const jsonMap: Record<string, string> = {};
    for (const e of collected) {
      if (e.kg > 0 && (!jsonMap[e.name] || e.kg > num(jsonMap[e.name])))
        jsonMap[e.name] = String(e.kg);
    }
    const weightsJson = Object.keys(jsonMap).length ? jsonMap : null;

    // volume_json (name → {sets,reps,kg,volume}); duplicates sum their volume.
    const volMap: Record<
      string,
      { sets: number; reps: number; kg: number; volume: number }
    > = {};
    let totalVolume = 0;
    for (const e of collected) {
      const volume =
        e.sets > 0 && e.reps > 0 && e.kg > 0 ? e.sets * e.reps * e.kg : 0;
      if (volume <= 0 && e.kg <= 0) continue;
      if (volMap[e.name]) volMap[e.name].volume += volume;
      else volMap[e.name] = { sets: e.sets, reps: e.reps, kg: e.kg, volume };
      totalVolume += volume;
    }
    const volumeJson = Object.keys(volMap).length ? volMap : null;
    const totalVol = totalVolume > 0 ? Math.round(totalVolume) : null;

    const composed = collected
      .filter((e) => e.kg > 0 || e.sets > 0)
      .map((e) => {
        const sr =
          e.sets > 0 && e.reps > 0
            ? `${e.sets}×${e.reps} `
            : e.sets > 0
              ? `${e.sets} sett `
              : "";
        const kg = e.kg > 0 ? `${e.kg}kg` : "";
        const vol =
          e.sets > 0 && e.reps > 0 && e.kg > 0
            ? ` (${Math.round(e.sets * e.reps * e.kg)}kg)`
            : "";
        return `${e.name} ${sr}${kg}${vol}`.trim();
      })
      .join(", ");
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
      machine: !machinesJson && cal != null && machine ? machine : null,
      machines_json: machinesJson,
      notes: notes.trim() || null,
      ...tag,
    });
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }
    setRpe(null);
    setActivity("");
    setPerExercise({});
    setPerSets({});
    setPerReps({});
    setSwaps({});
    setSwapOpen(null);
    setSwapCat("");
    setSwapEx("");
    setMachineKcal({});
    setManualExercises([]);
    setWeights("");
    setCalories("");
    setMachine("");
    setNotes("");
    setSaving(false);
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
              setPerExercise({});
              setPerSets({});
              setPerReps({});
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
                    const kg = parseFloat((perExercise[eff] ?? "").replace(",", ".")) || 0;
                    const sets = parseFloat((perSets[eff] ?? "").replace(",", ".")) || 0;
                    const reps = parseFloat((perReps[eff] ?? "").replace(",", ".")) || 0;
                    const vol = sets > 0 && reps > 0 && kg > 0 ? Math.round(sets * reps * kg) : 0;
                    const isPr = kg > 0 && (best == null || kg > best);
                    const cell =
                      "w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
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
                                {vol.toLocaleString("is-IS")} kg
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
                        <div className="mt-1.5 grid grid-cols-3 gap-2">
                          <input inputMode="numeric" value={perSets[eff] ?? ""} onChange={(e) => setPerSets((p) => ({ ...p, [eff]: e.target.value }))} placeholder="Sett" className={cell} />
                          <input inputMode="numeric" value={perReps[eff] ?? ""} onChange={(e) => setPerReps((p) => ({ ...p, [eff]: e.target.value }))} placeholder="Reps" className={cell} />
                          <input inputMode="decimal" value={perExercise[eff] ?? ""} onChange={(e) => setPerExercise((p) => ({ ...p, [eff]: e.target.value }))} placeholder="kg" className={isPr ? cell.replace("border-border", "border-accent") : cell} />
                        </div>
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
                    const kg = parseFloat((perExercise[eff] ?? "").replace(",", ".")) || 0;
                    const s = parseFloat((perSets[eff] ?? "").replace(",", ".")) || 0;
                    const r = parseFloat((perReps[eff] ?? "").replace(",", ".")) || 0;
                    return a + (s > 0 && r > 0 && kg > 0 ? s * r * kg : 0);
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
                  Volume = sett × reps × þyngd. Skildu eftir autt það sem á ekki við.
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
                  const kg = parseFloat((ex.kg ?? "").replace(",", ".")) || 0;
                  const sets = parseFloat((ex.sets ?? "").replace(",", ".")) || 0;
                  const reps = parseFloat((ex.reps ?? "").replace(",", ".")) || 0;
                  const vol = sets > 0 && reps > 0 && kg > 0 ? Math.round(sets * reps * kg) : 0;
                  const isPr = !mv && kg > 0 && (best == null || kg > best);
                  const cell =
                    "w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
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
                            {vol.toLocaleString("is-IS")} kg
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
                            onChange={(e) => setManualField(i, "kcal", e.target.value)}
                            placeholder="kcal"
                            className="w-24 rounded-md border border-border bg-muted px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                      ) : (
                        <div className="mt-1.5 grid grid-cols-3 gap-2">
                          <input inputMode="numeric" value={ex.sets} onChange={(e) => setManualField(i, "sets", e.target.value)} placeholder="Sett" className={cell} />
                          <input inputMode="numeric" value={ex.reps} onChange={(e) => setManualField(i, "reps", e.target.value)} placeholder="Reps" className={cell} />
                          <input inputMode="decimal" value={ex.kg} onChange={(e) => setManualField(i, "kg", e.target.value)} placeholder="kg" className={isPr ? cell.replace("border-border", "border-accent") : cell} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {(() => {
              const total = manualExercises.reduce((a, ex) => {
                const kg = parseFloat((ex.kg ?? "").replace(",", ".")) || 0;
                const s = parseFloat((ex.sets ?? "").replace(",", ".")) || 0;
                const r = parseFloat((ex.reps ?? "").replace(",", ".")) || 0;
                return a + (s > 0 && r > 0 && kg > 0 ? s * r * kg : 0);
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
              Veldu hreyfiflokk, svo æfingu, og „Bæta við". Skráðu sett × reps ×
              þyngd — volume og met reiknast sjálfkrafa.
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
      </div>

      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
      <button
        type="submit"
        disabled={saving}
        className="mt-4 rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
      >
        {saving ? "Vista…" : "Vista færslu"}
      </button>
    </form>
  );
}
