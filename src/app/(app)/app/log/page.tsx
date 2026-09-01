import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogForm } from "./log-form";
import { LogHistory } from "./log-history";

export const metadata = {
  title: "Æfingadagbók · Metabolic",
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
  weights_json: Record<string, string> | null;
  level: string | null;
  calories: number | null;
  machine: string | null;
  machines_json: Record<string, string> | null;
  total_volume: number | null;
  notes: string | null;
  activity: string | null;
  structure_source_id: string | null;
  scheduled_day: string | null;
  scheduled_category: string | null;
};

type WeekWorkout = {
  slot: number;
  structure_source_id: string;
  category: string;
  name: string;
  day: string | null;
  preview: string;
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
  const DAYS_IS = [
    "Sunnudagur", "Mánudagur", "Þriðjudagur", "Miðvikudagur",
    "Fimmtudagur", "Föstudagur", "Laugardagur",
  ];
  const todayDay = DAYS_IS[new Date(`${today}T00:00:00`).getDay()];

  // This week's plan for every level at the member's station — the member picks
  // which level they actually did (they can move between MB1/MB2/MB3 per session).
  const { data: planRows } = await supabase.rpc("current_week_plans_by_level");
  const rows = (planRows ?? []) as {
    level: string;
    slot: number;
    structure_source_id: string;
    category: string;
    name: string;
    day: string | null;
    preview: string | null;
  }[];

  // Fall back to the library prescription when a slot has no per-week override.
  const planSourceIds = [
    ...new Set(rows.map((r) => r.structure_source_id).filter(Boolean)),
  ];
  const { data: structPreviews } = planSourceIds.length
    ? await supabase
        .from("structures")
        .select("source_id, preview")
        .in("source_id", planSourceIds)
    : { data: [] as { source_id: string; preview: string | null }[] };
  const previewBySource = new Map(
    (structPreviews ?? []).map((s) => [s.source_id, s.preview ?? ""]),
  );

  const weekByLevel: Record<string, WeekWorkout[]> = {};
  for (const r of rows) {
    (weekByLevel[r.level] ??= []).push({
      slot: r.slot,
      structure_source_id: r.structure_source_id,
      category: r.category,
      name: r.name,
      day: r.day,
      preview: r.preview || previewBySource.get(r.structure_source_id) || "",
    });
  }

  const { data: logs } = await supabase
    .from("workout_logs")
    .select(
      "id, logged_on, rpe, weights, weights_json, level, calories, machine, machines_json, total_volume, notes, activity, structure_source_id, scheduled_day, scheduled_category",
    )
    .eq("user_id", user!.id)
    .order("logged_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);

  const list = (logs ?? []) as Log[];

  // Auto-tracked best working weight per exercise (maintained by a DB trigger
  // from weights_json). Lets the form flag a new PR per movement as you type.
  const { data: exBests } = await supabase
    .from("exercise_bests")
    .select("exercise, best_value")
    .eq("user_id", user!.id);
  const exerciseBests: Record<string, number> = Object.fromEntries(
    (exBests ?? []).map((b) => [b.exercise, Number(b.best_value)]),
  );

  // Exercise catalog for "önnur æfing": movement pattern (video category) →
  // exercise names, so the member picks a pattern then an exercise.
  const { data: exVideos } = await supabase
    .from("exercise_videos")
    .select("name, category")
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  const exerciseCatalog: Record<string, string[]> = {};
  for (const v of exVideos ?? []) {
    const cat = v.category ?? "Annað";
    (exerciseCatalog[cat] ??= []).push(v.name);
  }

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

  // Workouts the member has already logged (rated). Their names are no longer a
  // surprise, so they may be shown by name in the picker; unlogged ones stay
  // hidden until logged — you should never see the workout before you do it.
  const loggedSourceIds = [
    ...new Set(
      list
        .map((l) => l.structure_source_id)
        .filter((id): id is string => !!id),
    ),
  ];

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
        <a
          href="/app/tengingar"
          className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
        >
          ⌚ Tengja úr (Garmin, Apple Watch, Polar…) — láttu æfingar skrást
          sjálfkrafa →
        </a>
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

      <div className="mb-8">
        <LogForm
          userId={user!.id}
          today={today}
          todayDay={todayDay}
          weekByLevel={weekByLevel}
          loggedSourceIds={loggedSourceIds}
          exerciseBests={exerciseBests}
          exerciseCatalog={exerciseCatalog}
          recent={list
            .filter((l) => l.structure_source_id)
            .map((l) => ({
              structure_source_id: l.structure_source_id!,
              level: l.level,
              logged_on: l.logged_on,
              rpe: l.rpe,
              calories: l.calories,
              weights: l.weights,
            }))}
        />
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
          <LogHistory logs={list} />
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
