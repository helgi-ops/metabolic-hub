"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { WorkoutText } from "./workout-text";

const MACHINE_LABEL: Record<string, string> = {
  assault_airbike: "Assault Airbike",
  assault_runner: "Assault Runner",
  concept2_row: "Concept2 Róður",
  concept2_bike: "Concept2 Bike",
  concept2_ski: "Concept2 Ski",
  other: "Annað",
};

const CARDIO_MACHINES = [
  "assault_airbike",
  "assault_runner",
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
  machine_distance_json: Record<string, string> | null;
  volume_json: VolumeJson | null;
  total_volume: number | null;
  est_calories: number | null;
  notes: string | null;
  activity: string | null;
  structure_source_id?: string | null;
  scheduled_category?: string | null;
  workout_name?: string | null;
  workout_text?: string | null;
};

// Structured per-exercise sets (name → {sets:[{reps,kg}], volume}). Preferred for
// display because it collapses cleanly no matter how many sets were logged.
type VolumeJson = Record<
  string,
  { sets: { reps: number; kg: number }[]; volume: number }
>;

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

const CATEGORY_LABEL: Record<string, string> = {
  strength: "Strength",
  power_strength: "Power/Strength",
  power: "Power",
  endurance: "Endurance",
  burn: "Burn",
};
const DAY_SHORT = ["Sun", "Mán", "Þri", "Mið", "Fim", "Fös", "Lau"];
const MONTHS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mondayOf(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}
function niceDate(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}
function weekLabel(monday: string, thisMonday: string) {
  const diff = Math.round((new Date(`${thisMonday}T00:00:00`).getTime() - new Date(`${monday}T00:00:00`).getTime()) / (7 * 86_400_000));
  if (diff === 0) return "Þessi vika";
  if (diff === 1) return "Síðasta vika";
  const end = new Date(`${monday}T00:00:00`);
  end.setDate(end.getDate() + 6);
  const s = new Date(`${monday}T00:00:00`);
  return `${s.getDate()}. ${MONTHS[s.getMonth()]} – ${end.getDate()}. ${MONTHS[end.getMonth()]}`;
}
function rpeColor(n: number) {
  return n >= 9 ? "#fb7185" : n >= 7 ? "#fb923c" : n >= 5 ? "#fbbf24" : "#34d399";
}

// Burn shown on a card: the session estimate (incl. measured erg kcal), else
// the measured kcal on legacy rows.
function kcalText(l: Log): string {
  const est = l.est_calories != null ? Math.round(Number(l.est_calories)) : null;
  const meas = l.calories != null ? Math.round(Number(l.calories)) : null;
  if (est != null) {
    const containsEst = meas == null || est > meas;
    return `${containsEst ? "~" : ""}${est.toLocaleString("is-IS")} kcal`;
  }
  if (meas != null) return `${meas} kcal`;
  return "";
}

function distanceText(l: Log): string {
  if (!l.machine_distance_json) return "";
  const m = Object.values(l.machine_distance_json).reduce((a, v) => a + (Number(v) || 0), 0);
  return m > 0 ? `${m.toLocaleString("is-IS")} m` : "";
}

function machinesList(l: Log): string {
  if (l.machines_json && Object.keys(l.machines_json).length)
    return Object.entries(l.machines_json)
      .map(([k, v]) => `${MACHINE_LABEL[k] ?? k} ${Math.round(Number(v) || 0)} kcal`)
      .join(" · ");
  if (l.machine && l.calories != null) return `${MACHINE_LABEL[l.machine] ?? l.machine} ${l.calories} kcal`;
  return "";
}

// One line per exercise: "Goblet hnébeygja · 3 sett · 22–24 kg".
function exerciseRows(vj: VolumeJson | null): { name: string; detail: string }[] {
  if (!vj) return [];
  return Object.entries(vj)
    .filter(([, info]) => (info?.sets ?? []).length)
    .map(([name, info]) => {
      const sets = info.sets;
      const kgs = sets.map((x) => Number(x.kg)).filter((k) => k > 0);
      const reps = sets.map((x) => Number(x.reps)).filter((r) => r > 0);
      const kg = kgs.length
        ? Math.min(...kgs) === Math.max(...kgs)
          ? `${Math.max(...kgs)} kg`
          : `${Math.min(...kgs)}–${Math.max(...kgs)} kg`
        : "";
      const repTxt = reps.length ? `${reps.join("-")} reps` : "";
      return {
        name,
        detail: [`${sets.length} sett`, repTxt, kg].filter(Boolean).join(" · "),
      };
    });
}

