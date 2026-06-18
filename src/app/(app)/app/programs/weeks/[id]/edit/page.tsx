import { notFound } from "next/navigation";
import { requireProgramBuilder } from "@/lib/auth/require-staff";
import { EditClient } from "./edit-client";

export const metadata = { title: "Breyta viku · Metabolic" };

const LEVEL_MAP: Record<string, string> = {
  "Level 1": "MB1",
  "Level 2": "MB2",
  "Level 3": "MB3",
};

type Slot = {
  slot: number;
  category: string;
  structure_source_id: string;
  name: string;
  day?: string;
  focus?: string;
};

export default async function EditWeekPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireProgramBuilder();

  const { data: week } = await supabase
    .from("weekly_plans")
    .select("id, title, level, week_starting, programs_json")
    .eq("id", id)
    .single();
  if (!week) notFound();

  const slots = (Array.isArray(week.programs_json)
    ? week.programs_json
    : []) as Slot[];

  const { data: structuresRaw } = await supabase
    .from("structures")
    .select("source_id, name, category, levels, preview")
    .order("name", { ascending: true });

  const structures = (structuresRaw ?? []).map((s) => {
    const l1 = (s.levels as { l1?: string } | null)?.l1 ?? "";
    return {
      source_id: s.source_id,
      name: s.name,
      category: s.category,
      level: LEVEL_MAP[l1] ?? "ALL",
      preview: s.preview ?? "",
    };
  });

  return (
    <EditClient
      planId={week.id}
      title={week.title ?? ""}
      level={week.level}
      weekStarting={week.week_starting}
      slots={slots}
      structures={structures}
    />
  );
}
