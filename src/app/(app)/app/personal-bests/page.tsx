import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SharePbToggle } from "./share-toggle";
import { BenchmarkManager } from "./benchmark-manager";
import { AddPbButton, MetView, type ExBest, type TestCard } from "./met-view";

export const metadata = {
  title: "Mín met · Metabolic",
};

type Benchmark = {
  id: string;
  name: string;
  category: string;
  unit: string;
  higher_is_better: boolean;
  station_id: string | null;
};

type Pb = {
  id: string;
  value: number;
  unit: string;
  achieved_on: string;
  notes: string | null;
  benchmark_id: string;
};

const NEW_DAYS = 30;

// Server components render once per request, so "now" is the request time.
function requestTime(): number {
  return Date.now();
}

export default async function PersonalBestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: benchmarks }, { data: pbs }, { data: exBestRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, share_pbs, station_id, role, can_build_programs, station:stations(name)")
      .eq("id", user.id)
      .single(),
    supabase
      .from("benchmarks")
      .select("id, name, category, unit, higher_is_better, station_id")
      .order("position", { ascending: true }),
    supabase
      .from("personal_bests")
      .select("id, value, unit, achieved_on, notes, benchmark_id")
      .eq("user_id", user.id)
      .order("achieved_on", { ascending: false }),
    supabase
      .from("exercise_bests")
      .select("exercise, best_value, achieved_on")
      .eq("user_id", user.id)
      .order("achieved_on", { ascending: false }),
  ]);

  // Coaches with Program Builder access (and admins) can create station-scoped
  // custom benchmarks — the same "trusted coach" gate used elsewhere.
  const canManageBenchmarks =
    profile?.role === "admin" || (profile?.role === "coach" && profile?.can_build_programs === true);
  const benchList = (benchmarks ?? []) as Benchmark[];
  const customBenchmarks = benchList
    .filter((b) => b.station_id)
    .map((b) => ({ id: b.id, name: b.name, unit: b.unit }));
  const entries = (pbs ?? []) as Pb[];
  const stationName = (profile?.station as { name: string } | null)?.name ?? null;

  const now = requestTime();
  const isRecent = (iso: string) => now - new Date(`${iso}T00:00:00Z`).getTime() <= NEW_DAYS * 86_400_000;

  // Station rank for every test you've done (only members sharing PBs + you).
  const testedIds = [...new Set(entries.map((e) => e.benchmark_id))];
  const ranks = new Map<string, { rank: number; of: number }>();
  if (profile?.station_id && testedIds.length) {
    const boards = await Promise.all(
      testedIds.map((id) => supabase.rpc("pb_leaderboard", { p_benchmark: id }).then((r) => [id, r.data ?? []] as const)),
    );
    for (const [id, rows] of boards) {
      const i = rows.findIndex((r) => r.user_id === user.id);
      if (i !== -1) ranks.set(id, { rank: i + 1, of: rows.length });
    }
  }

  const tests: TestCard[] = benchList.map((b) => {
    const mine = entries.filter((e) => e.benchmark_id === b.id);
    let best: Pb | null = null;
    for (const e of mine) {
      if (!best || (b.higher_is_better ? e.value > best.value : e.value < best.value)) best = e;
    }
    const r = ranks.get(b.id);
    return {
      id: b.id,
      name: b.name,
      category: b.category,
      unit: b.unit,
      higherIsBetter: b.higher_is_better,
      best: best ? { value: Number(best.value), on: best.achieved_on } : null,
      points: [...mine]
        .sort((x, y) => x.achieved_on.localeCompare(y.achieved_on))
        .map((e) => ({ achieved_on: e.achieved_on, value: Number(e.value) })),
      entries: mine.map((e) => ({ id: e.id, value: Number(e.value), on: e.achieved_on, notes: e.notes })),
      isNew: !!best && isRecent(best.achieved_on),
      rank: r?.rank ?? null,
      rankOf: r?.of ?? null,
    };
  });

  const exBests: ExBest[] = (exBestRows ?? []).map((e) => ({
    exercise: e.exercise,
    best_value: Number(e.best_value),
    achieved_on: e.achieved_on,
    isNew: isRecent(e.achieved_on),
  }));

  const testedCount = tests.filter((t) => t.best).length;
  const newCount = tests.filter((t) => t.isNew).length + exBests.filter((e) => e.isNew).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">
            {testedCount} {testedCount === 1 ? "próf skráð" : "próf skráð"}
            {newCount > 0 && ` · ${newCount} ${newCount === 1 ? "nýtt met" : "ný met"} síðustu ${NEW_DAYS} daga`}
          </div>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Mín met</h1>
        </div>
        <AddPbButton />
      </header>

      <MetView
        userId={user.id}
        tests={tests}
        exBests={exBests}
        shareToggle={
          profile?.station_id ? (
            <SharePbToggle userId={user.id} initial={profile?.share_pbs ?? false} stationName={stationName} />
          ) : null
        }
      />

      {/* Coach/admin: create station-scoped custom benchmarks */}
      {canManageBenchmarks && (
        <div className="mt-8">
          <BenchmarkManager custom={customBenchmarks} />
        </div>
      )}
    </main>
  );
}
