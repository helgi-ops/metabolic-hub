import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMeasure } from "@/lib/format";
import { OptOutToggle } from "./opt-out-toggle";

export const metadata = { title: "Leaderboard · Metabolic" };

const MACHINE_FILTERS = [
  { value: "", label: "Öll tæki" },
  { value: "assault_airbike", label: "Assault Airbike" },
  { value: "assault_runner", label: "Assault Runner" },
  { value: "concept2", label: "Concept2" },
];

const PERIOD_FILTERS = [
  { value: "", label: "Frá upphafi" },
  { value: "month", label: "Þessi mánuður" },
];

type Benchmark = {
  id: string;
  name: string;
  category: string;
  unit: string;
  higher_is_better: boolean;
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    station?: string;
    machine?: string;
    period?: string;
    met?: string;
  }>;
}) {
  const {
    station: stationParam,
    machine: machineParam,
    period: periodParam,
    met: metParam,
  } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, station_id, leaderboard_opt_out")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";

  const { data: stations } = isAdmin
    ? await supabase.from("stations").select("id, name").order("name")
    : { data: [] as { id: string; name: string }[] };

  // All station tests/benchmarks (1RM lifts, rep tests, timed tests). The
  // leaderboard can show the kcal (brennsla) competition OR any one of these.
  const { data: benchmarks } = await supabase
    .from("benchmarks")
    .select("id, name, category, unit, higher_is_better")
    .order("position", { ascending: true });
  const benchList = (benchmarks ?? []) as Benchmark[];

  // Which view: a valid benchmark id → that test; otherwise the kcal leaderboard.
  const selectedBenchmark = benchList.find((b) => b.id === metParam) ?? null;
  const isKcal = !selectedBenchmark;

  const machine =
    isKcal && MACHINE_FILTERS.some((m) => m.value === machineParam)
      ? machineParam
      : "";
  const period =
    isKcal && PERIOD_FILTERS.some((p) => p.value === periodParam)
      ? periodParam
      : "";

  const now = new Date();
  const since =
    period === "month"
      ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
      : undefined;
  const stationFilter = (isAdmin ? stationParam : "") || undefined;

  // Pull the rows for whichever view is active.
  const { data: kcalRows } = isKcal
    ? await supabase.rpc("kcal_leaderboard", {
        p_station: stationFilter,
        p_machine: machine || undefined,
        p_since: since,
      })
    : { data: [] };
  const { data: pbRows } = selectedBenchmark
    ? await supabase.rpc("pb_leaderboard", {
        p_benchmark: selectedBenchmark.id,
        p_station: stationFilter,
      })
    : { data: [] };

  const kcalList = kcalRows ?? [];
  const pbList = pbRows ?? [];
  const showStation = isAdmin && !stationParam;
  const totalKcal = kcalList.reduce((a, r) => a + Number(r.total_kcal), 0);

  const medal = (i: number) =>
    i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm transition ${
      active
        ? "border-accent bg-accent text-accent-foreground"
        : "border-border bg-muted text-muted-foreground hover:text-foreground"
    }`;

  const qs = (next: {
    station?: string;
    machine?: string;
    period?: string;
    met?: string;
  }) => {
    const p = new URLSearchParams();
    const st = "station" in next ? next.station : stationParam;
    const mt = "met" in next ? next.met : metParam;
    if (st) p.set("station", st);
    if (mt) {
      // Benchmark view — machine/period don't apply.
      p.set("met", mt);
    } else {
      const mc = "machine" in next ? next.machine : machine;
      const pd = "period" in next ? next.period : period;
      if (mc) p.set("machine", mc);
      if (pd) p.set("period", pd);
    }
    const s = p.toString();
    return `/app/leaderboard${s ? `?${s}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-2 font-mono text-xs tracking-widest text-accent uppercase">
        Leaderboard
      </div>
      <h1 className="text-3xl font-bold">
        {selectedBenchmark ? selectedBenchmark.name : "Brennslan"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {isKcal
          ? `${
              period === "month" ? "Kaloríur þennan mánuð" : "Uppsafnaðar kaloríur"
            } á Assault Airbike, Assault Runner og Concept2.`
          : "Besta skráða metið hjá hverjum iðkanda. Aðeins þeir sem hafa kveikt á deilingu (á Mín met) sjást hér."}
        {!isAdmin && " Þín stöð."}
      </p>

      {isKcal && (
        <OptOutToggle
          userId={user.id}
          initialOptOut={profile?.leaderboard_opt_out ?? false}
        />
      )}

      {/* What to rank: kcal (brennsla) or a specific test/benchmark. */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href={qs({ met: "" })} className={chip(isKcal)}>
          🔥 Brennsla
        </Link>
        {benchList.map((b) => (
          <Link
            key={b.id}
            href={qs({ met: b.id })}
            className={chip(selectedBenchmark?.id === b.id)}
          >
            {b.name}
          </Link>
        ))}
      </div>

      {/* Kcal-only sub-filters */}
      {isKcal && (
        <div className="mt-3 flex flex-wrap gap-2">
          {PERIOD_FILTERS.map((p) => (
            <Link
              key={p.value}
              href={qs({ period: p.value })}
              className={chip(period === p.value)}
            >
              {p.label}
            </Link>
          ))}
        </div>
      )}
      {isKcal && (
        <div className="mt-3 flex flex-wrap gap-2">
          {MACHINE_FILTERS.map((m) => (
            <Link
              key={m.value}
              href={qs({ machine: m.value })}
              className={chip(machine === m.value)}
            >
              {m.label}
            </Link>
          ))}
        </div>
      )}

      {/* Admin: station filter (applies to both views) */}
      {isAdmin && stations && stations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={qs({ station: "" })} className={chip(!stationParam)}>
            Allar stöðvar
          </Link>
          {stations.map((s) => (
            <Link
              key={s.id}
              href={qs({ station: s.id })}
              className={chip(stationParam === s.id)}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {!selectedBenchmark ? (
        kcalList.length === 0 ? (
          <p className="mt-10 text-muted-foreground">
            Engar kaloríur skráðar ennþá. Skráðu æfingu í{" "}
            <Link href="/app/log" className="text-accent hover:underline">
              Dagbók
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="mt-8 overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-12 px-4 py-3 text-center">#</th>
                    <th className="px-4 py-3">Iðkandi</th>
                    {showStation && <th className="px-4 py-3">Stöð</th>}
                    <th className="px-4 py-3 text-right">Skráningar</th>
                    <th className="px-4 py-3 text-right">Kcal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {kcalList.map((r, i) => {
                    const me = r.user_id === user.id;
                    return (
                      <tr
                        key={r.user_id}
                        className={me ? "bg-accent/10" : undefined}
                      >
                        <td className="px-4 py-3 text-center text-lg">
                          {medal(i)}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {r.full_name || "—"}
                          {me && (
                            <span className="ml-2 text-xs text-accent">(þú)</span>
                          )}
                        </td>
                        {showStation && (
                          <td className="px-4 py-3 text-muted-foreground">
                            {r.station_name || "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {r.entries}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          {Number(r.total_kcal).toLocaleString("is-IS")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-right text-sm text-muted-foreground">
              Samtals: {totalKcal.toLocaleString("is-IS")} kcal
            </p>
          </>
        )
      ) : pbList.length === 0 ? (
        <p className="mt-10 text-muted-foreground">
          Engin deild met í þessari æfingu ennþá. Skráðu met í{" "}
          <Link href="/app/personal-bests" className="text-accent hover:underline">
            Mín met
          </Link>
          .
        </p>
      ) : (
        <div className="mt-8 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3 text-center">#</th>
                <th className="px-4 py-3">Iðkandi</th>
                <th className="px-4 py-3 text-right">{selectedBenchmark.name}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pbList.map((r, i) => {
                const me = r.user_id === user.id;
                return (
                  <tr key={r.user_id} className={me ? "bg-accent/10" : undefined}>
                    <td className="px-4 py-3 text-center text-lg">{medal(i)}</td>
                    <td className="px-4 py-3 font-medium">
                      {r.full_name || "—"}
                      {me && (
                        <span className="ml-2 text-xs text-accent">(þú)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {formatMeasure(Number(r.value), selectedBenchmark.unit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
