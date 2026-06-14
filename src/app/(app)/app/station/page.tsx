import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMeasure } from "@/lib/format";
import { MemberActions } from "./member-actions";

export const metadata = {
  title: "Stöðin · Metabolic",
};

type Benchmark = {
  id: string;
  name: string;
  unit: string;
  higher_is_better: boolean;
  position: number;
};

export default async function StationPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const { station: stationParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, station_id, coach_station_ids")
    .eq("id", user!.id)
    .single();

  // Coaches and admins only.
  if (!profile || profile.role === "student") redirect("/app");
  const isAdmin = profile.role === "admin";

  const { data: stations } = await supabase
    .from("stations")
    .select("id, name")
    .order("name", { ascending: true });
  const allStations = stations ?? [];

  // Stations this user may view: admins → all; coaches → primary + extras.
  const myIds = [
    profile.station_id,
    ...(profile.coach_station_ids ?? []),
  ].filter(Boolean) as string[];
  const allowedStations = isAdmin
    ? allStations
    : allStations.filter((s) => myIds.includes(s.id));
  const canSwitch = allowedStations.length > 1;

  const targetStationId =
    stationParam && allowedStations.some((s) => s.id === stationParam)
      ? stationParam
      : allowedStations[0]?.id ?? profile.station_id;
  const targetStation = allStations.find((s) => s.id === targetStationId);

  const { data: members } = targetStationId
    ? await supabase
        .from("profiles")
        .select("id, full_name, role, status")
        .eq("station_id", targetStationId)
        .order("full_name", { ascending: true })
    : { data: [] };
  const roster = members ?? [];
  const memberIds = roster.map((m) => m.id);
  const nameById = new Map(roster.map((m) => [m.id, m.full_name ?? "—"]));

  const { data: benchmarks } = await supabase
    .from("benchmarks")
    .select("id, name, unit, higher_is_better, position")
    .order("position", { ascending: true });
  const benchList = (benchmarks ?? []) as Benchmark[];

  const { data: pbs } = memberIds.length
    ? await supabase
        .from("personal_bests")
        .select("user_id, value, benchmark_id")
        .in("user_id", memberIds)
    : { data: [] };
  const pbList = pbs ?? [];

  // Best value per (benchmark, member).
  const best = new Map<string, Map<string, number>>();
  const pbCount = new Map<string, number>();
  for (const pb of pbList) {
    pbCount.set(pb.user_id, (pbCount.get(pb.user_id) ?? 0) + 1);
    const bm = benchList.find((b) => b.id === pb.benchmark_id);
    if (!bm) continue;
    if (!best.has(pb.benchmark_id)) best.set(pb.benchmark_id, new Map());
    const um = best.get(pb.benchmark_id)!;
    const cur = um.get(pb.user_id);
    const better =
      cur == null || (bm.higher_is_better ? pb.value > cur : pb.value < cur);
    if (better) um.set(pb.user_id, pb.value);
  }

  const leaderboards = benchList
    .map((bm) => {
      const um = best.get(bm.id);
      if (!um || um.size === 0) return null;
      const rows = [...um.entries()]
        .map(([uid, value]) => ({ name: nameById.get(uid) ?? "—", value }))
        .sort((a, b) =>
          bm.higher_is_better ? b.value - a.value : a.value - b.value,
        );
      return { benchmark: bm, rows };
    })
    .filter(Boolean) as { benchmark: Benchmark; rows: { name: string; value: number }[] }[];

  // Weekly plans for this station (oversight; admin can switch stations above).
  const { data: stationWeeks } = targetStationId
    ? await supabase
        .from("weekly_plans")
        .select("id, title, level, week_starting, programs_json, owner_id")
        .eq("station_id", targetStationId)
        .order("created_at", { ascending: false })
        .limit(8)
    : { data: [] };
  const weeks = stationWeeks ?? [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Stöðvar-yfirlit
        </div>
        <h1 className="mt-2 text-3xl font-bold">
          {targetStation?.name ?? "Stöðin"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {roster.length} skráðir · {pbList.length} skráð met. Þjálfarar sjá sína
          stöð; aðrar stöðvar eru faldar.
        </p>
        <div className="mt-4">
          <Link
            href={
              canSwitch && targetStationId
                ? `/app/station/timetable?station=${targetStationId}`
                : "/app/station/timetable"
            }
            className="inline-block rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium hover:border-accent transition"
          >
            Breyta tímatöflu →
          </Link>
        </div>
      </div>

      {/* Switch station (admins, and coaches with more than one station) */}
      {canSwitch && (
        <div className="mb-8 flex flex-wrap gap-2">
          {allowedStations.map((s) => (
            <Link
              key={s.id}
              href={`/app/station?station=${s.id}`}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                s.id === targetStationId
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Leaderboards */}
        <div className="lg:col-span-2">
          <h2 className="mb-4 font-semibold">Leaderboards</h2>
          {leaderboards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Engin met skráð á þessari stöð enn.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {leaderboards.map(({ benchmark, rows }) => (
                <div
                  key={benchmark.id}
                  className="rounded-lg border border-border bg-muted p-4"
                >
                  <div className="font-mono text-[10px] tracking-widest text-accent uppercase">
                    {benchmark.name}
                  </div>
                  <ol className="mt-3 space-y-1.5">
                    {rows.slice(0, 5).map((r, i) => (
                      <li
                        key={r.name + i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`w-4 text-right font-mono text-xs ${
                              i === 0 ? "text-accent" : "text-muted-foreground"
                            }`}
                          >
                            {i + 1}
                          </span>
                          {r.name}
                        </span>
                        <span className="font-medium">
                          {formatMeasure(r.value, benchmark.unit)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Roster */}
        <div>
          <h2 className="mb-4 font-semibold">Iðkendur</h2>
          {roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Engir skráðir á þessari stöð.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {roster.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {m.full_name ?? "—"}
                    {m.role !== "student" ? (
                      <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                        {m.role}
                      </span>
                    ) : (
                      m.status !== "active" && (
                        <span
                          className={`font-mono text-[10px] uppercase tracking-widest ${
                            m.status === "pending"
                              ? "text-amber-400"
                              : "text-red-400"
                          }`}
                        >
                          {m.status === "pending" ? "Í bið" : "Lokað"}
                        </span>
                      )
                    )}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {pbCount.get(m.id) ?? 0} met
                    </span>
                    {m.role === "student" && (
                      <MemberActions
                        memberId={m.id}
                        status={m.status}
                        canDelete={isAdmin}
                      />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Weekly plans for this station */}
      <div className="mt-8">
        <h2 className="mb-4 font-semibold">Vikur stöðvarinnar</h2>
        {weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Engar vistaðar vikur á þessari stöð enn.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {weeks.map((w) => {
              const slots = Array.isArray(w.programs_json)
                ? w.programs_json.length
                : 0;
              return (
                <li key={w.id}>
                  <Link
                    href={`/app/programs/weeks/${w.id}`}
                    className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted"
                  >
                    <span>
                      {w.title || `Vika ${w.week_starting}`}
                      <span className="ml-2 font-mono text-xs text-accent">
                        {w.level}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {nameById.get(w.owner_id) ?? "—"}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {w.week_starting} · {slots} tímar →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
