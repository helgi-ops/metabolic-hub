"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MACHINE_LABEL: Record<string, string> = {
  assault_airbike: "Assault Airbike",
  concept2_row: "Concept2 Róður",
  concept2_bike: "Concept2 Bike",
  concept2_ski: "Concept2 Ski",
  other: "Annað",
};

const CARDIO_MACHINES = [
  "assault_airbike",
  "concept2_row",
  "concept2_bike",
  "concept2_ski",
] as const;

const MACHINES = [...CARDIO_MACHINES, "other"] as const;

export type Log = {
  id: string;
  logged_on: string;
  rpe: number | null;
  weights: string | null;
  weights_json: Record<string, string> | null;
  level: string | null;
  calories: number | null;
  machine: string | null;
  machines_json: Record<string, string> | null;
  total_volume: number | null;
  est_calories: number | null;
  notes: string | null;
  activity: string | null;
};

// "Bekkpressa 60kg, Bekkpressa 65kg" → "Bekkpressa ×2 (60–65kg)".
function summarizeWeights(weights: string | null): string {
  if (!weights) return "";
  const items = weights
    .split(/\s*·\s*/)
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  const groups = new Map<string, number[]>();
  const order: string[] = [];
  const other: string[] = [];
  for (const it of items) {
    const m = it.match(/^(.+?)\s+([\d.,]+)\s*kg$/i);
    if (m) {
      const name = m[1].trim();
      const val = parseFloat(m[2].replace(",", "."));
      if (!groups.has(name)) {
        groups.set(name, []);
        order.push(name);
      }
      groups.get(name)!.push(val);
    } else {
      other.push(it);
    }
  }
  const parts = order.map((name) => {
    const vals = groups.get(name)!;
    if (vals.length > 1) {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const range = min === max ? `${min}kg` : `${min}–${max}kg`;
      return `${name} ×${vals.length} (${range})`;
    }
    return `${name} ${vals[0]}kg`;
  });
  return [...parts, ...other].join(", ");
}

// Rebuild the weights_json map (name → max kg) from an edited weights string so
// exercise-bests / last-time recall stay roughly in step with a correction.
function weightsToJson(text: string): Record<string, string> | null {
  const items = text
    .split(/\s*·\s*/)
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  const map: Record<string, string> = {};
  for (const it of items) {
    const m = it.match(/^(.+?)\s+([\d.,]+)\s*kg$/i);
    if (!m) continue;
    const name = m[1].trim();
    const val = parseFloat(m[2].replace(",", "."));
    if (Number.isNaN(val)) continue;
    if (!map[name] || val > parseFloat(map[name])) map[name] = String(val);
  }
  return Object.keys(map).length ? map : null;
}

const INITIAL_ROWS = 8;

