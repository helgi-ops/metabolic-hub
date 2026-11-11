import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStreak, lastWeekRange, weekKey } from "@/lib/streak";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "@/lib/programs/ui";
import { WeeklyRecap } from "./weekly-recap";

const IS_MONTHS = [
  "janúar", "febrúar", "mars", "apríl", "maí", "júní",
  "júlí", "ágúst", "september", "október", "nóvember", "desember",
];
const IS_MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];
const DAYS_IS = [
  "Sunnudagur", "Mánudagur", "Þriðjudagur", "Miðvikudagur",
  "Fimmtudagur", "Föstudagur", "Laugardagur",
];
const STRIP = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];
const KUDOS_FRESH_DAYS = 7;

function weekLabel(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const sd = s.getUTCDate();
  const ed = e.getUTCDate();
  const sm = IS_MONTHS[s.getUTCMonth()];
  const em = IS_MONTHS[e.getUTCMonth()];
  return s.getUTCMonth() === e.getUTCMonth()
    ? `${sd}.–${ed}. ${em}`
    : `${sd}. ${sm} – ${ed}. ${em}`;
}

const isoUTC = (d: Date) => d.toISOString().slice(0, 10);
const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()}. ${IS_MONTHS_SHORT[d.getUTCMonth()]}`;
};
const fmt = (n: number) => Math.round(n).toLocaleString("is-IS");

// Server components render once per request, so "now" is the request time.
function requestTime(): Date {
  return new Date();
}

export const metadata = {
  title: "Yfirlit · Metabolic",
};

type Log = {
  logged_on: string;
  rpe: number | null;
  level: string | null;
  activity: string | null;
  structure_source_id: string | null;
  scheduled_category: string | null;
  total_volume: number | null;
  est_calories: number | null;
  calories: number | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = requestTime();
  const today = isoUTC(now);
  const todayDay = DAYS_IS[now.getUTCDay()];
  const thisMonday = weekKey(today);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [
    { data: profile },
    { data: logsRaw },
    { data: planRows },
    { data: latestKudos },
    { data: foodRows },
    { data: targets },
    { data: lastBest },
    { count: pbCount },
    { count: enrollmentCount },
    { data: kcalBoard },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role, can_build_programs")
      .eq("id", user.id)
      .single(),
    supabase
      .from("workout_logs")
      .select(
        "logged_on, rpe, level, activity, structure_source_id, scheduled_category, total_volume, est_calories, calories",
      )
      .eq("user_id", user.id)
      .order("logged_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.rpc("current_week_plans_by_level"),
    supabase
      .from("coach_kudos")
      .select("message, created_at")
      .eq("member_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("nutrition_entries")
      .select("kcal, protein_g, carbs_g, fat_g")
      .eq("user_id", user.id)
      .eq("logged_on", today),
    supabase
      .from("nutrition_targets")
      .select("kcal, protein_g, carbs_g, fat_g")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("exercise_bests")
      .select("exercise, best_value, achieved_on")
      .eq("user_id", user.id)
      .order("achieved_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("personal_bests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("enrollments")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase.rpc("kcal_leaderboard", { p_since: monthStart }),
  ]);

  const logs = (logsRaw ?? []) as Log[];
  const isStaff = profile?.role === "admin" || profile?.role === "coach";
  const canBuildPrograms =
    profile?.role === "admin" || profile?.can_build_programs === true;
  const firstName = profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0];
  const hour = now.getUTCHours(); // Iceland = UTC
  const greeting = hour < 11 ? "Góðan daginn" : hour < 18 ? "Góðan dag" : "Gott kvöld";
  const longDate = `${todayDay} ${now.getUTCDate()}. ${IS_MONTHS[now.getUTCMonth()]}`;

  // ---- Today's workout -------------------------------------------------
  const plans = (planRows ?? []) as {
    level: string;
    day: string | null;
    category: string;
    name: string;
    structure_source_id: string;
    cycle_week: string | null;
  }[];
  const currentCycleWeek = plans.find((r) => r.cycle_week)?.cycle_week ?? null;
  const myLevel = logs.find((l) => l.level)?.level ?? null;
  const todays =
    plans.find((p) => p.day === todayDay && p.level === myLevel) ??
    plans.find((p) => p.day === todayDay) ??
    null;
  const loggedToday = logs.find((l) => l.logged_on === today) ?? null;
  const lastSameCategory = todays
    ? logs.find((l) => l.logged_on < today && l.scheduled_category === todays.category)
    : undefined;

  // Name of today's logged workout (revealed once logged).
  let loggedName: string | null = loggedToday?.activity ?? null;
  if (loggedToday?.structure_source_id) {
    const { data: st } = await supabase
      .from("structures")
      .select("name")
      .eq("source_id", loggedToday.structure_source_id)
      .maybeSingle();
    loggedName = st?.name ?? null;
  }

  // ---- Food today ------------------------------------------------------
  const food = (foodRows ?? []).reduce(
    (a, r) => ({
      kcal: a.kcal + (Number(r.kcal) || 0),
      protein: a.protein + (Number(r.protein_g) || 0),
      carbs: a.carbs + (Number(r.carbs_g) || 0),
      fat: a.fat + (Number(r.fat_g) || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const kcalTarget = Number(targets?.kcal) || 0;
  const kcalLeft = kcalTarget - food.kcal;
  const macros = [
    { label: "Prótein", value: food.protein, target: Number(targets?.protein_g) || 0, color: "#60a5fa" },
    { label: "Kolvetni", value: food.carbs, target: Number(targets?.carbs_g) || 0, color: "#fbbf24" },
    { label: "Fita", value: food.fat, target: Number(targets?.fat_g) || 0, color: "#fb7185" },
  ];

  // ---- This week -------------------------------------------------------
  const allDates = logs.map((l) => l.logged_on);
  const streak = currentWeekStreak(allDates);
  const weekLogs = logs.filter((l) => weekKey(l.logged_on) === thisMonday);
  const weekRpe = weekLogs.map((l) => l.rpe).filter((r): r is number => r != null);
  const avgRpe = weekRpe.length
    ? (weekRpe.reduce((a, b) => a + b, 0) / weekRpe.length).toFixed(1).replace(".", ",")
    : "—";
  const weekVolume = weekLogs.reduce((a, l) => a + (Number(l.total_volume) || 0), 0);
  const loggedDates = new Set(allDates);
  const strip = STRIP.map((label, i) => {
    const d = new Date(`${thisMonday}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = isoUTC(d);
    return { label, iso, done: loggedDates.has(iso), isToday: iso === today, future: iso > today };
  });

  // ---- Last week's AI recap ---------------------------------------------
  const { start: weekStart, end: weekEnd } = lastWeekRange();
  const hadWeekLogs = allDates.some((d) => d >= weekStart && d <= weekEnd);
  const { data: recap } = await supabase
    .from("weekly_recaps")
    .select("content")
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .maybeSingle();

  // ---- Feed: newest PR + where you stand this month ----------------------
  const board = [...((kcalBoard ?? []) as { user_id: string; total_kcal: number }[])].sort(
    (a, b) => Number(b.total_kcal) - Number(a.total_kcal),
  );
  const rankIdx = board.findIndex((r) => r.user_id === user.id);
  const rank = rankIdx === -1 ? null : rankIdx + 1;
  const monthName = IS_MONTHS[now.getUTCMonth()];

  const kudosAge = latestKudos
    ? Math.floor((now.getTime() - new Date(latestKudos.created_at).getTime()) / 86_400_000)
    : null;
  const kudosFresh = kudosAge != null && kudosAge <= KUDOS_FRESH_DAYS;
  const kudosWhen =
    kudosAge == null ? "" : kudosAge === 0 ? "í dag" : kudosAge === 1 ? "í gær" : `fyrir ${kudosAge} dögum`;

  const kudosCard = latestKudos && (
    <section className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
      <div className="text-xs tracking-wide text-orange-400 uppercase">Hrós frá þjálfara</div>
      <p className="mt-1.5 font-medium leading-relaxed">„{latestKudos.message}“</p>
      <div className="mt-1 text-xs text-muted-foreground">{kudosWhen}</div>
    </section>
  );

  const feed = [
    lastBest && {
      href: "/app/personal-bests",
      icon: "★",
      color: "#fbbf24",
      title: `Met: ${lastBest.exercise} ${Number(lastBest.best_value)} kg`,
      sub: shortDate(lastBest.achieved_on),
    },
    rank && {
      href: "/app/leaderboard",
      icon: "#",
      color: "#60a5fa",
      title: `Þú ert #${rank} í brennslu á stöðinni`,
      sub: `Leaderboard · ${monthName}`,
    },
    streak >= 4 && {
      href: "/app/afrek",
      icon: "◆",
      color: "#a78bfa",
      title: `${streak} vikur í röð`,
      sub: "Afrek · samfellni",
    },
  ].filter(Boolean) as { href: string; icon: string; color: string; title: string; sub: string }[];

  const links = [
    { href: "/app/personal-bests", title: "Mín met", sub: pbCount ? `${pbCount} skráð` : "Skrá fyrsta metið" },
    { href: "/app/leaderboard", title: "Leaderboard", sub: rank ? `#${rank} í ${monthName}` : "Keppnin á stöðinni" },
    { href: "/app/afrek", title: "Afrek", sub: "Merkin þín" },
    { href: "/app/fraedsla", title: "Fræðsla", sub: "Flexible Diet" },
    {
      href: "/app/akademia",
      title: "Akademía",
      sub: enrollmentCount ? "Halda áfram" : "Skoða námskeið",
    },
    ...(isStaff || canBuildPrograms
      ? [{ href: "/app/programs", title: "Æfingaplön", sub: currentCycleWeek ?? "Vikur og safn" }]
      : []),
  ];

  const R = 31;
  const C = 2 * Math.PI * R;
  const frac = kcalTarget > 0 ? Math.min(1, food.kcal / kcalTarget) : 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Greeting */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{longDate}</div>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            {greeting}, {firstName}
          </h1>
        </div>
        {currentCycleWeek && (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-orange-400">
            Lota · {currentCycleWeek.toLowerCase()} af 4
          </span>
        )}
      </header>

      {kudosFresh && <div className="mb-4">{kudosCard}</div>}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-4">
          {/* Today */}
          <div className="grid gap-4 sm:grid-cols-2">
            <section
              className={`flex flex-col gap-2.5 rounded-2xl border p-4 sm:p-5 ${
                loggedToday ? "border-border bg-muted" : "border-accent bg-muted"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs tracking-wide text-muted-foreground uppercase">
                  Æfing dagsins
                </span>
                {todays && (
                  <span
                    className="rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-widest uppercase"
                    style={{
                      color: CATEGORY_COLOR[todays.category] ?? "#a3a3a3",
                      borderColor: `${CATEGORY_COLOR[todays.category] ?? "#a3a3a3"}55`,
                    }}
                  >
                    {CATEGORY_LABEL[todays.category] ?? todays.category}
                  </span>
                )}
              </div>
              <div className="text-xl font-bold">
                {loggedToday
                  ? (loggedName ?? "Æfing skráð")
                  : todays
                    ? `Tími dagsins${myLevel ? ` · ${myLevel}` : ""}`
                    : "Enginn tími á plani í dag"}
              </div>
              <div className="text-sm text-muted-foreground">
                {loggedToday
                  ? "Vel gert — æfingin er komin í dagbókina."
                  : lastSameCategory
                    ? `Síðast í ${CATEGORY_LABEL[lastSameCategory.scheduled_category ?? ""] ?? "þessum flokki"}: ${
                        lastSameCategory.rpe != null ? `RPE ${lastSameCategory.rpe}` : "ekkert RPE"
                      }${
                        lastSameCategory.est_calories != null
                          ? ` · ~${fmt(Number(lastSameCategory.est_calories))} kcal`
                          : ""
                      }`
                    : todays
                      ? "Nafn tímans birtist eftir að þú skráir hann."
                      : "Skráðu aðra hreyfingu ef þú tókst eitthvað."}
              </div>
              {loggedToday ? (
                <div className="mt-auto flex h-12 items-center gap-2 rounded-xl bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-400">
                  ✓ Skráð
                  {loggedToday.rpe != null && <span className="font-normal">· RPE {loggedToday.rpe}</span>}
                </div>
              ) : (
                <Link
                  href="/app/log"
                  className="mt-auto flex h-12 items-center justify-center rounded-xl bg-accent text-[15px] font-bold text-accent-foreground hover:opacity-90"
                >
                  Skrá tímann
                </Link>
              )}
            </section>

            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-muted p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs tracking-wide text-muted-foreground uppercase">Matur í dag</span>
                <Link href="/app/naering" className="text-xs text-muted-foreground hover:text-foreground">
                  Opna →
                </Link>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative h-[76px] w-[76px] shrink-0">
                  <svg
                    width="76"
                    height="76"
                    viewBox="0 0 76 76"
                    role="img"
                    aria-label={kcalTarget ? `${fmt(food.kcal)} af ${fmt(kcalTarget)} kcal` : `${fmt(food.kcal)} kcal`}
                  >
                    <circle cx="38" cy="38" r={R} fill="none" stroke="var(--border)" strokeWidth="8" />
                    {kcalTarget > 0 && (
                      <circle
                        cx="38"
                        cy="38"
                        r={R}
                        fill="none"
                        stroke={kcalLeft < 0 ? "#fbbf24" : "var(--accent)"}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={C}
                        strokeDashoffset={C * (1 - frac)}
                        transform="rotate(-90 38 38)"
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[15px] font-bold tabular-nums">
                      {fmt(kcalTarget ? Math.abs(kcalLeft) : food.kcal)}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {kcalTarget ? (kcalLeft < 0 ? "yfir" : "eftir") : "kcal"}
                    </span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {macros.map((m) => (
                    <div key={m.label}>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>{m.label}</span>
                        <span className="tabular-nums">
                          {fmt(m.value)}
                          {m.target ? `/${fmt(m.target)}` : ""} g
                        </span>
                      </div>
                      <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${m.target ? Math.min(100, (m.value / m.target) * 100) : 0}%`,
                            background: m.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Link
                href="/app/naering"
                className="mt-auto flex h-12 items-center justify-center rounded-xl border border-border bg-background text-[15px] font-semibold hover:border-accent"
              >
                + Skrá mat
              </Link>
            </section>
          </div>

          {/* This week */}
          <section className="space-y-3 rounded-2xl border border-border bg-muted p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold">Vikan</h2>
              <span className="text-sm text-muted-foreground">
                {streak > 0 ? (
                  <span className="font-bold text-orange-400">
                    {streak} {streak === 1 ? "vika" : "vikur"} í röð
                  </span>
                ) : (
                  "Skráðu æfingu til að byrja nýja röð"
                )}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {strip.map((d) => (
                <div
                  key={d.iso}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border py-2 ${
                    d.isToday ? "border-accent bg-accent/5" : "border-border bg-background"
                  }`}
                >
                  <span className="text-[11px] text-muted-foreground">{d.label}</span>
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${
                      d.done ? "bg-emerald-400 text-background" : d.isToday ? "text-orange-400" : "text-muted-foreground/40"
                    }`}
                  >
                    {d.done ? "✓" : d.isToday ? "•" : d.future ? "" : "–"}
                  </span>
                  <span className="sr-only">{d.done ? "skráð" : "ekki skráð"}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat value={String(weekLogs.length)} label={weekLogs.length === 1 ? "tími í viku" : "tímar í viku"} />
              <Stat value={avgRpe} label="meðal RPE" />
              <Stat value={weekVolume ? `${fmt(weekVolume)} kg` : "—"} label="álag í viku" />
            </div>
          </section>

          <WeeklyRecap
            initialContent={recap?.content ?? null}
            weekLabel={weekLabel(weekStart, weekEnd)}
            hasLogs={hadWeekLogs}
          />
        </div>

        {/* Side column (below on phones) */}
        <aside className="mt-4 min-w-0 space-y-4 lg:mt-0">
          {!kudosFresh && kudosCard}

          {feed.length > 0 && (
            <section className="rounded-2xl border border-border bg-muted p-4">
              <h2 className="mb-1 font-bold">Nýjast hjá þér</h2>
              <ul>
                {feed.map((f) => (
                  <li key={f.title} className="border-t border-border/60 first:border-0">
                    <Link href={f.href} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                      <span
                        aria-hidden="true"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold"
                        style={{ color: f.color, background: `${f.color}22` }}
                      >
                        {f.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{f.title}</span>
                        <span className="block text-xs text-muted-foreground">{f.sub}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-muted p-4">
            <h2 className="mb-3 font-bold">Flýtileiðir</h2>
            <div className="grid grid-cols-2 gap-2">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-xl border border-border bg-background p-3 transition hover:border-accent"
                >
                  <span className="block text-sm font-semibold">{l.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{l.sub}</span>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
