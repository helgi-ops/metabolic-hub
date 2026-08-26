import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMeasure } from "@/lib/format";
import { daysSince } from "@/lib/streak";
import { MemberActions } from "./member-actions";
import { ProgramBuilderToggle } from "./program-builder-toggle";

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
        .select("id, full_name, role, status, can_build_programs")
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

  // Member activity — last logged workout per member, to spot who has dropped off.
  const { data: actLogs } = memberIds.length
    ? await supabase
        .from("workout_logs")
        .select("user_id, logged_on")
        .in("user_id", memberIds)
    : { data: [] as { user_id: string; logged_on: string }[] };
  const lastActive = new Map<string, string>();
  for (const l of actLogs ?? []) {
    const prev = lastActive.get(l.user_id);
    if (!prev || l.logged_on > prev) lastActive.set(l.user_id, l.logged_on);
  }
  const activity = roster
    .filter((m) => m.role === "student" && m.status === "active")
    .map((m) => {
      const last = lastActive.get(m.id) ?? null;
      return { name: m.full_name ?? "—", last, days: daysSince(last) };
    })
    .sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9));

  // Split the roster into meaningful groups so the pending-approval queue and
  // the active roster aren't buried in one long alphabetical list.
  const pendingMembers = roster.filter(
    (m) => m.role === "student" && m.status === "pending",
  );
  const coaches = roster.filter((m) => m.role !== "student");
  const activeStudents = roster.filter(
    (m) => m.role === "student" && m.status === "active",
  );
  const suspendedStudents = roster.filter(
    (m) => m.role === "student" && m.status === "suspended",
  );

  // One roster row, shared across the grouped sections below.
  const memberRow = (m: (typeof roster)[number]) => (
    <li
      key={m.id}
      className="flex items-center justify-between gap-2 px-4 py-3 text-sm"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{m.full_name ?? "—"}</span>
        {m.role !== "student" && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
            {m.role}
          </span>
        )}
        {m.role === "student" && m.status === "suspended" && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-red-400">
            Lokað
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-3">
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
        {isAdmin && m.role === "coach" && (
          <ProgramBuilderToggle
            memberId={m.id}
            enabled={m.can_build_programs}
          />
        )}
      </span>
    </li>
  );

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
          {activeStudents.length} virkir iðkendur · {coaches.length} þjálfarar
          {pendingMembers.length > 0 && (
            <span className="text-amber-400">
              {" "}
              · {pendingMembers.length} í bið
            </span>
          )}{" "}
          · {pbList.length} skráð met. Þjálfarar sjá sína stöð; aðrar stöðvar eru
          faldar.
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

      {/* Pending approvals — the coach's most actionable queue, up top */}
      {pendingMembers.length > 0 && (
        <div className="mb-8 rounded-lg border border-amber-400/40 bg-amber-400/5 p-4">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="font-semibold">Bíða samþykkis</h2>
            <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-medium text-amber-400">
              {pendingMembers.length}
            </span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Nýskráðir iðkendur — samþykktu til að veita aðgang.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {pendingMembers.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium">
                  {m.full_name ?? "—"}
                </span>
                <MemberActions
                  memberId={m.id}
                  status={m.status}
                  canDelete={isAdmin}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Member activity / at-risk */}
      {activity.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-1 font-semibold">Virkni iðkenda</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Síðasta skráða æfing. Náðu í þá sem hafa dottið úr (⚠ = 14+ dagar
            eða ekkert skráð).
          </p>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Iðkandi</th>
                  <th className="px-4 py-2 text-right">Síðasta skráning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activity.map((a, i) => {
                  const atRisk = a.days == null || a.days >= 14;
                  const warn = a.days != null && a.days >= 7 && a.days < 14;
                  const label =
                    a.days == null
                      ? "Aldrei skráð"
                      : a.days === 0
                        ? "Í dag"
                        : a.days === 1
                          ? "Í gær"
                          : `fyrir ${a.days} dögum`;
                  return (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{a.name}</td>
                      <td
                        className={`px-4 py-2 text-right ${
                          atRisk
                            ? "text-red-400"
                            : warn
                              ? "text-amber-400"
                              : "text-muted-foreground"
                        }`}
                      >
                        {label}
                        {atRisk && " ⚠"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

        {/* Roster — grouped: coaches, active students, suspended */}
        <div>
          <h2 className="mb-4 font-semibold">Iðkendur</h2>
          {roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Engir skráðir á þessari stöð.
            </p>
          ) : (
            <div className="space-y-5">
              {coaches.length > 0 && (
                <section>
                  <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Þjálfarar ({coaches.length})
                  </h3>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {coaches.map(memberRow)}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Virkir iðkendur ({activeStudents.length})
                </h3>
                {activeStudents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Engir virkir iðkendur.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {activeStudents.map(memberRow)}
                  </ul>
                )}
              </section>

              {suspendedStudents.length > 0 && (
                <section>
                  <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Lokaðir aðgangar ({suspendedStudents.length})
                  </h3>
                  <ul className="divide-y divide-border rounded-lg border border-border opacity-70">
                    {suspendedStudents.map(memberRow)}
                  </ul>
                </section>
              )}
            </div>
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
