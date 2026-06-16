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

type Scheduled = {
  source_id: string;
  scheduled_day: string;
  category: string;
} | null;

type WeekWorkout = {
  slot: number;
  structure_source_id: string;
  category: string;
  name: string;
  day: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  strength: "Strength",
  power_strength: "Power/Strength",
  power: "Power",
  endurance: "Endurance",
  burn: "Burn",
};

export function LogForm({
  userId,
  today,
  scheduled,
  weekWorkouts,
  loggedSourceIds,
}: {
  userId: string;
  today: string;
  scheduled: Scheduled;
  weekWorkouts: WeekWorkout[];
  loggedSourceIds: string[];
}) {
  const router = useRouter();
  // Names of workouts the member hasn't logged yet stay hidden — you only find
  // out what the workout was after you've done it and given it an RPE.
  const loggedSet = new Set(loggedSourceIds);
  const [loggedOn, setLoggedOn] = useState(today);
  const [workoutId, setWorkoutId] = useState<string>(
    scheduled?.source_id ?? "",
  );
  const [rpe, setRpe] = useState<number | null>(null);
  const [hoverRpe, setHoverRpe] = useState<number | null>(null);
  const [weights, setWeights] = useState("");
  const [calories, setCalories] = useState("");
  const [machine, setMachine] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cal = calories.trim() ? parseFloat(calories.replace(",", ".")) : null;
    if (!rpe && !weights.trim() && cal == null && !notes.trim()) {
      setError("Skráðu að minnsta kosti eitt atriði.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    // Tag the log with the workout the member picked (from this week's plan) so
    // it can be compared next time the same workout comes up.
    const picked = weekWorkouts.find(
      (w) => w.structure_source_id === workoutId,
    );
    const tag = picked
      ? {
          structure_source_id: picked.structure_source_id,
          scheduled_day: picked.day ?? scheduled?.scheduled_day ?? null,
          scheduled_category: picked.category,
        }
      : {};
    const { error: insertError } = await supabase.from("workout_logs").insert({
      user_id: userId,
      logged_on: loggedOn,
      rpe: rpe,
      weights: weights.trim() || null,
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

        {weekWorkouts.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">
              Hvaða æfingu varstu að gera?
            </span>
            <select
              value={workoutId}
              onChange={(e) => setWorkoutId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">— ekki tengt æfingu —</option>
              {weekWorkouts.map((w) => {
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
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              Þú sérð ekki æfinguna fyrirfram — nafnið birtist fyrst eftir að þú
              hefur skráð hana og gefið RPE. Tengir líka skráninguna við æfinguna
              svo þú getir borið þig saman næst.
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
            Þyngdir sem þú notaðir
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
