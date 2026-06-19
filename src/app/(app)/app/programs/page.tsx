import Link from "next/link";
import { requireProgramBuilder } from "@/lib/auth/require-staff";
import type { Database } from "@/lib/types/database";

export const metadata = {
  title: "Program Builder · Metabolic",
};

type Category = Database["public"]["Enums"]["program_category"];

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "strength", label: "Strength" },
  { key: "power_strength", label: "Power/Strength" },
  { key: "power", label: "Power" },
  { key: "endurance", label: "Endurance" },
  { key: "burn", label: "Burn" },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
);

// Level chips → the levels.l1 value stored on each structure.
const LEVELS: { key: string; label: string; value: string }[] = [
  { key: "MB1", label: "MB1", value: "Level 1" },
  { key: "MB2", label: "MB2", value: "Level 2" },
  { key: "MB3", label: "MB3", value: "Level 3" },
];
const LEVEL_VALUE: Record<string, string> = Object.fromEntries(
  LEVELS.map((l) => [l.key, l.value]),
);

// Name-based "type" facet: each chip matches structures whose name contains the
// pattern (case-insensitive). Some are families (Base, On The Min, Wave) and
// some are cross-cutting tags (Cluster, Partner, Contrast) — a setup can match
// more than one. Order roughly: main protocols, then tags.
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

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    level?: string;
    family?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const { category, level, family: familyRaw, q: qRaw, page: pageRaw } =
    await searchParams;
  const active = (
    CATEGORY_LABEL[category ?? ""] ? category : null
  ) as Category | null;
  const activeLevel = LEVEL_VALUE[level ?? ""] ? level! : null;
  const activeFamily = FAMILY_MATCH[familyRaw ?? ""] ? familyRaw! : null;
  const q = (qRaw ?? "").trim();
  const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);

  const { supabase, user } = await requireProgramBuilder();

  const { data: profile } = await supabase
    .from("profiles")
    .select("station_id, station:stations(name)")
    .eq("id", user.id)
    .single();
  const stationName = (profile?.station as { name: string } | null)?.name ?? null;

  // Weeks for my station (oversight of the studio). If I have no station, my own.
  let weekQuery = supabase
    .from("weekly_plans")
    .select("id, title, level, week_starting, programs_json, created_at, owner_id")
    .order("created_at", { ascending: false })
    .limit(8);
  weekQuery = profile?.station_id
    ? weekQuery.eq("station_id", profile.station_id)
    : weekQuery.eq("owner_id", user.id);
  const { data: myWeeks } = await weekQuery;

  // Resolve who built each week (owner_id → profiles has no FK, so look up by id).
  const ownerIds = [...new Set((myWeeks ?? []).map((w) => w.owner_id))];
  const { data: owners } = ownerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ownerIds)
    : { data: [] };
  const ownerName = new Map((owners ?? []).map((o) => [o.id, o.full_name]));

  // Last time each structure was used in a week plan for this station, so the
  // coach can avoid repeating the same setup inside a 4-week block. Scans ALL
  // station weeks (not just the 8 shown above).
  let usageQuery = supabase
    .from("weekly_plans")
    .select("week_starting, programs_json");
  usageQuery = profile?.station_id
    ? usageQuery.eq("station_id", profile.station_id)
    : usageQuery.eq("owner_id", user.id);
  const { data: usageWeeks } = await usageQuery;

  const lastUsed = new Map<string, string>(); // source_id → latest week_starting
  for (const w of usageWeeks ?? []) {
    const slots = Array.isArray(w.programs_json) ? w.programs_json : [];
    for (const slot of slots as { structure_source_id?: string }[]) {
      const sid = slot?.structure_source_id;
      if (!sid || !w.week_starting) continue;
      const prev = lastUsed.get(sid);
      if (!prev || w.week_starting > prev) lastUsed.set(sid, w.week_starting);
    }
  }

  // Total per category (for the filter counts) — cheap head counts.
  const counts = await Promise.all(
    CATEGORIES.map(async (c) => {
      const { count } = await supabase
        .from("structures")
        .select("*", { count: "exact", head: true })
        .eq("category", c.key);
      return [c.key, count ?? 0] as const;
    }),
  );
  const countByCat = Object.fromEntries(counts);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);

  const from = (page - 1) * PAGE_SIZE;
  let query = supabase
    .from("structures")
    .select("id, source_id, name, category, group_key, levels, preview", {
      count: "exact",
    })
    .order("name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (active) query = query.eq("category", active);
  if (activeLevel) query = query.eq("levels->>l1", LEVEL_VALUE[activeLevel]);
  if (activeFamily)
    query = query.ilike("name", `%${FAMILY_MATCH[activeFamily]}%`);
  if (q) query = query.or(`name.ilike.%${q}%,preview.ilike.%${q}%`);

  const { data: structures, count: matchCount } = await query;
  const list = structures ?? [];
  const totalPages = Math.max(1, Math.ceil((matchCount ?? 0) / PAGE_SIZE));

  // Build a querystring for filter links / pagination, preserving the rest.
  const buildHref = (next: {
    category?: string | null;
    level?: string | null;
    family?: string | null;
    q?: string | null;
    page?: number | null;
  }) => {
    const p = new URLSearchParams();
    const cat = next.category === undefined ? active : next.category;
    const lvl = next.level === undefined ? activeLevel : next.level;
    const fam = next.family === undefined ? activeFamily : next.family;
    const qv = next.q === undefined ? q : next.q;
    const pg = next.page === undefined ? page : next.page;
    if (cat) p.set("category", cat);
    if (lvl) p.set("level", lvl);
    if (fam) p.set("family", fam);
    if (qv) p.set("q", qv);
    if (pg && pg > 1) p.set("page", String(pg));
    const s = p.toString();
    return s ? `/app/programs?${s}` : "/app/programs";
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Program Builder
        </div>
        <h1 className="mt-2 text-3xl font-bold">Æfingasafn — structures</h1>
        <p className="mt-2 text-muted-foreground">
          {total} æfinga-structures úr Metabolic kerfinu, núna í gagnagrunninum.
          Sía eftir flokki; hver structure er heill tími tilbúinn í vikuplan.
        </p>
      </div>

      {/* My saved weeks */}
      <section className="mb-10 rounded-lg border border-border bg-muted p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            Vikur{stationName ? ` — ${stationName}` : ""}
          </h2>
          <Link
            href="/app/programs/new"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
          >
            + Smíða viku
          </Link>
        </div>
        {myWeeks && myWeeks.length > 0 ? (
          <ul className="mt-4 divide-y divide-border">
            {myWeeks.map((w) => {
              const slots = Array.isArray(w.programs_json)
                ? w.programs_json.length
                : 0;
              return (
                <li key={w.id}>
                  <Link
                    href={`/app/programs/weeks/${w.id}`}
                    className="-mx-2 flex items-center justify-between rounded px-2 py-3 text-sm hover:bg-background"
                  >
                    <div>
                      <span className="font-medium">
                        {w.title || `Vika ${w.week_starting}`}
                      </span>
                      <span className="ml-2 font-mono text-xs text-accent">
                        {w.level}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {ownerName.get(w.owner_id) ?? "—"}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {w.week_starting} · {slots} tímar →
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Engar vistaðar vikur enn. Smelltu á „Smíða viku“ til að byrja.
          </p>
        )}
      </section>

      {/* Search */}
      <form method="get" action="/app/programs" className="mb-4 flex gap-2">
        {active && <input type="hidden" name="category" value={active} />}
        {activeLevel && <input type="hidden" name="level" value={activeLevel} />}
        {activeFamily && (
          <input type="hidden" name="family" value={activeFamily} />
        )}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Leita að æfingu (nafn eða innihald)…"
          className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
        >
          Leita
        </button>
        {q && (
          <Link
            href={buildHref({ q: null, page: 1 })}
            className="shrink-0 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            Hreinsa
          </Link>
        )}
      </form>

      {/* Category filter */}
      <div className="mb-3 flex flex-wrap gap-2">
        <FilterChip
          href={buildHref({ category: null, page: 1 })}
          label="Allir"
          count={total}
          active={!active}
        />
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c.key}
            href={buildHref({ category: c.key, page: 1 })}
            label={c.label}
            count={countByCat[c.key] ?? 0}
            active={active === c.key}
          />
        ))}
      </div>

      {/* Level filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        <FilterChip
          href={buildHref({ level: null, page: 1 })}
          label="Öll stig"
          active={!activeLevel}
        />
        {LEVELS.map((l) => (
          <FilterChip
            key={l.key}
            href={buildHref({ level: l.key, page: 1 })}
            label={l.label}
            active={activeLevel === l.key}
          />
        ))}
      </div>

      {/* Type / family filter (by name) */}
      <div className="mb-6 flex flex-wrap gap-2">
        <FilterChip
          href={buildHref({ family: null, page: 1 })}
          label="Allar tegundir"
          active={!activeFamily}
        />
        {FAMILIES.map((f) => (
          <FilterChip
            key={f.label}
            href={buildHref({ family: f.label, page: 1 })}
            label={f.label}
            active={activeFamily === f.label}
          />
        ))}
      </div>

      <div className="mb-4 text-sm text-muted-foreground">
        {active ? CATEGORY_LABEL[active] : "Allir flokkar"}
        {activeLevel ? ` · ${activeLevel}` : ""}
        {activeFamily ? ` · ${activeFamily}` : ""}
        {q ? ` · „${q}“` : ""} · {matchCount ?? list.length} structures
        {totalPages > 1 && ` · síða ${page}/${totalPages}`}
      </div>

      {list.length === 0 && (
        <p className="rounded-lg border border-border bg-muted p-6 text-sm text-muted-foreground">
          Engin structure fannst{q ? ` fyrir „${q}“` : ""}. Prófaðu aðra leit eða
          síu.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => {
          const levels = (s.levels ?? {}) as Record<string, string>;
          const used = lastUsedInfo(lastUsed.get(s.source_id));
          return (
            <article
              key={s.id}
              className="flex flex-col rounded-lg border border-border bg-muted p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] tracking-widest text-accent uppercase">
                  {CATEGORY_LABEL[s.category] ?? s.category}
                </span>
                <div className="flex gap-1">
                  {["l1", "l2", "l3"].map((lv) =>
                    levels[lv] ? (
                      <span
                        key={lv}
                        className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        title={levels[lv]}
                      >
                        {lv.toUpperCase()}
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
              <h2 className="mt-2 font-semibold">{s.name}</h2>
              <pre className="mt-3 flex-1 whitespace-pre-line font-sans text-xs leading-relaxed text-muted-foreground">
                {s.preview}
              </pre>
              {used && (
                <div
                  className={`mt-3 rounded px-2 py-1 text-[11px] ${
                    used.recent
                      ? "bg-red-500/15 text-red-400"
                      : "text-muted-foreground"
                  }`}
                  title={`Síðast í vikuplani sem hófst ${used.date}`}
                >
                  {used.recent
                    ? `⚠ Notað fyrir ${used.days} ${used.days === 1 ? "degi" : "dögum"} — innan 4-vikna lotu`
                    : `Síðast notað ${used.date}`}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={buildHref({ page: page - 1 })}
              className="rounded-md border border-border px-4 py-2 text-muted-foreground hover:text-foreground transition"
            >
              ← Fyrri
            </Link>
          ) : (
            <span className="rounded-md border border-border px-4 py-2 text-muted-foreground/40">
              ← Fyrri
            </span>
          )}
          <span className="text-muted-foreground">
            Síða {page} af {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={buildHref({ page: page + 1 })}
              className="rounded-md border border-border px-4 py-2 text-muted-foreground hover:text-foreground transition"
            >
              Næsta →
            </Link>
          ) : (
            <span className="rounded-md border border-border px-4 py-2 text-muted-foreground/40">
              Næsta →
            </span>
          )}
        </div>
      )}
    </main>
  );
}

// How long ago a structure was last used in a week plan. "recent" means within
// a 4-week (28-day) block — the window a coach should avoid repeating within.
function lastUsedInfo(
  date: string | undefined,
): { date: string; days: number; recent: boolean } | null {
  if (!date) return null;
  const start = new Date(`${date}T00:00:00Z`).getTime();
  const days = Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
  return { date, days, recent: days <= 28 };
}

function FilterChip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {count != null && (
        <span
          className={`ml-1.5 text-xs ${active ? "opacity-80" : "opacity-60"}`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
