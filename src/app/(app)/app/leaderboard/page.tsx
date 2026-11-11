import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMeasure } from "@/lib/format";
import { OptOutToggle } from "./opt-out-toggle";
import { NavSelect, type NavGroup } from "./nav-select";

export const metadata = { title: "Leaderboard · Metabolic" };

const MACHINE_FILTERS = [
  { value: "", label: "Öll tæki" },
  { value: "assault_airbike", label: "Assault Airbike" },
  { value: "assault_runner", label: "Assault Runner" },
  { value: "concept2", label: "Concept2" },
];

const PERIODS = [
  { value: "week", label: "Vikan" },
  { value: "month", label: "Mánuðurinn" },
  { value: "all", label: "Frá upphafi" },
] as const;

const TABS = [
  { value: "kcal", label: "Brennsla" },
  { value: "str", label: "Styrkur" },
  { value: "thol", label: "Þol & tímar" },
] as const;
type Tab = (typeof TABS)[number]["value"];

// Benchmark categories per tab, with sub-headings for the test picker.
const TAB_CATS: Record<Exclude<Tab, "kcal">, string[]> = {
  str: ["lyfta", "likamsthyngd"],
  thol: ["thol", "timataka"],
};
const SUBGROUP_LABEL: Record<string, string> = {
  lyfta: "Lyftur",
  likamsthyngd: "Líkamsþyngd",
  thol: "Þol",
  timataka: "Tímatökur (WOD)",
};
const IS_MONTHS = [
  "janúar", "febrúar", "mars", "apríl", "maí", "júní",
  "júlí", "ágúst", "september", "október", "nóvember", "desember",
];
const MEDAL = ["#fbbf24", "#d4d4d4", "#d97706"];

type Benchmark = {
  id: string;
  name: string;
  category: string;
  unit: string;
  higher_is_better: boolean;
};

