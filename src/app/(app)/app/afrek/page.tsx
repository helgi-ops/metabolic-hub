import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { evaluateBadges, type BadgeStats } from "@/lib/badges";

export const metadata = { title: "Afrek · Metabolic" };

const CARDIO = ["assault_airbike", "concept2_row", "concept2_bike", "concept2_ski"];

function weekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export default async function AchievementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: logs }, { data: pbs }, { data: prog }, { data: enrolls }] =
    await Promise.all([
      supabase
        .from("workout_logs")
        .select("logged_on, calories, machine")
        .eq("user_id", user.id),
      supabase.from("personal_bests").select("benchmark_id").eq("user_id", user.id),
      supabase
        .from("lesson_progress")
        .select("lesson_id, completed_at")
        .eq("user_id", user.id),
      supabase.from("enrollments").select("course_id").eq("user_id", user.id),
    ]);

  const logList = logs ?? [];
  const kcal = logList
    .filter((l) => l.machine && CARDIO.includes(l.machine) && l.calories != null)
    .reduce((a, l) => a + Number(l.calories), 0);
  const activeWeeks = new Set(logList.map((l) => weekKey(l.logged_on))).size;

  const pbList = pbs ?? [];
  const pbByBench = new Map<string, number>();
  for (const p of pbList)
    pbByBench.set(p.benchmark_id, (pbByBench.get(p.benchmark_id) ?? 0) + 1);
  const pbImprovements = [...pbByBench.values()].filter((n) => n >= 2).length;

  const completedLessons = new Set(
    (prog ?? []).filter((p) => p.completed_at).map((p) => p.lesson_id),
  );

  // Fully completed courses (among enrolled).
  let coursesDone = 0;
  const courseIds = (enrolls ?? []).map((e) => e.course_id);
  if (courseIds.length) {
    const { data: mods } = await supabase
      .from("modules")
      .select("id, course_id")
      .in("course_id", courseIds);
    const modToCourse = new Map((mods ?? []).map((m) => [m.id, m.course_id]));
    const modIds = (mods ?? []).map((m) => m.id);
    const { data: lessons } = modIds.length
      ? await supabase.from("lessons").select("id, module_id").in("module_id", modIds)
      : { data: [] as { id: string; module_id: string }[] };
    const total = new Map<string, number>();
    const done = new Map<string, number>();
    for (const l of lessons ?? []) {
      const c = modToCourse.get(l.module_id);
      if (!c) continue;
      total.set(c, (total.get(c) ?? 0) + 1);
      if (completedLessons.has(l.id)) done.set(c, (done.get(c) ?? 0) + 1);
    }
    for (const c of courseIds) {
      const t = total.get(c) ?? 0;
      if (t > 0 && (done.get(c) ?? 0) >= t) coursesDone++;
    }
  }

  const stats: BadgeStats = {
    workouts: logList.length,
    kcal: Math.round(kcal),
    activeWeeks,
    pbCount: pbList.length,
    pbBenchmarks: pbByBench.size,
    pbImprovements,
    lessonsDone: completedLessons.size,
    coursesDone,
  };

  const badges = evaluateBadges(stats);
  const earnedCount = badges.filter((b) => b.earned).length;
  const groups = [...new Set(badges.map((b) => b.group))];

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Afrek
        </div>
        <h1 className="mt-2 text-3xl font-bold">Merkin þín</h1>
        <p className="mt-2 text-muted-foreground">
          Þú hefur unnið þér inn{" "}
          <span className="font-semibold text-foreground">
            {earnedCount} af {badges.length}
          </span>{" "}
          merkjum. Haltu áfram!
        </p>
      </div>

      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group}>
            <h2 className="mb-3 font-mono text-xs tracking-widest text-muted-foreground uppercase">
              {group}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {badges
                .filter((b) => b.group === group)
                .map((b) => {
                  const pct = Math.min(
                    100,
                    Math.round((b.current / b.target) * 100),
                  );
                  return (
                    <div
                      key={b.id}
                      className={`rounded-lg border p-4 transition ${
                        b.earned
                          ? "border-accent/50 bg-accent/10"
                          : "border-border bg-muted"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`text-3xl ${b.earned ? "" : "opacity-30 grayscale"}`}
                        >
                          {b.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{b.title}</span>
                            {b.earned && (
                              <span className="text-xs text-accent">✓</span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {b.desc}
                          </p>
                        </div>
                      </div>
                      {!b.earned && (
                        <div className="mt-3">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
                            <div
                              className="h-full rounded-full bg-accent/60"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="mt-1 text-right text-[11px] text-muted-foreground">
                            {Math.min(b.current, b.target)} / {b.target}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
