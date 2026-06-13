import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogForm } from "./log-form";

export const metadata = {
  title: "Æfingadagbók · Metabolic",
};

const MACHINE_LABEL: Record<string, string> = {
  assault_airbike: "Assault Airbike",
  concept2_row: "Concept2 Róður",
  concept2_bike: "Concept2 Bike",
  concept2_ski: "Concept2 Ski",
  other: "Annað",
};

const CATEGORY_LABEL: Record<string, string> = {
  strength: "Strength",
  power_strength: "Power/Strength",
  power: "Power",
  endurance: "Endurance",
  burn: "Burn",
};

type Log = {
  id: string;
  logged_on: string;
  rpe: number | null;
  weights: string | null;
  calories: number | null;
  machine: string | null;
  notes: string | null;
  structure_source_id: string | null;
  scheduled_day: string | null;
  scheduled_category: string | null;
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function LogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = todayISO();

  // Today's scheduled workout for the member's station (identity only — never the
  // prescription). Lets us tag the log and compare against past attempts.
  const { data: sched } = await supabase.rpc("scheduled_structure_for", {
    d: today,
  });
  const scheduled = sched?.[0] ?? null;

  // Previous attempt at the same workout, for "last time" comparison.
  let lastSame: { logged_on: string; rpe: number | null; calories: number | null } | null = null;
  if (scheduled?.source_id) {
    const { data } = await supabase
      .from("workout_logs")
      .select("logged_on, rpe, calories")
      .eq("user_id", user!.id)
      .eq("structure_source_id", scheduled.source_id)
      .order("logged_on", { ascending: false })
      .limit(1);
    lastSame = data?.[0] ?? null;
  }

  const { data: logs } = await supabase
    .from("workout_logs")
    .select(
      "id, logged_on, rpe, weights, calories, machine, notes, structure_source_id, scheduled_day, scheduled_category",
    )
    .eq("user_id", user!.id)
    .order("logged_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);

  const list = (logs ?? []) as Log[];

  // Group tagged logs by the workout they belong to, for side-by-side comparison.
  const groups = new Map<
    string,
    { day: string | null; category: string | null; entries: Log[] }
  >();
  for (const l of list) {
    if (!l.structure_source_id) continue;
    if (!groups.has(l.structure_source_id)) {
      groups.set(l.structure_source_id, {
        day: l.scheduled_day,
        category: l.scheduled_category,
        entries: [],
      });
    }
    groups.get(l.structure_source_id)!.entries.push(l);
  }
  const comparisons = [...groups.values()].filter((g) => g.entries.length >= 2);

  const rpeValues = list.map((l) => l.rpe).filter((r): r is number => r != null);
  const avgRpe = rpeValues.length
    ? (rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length).toFixed(1)
    : "—";
  const totalCalories = list.reduce((sum, l) => sum + (l.calories ?? 0), 0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Æfingadagbók
        </div>
        <h1 className="mt-2 text-3xl font-bold">Dagbók</h1>
        <p className="mt-2 text-muted-foreground">
          Skráðu hvernig æfingin var — álag, þyngdir og kaloríur á tækjunum.
        </p>
      </div>

      {list.length > 0 && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Skráðar æfingar" value={list.length} />
          <Stat label="Meðal RPE" value={avgRpe} />
          <Stat
            label="Kaloríur samtals"
            value={Math.round(totalCalories).toLocaleString("is-IS")}
          />
        </div>
      )}

      {scheduled && (
        <div className="mb-4 rounded-lg border border-accent/40 bg-accent/10 p-4">
          <div className="text-sm">
            <span className="font-medium">Æfing dagsins:</span>{" "}
            {scheduled.scheduled_day} ·{" "}
            {CATEGORY_LABEL[scheduled.category] ?? scheduled.category}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {lastSame
              ? `Síðast þegar þú tókst þessa æfingu (${lastSame.logged_on}): ${
                  lastSame.rpe != null ? `RPE ${lastSame.rpe}/10` : "ekkert RPE"
                }${lastSame.calories != null ? ` · ${lastSame.calories} kcal` : ""}.`
              : "Fyrsta skiptið sem þú skráir þessa æfingu — næst geturðu borið saman."}
          </div>
        </div>
      )}

      <div className="mb-8">
        <LogForm userId={user!.id} today={today} scheduled={scheduled} />
      </div>

      {comparisons.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-semibold">Samanburður — sömu æfingar</h2>
          <div className="space-y-4">
            {comparisons.map((g, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-muted p-4"
              >
                <div className="text-sm font-medium">
                  {g.day ?? "Æfing"} ·{" "}
                  {g.category
                    ? (CATEGORY_LABEL[g.category] ?? g.category)
                    : ""}
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {g.entries.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between text-muted-foreground"
                    >
                      <span>{e.logged_on}</span>
                      <span>
                        {e.rpe != null ? `RPE ${e.rpe}/10` : "—"}
                        {e.calories != null ? ` · ${e.calories} kcal` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 font-semibold">Saga</h2>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Engar færslur enn. Skráðu fyrstu æfinguna hér að ofan.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Dags.</th>
                  <th className="px-4 py-2 font-medium">RPE</th>
                  <th className="px-4 py-2 font-medium">Þyngdir</th>
                  <th className="px-4 py-2 font-medium">Kaloríur</th>
                  <th className="px-4 py-2 font-medium">Athugasemd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((l) => (
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
                      {l.weights ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                      {l.calories != null
                        ? `${l.calories} kcal${l.machine ? ` · ${MACHINE_LABEL[l.machine] ?? l.machine}` : ""}`
                        : ""}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {l.notes ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-muted p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