export function LogHistory({
  logs,
  names = {},
  today,
}: {
  logs: Log[];
  names?: Record<string, string>;
  today: string;
}) {
  const [editing, setEditing] = useState<Log | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Which logs have their workout description (uppsetning) expanded.
  const [openText, setOpenText] = useState<Record<string, boolean>>({});

  const visible = showAll ? logs : logs.slice(0, INITIAL_ROWS);
  const hidden = logs.length - visible.length;
  const thisMonday = mondayOf(today);

  // Previous log of the same workout (logs are newest-first) → "vs last time".
  const prevOf = new Map<string, Log>();
  for (let i = 0; i < logs.length; i++) {
    const sid = logs[i].structure_source_id;
    if (!sid) continue;
    const prev = logs.slice(i + 1).find((x) => x.structure_source_id === sid);
    if (prev) prevOf.set(logs[i].id, prev);
  }

  // Group the visible logs by training week.
  const groups: { monday: string; items: Log[] }[] = [];
  for (const l of visible) {
    const m = mondayOf(l.logged_on);
    const g = groups[groups.length - 1];
    if (g && g.monday === m) g.items.push(l);
    else groups.push({ monday: m, items: [l] });
  }

  return (
    <>
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.monday} className="space-y-2">
            <h3 className="flex items-baseline justify-between text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <span>{weekLabel(g.monday, thisMonday)}</span>
              <span className="normal-case">
                {g.items.length} {g.items.length === 1 ? "æfing" : "æfingar"}
              </span>
            </h3>
            {g.items.map((l) => {
              const title =
                l.activity ??
                l.workout_name ??
                (l.structure_source_id ? names[l.structure_source_id] : null) ??
                (l.scheduled_category ? CATEGORY_LABEL[l.scheduled_category] ?? l.scheduled_category : null) ??
                "Æfing";
              const rows = exerciseRows(l.volume_json);
              const legacyWeights = rows.length ? "" : summarizeWeights(l.weights);
              const machines = machinesList(l);
              const kcal = kcalText(l);
              const dist = distanceText(l);
              const vol = l.total_volume ? Math.round(Number(l.total_volume)) : 0;
              const prev = prevOf.get(l.id);
              const volDiff =
                prev && vol && prev.total_volume ? vol - Math.round(Number(prev.total_volume)) : 0;
              const isOpen = open[l.id] ?? false;
              const facts = [
                vol ? `${vol.toLocaleString("is-IS")} kg álag` : "",
                rows.length ? `${rows.length} ${rows.length === 1 ? "æfing" : "æfingar"}` : "",
                kcal,
                dist,
              ].filter(Boolean);
              return (
                <article key={l.id} className="rounded-xl border border-border bg-muted p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{niceDate(l.logged_on)}</span>
                        {l.level && <span className="font-mono">· {l.level}</span>}
                        {l.activity && <span>· Önnur æfing</span>}
                      </div>
                      <h4 className="mt-0.5 font-semibold leading-snug">{title}</h4>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {l.rpe != null && (
                        <span
                          className="rounded-md px-2 py-0.5 text-xs font-bold"
                          style={{ color: rpeColor(l.rpe), background: `${rpeColor(l.rpe)}1f` }}
                          title="RPE — upplifað áreynslustig"
                        >
                          RPE {l.rpe}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditing(l)}
                        aria-label="Leiðrétta færslu"
                        title="Leiðrétta"
                        className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {facts.length > 0 && (
                    <div className="mt-2 text-sm text-muted-foreground">{facts.join(" · ")}</div>
                  )}
                  {machines && <div className="mt-1 text-xs text-muted-foreground">{machines}</div>}
                  {legacyWeights && (
                    <div className="mt-1 text-xs text-muted-foreground">{legacyWeights}</div>
                  )}
                  {volDiff !== 0 && (
                    <div className={`mt-1 text-xs ${volDiff > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                      {volDiff > 0 ? "+" : "−"}
                      {Math.abs(volDiff).toLocaleString("is-IS")} kg álag miðað við síðast
                    </div>
                  )}
                  {l.notes && (
                    <p className="mt-2 border-l-2 border-border pl-2.5 text-sm text-muted-foreground italic">
                      {l.notes}
                    </p>
                  )}

                  {l.workout_text && (
                    <>
                      <button
                        type="button"
                        onClick={() => setOpenText((p) => ({ ...p, [l.id]: !p[l.id] }))}
                        aria-expanded={!!openText[l.id]}
                        className="mt-2 mr-4 text-xs text-orange-400 hover:text-orange-300"
                      >
                        {openText[l.id] ? "Fela uppsetningu" : "Sýna uppsetningu"}
                      </button>
                      {openText[l.id] && (
                        <div className="mt-2 rounded-lg border border-border bg-background/60 p-3">
                          <WorkoutText text={l.workout_text} />
                        </div>
                      )}
                    </>
                  )}

                  {rows.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setOpen((p) => ({ ...p, [l.id]: !isOpen }))}
                        aria-expanded={isOpen}
                        className="mt-2 text-xs text-orange-400 hover:text-orange-300"
                      >
                        {isOpen ? "Fela æfingar" : "Sýna æfingar"}
                      </button>
                      {isOpen && (
                        <ul className="mt-2 divide-y divide-border/60 rounded-lg border border-border bg-background/60 px-3 text-sm">
                          {rows.map((r) => (
                            <li key={r.name} className="flex justify-between gap-3 py-2">
                              <span>{r.name}</span>
                              <span className="text-right text-xs text-muted-foreground">{r.detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>

      {logs.length > INITIAL_ROWS && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            {showAll ? "Sýna minna" : `Sýna fleiri (${hidden} í viðbót)`}
          </button>
        </div>
      )}

      {editing && <EditModal log={editing} onClose={() => setEditing(null)} />}
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
