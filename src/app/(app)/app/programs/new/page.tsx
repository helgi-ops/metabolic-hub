import { requireProgramBuilder } from "@/lib/auth/require-staff";
import { BuilderClient } from "./builder-client";

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

  return (
    <BuilderClient
      userId={user.id}
      stationId={profile?.station_id ?? null}
      structures={structures}
    />
  );
}
