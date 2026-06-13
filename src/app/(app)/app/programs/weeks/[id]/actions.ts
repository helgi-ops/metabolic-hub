"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/require-staff";
import {
  generateWeeklyPlanPdf,
  type PdfSession,
} from "@/lib/pdf/weekly-plan-pdf";

type Slot = {
  slot: number;
  category: string;
  structure_source_id: string;
  name: string;
  day?: string;
};

export async function generatePlanPdf(
  planId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireStaff();

  const { data: week, error: weekErr } = await supabase
    .from("weekly_plans")
    .select("id, title, level, week_starting, programs_json")
    .eq("id", planId)
    .single();
  if (weekErr || !week) return { ok: false, error: "Vika fannst ekki." };

  const slots = (Array.isArray(week.programs_json)
    ? week.programs_json
    : []) as Slot[];

  // Pull full prescriptions for the slots' structures.
  const sourceIds = slots.map((s) => s.structure_source_id).filter(Boolean);
  const { data: structures } = await supabase
    .from("structures")
    .select("source_id, name, preview")
    .in("source_id", sourceIds);
  const bySource = new Map((structures ?? []).map((s) => [s.source_id, s]));

  const sessions: PdfSession[] = slots.map((s) => ({
    slot: s.slot,
    category: s.category,
    name: bySource.get(s.structure_source_id)?.name ?? s.name,
    preview: bySource.get(s.structure_source_id)?.preview ?? "",
    day: s.day,
  }));

  const bytes = await generateWeeklyPlanPdf({
    title: week.title ?? "",
    level: week.level,
    weekStarting: week.week_starting,
    sessions,
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
