"use server";

import { createClient } from "@/lib/supabase/server";
import { currentWeekStreak, lastWeekRange } from "@/lib/streak";
import { generateRecapText, type RecapStats } from "@/lib/ai/weekly-recap";

const CATEGORY_LABEL: Record<string, string> = {
  strength: "Strength",
  power_strength: "Power/Strength",
  power: "Power",
  endurance: "Endurance",
  burn: "Burn",
};

export type RecapResult =
  | { ok: true; content: string; cached: boolean }
  | { ok: false; reason: "empty" | "unconfigured" | "error"; message: string };

// Build (or fetch the cached) AI recap of the member's previous full week.
// Runs as the logged-in member, so all reads/writes are RLS-scoped to them.
export async function generateWeeklyRecap(): Promise<RecapResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "error", message: "Ekki innskráð/ur." };

  const { start, end } = lastWeekRange();

  // Reuse a recap once generated for this week (one Claude call per member/week).
  const { data: existing } = await supabase
    .from("weekly_recaps")
    .select("content")
    .eq("user_id", user.id)
    .eq("week_start", start)
    .maybeSingle();
  if (existing) return { ok: true, content: existing.content, cached: true };

  // Logs from the week being recapped.
  const { data: weekLogs } = await supabase
    .from("workout_logs")
    .select("logged_on, rpe, calories, scheduled_category, notes")
    .eq("user_id", user.id)
    .gte("logged_on", start)
    .lte("logged_on", end);

  const logs = weekLogs ?? [];
  if (logs.length === 0) {
    return {
      ok: false,
      reason: "empty",
      message: "Engar skráðar æfingar í síðustu viku.",
    };
  }

  // Streak uses the member's whole history; PBs are scoped to the week.
  const [{ data: allDates }, { count: pbCount }, profileRes] = await Promise.all([
    supabase.from("workout_logs").select("logged_on").eq("user_id", user.id),
    supabase
      .from("personal_bests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("achieved_on", start)
      .lte("achieved_on", end),
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
  ]);

  const rpes = logs
    .map((l) => l.rpe)
    .filter((r): r is number => r != null);
  const categories = [
    ...new Set(
      logs
        .map((l) => l.scheduled_category)
        .filter((c): c is string => !!c)
        .map((c) => CATEGORY_LABEL[c] ?? c),
    ),
  ];

  const stats: RecapStats = {
    firstName:
      profileRes.data?.full_name?.split(" ")[0] ??
      user.email?.split("@")[0] ??
      "þú",
    weekStart: start,
    weekEnd: end,
    workouts: logs.length,
    daysActive: new Set(logs.map((l) => l.logged_on)).size,
    avgRpe: rpes.length
      ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10
      : null,
    totalCalories: Math.round(
      logs.reduce((sum, l) => sum + (l.calories ?? 0), 0),
    ),
    categories,
    newPbs: pbCount ?? 0,
    streakWeeks: currentWeekStreak((allDates ?? []).map((d) => d.logged_on)),
    notes: logs
      .map((l) => l.notes)
      .filter((n): n is string => !!n && n.trim().length > 0)
      .slice(0, 5),
  };

  let content: string;
  try {
    content = await generateRecapText(stats);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("ANTHROPIC_API_KEY")) {
      return {
        ok: false,
        reason: "unconfigured",
        message:
          "AI-yfirlit er ekki virkjað enn (vantar ANTHROPIC_API_KEY á þjóninn).",
      };
    }
    return { ok: false, reason: "error", message };
  }

  if (!content) {
    return { ok: false, reason: "error", message: "Tómt svar frá Claude." };
  }

  await supabase
    .from("weekly_recaps")
    .insert({ user_id: user.id, week_start: start, content });

  return { ok: true, content, cached: false };
}
