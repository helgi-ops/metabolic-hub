"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Members control whether their kcal shows on the leaderboard. Default is
// visible (opt_out = false); toggling this hides them from everyone's board.
export async function setLeaderboardOptOut(optOut: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const };

  const { error } = await supabase
    .from("profiles")
    .update({ leaderboard_opt_out: optOut })
    .eq("id", user.id);

  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/app/leaderboard");
  return { ok: true as const, optOut };
}
