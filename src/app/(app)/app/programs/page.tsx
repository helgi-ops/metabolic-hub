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

const PAGE_SIZE = 48;

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const active = (
    CATEGORY_LABEL[category ?? ""] ? category : null
  ) as Category | null;

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

  let query = supabase
    .from("structures")
    .select("id, source_id, name, category, group_key, levels, preview", {
      count: "exact",
    })
    .order("name", { ascending: true })
    .limit(PAGE_SIZE);
  if (active) query = query.eq("category", active);

  const { data: structures, count: matchCount } = await query;
  const list = structures ?? [];

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

      {/* Category filter */}
      <div className="mb-8 flex flex-wrap gap-2">
        <FilterChip href="/app/programs" label="Allir" count={total} active={!active} />
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c.key}
            href={`/app/programs?category=${c.key}`}
            label={c.label}
            count={countByCat[c.key] ?? 0}
            active={active === c.key}
          />
        ))}
      </div>

      <div className="mb-4 text-sm text-muted-foreground">
        {active ? CATEGORY_LABEL[active] : "Allir flokkar"} ·{" "}
        {matchCount ?? list.length} structures
        {(matchCount ?? 0) > PAGE_SIZE && ` (sýni fyrstu ${PAGE_SIZE})`}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => {
          const levels = (s.levels ?? {}) as Record<string, string>;
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
            </article>
          );
        })}
      </div>
    </main>
  );
}

function FilterChip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
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
      <span className={`ml-1.5 text-xs ${active ? "opacity-80" : "opacity-60"}`}>
        {count}
      </span>
    </Link>
  );
}
