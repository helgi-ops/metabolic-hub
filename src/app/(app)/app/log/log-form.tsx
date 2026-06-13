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

type Scheduled = {
  source_id: string;
  scheduled_day: string;
  category: string;
} | null;

export function LogForm({
  userId,
  today,
  scheduled,
}: {
  userId: string;
  today: string;
  scheduled: Scheduled;
}) {
  const router = useRouter();
  const [loggedOn, setLoggedOn] = useState(today);
  const [rpe, setRpe] = useState<number | null>(null);
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
    // Tag the log with today's scheduled workout (identity only) so it can be
    // compared next time the same workout comes up.
    const tag =
      loggedOn === today && scheduled
        ? {
            structure_source_id: scheduled.source_id,
            scheduled_day: scheduled.scheduled_day,
            scheduled_category: scheduled.category,
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

        <div>
          <span className="mb-1 block text-sm text-muted-foreground">
            Hversu erfið var æfingin? (1 = létt, 10 = hámark)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRpe(rpe === n ? null : n)}
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