export function LogHistory({ logs }: { logs: Log[] }) {
  const [editing, setEditing] = useState<Log | null>(null);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? logs : logs.slice(0, INITIAL_ROWS);
  const hidden = logs.length - visible.length;

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Dags.</th>
              <th className="px-4 py-2 font-medium">RPE</th>
              <th className="px-4 py-2 font-medium">Þyngdir</th>
              <th className="px-4 py-2 text-right font-medium">Volume</th>
              <th className="px-4 py-2 font-medium">Kaloríur</th>
              <th className="px-4 py-2 font-medium">Athugasemd</th>
              <th className="px-4 py-2 text-right font-medium">Aðgerðir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                  {l.logged_on}
                </td>
                <td className="px-4 py-2">
                  {l.rpe != null ? (
                    <span className="font-medium">{l.rpe}/10</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {l.activity ? (
                    <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs text-accent">
                      🚲 {l.activity}
                    </span>
                  ) : (
                    summarizeWeights(l.weights)
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-muted-foreground">
                  {l.total_volume
                    ? `${Math.round(Number(l.total_volume)).toLocaleString("is-IS")} kg`
                    : ""}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                  {l.calories != null ? (
                    `${l.calories} kcal${
                      l.machine
                        ? ` · ${MACHINE_LABEL[l.machine] ?? l.machine}`
                        : ""
                    }`
                  ) : l.est_calories != null ? (
                    <span title="Áætluð brennsla (engin úr tengd)">
                      🔥 ~{Math.round(Number(l.est_calories))} kcal
                      <span className="ml-1 text-xs">áætlað</span>
                    </span>
                  ) : (
                    ""
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {l.notes ?? ""}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(l)}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:border-accent hover:text-foreground"
                  >
                    Leiðrétta
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logs.length > INITIAL_ROWS && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            {showAll
              ? "Sýna minna"
              : `Sýna fleiri (${hidden} í viðbót)`}
          </button>
        </div>
      )}

      {editing && (
        <EditModal log={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function EditModal({ log, onClose }: { log: Log; onClose: () => void }) {
  const router = useRouter();
  const isActivity = log.activity != null;
  const hasMachines = !!log.machines_json;

  const [loggedOn, setLoggedOn] = useState(log.logged_on);
  const [rpe, setRpe] = useState<string>(log.rpe != null ? String(log.rpe) : "");
  const [activity, setActivity] = useState(log.activity ?? "");
  const [weights, setWeights] = useState(log.weights ?? "");
  const [calories, setCalories] = useState(
    log.calories != null ? String(log.calories) : "",
  );
  const [machine, setMachine] = useState(log.machine ?? "");
  const [machineKcal, setMachineKcal] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {};
      if (log.machines_json) {
        for (const [k, v] of Object.entries(log.machines_json)) init[k] = v;
      }
      return init;
    },
  );
  const [notes, setNotes] = useState(log.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setError(null);
    setSaving(true);
    const supabase = createClient();

    const rpeNum = rpe ? Number(rpe) : null;
    const weightsText = weights.trim() || null;

    // Per-machine kcal (endurance) → json map + total; else single field.
    let machinesJson: Record<string, string> | null = null;
    let totalCalories: number | null = null;
    let singleMachine: string | null = null;
    if (hasMachines) {
      const entries = Object.entries(machineKcal)
        .map(([k, v]) => [k, parseFloat(v.replace(",", "."))] as const)
        .filter(([, v]) => !Number.isNaN(v) && v > 0);
      machinesJson = entries.length
        ? Object.fromEntries(entries.map(([k, v]) => [k, String(v)]))
        : null;
      totalCalories = entries.reduce((s, [, v]) => s + v, 0) || null;
    } else {
      totalCalories = calories.trim()
        ? parseFloat(calories.replace(",", "."))
        : null;
      singleMachine = totalCalories != null && machine ? machine : null;
    }

    const { error: updErr } = await supabase
      .from("workout_logs")
      .update({
        logged_on: loggedOn,
        rpe: rpeNum,
        activity: isActivity ? activity.trim() || null : log.activity,
        weights: weightsText,
        weights_json: weightsToJson(weights),
        calories: totalCalories,
        machine: singleMachine,
        machines_json: machinesJson,
        notes: notes.trim() || null,
      })
      .eq("id", log.id);

    if (updErr) {
      setError(updErr.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
    router.refresh();
  }

  async function remove() {
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("workout_logs")
      .delete()
      .eq("id", log.id);
    if (delErr) {
      setError(delErr.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
    router.refresh();
  }

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold">Leiðrétta færslu</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Loka"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">
              Dagsetning
            </span>
            <input
              type="date"
              value={loggedOn}
              onChange={(e) => setLoggedOn(e.target.value)}
              className={field}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">
              RPE
            </span>
            <select
              value={rpe}
              onChange={(e) => setRpe(e.target.value)}
              className={field}
            >
              <option value="">—</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}/10
                </option>
              ))}
            </select>
          </label>

          {isActivity && (
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">
                Hvað gerðir þú?
              </span>
              <input
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="t.d. Hjól, Hlaup, Sund"
                className={field}
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">
              Þyngdir
            </span>
            <input
              value={weights}
              onChange={(e) => setWeights(e.target.value)}
              placeholder="t.d. Bekkpressa 60kg, Róður 40kg"
              className={field}
            />
          </label>

          {hasMachines ? (
            <div>
              <span className="mb-1 block text-sm text-muted-foreground">
                Kaloríur á hverju tæki
              </span>
              <div className="space-y-1.5">
                {CARDIO_MACHINES.map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <span className="flex-1 text-sm">{MACHINE_LABEL[m]}</span>
                    <input
                      inputMode="decimal"
                      value={machineKcal[m] ?? ""}
                      onChange={(e) =>
                        setMachineKcal((p) => ({ ...p, [m]: e.target.value }))
                      }
                      placeholder="kcal"
                      className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
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
                  className={field}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-muted-foreground">
                  Tæki
                </span>
                <select
                  value={machine}
                  onChange={(e) => setMachine(e.target.value)}
                  className={field}
                >
                  <option value="">Veldu tæki</option>
                  {MACHINES.map((m) => (
                    <option key={m} value={m}>
                      {MACHINE_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">
              Athugasemd
            </span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={field}
            />
          </label>
        </div>

        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className="rounded-md border border-transparent px-2 py-2 text-sm text-muted-foreground transition hover:text-red-400 disabled:opacity-50"
          >
            Eyða færslu
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Hætta við
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Vista…" : "Vista"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
