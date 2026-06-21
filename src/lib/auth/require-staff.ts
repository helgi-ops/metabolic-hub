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

/**
 * Guards the Program Builder (weekly plans / OptiSigns). Admins always pass;
 * coaches only when an admin has granted them `can_build_programs`. Everyone
 * else is sent back to their dashboard.
 */
export async function requireProgramBuilder() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, can_build_programs")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role === "student") redirect("/app");
  if (profile.role !== "admin" && !profile.can_build_programs) redirect("/app");

  return { supabase, user, role: profile.role };
}

/**
 * Guards the weekly-plan VIEW. Any staff member (coach/admin) may look at the
 * week their station is running — coaches without `can_build_programs` get a
 * read-only view. `canBuild` tells the page whether to render building/editing
 * controls. Students are still sent back to their dashboard.
 */
export async function requireProgramViewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, can_build_programs")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role === "student") redirect("/app");

  const canBuild =
    profile.role === "admin" || profile.can_build_programs === true;
  return { supabase, user, role: profile.role, canBuild };
}
