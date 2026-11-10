import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogForm } from "./log-form";
import { LogHistory } from "./log-history";
import { ProgressChart } from "../personal-bests/progress-chart";

export const metadata = {
  title: "Æfingadagbók · Metabolic",
};

// Automatic watch sync (Garmin/Apple Watch/Polar via Terra) isn't working yet,
// so the "Tengja úr" entry point is hidden. The feature code (/app/tengingar +
// API routes) is kept — flip to true to re-enable once sync works.
const WATCH_SYNC_ENABLED = false;

const CATEGORY_LABEL: Record<string, string> = {
  strength: "Strength",
  power_strength: "Power/Strength",
  power: "Power",
  endurance: "Endurance",
  burn: "Burn",
};

const MACHINE_LABEL: Record<string, string> = {
  assault_airbike: "Assault Airbike",
  assault_runner: "Assault Runner",
  concept2_row: "Concept2 Róður",
  concept2_bike: "Concept2 Bike",
  concept2_ski: "Concept2 Ski",
  other: "Annað",
};

type Log = {
  id: string;
  logged_on: string;
  rpe: number | null;
  weights: string | null;
  weights_json: Record<string, string> | null;
  volume_json: Record<
    string,
    { sets: { reps: number; kg: number }[]; volume: number }
  > | null;
  level: string | null;
  calories: number | null;
  machine: string | null;
  machines_json: Record<string, string> | null;
  machine_distance_json: Record<string, string> | null;
  total_volume: number | null;
  est_calories: number | null;
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

// Which machine(s) a log was done on, with per-machine kcal and (for the runner)
// distance — so a comparison shows whether you used e.g. the airbike or Concept2.
function machinesText(e: Log): string {
  const dist = e.machine_distance_json ?? {};
  if (e.machines_json && Object.keys(e.machines_json).length) {
    return Object.entries(e.machines_json)
      .map(([k, v]) => {
        const label = MACHINE_LABEL[k] ?? k;
        const kcal = Number(v) || 0;
        const m = Number(dist[k]) || 0;
        const bits = [
          kcal > 0 ? `${Math.round(kcal)} kcal` : "",
          m > 0 ? `${Math.round(m)} m` : "",
        ]
          .filter(Boolean)
          .join(", ");
        return bits ? `${label} (${bits})` : label;
      })
      .join(" · ");
  }
  if (e.machine) return MACHINE_LABEL[e.machine] ?? e.machine;
  return "";
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Monday (ISO week start) for a given date, as YYYY-MM-DD — the bucket key for
// weekly aggregation so the trend groups a whole training week into one point.
function weekStartISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
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
    cycle_week: string | null;
  }[];
  // Which periodization week the member's station is on right now (Vika 1–4).
  const currentCycleWeek = rows.find((r) => r.cycle_week)?.cycle_week ?? null;

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
      "id, logged_on, rpe, weights, weights_json, volume_json, level, calories, machine, machines_json, machine_distance_json, total_volume, est_calories, notes, activity, structure_source_id, scheduled_day, scheduled_category",
    )
    .eq("user_id", user!.id)
    .order("logged_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);

  const list = (logs ?? []) as Log[];

  // Most recently logged sets (reps + kg) per exercise, for the "Sama og síðast"
  // one-tap fill in the log form. `list` is newest-first, so the first time a
  // name appears is its latest log.
  const lastSetsByExercise: Record<string, { reps: number; kg: number }[]> = {};
  for (const l of list) {
    if (!l.volume_json) continue;
    for (const [name, info] of Object.entries(l.volume_json)) {
      if (lastSetsByExercise[name]) continue;
      const sets = (info?.sets ?? [])
        .map((s) => ({ reps: Number(s.reps) || 0, kg: Number(s.kg) || 0 }))
        .filter((s) => s.reps > 0 || s.kg > 0);
      if (sets.length) lastSetsByExercise[name] = sets;
    }
  }

  // Auto-tracked best working weight per exercise (maintained by a DB trigger
  // from weights_json). Lets the form flag a new PR per movement as you type.
  const { data: exBests } = await supabase
    .from("exercise_bests")
    .select("exercise, best_value")
    .eq("user_id", user!.id);
  const exerciseBests: Record<string, number> = Object.fromEntries(
    (exBests ?? []).map((b) => [b.exercise, Number(b.best_value)]),
  );

  // Bodyweight (from the member's nutrition profile) drives the live calorie-burn
  // estimate in the form while wearables aren't connected. Null if not set yet.
  const { data: nutProfile } = await supabase
    .from("nutrition_profile")
    .select("weight_kg")
    .eq("user_id", user!.id)
    .maybeSingle();
  const weightKg = nutProfile?.weight_kg != null ? Number(nutProfile.weight_kg) : null;

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

  // Movements members do that aren't in the video bank yet — added so they can
  // still be picked when self-logging "önnur æfing".
  const EXTRA_CATALOG: Record<string, string[]> = {
    "Framan á læri": ["Thruster", "BB Squat", "BB Front Squat", "BB Box Squat"],
    "Framan á læri nr. 2": [
      "Afturstig + armkreppa",
      "Afturstig + pressa",
      "Hliðarstig",
    ],
    // The video bank's "Lárétt pressa" is only push-up variations — add the
    // barbell/dumbbell bench presses members actually load, plus floor press
    // (used in the programming) and a machine option.
    "Lárétt pressa": [
      "BB Bekkpressa",
      "BB Incline Bekkpressa",
      "DB Bekkpressa",
      "DB Incline Bekkpressa",
      "BB Floor press",
      "DB Floor press",
      "Bekkpressa í tæki",
    ],
    "Lóðrétt pressa": ["Lateral raise", "Front raise"],
    // Biceps/triceps aren't their own category in the video bank — add them as
    // dedicated patterns so members can log arm work directly.
    Biceps: [
      "BB Armkreppa",
      "DB Armkreppa",
      "Hammer curl",
      "Kaðal armkreppa",
      "Preacher curl",
    ],
    Triceps: [
      "Kaðal armrétta",
      "DB Skull crusher",
      "Overhead armrétta",
      "Þröng bekkpressa",
      "Dýfur",
    ],
  };
  for (const [cat, names] of Object.entries(EXTRA_CATALOG)) {
    const listForCat = (exerciseCatalog[cat] ??= []);
    for (const n of names) if (!listForCat.includes(n)) listForCat.push(n);
    listForCat.sort((a, b) => a.localeCompare(b, "is"));
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

  // Names of workouts already logged (they're revealed once logged) for the
  // history cards.
  const { data: loggedStructs } = loggedSourceIds.length
    ? await supabase.from("structures").select("source_id, name").in("source_id", loggedSourceIds)
    : { data: [] as { source_id: string; name: string }[] };
  const loggedNames: Record<string, string> = Object.fromEntries(
    (loggedStructs ?? []).map((s) => [s.source_id, s.name]),
  );

  const rpeValues = list.map((l) => l.rpe).filter((r): r is number => r != null);
  const avgRpe = rpeValues.length
    ? (rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length).toFixed(1).replace(".", ",")
    : "—";

  // Volume trend: total training load (sett × reps × kg) summed per week. Every
  // strength workout in a week adds up, so the trend tracks weekly load over time.
  const volumeByWeek = new Map<string, number>();
  for (const l of list) {
    const v = Number(l.total_volume) || 0;
    if (v <= 0) continue;
    const wk = weekStartISO(l.logged_on);
    volumeByWeek.set(wk, (volumeByWeek.get(wk) ?? 0) + v);
  }
  const volumePoints = [...volumeByWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, v]) => ({ achieved_on: week, value: Math.round(v) }));

  // This week at a glance: which days have a log, sessions this week, and how
  // many weeks in a row the member has logged at least once.
  const thisWeek = weekStartISO(today);
  const loggedDates = new Set(list.map((l) => l.logged_on));
  const STRIP_DAYS = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];
  const strip = STRIP_DAYS.map((label, i) => {
    const d = new Date(`${thisWeek}T00:00:00`);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { label, iso, done: loggedDates.has(iso), isToday: iso === today, future: iso > today };
  });
  const sessionsThisWeek = list.filter((l) => weekStartISO(l.logged_on) === thisWeek).length;
  const loggedWeeks = new Set(list.map((l) => weekStartISO(l.logged_on)));
  let streak = 0;
  {
    const cursor = new Date(`${thisWeek}T00:00:00`);
    if (!loggedWeeks.has(thisWeek)) cursor.setDate(cursor.getDate() - 7);
    for (;;) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      if (!loggedWeeks.has(key)) break;
      streak++;
      cursor.setDate(cursor.getDate() - 7);
    }
  }

  const weekStrip = (
    <div className="grid grid-cols-7 gap-1.5" aria-label="Þessi vika">
        {strip.map((d) => (
          <div
            key={d.iso}
            className={`flex flex-col items-center gap-1.5 rounded-lg border py-2 ${
              d.isToday ? "border-accent bg-accent/5" : "border-border bg-muted"
            }`}
          >
            <span className="text-[11px] text-muted-foreground">{d.label}</span>
            <span
              className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${
                d.done
                  ? "bg-emerald-400 text-background"
                  : d.isToday
                    ? "text-orange-400"
                    : "text-muted-foreground/40"
              }`}
            >
              {d.done ? "✓" : d.isToday ? "•" : d.future ? "" : "–"}
            </span>
            <span className="sr-only">{d.done ? "skráð" : "ekki skráð"}</span>
          </div>
        ))}
      </div>
  );
  const statsBlock = list.length > 0 && (
    <div className="grid grid-cols-3 gap-2">
      <Stat label={sessionsThisWeek === 1 ? "tími þessa viku" : "tímar þessa viku"} value={sessionsThisWeek} />
      <Stat label="meðal RPE" value={avgRpe} />
      <Stat label={streak === 1 ? "vika í röð" : "vikur í röð"} value={streak} />
    </div>
  );
  const extras = (
    <>
      {comparisons.length > 0 && (
        <details className="rounded-xl border border-border bg-muted">
          <summary className="cursor-pointer px-4 py-3 font-semibold">
            Samanburður — sömu æfingar ({comparisons.length})
          </summary>
          <div className="px-4 pb-4">
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
                <ul className="mt-2 space-y-1.5 text-sm">
                  {g.entries.map((e) => {
                    const machines = machinesText(e);
                    return (
                      <li key={e.id} className="text-muted-foreground">
                        <div className="flex items-center justify-between">
                          <span>{e.logged_on}</span>
                          <span>
                            {e.rpe != null ? `RPE ${e.rpe}/10` : "—"}
                            {e.calories != null ? ` · ${e.calories} kcal` : ""}
                          </span>
                        </div>
                        {machines && (
                          <div className="mt-0.5 text-xs">🚲 {machines}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          </div>
        </details>
      )}

      {volumePoints.length >= 2 && (
        <details className="rounded-xl border border-border bg-muted">
          <summary className="cursor-pointer px-4 py-3 font-semibold">Álagsþróun (vikulegt)</summary>
          <div className="px-4 pb-4">
          <ProgressChart
            name="Heildar-álag á viku (sett × reps × kg)"
            unit="kg"
            higherIsBetter
            points={volumePoints}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Samtala álags allra styrktaræfinga hverrar viku (mánudagur–sunnudagur).
            Vaxandi lína = þú ert að lyfta meira yfir tíma. Dagsetning = upphaf
            vikunnar.
          </p>
          </div>
        </details>
      )}

    </>
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10 lg:max-w-6xl">
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold sm:text-3xl">Æfingadagbók</h1>
          {currentCycleWeek && (
            <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-0.5 text-xs font-medium text-orange-400">
              Lota · {currentCycleWeek.toLowerCase()}
            </span>
          )}
        </div>
        {/* Hidden until automatic watch sync (Garmin/Terra) works end-to-end.
            The /app/tengingar page + API routes are kept — flip this to true to
            bring the entry point back. */}
        {WATCH_SYNC_ENABLED && (
          <a
            href="/app/tengingar"
            className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            ⌚ Tengja úr (Garmin, Apple Watch, Polar…) — láttu æfingar skrást
            sjálfkrafa →
          </a>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-5">
          {/* Phone/tablet: week strip above the form, stats + extras below it. */}
          <div className="lg:hidden">{weekStrip}</div>
          <div>
        <LogForm
          userId={user!.id}
          today={today}
          todayDay={todayDay}
          weekByLevel={weekByLevel}
          loggedSourceIds={loggedSourceIds}
          exerciseBests={exerciseBests}
          exerciseCatalog={exerciseCatalog}
          lastSets={lastSetsByExercise}
          weightKg={weightKg}
          isFirstLog={list.length === 0}
          recent={list
            .filter((l) => l.structure_source_id)
            .map((l) => ({
              structure_source_id: l.structure_source_id!,
              level: l.level,
              logged_on: l.logged_on,
              rpe: l.rpe,
              calories: l.calories,
              weights: l.weights,
              total_volume: l.total_volume,
            }))}
        />
      </div>

          <div className="space-y-3 lg:hidden">
            {statsBlock}
            {extras}
          </div>
          <div className="pt-3">
        <h2 className="mb-3 text-lg font-bold">Saga</h2>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Engar færslur enn. Skráðu fyrstu æfinguna hér að ofan.
          </p>
        ) : (
          <LogHistory logs={list} names={loggedNames} today={today} />
        )}
      </div>
        </div>

        {/* Desktop: the week, stats and extras sit beside the form. */}
        <aside className="hidden space-y-3 lg:sticky lg:top-6 lg:block">
          {weekStrip}
          {statsBlock}
          {extras}
        </aside>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-muted p-3">
      <div className="text-xl font-bold">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
