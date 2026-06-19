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
    const m = line.match(/^\d+[a-z]?[.)]?\s+(.*)$/i);
    if (!m) continue;
    let name = m[1].split(/\s[–—-]\s/)[0]; // cut a " – scheme" suffix
    // Cut from the first rep/set/kcal/time number onward.
    name = name
      .replace(/\s+\d[\d/.,x×:-]*\s*(reps?|sett|sek|kcal|mín|min|kg)?.*$/i, "")
      .trim();
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
  recent,
}: {
  userId: string;
  today: string;
  todayDay: string;
  weekByLevel: Record<string, WeekWorkout[]>;
  loggedSourceIds: string[];
  exerciseBests: Record<string, number>;
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
  }

  const [activity, setActivity] = useState("");
  // kg per exercise, keyed by movement name (parsed from the prescription).
  const [perExercise, setPerExercise] = useState<Record<string, string>>({});
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

    // Per-exercise weights → a json map + a readable summary string.
    const filled = Object.entries(perExercise)
      .map(([k, v]) => [k, v.trim()] as const)
      .filter(([, v]) => v);
    const weightsJson = filled.length
      ? Object.fromEntries(filled.map(([k, v]) => [k, v]))
      : null;
    const composed = filled.map(([k, v]) => `${k} ${v}kg`).join(", ");
    const weightsText =
      [composed, weights.trim()].filter(Boolean).join(" · ") || null;

    if (
      !rpe &&
      !weightsText &&
      cal == null &&
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
    const { error: insertError } = await supabase.from("workout_logs").insert({
      user_id: userId,
      logged_on: loggedOn,
      activity: activityName || null,
      rpe: rpe,
      weights: weightsText,
      weights_json: weightsJson,
      calories: cal,
      machine: cal != null && machine ? machine : null,
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
            onChange={(e) => setLoggedOn(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent sm:w-auto"
          />
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

        {selected && exercises.length > 0 && (
          <div>
            <span className="mb-1 block text-sm text-muted-foreground">
              Þyngdir í æfingunni (kg) — fylltu inn það sem þú notaðir
            </span>
            <div className="space-y-1.5">
              {exercises.map((ex) => {
                const best = exerciseBests[ex];
                const entered = parseFloat(
                  (perExercise[ex] ?? "").replace(",", "."),
                );
                const isPr =
                  !Number.isNaN(entered) &&
                  entered > 0 &&
                  (best == null || entered > best);
                return (
                  <div key={ex} className="flex items-center gap-2">
                    <span className="flex-1 text-sm">
                      {ex}
                      {best != null && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          met: {best} kg
                        </span>
                      )}
                      {isPr && (
                        <span className="ml-2 text-xs font-medium text-accent">
                          🎉 Nýtt met!
                        </span>
                      )}
                    </span>
                    <input
                      inputMode="decimal"
                      value={perExercise[ex] ?? ""}
                      onChange={(e) =>
                        setPerExercise((p) => ({ ...p, [ex]: e.target.value }))
                      }
                      placeholder="kg"
                      className={`w-24 rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent ${
                        isPr ? "border-accent" : "border-border"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
            <span className="mt-1 block text-xs text-muted-foreground">
              Þarft ekki að skrifa æfingarnar — bara þyngdina. Geymist með
              skráningunni svo þú getir borið saman næst.
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
              og kaloríur fyrir hana hér að neðan.
            </span>
          </label>
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
              ? "Aðrar þyngdir / nótur (valfrjálst)"
              : "Þyngdir sem þú notaðir"}
          </span>
          <input
            value={weights}
            onChange={(e) => setWeights(e.target.value)}
            placeholder="t.d. Goblet 24kg, Deadlift 80kg, KB swing 32kg"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>

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
            <span className="mb-1 block text-sm text-muted-foreground">Tæki</span>
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

        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">
            Athugasemd (valfrjálst)
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="t.d. góð orka í dag, vinstri öxl aðeins aum"
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
