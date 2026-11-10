import Link from "next/link";
import { Suspense } from "react";
import { requireProgramViewer } from "@/lib/auth/require-staff";
import type { Database } from "@/lib/types/database";
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  CYCLE_DAYS,
  DAY_MS,
  cleanTitle,
  isoWeek,
  mondayOf,
  parseISO,
  shortDate,
  shortDay,
  toISO,
} from "@/lib/programs/ui";
import { LibraryFilters } from "./library-filters";

export const metadata = {
  title: "Æfingaplön · Metabolic",
};

type Category = Database["public"]["Enums"]["program_category"];
type Level = Database["public"]["Enums"]["mb_level"];

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "strength", label: "Strength" },
  { key: "power_strength", label: "Power/Strength" },
  { key: "power", label: "Power" },
  { key: "endurance", label: "Endurance" },
  { key: "burn", label: "Burn" },
];

// Level chips → the levels.l1 value stored on each structure.
const LEVELS: { key: Level; value: string }[] = [
  { key: "MB1", value: "Level 1" },
  { key: "MB2", value: "Level 2" },
  { key: "MB3", value: "Level 3" },
];
const LEVEL_VALUE: Record<string, string> = Object.fromEntries(
  LEVELS.map((l) => [l.key, l.value]),
);
const LEVEL_SHORT: Record<string, string> = {
  "Level 1": "MB1",
  "Level 2": "MB2",
  "Level 3": "MB3",
};

// Name-based "type" facet: each option matches structures whose name contains
// the pattern (case-insensitive). Some are families (Base, On The Min, Wave) and
// some are cross-cutting tags (Cluster, Partner, Contrast).
const FAMILIES: { label: string; match: string }[] = [
  { label: "Base", match: "Base " },
  { label: "On The Min", match: "On The Min" },
  { label: "Wave", match: "Wave" },
  { label: "Combine", match: "Combine" },
  { label: "Duplus", match: "Duplus" },
  { label: "Centum", match: "Centum" },
  { label: "Charge", match: "Charge" },
  { label: "Imperium", match: "Imperium" },
  { label: "Omnis", match: "Omnis" },
  { label: "Density", match: "Density" },
  { label: "Ladder", match: "Ladder" },
  { label: "Countdown", match: "Countdown" },
  { label: "5-4-3-2-1", match: "5-4-3-2-1" },
  { label: "Contrast", match: "Contrast" },
  { label: "Complex", match: "Complex" },
  { label: "Cluster", match: "Cluster" },
  { label: "Rest-Pause", match: "Rest-Pause" },
  { label: "Partner", match: "Partner" },
];
const FAMILY_MATCH: Record<string, string> = Object.fromEntries(
  FAMILIES.map((f) => [f.label, f.match]),
);

const PAGE_SIZE = 48;

type WeekSlot = {
  slot?: number;
  category: string;
  structure_source_id?: string;
  name?: string;
  day?: string;
};

