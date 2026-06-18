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

const LEVEL_NUM: Record<string, number> = { MB1: 1, MB2: 2, MB3: 3 };
const NUM_LEVEL: Record<number, "MB1" | "MB2" | "MB3"> = {
  1: "MB1",
  2: "MB2",
  3: "MB3",
};

// Swap the level token anywhere it appears as a unit (-l1, -l1-var-a,
// -l1-4-6-8 …). Fallback when a family has no group_key.
function mapToLevel(sourceId: string, lvl: number): string {
  return sourceId.replace(/-l[123](?=-|$)/, `-l${lvl}`);
}

// Drop the level token so the same setup at different levels normalises to one
// key — lets us preserve the variant (…-l1-var-b ↔ …-l2-var-b, base ↔ base).
function stripLevel(sourceId: string): string {
  return sourceId.replace(/-l[123](?=-|$)/, "");
}

export async function deleteWeek(
  planId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireProgramBuilder();
  const { error } = await supabase
    .from("weekly_plans")
    .delete()
    .eq("id", planId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/programs");
  return { ok: true };
}

// Clone a saved week to the other two MB levels, mapping each chosen structure
// to its sibling at the target level (same family/variant). Structures with no
// level token (endurance/burn "ALL" picks) carry over unchanged; if a sibling
// doesn't exist, the original pick is kept so no slot ends up empty.
export async function cloneWeekToLevels(
  planId: string,
): Promise<{ ok: boolean; created?: number; error?: string }> {
  const { supabase, user } = await requireProgramBuilder();

  const { data: week, error } = await supabase
    .from("weekly_plans")
    .select("title, level, week_starting, programs_json, station_id")
    .eq("id", planId)
    .single();
  if (error || !week) return { ok: false, error: "Vika fannst ekki." };

  const srcLvl = LEVEL_NUM[week.level];
  if (!srcLvl) return { ok: false, error: "Vikan er ekki á MB1/MB2/MB3 stigi." };

  const slots = (Array.isArray(week.programs_json)
    ? week.programs_json
    : []) as Slot[];
  const targets = [1, 2, 3].filter((l) => l !== srcLvl);
  const sourceIds = slots.map((s) => s.structure_source_id).filter(Boolean);

  // The family (group_key) of each chosen structure — the authoritative link
  // across levels (source_id naming is inconsistent, e.g. "french-contrast"
  // for L1 base vs "french-contrast-l2").
  const { data: srcRows } = sourceIds.length
    ? await supabase
        .from("structures")
        .select("source_id, group_key")
        .in("source_id", sourceIds)
    : { data: [] as { source_id: string; group_key: string | null }[] };
  const groupBySource = new Map(
    (srcRows ?? []).map((r) => [r.source_id, r.group_key]),
  );

  // All structures in those families, so we can pick the right level + variant.
  const groupKeys = [
    ...new Set((srcRows ?? []).map((r) => r.group_key).filter(Boolean)),
  ] as string[];
  const { data: famRows } = groupKeys.length
    ? await supabase
        .from("structures")
        .select("source_id, group_key, levels, name")
        .in("group_key", groupKeys)
    : {
        data: [] as {
          source_id: string;
          group_key: string;
          levels: { l1?: string } | null;
          name: string;
        }[],
      };
  const nameBy = new Map((famRows ?? []).map((r) => [r.source_id, r.name]));

  // Resolve a slot's structure to the equivalent at the target level.
  function resolve(sid: string, lvl: number): { id: string; name: string } {
    const gk = groupBySource.get(sid);
    if (gk) {
      const wantLvl = `Level ${lvl}`;
      const cands = (famRows ?? []).filter(
        (r) =>
          r.group_key === gk &&
          ((r.levels as { l1?: string } | null)?.l1 ?? "") === wantLvl,
      );
      if (cands.length) {
        const want = stripLevel(sid);
        const exact = cands.find((c) => stripLevel(c.source_id) === want);
        const pick = exact ?? cands[0];
        return { id: pick.source_id, name: pick.name };
      }
    }
    // No family match (standalone / ALL-level pick, or level not built):
    // try a plain token swap, else keep the original so no slot is empty.
    const swapped = mapToLevel(sid, lvl);
    if (swapped !== sid && nameBy.has(swapped))
      return { id: swapped, name: nameBy.get(swapped)! };
    return { id: sid, name: "" };
  }

  let created = 0;
  for (const lvl of targets) {
    const programs_json = slots.map((s) => {
      const r = resolve(s.structure_source_id, lvl);
      return {
        ...s,
        structure_source_id: r.id,
        name: r.name || s.name,
      };
    });
    const hadToken = /\bMB[123]\b/.test(week.title ?? "");
    const title = hadToken
      ? (week.title ?? "").replace(/\bMB[123]\b/g, NUM_LEVEL[lvl])
      : `${week.title || `Vika ${week.week_starting}`} – ${NUM_LEVEL[lvl]}`;

    const { error: insErr } = await supabase.from("weekly_plans").insert({
      owner_id: user.id,
      station_id: week.station_id,
      title,
      level: NUM_LEVEL[lvl],
      week_starting: week.week_starting,
      programs_json,
    });
    if (!insErr) created++;
  }

  revalidatePath("/app/programs");
  return { ok: true, created };
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
