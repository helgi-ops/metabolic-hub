import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStreak, lastWeekRange } from "@/lib/streak";
import { WeeklyRecap } from "./weekly-recap";

const IS_MONTHS = [
  "janúar", "febrúar", "mars", "apríl", "maí", "júní",
  "júlí", "ágúst", "september", "október", "nóvember", "desember",
];

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

export const metadata = {
  title: "Yfirlit · Metabolic",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, created_at, can_build_programs")
    .eq("id", user!.id)
    .single();
  const canBuildPrograms =
    profile?.role === "admin" || profile?.can_build_programs === true;

  const { count: programCount } = await supabase
    .from("programs")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user!.id);

  const { count: enrollmentCount } = await supabase
    .from("enrollments")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user!.id);

  const { data: logDates } = await supabase
    .from("workout_logs")
    .select("logged_on")
    .eq("user_id", user!.id);
  const allDates = (logDates ?? []).map((l) => l.logged_on);
  const streak = currentWeekStreak(allDates);

  // AI weekly recap of the previous full week (Mon–Sun).
  const { start: weekStart, end: weekEnd } = lastWeekRange();
  const hadWeekLogs = allDates.some((d) => d >= weekStart && d <= weekEnd);
  const { data: recap } = await supabase
    .from("weekly_recaps")
    .select("content")
    .eq("user_id", user!.id)
    .eq("week_start", weekStart)
    .maybeSingle();

  const firstName =
    profile?.full_name?.split(" ")[0] ?? user!.email?.split("@")[0];

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-12">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Yfirlit
        </div>
        <h1 className="mt-2 text-3xl font-bold">Hæ, {firstName}.</h1>
        <p className="mt-2 text-muted-foreground">
          Velkomin/n á Metabolic Hub.{" "}
          {profile?.role === "admin" &&
            "Þú ert admin — fullur aðgangur að öllu."}
        </p>
      </div>

      {/* Consistency streak */}
      <div className="mb-8 flex items-center gap-4 rounded-lg border border-accent/40 bg-accent/10 p-5">
        <div className="text-4xl">🔥</div>
        <div>
          <div className="text-2xl font-bold">
            {streak > 0
              ? `${streak} ${streak === 1 ? "vika" : "vikur"} í röð`
              : "Engin samfellni í gangi"}
          </div>
          <p className="text-sm text-muted-foreground">
            {streak > 0
              ? "Flott! Skráðu æfingu þessa viku til að halda röðinni."
              : "Skráðu æfingu í Dagbók til að byrja nýja samfellni."}
          </p>
        </div>
      </div>

      <WeeklyRecap
        initialContent={recap?.content ?? null}
        weekLabel={weekLabel(weekStart, weekEnd)}
        hasLogs={hadWeekLogs}
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-12">
        <Stat label="Æfingaplön" value={programCount ?? 0} />
        <Stat label="Námskeið" value={enrollmentCount ?? 0} />
        <Stat
          label="Hlutverk"
          value={
            profile?.role === "admin"
              ? "Admin"
              : profile?.role === "coach"
                ? "Þjálfari"
                : "Nemandi"
          }
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card
          title="Mín met"
          description="Skráðu Personal Best og fylgstu með framvindunni þinni."
          href="/app/personal-bests"
          cta="Skrá met →"
        />
        <Card
          title="Dagbók"
          description="Skráðu álag, þyngdir og kaloríur eftir hverja æfingu."
          href="/app/log"
          cta="Skrá æfingu →"
        />
        <Card
          title="Kcal Leaderboard"
          description="Uppsafnaðar kaloríur á Assault Airbike og Concept2 — keppnin á þinni stöð."
          href="/app/leaderboard"
          cta="Sjá leaderboard →"
        />
        <Card
          title="Afrek"
          description="Safnaðu merkjum fyrir æfingar, met, brennslu, samfellni og námskeið."
          href="/app/afrek"
          cta="Sjá merkin →"
        />
        {canBuildPrograms && (
          <Card
            title="Program Builder"
            description="Skoðaðu 752 æfinga-structures úr Metabolic kerfinu — síaðar eftir flokki."
            href="/app/programs"
            cta="Opna safnið →"
          />
        )}
        <Card
          title="Akademía"
          description="Metabolic Coach Academy — horfðu á lexíur, fylgstu með framvindu og fáðu vottun."
          href="/app/akademia"
          cta={enrollmentCount && enrollmentCount > 0 ? "Halda áfram →" : "Skoða námskeið →"}
        />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-muted p-6">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}

function Card({
  title,
  description,
  href,
  cta,
  disabled,
  ctaDisabled,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
  disabled?: boolean;
  ctaDisabled?: string;
}) {
  const body = (
    <>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">
        {disabled ? (
          <span className="text-sm text-muted-foreground">
            {ctaDisabled ?? cta}
          </span>
        ) : (
          <span className="text-sm text-accent">{cta}</span>
        )}
      </div>
    </>
  );

  if (disabled) {
    return (
      <div className="rounded-lg border border-border bg-muted p-6">{body}</div>
    );
  }

  return (
    <Link
      href={href}
      className="block rounded-lg border border-border bg-muted p-6 transition hover:border-accent"
    >
      {body}
    </Link>
  );
}