type Usage = { label: string; tone: "fresh" | "old" | "recent" | "planned" };

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{
    vika?: string;
    category?: string;
    level?: string;
    family?: string;
    q?: string;
    page?: string;
    fresh?: string;
    view?: string;
  }>;
}) {
  const sp = await searchParams;
  const active = (CATEGORY_LABEL[sp.category ?? ""] ? sp.category : null) as Category | null;
  const activeLevel = LEVEL_VALUE[sp.level ?? ""] ? sp.level! : null;
  const activeFamily = FAMILY_MATCH[sp.family ?? ""] ? sp.family! : null;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const onlyFresh = sp.fresh === "1";
  const listView = sp.view === "list";

  const { supabase, user, canBuild } = await requireProgramViewer();

  const { data: profile } = await supabase
    .from("profiles")
    .select("station_id, station:stations(name)")
    .eq("id", user.id)
    .single();
  const stationName = (profile?.station as { name: string } | null)?.name ?? null;

  // Every week for my station (oversight of the studio). If I have no station,
  // my own. Drives the current week, the 4-week cycle and "last used".
  let weekQuery = supabase
    .from("weekly_plans")
    .select(
      "id, title, level, week_starting, cycle_week, programs_json, optisigns_pushed_at, owner_id, created_at",
    )
    .order("week_starting", { ascending: false })
    .order("created_at", { ascending: false });
  weekQuery = profile?.station_id
    ? weekQuery.eq("station_id", profile.station_id)
    : weekQuery.eq("owner_id", user.id);
  const { data: weeksRaw } = await weekQuery;
  const weeks = weeksRaw ?? [];
  const slotsOf = (w: { programs_json: unknown }) =>
    (Array.isArray(w.programs_json) ? w.programs_json : []) as WeekSlot[];

  const nowMs = requestTime();
  const todayISO = toISO(nowMs);
  const thisMonday = mondayOf(nowMs);

  // Week tab: chosen level, else the level of the newest week, else MB1.
  const weekLevel: Level = (LEVELS.some((l) => l.key === sp.vika)
    ? sp.vika
    : (weeks[0]?.level ?? "MB1")) as Level;
  const levelWeeks = weeks.filter((w) => w.level === weekLevel);
  const current =
    levelWeeks.find((w) => w.week_starting <= todayISO) ?? null;
  const upcoming =
    [...levelWeeks].reverse().find((w) => w.week_starting > todayISO) ?? null;
  const currentSlots = current ? slotsOf(current) : [];

  // Latest week_starting each structure was used in (any level — source ids
  // are per level anyway).
  const lastUsed = new Map<string, string>();
  for (const w of weeks) {
    for (const s of slotsOf(w)) {
      const sid = s?.structure_source_id;
      if (!sid || !w.week_starting) continue;
      const prev = lastUsed.get(sid);
      if (!prev || w.week_starting > prev) lastUsed.set(sid, w.week_starting);
    }
  }
  const usageOf = (sourceId: string): Usage => {
    const d = lastUsed.get(sourceId);
    if (!d) return { label: "Aldrei notað", tone: "fresh" };
    const days = Math.floor((nowMs - parseISO(d)) / DAY_MS);
    if (days < 0) return { label: `Planað ${shortDate(d)}`, tone: "planned" };
    if (days <= CYCLE_DAYS)
      return {
        label: `Fyrir ${days} ${days === 1 ? "degi" : "dögum"} – innan lotu`,
        tone: "recent",
      };
    return { label: `Síðast ${shortDate(d)}`, tone: "old" };
  };
  const recentIds = [...lastUsed.entries()]
    .filter(([, d]) => nowMs - parseISO(d) <= CYCLE_DAYS * DAY_MS)
    .map(([sid]) => sid);

  // 4-week cycle for the selected level: anchored on the current week's
  // "Vika N" tag when it has one, otherwise the last four weeks.
  const cycleN = Number(current?.cycle_week?.match(/[1-4]/)?.[0] ?? 0);
  const cycleStartMs = current
    ? parseISO(current.week_starting) - ((cycleN || 4) - 1) * 7 * DAY_MS
    : 0;
  const cycleCols = current
    ? [0, 1, 2, 3].map((i) => {
        const start = toISO(cycleStartMs + i * 7 * DAY_MS);
        const week = levelWeeks.find((w) => w.week_starting === start) ?? null;
        return {
          start,
          label: cycleN ? `Vika ${i + 1}` : shortDate(start),
          isCurrent: week?.id === current.id,
          slots: week ? slotsOf(week) : null,
        };
      })
    : [];
  const cycleRowCount = Math.max(6, ...cycleCols.map((c) => c.slots?.length ?? 0));
  // A structure that shows up more than once in the cycle gets flagged.
  const cycleCounts = new Map<string, number>();
  for (const c of cycleCols)
    for (const s of c.slots ?? [])
      if (s.structure_source_id)
        cycleCounts.set(s.structure_source_id, (cycleCounts.get(s.structure_source_id) ?? 0) + 1);

  const balance = CATEGORIES.map((c) => ({
    ...c,
    n: currentSlots.filter((s) => s.category === c.key).length,
  }));
  const missing = balance.filter((b) => b.n === 0 && b.key !== "power").map((b) => b.label);

  // Who built each recent week (owner_id → profiles has no FK).
  const recentList = weeks.slice(0, 12);
  const ownerIds = [...new Set(recentList.map((w) => w.owner_id))];
  const { data: owners } = ownerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ownerIds)
    : { data: [] };
  const ownerName = new Map((owners ?? []).map((o) => [o.id, o.full_name]));

  // Library ------------------------------------------------------------
  const counts = await Promise.all(
    CATEGORIES.map(async (c) => {
      const { count } = await supabase
        .from("structures")
        .select("*", { count: "exact", head: true })
        .eq("category", c.key);
      return count ?? 0;
    }),
  );
  const total = counts.reduce((sum, n) => sum + n, 0);

  const from = (page - 1) * PAGE_SIZE;
  let query = supabase
    .from("structures")
    .select("id, source_id, name, category, levels, preview", { count: "exact" })
    .order("name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (active) query = query.eq("category", active);
  if (activeLevel) query = query.eq("levels->>l1", LEVEL_VALUE[activeLevel]);
  if (activeFamily) query = query.ilike("name", `%${FAMILY_MATCH[activeFamily]}%`);
  if (q) query = query.or(`name.ilike.%${q}%,preview.ilike.%${q}%`);
  if (onlyFresh && recentIds.length)
    query = query.not(
      "source_id",
      "in",
      `(${recentIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`,
    );

  const { data: structures, count: matchCount } = await query;
  const list = structures ?? [];
  const totalPages = Math.max(1, Math.ceil((matchCount ?? 0) / PAGE_SIZE));

  // Querystring builder that keeps everything else as it is.
  const buildHref = (next: Record<string, string | null>, hash = "") => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = {
      vika: sp.vika ?? null,
      category: active,
      level: activeLevel,
      family: activeFamily,
      q: q || null,
      fresh: onlyFresh ? "1" : null,
      view: listView ? "list" : null,
      page: page > 1 ? String(page) : null,
    };
    for (const [k, v] of Object.entries({ ...cur, ...next })) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/programs${s ? `?${s}` : ""}${hash}`;
  };

  const activeChips = [
    active && { label: CATEGORY_LABEL[active], href: buildHref({ category: null, page: null }, "#safn") },
    activeLevel && { label: activeLevel, href: buildHref({ level: null, page: null }, "#safn") },
    activeFamily && { label: activeFamily, href: buildHref({ family: null, page: null }, "#safn") },
    q && { label: `„${q}“`, href: buildHref({ q: null, page: null }, "#safn") },
    onlyFresh && { label: "Ekki nýlega notað", href: buildHref({ fresh: null, page: null }, "#safn") },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs tracking-widest text-accent uppercase">
            Æfingaplön{stationName ? ` · ${stationName}` : ""}
          </div>
          <h1 className="mt-2 text-3xl font-bold">
            {current ? (
              <>
                Vika {isoWeek(current.week_starting)}{" "}
                <span className="font-medium text-muted-foreground">
                  · {shortDate(current.week_starting)}–{shortDate(current.week_starting, 5)}
                </span>
              </>
            ) : (
              "Æfingaplön"
            )}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {current?.cycle_week && (
              <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-orange-400">
                Lota: {current.cycle_week.toLowerCase()} af 4
              </span>
            )}
            {current && current.week_starting !== thisMonday && (
              <span>Engin {weekLevel} vika skráð fyrir þessa viku – sýni nýjustu</span>
            )}
            {!canBuild && <span>Skoðunarhamur</span>}
          </div>
        </div>
        {canBuild && (
          <div className="flex flex-wrap gap-2">
            {upcoming && (
              <Link
                href={`/app/programs/weeks/${upcoming.id}`}
                className="flex h-10 items-center rounded-lg border border-border bg-muted px-3.5 text-sm hover:border-accent"
              >
                Næsta vika ({shortDate(upcoming.week_starting)}) →
              </Link>
            )}
            <Link
              href="/app/programs/new"
              className="flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground hover:opacity-90"
            >
              + Smíða viku
            </Link>
          </div>
        )}
      </header>

      {/* Current week */}
      <section className="mb-6 overflow-hidden rounded-xl border border-border bg-muted">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <nav aria-label="Stig" className="flex gap-1 rounded-lg border border-border bg-background p-[3px]">
            {LEVELS.map((l) => (
              <Link
                key={l.key}
                href={buildHref({ vika: l.key })}
                aria-current={weekLevel === l.key ? "page" : undefined}
                scroll={false}
                className={`flex h-[34px] min-w-[64px] items-center justify-center rounded-md px-3 text-sm font-semibold ${
                  weekLevel === l.key
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.key}
              </Link>
            ))}
          </nav>
          {current && (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {current.optisigns_pushed_at ? (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
                  Birt á skjám
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-muted-foreground" />
                  Ekki birt á skjám
                </span>
              )}
              <Link
                href={`/app/programs/weeks/${current.id}`}
                className="font-medium text-orange-400 hover:text-orange-300"
              >
                Opna viku →
              </Link>
            </div>
          )}
        </div>
        {current && currentSlots.length > 0 ? (
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {currentSlots.map((s, i) => (
              <Link
                key={i}
                href={`/app/programs/weeks/${current.id}`}
                className="flex min-h-[130px] flex-col gap-2.5 bg-muted p-4 hover:bg-background"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                    {shortDay(s.day, i)} · {shortDate(current.week_starting, i)}
                  </span>
                </div>
                <CategoryTag category={s.category} />
                <div className="text-[15px] font-semibold leading-snug">
                  {cleanTitle(s.name ?? "—")}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            {canBuild
              ? `Engin ${weekLevel} vika hefur verið sett upp enn. Smelltu á „Smíða viku“ til að byrja.`
              : `Engin ${weekLevel} æfingavika hefur verið sett upp fyrir stöðina þína enn.`}
          </p>
        )}
      </section>

      {/* Cycle + balance */}
      {current && (
        <div className="mb-12 flex flex-wrap gap-6">
          <section className="min-w-0 flex-[2_1_560px] rounded-xl border border-border bg-muted p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                {cycleN ? "4-vikna lota" : "Síðustu 4 vikur"} · {weekLevel}
              </h2>
              <span className="text-xs text-muted-foreground">
                Rautt = sama uppsetning oftar en einu sinni
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Tími</th>
                    {cycleCols.map((c) => (
                      <th
                        key={c.start}
                        className={`px-2 py-2 font-medium ${c.isCurrent ? "text-orange-400" : ""}`}
                      >
                        {c.label}
                        {c.isCurrent ? " · núna" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: cycleRowCount }, (_, r) => (
                    <tr key={r} className="border-t border-border">
                      <td className="whitespace-nowrap py-2.5 pr-2 text-muted-foreground">
                        {shortDay(currentSlots[r]?.day, r)}
                      </td>
                      {cycleCols.map((c) => {
                        const s = c.slots?.[r];
                        const dup =
                          s?.structure_source_id &&
                          (cycleCounts.get(s.structure_source_id) ?? 0) > 1;
                        return (
                          <td
                            key={c.start}
                            className={`px-2 py-2.5 ${c.isCurrent ? "bg-accent/5 font-medium" : ""} ${
                              dup ? "text-red-300" : c.slots ? "" : "text-muted-foreground/60"
                            }`}
                          >
                            {s ? cleanTitle(s.name ?? "—") : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex min-w-0 flex-[1_1_280px] flex-col gap-4 rounded-xl border border-border bg-muted p-5">
            <h2 className="font-semibold">Jafnvægi vikunnar</h2>
            <div aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {balance.map((b) => (
                <span
                  key={b.key}
                  style={{
                    flex: `${b.n || 0.15} 1 0`,
                    background: b.n ? CATEGORY_COLOR[b.key] : "var(--border)",
                  }}
                />
              ))}
            </div>
            <ul className="space-y-2 text-sm">
              {balance.map((b) => (
                <li key={b.key} className="flex justify-between">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-[3px]"
                      style={{ background: CATEGORY_COLOR[b.key] }}
                    />
                    {b.label}
                  </span>
                  <span className="text-muted-foreground">
                    {b.n} {b.n === 1 ? "tími" : "tímar"}
                  </span>
                </li>
              ))}
            </ul>
            {missing.length > 0 && (
              <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                Enginn {missing.join(" eða ")} tími þessa vikuna.
              </p>
            )}
          </section>
        </div>
      )}

      {/* All weeks (compact) */}
      {recentList.length > 0 && (
        <details className="mb-12 rounded-xl border border-border bg-muted">
          <summary className="cursor-pointer px-5 py-3.5 text-sm font-medium">
            Allar vikur{stationName ? ` – ${stationName}` : ""} ({weeks.length})
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {recentList.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/app/programs/weeks/${w.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-background"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{w.title || `Vika ${isoWeek(w.week_starting)}`}</span>
                    <span className="ml-2 font-mono text-xs text-orange-400">{w.level}</span>
                    {w.cycle_week && (
                      <span className="ml-2 text-xs text-muted-foreground">{w.cycle_week}</span>
                    )}
                    <div className="text-xs text-muted-foreground">{ownerName.get(w.owner_id) ?? "—"}</div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {shortDate(w.week_starting)} · {slotsOf(w).length} tímar
                    {w.optisigns_pushed_at ? " · birt" : ""} →
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Library */}
      <section id="safn" className="scroll-mt-4 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">Uppsetningasafn</h2>
          <span className="text-sm text-muted-foreground">
            {total} uppsetningar · {matchCount ?? list.length} sýndar
            {totalPages > 1 && ` · síða ${page}/${totalPages}`}
          </span>
        </div>

        <Suspense fallback={<div className="h-16 rounded-xl border border-border bg-muted" />}>
          <LibraryFilters
            categories={CATEGORIES.map((c, i) => ({ value: c.key, label: `${c.label} (${counts[i]})` }))}
            levels={LEVELS.map((l) => ({ value: l.key, label: l.key }))}
            families={FAMILIES.map((f) => ({ value: f.label, label: f.label }))}
          />
        </Suspense>

        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Virkar síur:</span>
            {activeChips.map((c) => (
              <Link
                key={c.label}
                href={c.href}
                scroll={false}
                className="rounded-full border border-border px-2.5 py-1 text-foreground hover:border-accent"
              >
                {c.label} <span aria-hidden="true">✕</span>
                <span className="sr-only">fjarlægja síu</span>
              </Link>
            ))}
            <Link href="/app/programs#safn" scroll={false} className="hover:text-foreground">
              Hreinsa allt
            </Link>
          </div>
        )}

        {list.length === 0 && (
          <p className="rounded-xl border border-border bg-muted p-6 text-sm text-muted-foreground">
            Engin uppsetning fannst{q ? ` fyrir „${q}“` : ""}. Prófaðu aðra leit eða síu.
          </p>
        )}

        <div className={listView ? "space-y-2" : "grid gap-4 md:grid-cols-2 lg:grid-cols-3"}>
          {list.map((s) => {
            const levels = (s.levels ?? {}) as Record<string, string>;
            const lvls = ["l1", "l2", "l3"]
              .map((k) => levels[k])
              .filter(Boolean)
              .map((v) => LEVEL_SHORT[v] ?? v);
            const use = usageOf(s.source_id);
            const dim = use.tone === "recent" || use.tone === "planned";
            const preview = (s.preview ?? "").trim();
            const toneCls =
              use.tone === "fresh"
                ? "text-emerald-400"
                : use.tone === "recent"
                  ? "text-red-300"
                  : use.tone === "planned"
                    ? "text-orange-400"
                    : "text-muted-foreground";
            const addBtn = canBuild && (
              <Link
                href={`/app/programs/new?add=${s.id}`}
                className="flex h-9 shrink-0 items-center rounded-lg border border-accent px-3 text-[13px] font-medium text-orange-400 hover:bg-accent/10"
              >
                + Setja í viku
              </Link>
            );

            if (listView) {
              return (
                <article
                  key={s.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted px-4 py-3 ${
                    dim ? "border-red-400/30 opacity-75" : "border-border"
                  }`}
                >
                  <CategoryTag category={s.category} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold">{s.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">
                      {preview.split("\n").find((l) => l.trim())}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">{lvls.join(" · ")}</span>
                  <span className={`text-xs ${toneCls}`}>{use.label}</span>
                  {addBtn}
                </article>
              );
            }

            return (
              <article
                key={s.id}
                className={`flex flex-col gap-2.5 rounded-xl border bg-muted p-4 ${
                  dim ? "border-red-400/30 opacity-75" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <CategoryTag category={s.category} />
                  <span className="font-mono text-[11px] text-muted-foreground">{lvls.join(" · ")}</span>
                </div>
                <h3 className="font-semibold">{s.name}</h3>
                {preview && (
                  <details className="group text-xs text-muted-foreground">
                    <summary className="cursor-pointer list-none">
                      <span className="line-clamp-3 whitespace-pre-line leading-relaxed group-open:hidden">
                        {preview}
                      </span>
                      <span className="mt-1 inline-block text-[11px] underline group-open:hidden">
                        Sýna allt
                      </span>
                      <span className="hidden text-[11px] underline group-open:inline">Fela</span>
                    </summary>
                    <pre className="mt-1 whitespace-pre-line font-sans leading-relaxed">{preview}</pre>
                  </details>
                )}
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className={`text-xs ${toneCls}`}>{use.label}</span>
                  {addBtn}
                </div>
              </article>
            );
          })}
        </div>

        {totalPages > 1 && (
          <nav aria-label="Síður" className="flex items-center justify-center gap-3 pt-4 text-sm">
            {page > 1 ? (
              <Link
                href={buildHref({ page: page - 1 > 1 ? String(page - 1) : null }, "#safn")}
                className="rounded-lg border border-border px-4 py-2 text-muted-foreground hover:text-foreground"
              >
                ← Fyrri
              </Link>
            ) : (
              <span className="rounded-lg border border-border px-4 py-2 text-muted-foreground/40">← Fyrri</span>
            )}
            <span className="text-muted-foreground">
              Síða {page} af {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={buildHref({ page: String(page + 1) }, "#safn")}
                className="rounded-lg border border-border px-4 py-2 text-muted-foreground hover:text-foreground"
              >
                Næsta →
              </Link>
            ) : (
              <span className="rounded-lg border border-border px-4 py-2 text-muted-foreground/40">Næsta →</span>
            )}
          </nav>
        )}
      </section>
    </main>
  );
}

// Server components render once per request, so "now" is the request time.
function requestTime(): number {
  return Date.now();
}

function CategoryTag({ category }: { category: string }) {
  const color = CATEGORY_COLOR[category] ?? "#a3a3a3";
  return (
    <span
      className="w-fit rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-widest uppercase"
      style={{ color, borderColor: `${color}55` }}
    >
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}
