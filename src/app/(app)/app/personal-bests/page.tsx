import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMeasure, formatTime, isTimeUnit } from "@/lib/format";
import { PbForm } from "./pb-form";
import { ProgressChart } from "./progress-chart";
import { SharePbToggle } from "./share-toggle";

export const metadata = {
  title: "Mín met · Metabolic",
};

type Benchmark = {
  id: string;
  name: string;
  category: string;
  unit: string;
  higher_is_better: boolean;
};

type Pb = {
  id: string;
  value: number;
  unit: string;
  achieved_on: string;
  notes: string | null;
  benchmark: Benchmark | null;
};

export default async function PersonalBestsPage({
  searchParams,
}: {
  searchParams: Promise<{ met?: string }>;
}) {
  const { met: metParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, share_pbs, station_id, station:stations(name)")
    .eq("id", user!.id)
    .single();

  const { data: benchmarks } = await supabase
    .from("benchmarks")
    .select("id, name, category, unit, higher_is_better")
    .order("position", { ascending: true });
  const benchList = (benchmarks ?? []) as Benchmark[];

  // Station PB leaderboard (only members who opted in + always yourself).
  const selectedBenchmark =
    benchList.find((b) => b.id === metParam) ?? benchList[0] ?? null;
  const { data: lbRows } = selectedBenchmark
    ? await supabase.rpc("pb_leaderboard", {
        p_benchmark: selectedBenchmark.id,
      })
    : { data: [] };
  const leaderboard = lbRows ?? [];

  const { data: pbs } = await supabase
    .from("personal_bests")
    .select(
      "id, value, unit, achieved_on, notes, benchmark:benchmarks(id, name, category, unit, higher_is_better)",
    )
    .eq("user_id", user!.id)
    .order("achieved_on", { ascending: false });

  const entries = (pbs ?? []) as unknown as Pb[];
  const stationName =
    (profile?.station as { name: string } | null)?.name ?? null;

  // Auto-tracked best working weight per exercise, derived from the Dagbók log
  // (heaviest weight you've actually used in a session) — distinct from the
  // explicit 1RM benchmarks above.
  const { data: exBestRows } = await supabase
    .from("exercise_bests")
    .select("exercise, best_value, achieved_on")
    .eq("user_id", user!.id)
    .order("best_value", { ascending: false });
  const exBests = (exBestRows ?? []) as {
    exercise: string;
    best_value: number;
    achieved_on: string;
  }[];

  // Best entry per benchmark (respecting higher_is_better).
  const bestByBenchmark = new Map<string, Pb>();
  for (const e of entries) {
    if (!e.benchmark) continue;
    const cur = bestByBenchmark.get(e.benchmark.id);
    if (!cur) {
      bestByBenchmark.set(e.benchmark.id, e);
      continue;
    }
    const better = e.benchmark.higher_is_better
      ? e.value > cur.value
      : e.value < cur.value;
    if (better) bestByBenchmark.set(e.benchmark.id, e);
  }
  const bests = [...bestByBenchmark.values()];

  // Progress series per benchmark (ascending by date), for benchmarks with ≥2 entries.
  const seriesByBenchmark = new Map<
    string,
    {
      name: string;
      unit: string;
      higherIsBetter: boolean;
      points: { achieved_on: string; value: number }[];
    }
  >();
  for (const e of entries) {
    if (!e.benchmark) continue;
    if (!seriesByBenchmark.has(e.benchmark.id)) {
      seriesByBenchmark.set(e.benchmark.id, {
        name: e.benchmark.name,
        unit: e.unit,
        higherIsBetter: e.benchmark.higher_is_better,
        points: [],
      });
    }
    seriesByBenchmark
      .get(e.benchmark.id)!
      .points.push({ achieved_on: e.achieved_on, value: e.value });
  }
  const charts = [...seriesByBenchmark.values()]
    .map((s) => ({
      ...s,
      points: [...s.points].sort((a, b) =>
        a.achieved_on < b.achieved_on ? -1 : 1,
      ),
    }))
    .filter((s) => s.points.length >= 2);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Mín met {stationName ? `· ${stationName}` : ""}
        </div>
        <h1 className="mt-2 text-3xl font-bold">Personal Best</h1>
        <p className="mt-2 text-muted-foreground">
          Haltu utan um bestu árangra þína í lyklaæfingum
          {stationName ? ` hjá ${stationName}` : ""}.
        </p>
      </div>

      {/* Sharing toggle */}
      {profile?.station_id && (
        <div className="mb-8">
          <SharePbToggle
            userId={user!.id}
            initial={profile?.share_pbs ?? false}
            stationName={stationName}
          />
        </div>
      )}

      {/* Current bests */}
      {bests.length > 0 && (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bests.map((b) => (
            <div
              key={b.id}
              className="rounded-lg border border-border bg-muted p-4"
            >
              <div className="text-xs text-muted-foreground">
                {b.benchmark?.name}
              </div>
              <div className="mt-1 text-2xl font-bold">
                {isTimeUnit(b.unit) ? (
                  formatTime(b.value)
                ) : (
                  <>
                    {b.value}{" "}
                    <span className="text-base font-normal text-muted-foreground">
                      {b.unit}
                    </span>
                  </>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {b.achieved_on}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-tracked exercise bests from the workout log */}
      {exBests.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-1 font-semibold">Æfingamet</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Þyngsta þyngd sem þú hefur notað í hverri æfingu — skráist sjálfkrafa
            úr dagbókinni.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {exBests.map((b) => (
              <div
                key={b.exercise}
                className="rounded-lg border border-border bg-muted p-4"
              >
                <div className="text-xs text-muted-foreground">{b.exercise}</div>
                <div className="mt-1 text-2xl font-bold">
                  {b.best_value}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    kg
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {b.achieved_on}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Station leaderboard */}
      {profile?.station_id && selectedBenchmark && (
        <div className="mb-8">
          <h2 className="mb-1 font-semibold">Topplisti stöðvarinnar</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Aðeins þeir sem hafa kveikt á deilingu sjást hér.
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {benchList.map((b) => (
              <Link
                key={b.id}
                href={`/app/personal-bests?met=${b.id}`}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  b.id === selectedBenchmark.id
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {b.name}
              </Link>
            ))}
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Engin deild met í þessari æfingu ennþá.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-12 px-4 py-2 text-center">#</th>
                    <th className="px-4 py-2">Iðkandi</th>
                    <th className="px-4 py-2 text-right">{selectedBenchmark.name}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {leaderboard.map((r, i) => {
                    const me = r.user_id === user!.id;
                    return (
                      <tr
                        key={r.user_id}
                        className={me ? "bg-accent/10" : undefined}
                      >
                        <td className="px-4 py-2 text-center text-lg">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                        </td>
                        <td className="px-4 py-2 font-medium">
                          {r.full_name || "—"}
                          {me && <span className="ml-2 text-xs text-accent">(þú)</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold">
                          {formatMeasure(Number(r.value), selectedBenchmark.unit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Progress charts */}
      {charts.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-semibold">Framvinda</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {charts.map((c) => (
              <ProgressChart
                key={c.name}
                name={c.name}
                unit={c.unit}
                higherIsBetter={c.higherIsBetter}
                points={c.points}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      <div className="mb-8">
        <PbForm userId={user!.id} benchmarks={benchmarks ?? []} />
      </div>

      {/* Full log */}
      <div>
        <h2 className="mb-3 font-semibold">Saga</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Engin met skráð enn. Skráðu þitt fyrsta hér að ofan.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Æfing</th>
                  <th className="px-4 py-2 font-medium">Gildi</th>
                  <th className="px-4 py-2 font-medium">Dagsetning</th>
                  <th className="px-4 py-2 font-medium">Athugasemd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2">{e.benchmark?.name ?? "—"}</td>
                    <td className="px-4 py-2 font-medium">
                      {formatMeasure(e.value, e.unit)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {e.achieved_on}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {e.notes ?? ""}
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
