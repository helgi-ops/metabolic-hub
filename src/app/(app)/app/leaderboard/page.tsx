import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OptOutToggle } from "./opt-out-toggle";

export const metadata = { title: "Kcal Leaderboard · Metabolic" };

const MACHINE_FILTERS = [
  { value: "", label: "Öll tæki" },
  { value: "assault_airbike", label: "Assault Airbike" },
  { value: "concept2", label: "Concept2" },
];

const PERIOD_FILTERS = [
  { value: "", label: "Frá upphafi" },
  { value: "month", label: "Þessi mánuður" },
];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string; machine?: string; period?: string }>;
}) {
  const {
    station: stationParam,
    machine: machineParam,
    period: periodParam,
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

  const machine = MACHINE_FILTERS.some((m) => m.value === machineParam)
    ? machineParam
    : "";
  const period = PERIOD_FILTERS.some((p) => p.value === periodParam)
    ? periodParam
    : "";

  const now = new Date();
  const since =
    period === "month"
      ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
      : null;

  const { data: rows } = await supabase.rpc("kcal_leaderboard", {
    p_station: isAdmin ? stationParam || null : null,
    p_machine: machine || null,
    p_since: since,
  });

  const list = rows ?? [];
  const showStation = isAdmin && !stationParam;
  const total = list.reduce((a, r) => a + Number(r.total_kcal), 0);

  const medal = (i: number) =>
    i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm transition ${
      active
        ? "border-accent bg-accent text-accent-foreground"
        : "border-border bg-muted text-muted-foreground hover:text-foreground"
    }`;

  const qs = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const st = next.station ?? stationParam;
    const mc = next.machine ?? machine;
    const pd = next.period ?? period;
    if (st) p.set("station", st);
    if (mc) p.set("machine", mc);
    if (pd) p.set("period", pd);
    const s = p.toString();
    return `/app/leaderboard${s ? `?${s}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-2 font-mono text-xs tracking-widest text-accent uppercase">
        Kcal Leaderboard
      </div>
      <h1 className="text-3xl font-bold">Brennslan</h1>
      <p className="mt-2 text-muted-foreground">
        {period === "month" ? "Kaloríur þennan mánuð" : "Uppsafnaðar kaloríur"} á
        Assault Airbike og Concept2. {!isAdmin && "Þín stöð."}
      </p>

      <OptOutToggle
        userId={user.id}
        initialOptOut={profile?.leaderboard_opt_out ?? false}
      />

      {/* Period filter */}
      <div className="mt-6 flex flex-wrap gap-2">
        {PERIOD_FILTERS.map((p) => (
          <Link key={p.value} href={qs({ period: p.value })} className={chip(period === p.value)}>
            {p.label}
          </Link>
        ))}
      </div>

      {/* Machine filter */}
      <div className="mt-3 flex flex-wrap gap-2">
        {MACHINE_FILTERS.map((m) => (
          <Link key={m.value} href={qs({ machine: m.value })} className={chip(machine === m.value)}>
            {m.label}
          </Link>
        ))}
      </div>

      {/* Admin: station filter */}
      {isAdmin && stations && stations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={qs({ station: "" })} className={chip(!stationParam)}>
            Allar stöðvar
          </Link>
          {stations.map((s) => (
            <Link key={s.id} href={qs({ station: s.id })} className={chip(stationParam === s.id)}>
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {list.length === 0 ? (
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
                {list.map((r, i) => {
                  const me = r.user_id === user.id;
                  return (
                    <tr key={r.user_id} className={me ? "bg-accent/10" : undefined}>
                      <td className="px-4 py-3 text-center text-lg">{medal(i)}</td>
                      <td className="px-4 py-3 font-medium">
                        {r.full_name || "—"}
                        {me && <span className="ml-2 text-xs text-accent">(þú)</span>}
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
            Samtals: {total.toLocaleString("is-IS")} kcal
          </p>
        </>
      )}
    </main>
  );
}
