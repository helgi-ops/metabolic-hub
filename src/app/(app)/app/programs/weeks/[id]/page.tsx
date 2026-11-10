import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProgramViewer } from "@/lib/auth/require-staff";
import { parsePreview } from "@/lib/programs/parse";
import {
  DAY_MS,
  DAY_SHORT,
  dayIndex,
  isoWeek,
  parseISO,
  shortDate,
  shortFocus,
  toISO,
} from "@/lib/programs/ui";
import { PrintButton } from "./print-button";
import { CycleSelect, MoveStartButton, PublishButton, WeekMenu } from "./week-menu";
import { CategoryTag, Exercises, WeekView, type DayView } from "./week-view";

export const metadata = {
  title: "Vika · Metabolic",
};

const DAYS_LONG = [
  "Mánudagur",
  "Þriðjudagur",
  "Miðvikudagur",
  "Fimmtudagur",
  "Föstudagur",
  "Laugardagur",
  "Sunnudagur",
];
// "laugardaginn 7. nóv"
const DAYS_ACC = [
  "mánudaginn",
  "þriðjudaginn",
  "miðvikudaginn",
  "fimmtudaginn",
  "föstudaginn",
  "laugardaginn",
  "sunnudaginn",
];
const LEVELS = ["MB1", "MB2", "MB3"] as const;

type Slot = {
  slot: number;
  category: string;
  structure_source_id: string;
  name: string;
  day?: string;
  focus?: string;
  preview?: string; // per-week override of the workout's exercise list
};

// Swap the level token in a structure source_id (…-l3-var-d → …-l1-var-d) to
// find the sibling structure for another level.
function levelId(sourceId: string, lvl: number): string {
  return sourceId.replace(/-l[123](?=-|$)/, `-l${lvl}`);
}

function slotsOf(w: { programs_json: unknown } | null | undefined): Slot[] {
  return (w && Array.isArray(w.programs_json) ? w.programs_json : []) as Slot[];
}

function requestTime(): number {
  return Date.now();
}

