import { requireProgramBuilder } from "@/lib/auth/require-staff";
import { BuilderClient, type RecentWeek } from "./builder-client";

export const metadata = {
  title: "Smíða viku · Metabolic",
};

export default async function NewProgramPage() {
  const { supabase, user } = await requireProgramBuilder();

  const { data: profile } = await supabase
    .from("profiles")
    .select("station_id")
    .eq("id", user.id)
    .single();

  // Supabase caps a single select at 1000 rows; the structures library is bigger,
  // so page through it to get every setup into the builder.
  const structuresRaw: Array<{
    id: string;
    source_id: string;
    name: string;
    category: string;
    levels: unknown;
    preview: string | null;
  }> = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("structures")
      .select("id, source_id, name, category, levels, preview")
      .order("name", { ascending: true })
      .range(from, from + 999);
    if (!data?.length) break;
    structuresRaw.push(...data);
    if (data.length < 1000) break;
  }

  // The structure's real level lives in levels.l1 ("Level 1/2/3"); a handful are
  // cross-level ("All Levels"/"Foundation"/"Performance") → treat as ALL.
  const LEVEL_MAP: Record<string, string> = {
    "Level 1": "MB1",
    "Level 2": "MB2",
    "Level 3": "MB3",
  };
  const structures = structuresRaw.map((s) => {
    const l1 = (s.levels as { l1?: string } | null)?.l1 ?? "";
    return {
      id: s.id,
      source_id: s.source_id,
      name: s.name,
      category: s.category,
      level: LEVEL_MAP[l1] ?? "ALL",
      preview: s.preview ?? "",
    };
  });

  // Every saved week for this station (or my own, without a station): used to
  // show when each setup was last used, and to copy the latest week per level.
  let weeksQuery = supabase
    .from("weekly_plans")
    .select("id, title, level, week_starting, cycle_week, programs_json")
    .order("week_starting", { ascending: false });
  weeksQuery = profile?.station_id
    ? weeksQuery.eq("station_id", profile.station_id)
    : weeksQuery.eq("owner_id", user.id);
  const { data: weeks } = await weeksQuery;

  // source_id → every week_starting it was used in (newest first).
  const usage: Record<string, string[]> = {};
  const recentWeeks: RecentWeek[] = [];
  const seenLevel = new Set<string>();
  for (const w of weeks ?? []) {
    const slots = (Array.isArray(w.programs_json) ? w.programs_json : []) as {
      category?: string;
      structure_source_id?: string;
      preview?: string;
    }[];
    for (const s of slots) {
      const sid = s?.structure_source_id;
      if (!sid || !w.week_starting) continue;
      (usage[sid] ??= []).push(w.week_starting);
    }
    // Keep only the latest week per level for "Afrita síðustu viku".
    if (!seenLevel.has(w.level)) {
      seenLevel.add(w.level);
      recentWeeks.push({
        id: w.id,
        title: w.title,
        level: w.level,
        week_starting: w.week_starting,
        cycle_week: w.cycle_week,
        slots: slots.map((s) => ({
          category: s.category ?? "",
          structure_source_id: s.structure_source_id ?? "",
          preview: s.preview,
        })),
      });
    }
  }

  return (
    <BuilderClient
      userId={user.id}
      stationId={profile?.station_id ?? null}
      structures={structures}
      usage={usage}
      recentWeeks={recentWeeks}
    />
  );
}
