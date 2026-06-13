import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMeasure, formatTime, isTimeUnit } from "@/lib/format";
import { PbForm } from "./pb-form";
import { ProgressChart } from "./progress-chart";

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

export default async function PersonalBestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, station:stations(name)")
    .eq("id", user!.id)
    .single();

  const { data: benchmarks } = await supabase
    .from("benchmarks")
    .select("id, name, category, unit, higher_is_better")
    .order("position", { ascending: true });

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
