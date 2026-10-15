"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

// Categories must match the leaderboard dropdown groups (leaderboard/page.tsx),
// and units must be ones formatMeasure/isTimeUnit know how to render.
const CATEGORIES = ["lyfta", "likamsthyngd", "thol", "timataka"] as const;
const UNITS = ["kg", "reps", "sek", "kcal", "m"] as const;

type Result = { ok: true } | { ok: false; message: string };

/**
 * Who may manage custom benchmarks: admins, and coaches with Program Builder
 * access (can_build_programs). Returns the station a coach's benchmark belongs to
 * (their primary station), or null for admins (= a shared/global benchmark).
 */
async function authorize(): Promise<
  | { ok: true; isAdmin: boolean; stationId: string | null }
  | { ok: false; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Þú þarft að vera skráð(ur) inn." };

  const { data: me } = await supabase
    .from("profiles")
    .select("role, can_build_programs, station_id")
    .eq("id", user.id)
    .single();

  if (me?.role === "admin") {
    return { ok: true, isAdmin: true, stationId: null };
  }
  if (me?.role === "coach" && me.can_build_programs && me.station_id) {
    return { ok: true, isAdmin: false, stationId: me.station_id };
  }
  return {
    ok: false,
    message:
      "Aðeins þjálfarar með Program Builder (eða admin) geta búið til æfingar.",
  };
}

export async function createBenchmark(input: {
  name: string;
  category: string;
  unit: string;
  higherIsBetter: boolean;
}): Promise<Result> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  const name = input.name.trim();
  if (!name) return { ok: false, message: "Sláðu inn nafn á æfingunni." };
  if (!CATEGORIES.includes(input.category as (typeof CATEGORIES)[number])) {
    return { ok: false, message: "Ógildur flokkur." };
  }
  if (!UNITS.includes(input.unit as (typeof UNITS)[number])) {
    return { ok: false, message: "Ógild eining." };
  }

  const supabase = await createClient();

  // Next position after the highest visible one (seeded top is 150).
  const { data: top } = await supabase
    .from("benchmarks")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (top?.position ?? 150) + 10;

  const { error } = await supabase.from("benchmarks").insert({
    name,
    category: input.category,
    unit: input.unit,
    higher_is_better: input.higherIsBetter,
    // Random slug — it's never shown to users, so no collision handling needed.
    slug: `custom-${randomUUID().slice(0, 8)}`,
    position,
    station_id: auth.stationId,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function deleteBenchmark(id: string): Promise<Result> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  // Only custom (station-scoped) benchmarks are deletable here — never a shared
  // seeded one. RLS also enforces station ownership for coaches.
  const { data: b } = await supabase
    .from("benchmarks")
    .select("id, station_id")
    .eq("id", id)
    .maybeSingle();
  if (!b) return { ok: false, message: "Æfing fannst ekki." };
  if (!b.station_id) {
    return { ok: false, message: "Ekki hægt að eyða sameiginlegri æfingu." };
  }

  const { error } = await supabase.from("benchmarks").delete().eq("id", id);
  if (error) {
    // FK from personal_bests has no ON DELETE → blocked when PBs exist.
    return {
      ok: false,
      message:
        "Ekki hægt að eyða — það eru skráð met við þessa æfingu. Eyddu þeim fyrst.",
    };
  }
  return { ok: true };
}