type Ranked = {
  user_id: string;
  name: string;
  value: number;
  display: string;
  sub: string;
  station?: string | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

// Server components render once per request, so "now" is the request time.
function requestTime(): Date {
  return new Date();
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    station?: string;
    machine?: string;
    period?: string;
    met?: string;
    tab?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, station_id, leaderboard_opt_out, station:stations(name)")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";

  const [{ data: stations }, { data: benchmarks }] = await Promise.all([
    isAdmin
      ? supabase.from("stations").select("id, name").order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase
      .from("benchmarks")
      .select("id, name, category, unit, higher_is_better")
      .order("position", { ascending: true }),
  ]);
  const benchList = (benchmarks ?? []) as Benchmark[];

  // Which tab: an explicit ?met picks its tab; else ?tab; else Brennsla.
  const metBench = benchList.find((b) => b.id === sp.met) ?? null;
  const tabFromMet: Tab | null = metBench
    ? TAB_CATS.str.includes(metBench.category)
      ? "str"
      : "thol"
    : null;
  const tab: Tab =
    tabFromMet ?? (TABS.some((t) => t.value === sp.tab) ? (sp.tab as Tab) : "kcal");
  const isKcal = tab === "kcal";
  const tabBenches = isKcal ? [] : benchList.filter((b) => TAB_CATS[tab].includes(b.category));
  const selectedBenchmark = isKcal ? null : (metBench ?? tabBenches[0] ?? null);

  const machine =
    isKcal && MACHINE_FILTERS.some((m) => m.value === sp.machine) ? (sp.machine as string) : "";
  const period: (typeof PERIODS)[number]["value"] = PERIODS.some((p) => p.value === sp.period)
    ? (sp.period as (typeof PERIODS)[number]["value"])
    : "month";
  const stationParam = isAdmin ? (sp.station ?? "") : "";

  const now = requestTime();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  const since =
    period === "week"
      ? iso(monday)
      : period === "month"
        ? `${iso(now).slice(0, 7)}-01`
        : undefined;
  const periodText =
    period === "week" ? "í vikunni" : period === "month" ? `í ${IS_MONTHS[now.getUTCMonth()]}` : "frá upphafi";

  // Rows for whichever view is active.
  const [{ data: kcalRows }, { data: pbRows }] = await Promise.all([
    isKcal
      ? supabase.rpc("kcal_leaderboard", {
          p_station: stationParam || undefined,
          p_machine: machine || undefined,
          p_since: since,
        })
      : Promise.resolve({ data: [] }),
    selectedBenchmark
      ? supabase.rpc("pb_leaderboard", {
          p_benchmark: selectedBenchmark.id,
          p_station: stationParam || undefined,
        })
      : Promise.resolve({ data: [] }),
  ]);

  const showStation = isAdmin && !stationParam;
  const ranked: Ranked[] = isKcal
    ? [...(kcalRows ?? [])]
        .sort((a, b) => Number(b.total_kcal) - Number(a.total_kcal))
        .map((r) => ({
          user_id: r.user_id,
          name: r.full_name || "—",
          value: Number(r.total_kcal),
          display: `${Number(r.total_kcal).toLocaleString("is-IS")} kcal`,
          sub: `${r.entries} ${r.entries === 1 ? "skráning" : "skráningar"}`,
          station: r.station_name,
        }))
    : (pbRows ?? []).map((r) => ({
        user_id: r.user_id,
        name: r.full_name || "—",
        value: Number(r.value),
        display: formatMeasure(Number(r.value), selectedBenchmark!.unit),
        sub: "",
      }));
  const lowerIsBetter = !isKcal && selectedBenchmark ? !selectedBenchmark.higher_is_better : false;

  // Bar length relative to the leader (inverted for "lower is better" tests).
  const best = ranked[0]?.value ?? 0;
  const barPct = (v: number) =>
    !best || !v ? 0 : Math.max(4, Math.round((lowerIsBetter ? best / v : v / best) * 100));

  const meIdx = ranked.findIndex((r) => r.user_id === user.id);
  const me = meIdx === -1 ? null : ranked[meIdx];
  const above = meIdx > 0 ? ranked[meIdx - 1] : null;
  const below = meIdx >= 0 ? ranked[meIdx + 1] : null;
  const totalKcal = isKcal ? ranked.reduce((a, r) => a + r.value, 0) : 0;
  const myKcalRow = isKcal ? (kcalRows ?? []).find((r) => r.user_id === user.id) : null;
  const perSession =
    myKcalRow && myKcalRow.entries > 0 ? Number(myKcalRow.total_kcal) / myKcalRow.entries : 0;

  let gapLine = "";
  if (me && above) {
    const gap = Math.abs(above.value - me.value);
    if (isKcal) {
      const sessions = perSession > 0 ? Math.ceil(gap / perSession) : 0;
      gapLine = `${Math.round(gap).toLocaleString("is-IS")} kcal í #${meIdx} (${above.name})${
        sessions ? ` — um ${sessions} ${sessions === 1 ? "æfing" : "æfingar"} í viðbót` : ""
      }`;
    } else {
      gapLine = `${formatMeasure(Math.round(gap * 100) / 100, selectedBenchmark!.unit)} í #${meIdx} (${above.name})`;
    }
  } else if (me && meIdx === 0) {
    gapLine = below
      ? `Þú ert efst/ur — ${
          isKcal
            ? `${Math.round(Math.abs(me.value - below.value)).toLocaleString("is-IS")} kcal`
            : formatMeasure(Math.round(Math.abs(me.value - below.value) * 100) / 100, selectedBenchmark!.unit)
        } á undan #2`
      : "Þú ert efst/ur!";
  }

  const stationName = isAdmin
    ? ((stations ?? []).find((s) => s.id === stationParam)?.name ?? "Allar stöðvar")
    : ((profile?.station as { name: string } | null)?.name ?? "Þín stöð");

  // URL builder that keeps the rest of the state.
  const href = (next: Partial<Record<"tab" | "met" | "period" | "machine" | "station", string>>) => {
    const p = new URLSearchParams();
    const t = next.tab ?? tab;
    const st = next.station ?? stationParam;
    if (st) p.set("station", st);
    if (t === "kcal") {
      const mc = next.machine ?? machine;
      const pd = next.period ?? period;
      if (mc) p.set("machine", mc);
      if (pd && pd !== "month") p.set("period", pd);
    } else {
      const m = next.met ?? (next.tab ? "" : (selectedBenchmark?.id ?? ""));
      if (m) p.set("met", m);
      else p.set("tab", t);
    }
    const s = p.toString();
    return `/app/leaderboard${s ? `?${s}` : ""}`;
  };

  const testGroups: NavGroup[] = isKcal
    ? []
    : TAB_CATS[tab]
        .map((cat) => ({
          label: SUBGROUP_LABEL[cat] ?? cat,
          options: benchList.filter((b) => b.category === cat).map((b) => ({ label: b.name, href: href({ met: b.id }) })),
        }))
        .filter((g) => g.options.length > 0);
  const quickTests = tabBenches.slice(0, 3);

  const seg = (on: boolean) =>
    `flex h-9 items-center rounded-md px-3.5 text-[13px] font-semibold transition ${
      on ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const ctaHref = isKcal ? "/app/log" : "/app/personal-bests";
  const ctaLabel = isKcal ? "Skrá æfingu" : "Skrá nýtt met";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{stationName}</div>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Leaderboard</h1>
        </div>
        <nav aria-label="Keppni" className="flex gap-1 rounded-lg border border-border bg-muted p-[3px]">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={href({ tab: t.value })}
              scroll={false}
              aria-current={tab === t.value ? "page" : undefined}
              className={seg(tab === t.value)}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {isKcal ? (
          <>
            <div className="flex gap-1 rounded-lg border border-border bg-muted p-[3px]">
              {PERIODS.map((p) => (
                <Link key={p.value} href={href({ period: p.value })} scroll={false} className={seg(period === p.value)}>
                  {p.label}
                </Link>
              ))}
            </div>
            <NavSelect
              label="Tæki"
              value={href({ machine })}
              groups={[{ options: MACHINE_FILTERS.map((m) => ({ label: m.label, href: href({ machine: m.value }) })) }]}
            />
          </>
        ) : (
          <>
            {testGroups.length > 0 && selectedBenchmark && (
              <NavSelect label="Próf" value={href({ met: selectedBenchmark.id })} groups={testGroups} />
            )}
            {quickTests.map((b) => (
              <Link
                key={b.id}
                href={href({ met: b.id })}
                scroll={false}
                className={`flex h-9 items-center rounded-full border px-3 text-[13px] transition ${
                  selectedBenchmark?.id === b.id
                    ? "border-accent bg-accent/15 text-orange-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {b.name}
              </Link>
            ))}
          </>
        )}
        {isAdmin && (stations ?? []).length > 0 && (
          <NavSelect
            label="Stöð"
            value={href({ station: stationParam })}
            groups={[
              {
                options: [
                  { label: "Allar stöðvar", href: href({ station: "" }) },
                  ...(stations ?? []).map((s) => ({ label: s.name, href: href({ station: s.id }) })),
                ],
              },
            ]}
          />
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-4">
          {ranked.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted p-6 text-sm text-muted-foreground">
              {isKcal ? (
                <>
                  Engar kaloríur skráðar {periodText}. Skráðu æfingu í{" "}
                  <Link href="/app/log" className="text-orange-400 hover:underline">
                    Æfingadagbók
                  </Link>
                  .
                </>
              ) : (
                <>
                  Engin deild met í {selectedBenchmark?.name ?? "þessu prófi"} ennþá. Skráðu met í{" "}
                  <Link href="/app/personal-bests" className="text-orange-400 hover:underline">
                    Mín met
                  </Link>{" "}
                  og kveiktu á deilingu.
                </>
              )}
            </div>
          ) : (
            <>
              {/* Podium */}
              <div className="grid grid-cols-3 items-end gap-2">
                {[1, 0, 2].map((i) => {
                  const r = podium[i];
                  if (!r) return <div key={i} />;
                  const mine = r.user_id === user.id;
                  return (
                    <div
                      key={r.user_id}
                      className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border bg-muted px-2 pb-3.5 ${
                        i === 0 ? "pt-5" : "pt-3.5"
                      }`}
                      style={{ borderColor: mine ? "var(--accent)" : `${MEDAL[i]}66` }}
                    >
                      <span
                        className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-background"
                        style={{ background: MEDAL[i] }}
                      >
                        {i + 1}
                      </span>
                      <span
                        className={`grid place-items-center rounded-full border-2 bg-border font-bold ${
                          i === 0 ? "h-14 w-14 text-base" : "h-11 w-11 text-sm"
                        }`}
                        style={{ borderColor: MEDAL[i] }}
                        aria-hidden="true"
                      >
                        {initials(r.name)}
                      </span>
                      <span className="w-full truncate text-center text-[13px] font-semibold">
                        {r.name}
                        {mine && <span className="text-orange-400"> (þú)</span>}
                      </span>
                      <span className="font-mono text-sm font-bold tabular-nums sm:text-[15px]">{r.display}</span>
                    </div>
                  );
                })}
              </div>

              {/* The rest */}
              {rest.length > 0 && (
                <ol className="rounded-2xl border border-border bg-muted">
                  {rest.map((r, j) => {
                    const rank = j + 4;
                    const mine = r.user_id === user.id;
                    return (
                      <li
                        key={r.user_id}
                        className={`flex items-center gap-3 border-t border-border/60 px-4 py-3 first:rounded-t-2xl first:border-0 last:rounded-b-2xl ${
                          mine ? "sticky bottom-0 z-10 bg-[#2a1a0e]" : ""
                        }`}
                      >
                        <span className="w-6 text-center font-mono text-[13px] text-muted-foreground">{rank}</span>
                        <span
                          aria-hidden="true"
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${
                            mine ? "bg-accent text-accent-foreground" : "bg-border"
                          }`}
                        >
                          {initials(r.name)}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex justify-between gap-2">
                            <span className="truncate text-sm font-semibold">
                              {r.name}
                              {mine && <span className="font-normal text-orange-400"> (þú)</span>}
                            </span>
                            <span className="shrink-0 font-mono text-sm font-bold tabular-nums">{r.display}</span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-border">
                            <div
                              className={`h-full rounded-full ${mine ? "bg-accent" : "bg-muted-foreground/50"}`}
                              style={{ width: `${barPct(r.value)}%` }}
                            />
                          </div>
                          {(r.sub || (showStation && r.station)) && (
                            <div className="text-[11px] text-muted-foreground">
                              {[r.sub, showStation ? r.station : null].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              {isKcal && (
                <p className="text-xs text-muted-foreground">
                  Samtals {periodText}: {Math.round(totalKcal).toLocaleString("is-IS")} kcal
                </p>
              )}
              {!isKcal && (
                <p className="text-xs text-muted-foreground">
                  Besta skráða metið hjá hverjum. Aðeins þeir sem deila metum (á Mín met) sjást hér.
                </p>
              )}
            </>
          )}
        </div>

        {/* Your standing */}
        <aside className="mt-4 min-w-0 space-y-4 lg:sticky lg:top-6 lg:mt-0">
          <section className={`space-y-3 rounded-2xl border bg-muted p-5 ${me ? "border-accent" : "border-border"}`}>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Þín staða</div>
            {me ? (
              <>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-4xl leading-none font-bold">#{meIdx + 1}</span>
                  <span className="text-muted-foreground">af {ranked.length}</span>
                </div>
                <div className="text-sm">
                  {me.display}
                  {isKcal ? ` ${periodText}` : ""}
                  {me.sub ? ` · ${me.sub}` : ""}
                </div>
                {gapLine && (
                  <div className="border-t border-border pt-3 text-[13px] text-foreground/85">{gapLine}</div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {isKcal
                  ? profile?.leaderboard_opt_out
                    ? "Þú ert falin/n á leaderboard. Kveiktu á því hér fyrir neðan til að vera með."
                    : `Engin brennsla skráð ${periodText} enn.`
                  : `Ekkert deilt met í ${selectedBenchmark?.name ?? "þessu prófi"} enn.`}
              </p>
            )}
            <Link
              href={ctaHref}
              className="flex h-11 items-center justify-center rounded-xl bg-accent font-bold text-accent-foreground hover:opacity-90"
            >
              {ctaLabel}
            </Link>
          </section>

          {isKcal && (
            <section className="rounded-2xl border border-border bg-muted p-4">
              <div className="mb-2 text-sm font-semibold">Persónuvernd</div>
              <OptOutToggle userId={user.id} initialOptOut={profile?.leaderboard_opt_out ?? false} />
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
