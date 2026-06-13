import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Guards a page so only coaches/admins (staff) can view it. Members (students)
 * must never see the workout/programming content — it lives on the station board
 * / TV, not in the member app. Redirects students back to their dashboard.
 */
export async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role === "student") redirect("/app");

  return { supabase, user, role: profile.role };
}