export default async function WeekPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, canBuild } = await requireProgramViewer();

  const { data: week } = await supabase
    .from("weekly_plans")
    .select(
      "id, title, level, week_starting, cycle_week, programs_json, created_at, generated_pdf_url, optisigns_pushed_at, station_id, owner_id",
    )
    .eq("id", id)
    .single();

  if (!week) notFound();

  let pdfUrl: string | null = null;
  if (week.generated_pdf_url) {
    const { data: signed } = await supabase.storage
      .from("weekly-plan-pdfs")
      .createSignedUrl(week.generated_pdf_url, 3600);
    pdfUrl = signed?.signedUrl ?? null;
  }

  const slots = slotsOf(week);

  // Weeks of the same studio: the same week at other levels (level tabs) and
  // the previous/next week at this level (arrows).
  const scope = <T extends { eq: (c: string, v: string) => T }>(q: T) =>
    week.station_id ? q.eq("station_id", week.station_id) : q.eq("owner_id", week.owner_id);
  const [{ data: siblings }, { data: prevW }, { data: nextW }] = await Promise.all([
    scope(
      supabase
        .from("weekly_plans")
        .select("id, level, programs_json, created_at")
        .eq("week_starting", week.week_starting)
        .neq("id", week.id),
    ).order("created_at", { ascending: false }),
    scope(
      supabase
        .from("weekly_plans")
        .select("id, week_starting")
        .eq("level", week.level)
        .lt("week_starting", week.week_starting),
    )
      .order("week_starting", { ascending: false })
      .limit(1),
    scope(
      supabase
        .from("weekly_plans")
        .select("id, week_starting")
        .eq("level", week.level)
        .gt("week_starting", week.week_starting),
    )
      .order("week_starting", { ascending: true })
      .limit(1),
  ]);
  const siblingByLevel = new Map<string, { id: string; programs_json: unknown }>();
  for (const s of siblings ?? []) if (!siblingByLevel.has(s.level)) siblingByLevel.set(s.level, s);
  siblingByLevel.set(week.level, week);

  // Structures for every slot at every level (sibling weeks first, else the
  // level-swapped library structure) so the compare view has something to show.
  const needed = new Set<string>();
  for (const w of siblingByLevel.values())
    for (const s of slotsOf(w)) if (s.structure_source_id) needed.add(s.structure_source_id);
  for (const s of slots)
    if (s.structure_source_id)
      for (const n of [1, 2, 3]) needed.add(levelId(s.structure_source_id, n));
  const { data: structures } = needed.size
    ? await supabase
        .from("structures")
        .select("source_id, name, category, preview")
        .in("source_id", [...needed])
    : { data: [] as { source_id: string; name: string; category: string; preview: string | null }[] };
  const bySource = new Map((structures ?? []).map((s) => [s.source_id, s]));

  // Dates: each slot's weekday (from its day name, else its position).
  const startMs = parseISO(week.week_starting);
  const startDow = (new Date(startMs).getUTCDay() + 6) % 7; // Mán = 0
  // The Monday the week belongs to: a week saved on a Sat/Sun is the coming one.
  const mondayMs = startMs + (startDow >= 5 ? 7 - startDow : -startDow) * DAY_MS;
  const dayOf = (s: Slot, i: number) => dayIndex(s.day) ?? Math.min(i, 6);
  const dateOf = (s: Slot, i: number) => toISO(mondayMs + dayOf(s, i) * DAY_MS);

  const days: DayView[] = slots.map((s, i) => {
    const st = bySource.get(s.structure_source_id);
    const text = s.preview ?? st?.preview ?? "";
    const idx = dayOf(s, i);
    return {
      short: DAY_SHORT[idx] ?? `Tími ${i + 1}`,
      long: s.day ?? DAYS_LONG[idx] ?? `Tími ${i + 1}`,
      date: shortDate(dateOf(s, i)),
      category: s.category,
      focus: shortFocus(s.focus),
      name: st?.name ?? s.name,
      parsed: parsePreview(text),
      edited: !!s.preview && !!st && s.preview !== st.preview,
      text,
      libraryPreview: st?.preview ?? "",
      compare: LEVELS.map((lvl, li) => {
        const sib = siblingByLevel.get(lvl);
        const sibSlot = sib ? slotsOf(sib)[i] : null;
        const sid = sibSlot?.structure_source_id ?? (s.structure_source_id ? levelId(s.structure_source_id, li + 1) : "");
        const cst = bySource.get(sid);
        const ctext = sibSlot?.preview ?? cst?.preview ?? null;
        return {
          level: lvl,
          name: cst?.name ?? sibSlot?.name ?? "",
          parsed: ctext ? parsePreview(ctext) : null,
          current: lvl === week.level,
        };
      }),
    };
  });

  // Open on today's session when this week is running now.
  const todayISO = toISO(requestTime());
  const todayIdx = slots.findIndex((s, i) => dateOf(s, i) === todayISO);
  const lastDate = slots.length ? dateOf(slots[slots.length - 1], slots.length - 1) : week.week_starting;

  // A week should start on a Monday; offer to move it (Sat/Sun → next Monday).
  const suggestedMonday = startDow === 0 ? null : toISO(mondayMs);

  // For the in-place editor: when each setup was last used at this studio.
  let lastUsed: Record<string, string> = {};
  if (canBuild) {
    const { data: usageWeeks } = await scope(
      supabase.from("weekly_plans").select("week_starting, programs_json").neq("id", week.id),
    );
    const latest = new Map<string, string>();
    for (const w of usageWeeks ?? [])
      for (const s of slotsOf(w))
        if (s.structure_source_id && (latest.get(s.structure_source_id) ?? "") < w.week_starting)
          latest.set(s.structure_source_id, w.week_starting);
    const now = requestTime();
    lastUsed = Object.fromEntries(
      [...latest].map(([sid, d]) => {
        const days = Math.floor((now - parseISO(d)) / DAY_MS);
        return [sid, days < 0 ? `Planað ${shortDate(d)}` : days <= 28 ? `Fyrir ${days} ${days === 1 ? "degi" : "dögum"}` : `Síðast ${shortDate(d)}`];
      }),
    );
  }
  const edit = canBuild
    ? { planId: week.id, level: week.level, slots, lastUsed }
    : null;
  const firstSlotDate = slots.length ? dateOf(slots[0], 0) : week.week_starting;

  return (
    <main className="print-doc mx-auto max-w-5xl px-6 py-10">
      <div className="no-print mb-5">
        <Link href="/app/programs" className="text-sm text-muted-foreground hover:text-foreground">
          ← Æfingaplön
        </Link>
      </div>

      {/* Header */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <ArrowLink href={prevW?.[0] ? `/app/programs/weeks/${prevW[0].id}` : null} label="Fyrri vika">
              ←
            </ArrowLink>
            <h1 className="text-3xl font-bold">
              Vika {isoWeek(firstSlotDate)}{" "}
              <span className="font-medium text-muted-foreground">
                · {shortDate(firstSlotDate)}–{shortDate(lastDate)}
              </span>
            </h1>
            <ArrowLink href={nextW?.[0] ? `/app/programs/weeks/${nextW[0].id}` : null} label="Næsta vika">
              →
            </ArrowLink>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Stig" className="no-print flex gap-1 rounded-lg border border-border bg-muted p-[3px]">
              {LEVELS.map((lvl) => {
                const sib = siblingByLevel.get(lvl);
                const isCurrent = lvl === week.level;
                const cls = `flex h-8 min-w-[52px] items-center justify-center rounded-md px-2.5 text-[13px] font-semibold ${
                  isCurrent
                    ? "bg-accent text-accent-foreground"
                    : sib
                      ? "text-muted-foreground hover:text-foreground"
                      : "text-muted-foreground/40"
                }`;
                return sib && !isCurrent ? (
                  <Link key={lvl} href={`/app/programs/weeks/${sib.id}`} className={cls}>
                    {lvl}
                  </Link>
                ) : (
                  <span
                    key={lvl}
                    className={cls}
                    aria-current={isCurrent ? "page" : undefined}
                    title={isCurrent ? undefined : `Engin ${lvl} vika fyrir þessa dagsetningu`}
                  >
                    {lvl}
                  </span>
                );
              })}
            </nav>
            <span className="print-accent hidden font-mono text-xs tracking-widest uppercase print:inline">
              {week.level}
            </span>
            {canBuild ? (
              <CycleSelect planId={week.id} value={week.cycle_week ?? ""} />
            ) : (
              week.cycle_week && (
                <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-orange-400">
                  Lota · {week.cycle_week.toLowerCase()} af 4
                </span>
              )
            )}
            {week.title && (
              <span className="text-sm text-muted-foreground">{week.title}</span>
            )}
          </div>
        </div>

        {canBuild && (
          <div className="no-print flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-2">
              <PrintButton />
              <PublishButton planId={week.id} published={!!week.optisigns_pushed_at} />
              <WeekMenu planId={week.id} level={week.level} pdfUrl={pdfUrl} />
            </div>
            {week.optisigns_pushed_at ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
                Birt á skjám{" "}
                {new Date(week.optisigns_pushed_at).toLocaleString("is-IS", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Atlantic/Reykjavik",
                })}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Ekki birt á skjám</span>
            )}
          </div>
        )}
      </header>

      {canBuild && suggestedMonday && (
        <div className="no-print mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-400/35 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-300">
          <span>
            Vikan er skráð með upphaf {DAYS_ACC[startDow]} {shortDate(week.week_starting)}.
          </span>
          <MoveStartButton
            planId={week.id}
            to={suggestedMonday}
            label={`Færa á mánudag ${shortDate(suggestedMonday)}`}
          />
        </div>
      )}

      {days.length === 0 ? (
        <p className="rounded-xl border border-border bg-muted p-6 text-sm text-muted-foreground">
          Engir tímar í þessari viku.
        </p>
      ) : (
        <WeekView days={days} initialDay={todayIdx === -1 ? 0 : todayIdx} edit={edit} />
      )}

      {/* Print: every day, one card each */}
      <div className="hidden space-y-4 print:block">
        {days.map((d, i) => (
          <article key={i} className="print-card rounded-lg border border-border p-5">
            <div className="flex items-baseline gap-3">
              <span className="font-semibold">
                {d.long} · {d.date}
              </span>
              <CategoryTag category={d.category} />
            </div>
            {d.focus && <div className="mt-0.5 text-xs">{d.focus}</div>}
            <h2 className="mt-1 font-semibold">{d.name}</h2>
            {d.parsed.intro && <p className="mt-2 text-xs">{d.parsed.intro}</p>}
            <div className="mt-3">
              <Exercises parsed={d.parsed} compact />
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

function ArrowLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const cls = "no-print grid h-9 w-9 place-items-center rounded-lg border border-border bg-muted";
  return href ? (
    <Link href={href} aria-label={label} className={`${cls} hover:border-accent`}>
      {children}
    </Link>
  ) : (
    <span aria-hidden="true" className={`${cls} opacity-30`}>
      {children}
    </span>
  );
}
