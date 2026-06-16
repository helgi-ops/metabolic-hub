"use server";

import { revalidatePath } from "next/cache";
import { requireProgramBuilder } from "@/lib/auth/require-staff";
import {
  generateOptiSignsPdf,
  type SlideWorkout,
  type LevelContent,
} from "@/lib/pdf/optisigns-pdf";

type Slot = {
  slot: number;
  category: string;
  structure_source_id: string;
  name: string;
  day?: string;
};

// Swap the level token in a structure source_id (…-l3-var-d → …-l1-var-d) to
// find the sibling structure for another level.
function levelId(sourceId: string, lvl: number): string {
  return sourceId.replace(/-l[123](?=-var-|$)/, `-l${lvl}`);
}

// Strip the "L3 (Var D)" suffix to get a clean workout title for the slide.
function cleanTitle(name: string): string {
  return name.replace(/\s*L[123]\b.*$/i, "").trim() || name;
}

// A structure preview = intro paragraph + a numbered exercise list.
function parsePreview(preview: string | null | undefined): LevelContent {
  if (!preview || !preview.trim()) return null;
  const blocks = preview.replace(/\r/g, "").split(/\n\s*\n/);
  let intro = (blocks[0] ?? "").trim();
  let exercises = blocks
    .slice(1)
    .join("\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (exercises.length === 0) {
    const lines = preview
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    intro = lines[0] ?? "";
    exercises = lines.slice(1);
  }
  return { intro, exercises };
}

export async function generatePlanPdf(
  planId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireProgramBuilder();

  const { data: week, error: weekErr } = await supabase
    .from("weekly_plans")
    .select("id, title, level, week_starting, programs_json")
    .eq("id", planId)
    .single();
  if (weekErr || !week) return { ok: false, error: "Vika fannst ekki." };

  const slots = (Array.isArray(week.programs_json)
    ? week.programs_json
    : []) as Slot[];

  // Pull every level (l1/l2/l3) of each slot's workout so we can show level pairs.
  const needed = new Set<string>();
  for (const s of slots) {
    if (!s.structure_source_id) continue;
    for (const lvl of [1, 2, 3]) needed.add(levelId(s.structure_source_id, lvl));
  }
  const { data: structures } = needed.size
    ? await supabase
        .from("structures")
        .select("source_id, name, preview")
        .in("source_id", [...needed])
    : { data: [] as { source_id: string; name: string; preview: string | null }[] };
  const bySource = new Map((structures ?? []).map((s) => [s.source_id, s]));

  const workouts: SlideWorkout[] = slots.map((s) => {
    const lv = (lvl: number) =>
      parsePreview(bySource.get(levelId(s.structure_source_id, lvl))?.preview);
    return {
      title: cleanTitle(s.name),
      levels: { 1: lv(1), 2: lv(2), 3: lv(3) },
    };
  });

  const bytes = await generateOptiSignsPdf({
    title: week.title ?? "",
    level: week.level,
    workouts,
  });

  // Upload to the owner's folder (storage RLS: auth.uid() = first path segment).
  const path = `${user.id}/${planId}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from("weekly-plan-pdfs")
    .upload(path, Buffer.from(bytes), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadErr) return { ok: false, error: uploadErr.message };

  const { error: updateErr } = await supabase
    .from("weekly_plans")
    .update({
      generated_pdf_url: path,
      optisigns_pushed_at: new Date().toISOString(),
    })
    .eq("id", planId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath(`/app/programs/weeks/${planId}`);
  return { ok: true };
}
