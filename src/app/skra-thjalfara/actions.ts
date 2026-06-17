"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type CoachSignupResult =
  | { ok: true }
  | { ok: false; message: string };

// Creates an active coach account from the coach invite link. Gated by a shared
// invite code (COACH_INVITE_CODE) so not just anyone can self-register as staff.
// Coaches get role=coach + status=active immediately (email_confirm bypasses the
// confirmation email); Program Builder stays OFF until an admin grants it.
export async function registerCoach(input: {
  fullName: string;
  email: string;
  password: string;
  stationId: string;
  code: string;
}): Promise<CoachSignupResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const stationId = input.stationId || null;

  const expected = process.env.COACH_INVITE_CODE?.trim();
  if (!expected) {
    return {
      ok: false,
      message: "Þjálfara-skráning er ekki virkjuð (vantar boðskóða á þjóninn).",
    };
  }
  if (input.code.trim() !== expected) {
    return { ok: false, message: "Rangur boðskóði." };
  }
  if (!fullName || !email) {
    return { ok: false, message: "Fylltu út nafn og netfang." };
  }
  if (input.password.length < 8) {
    return { ok: false, message: "Lykilorð þarf að vera að lágmarki 8 stafir." };
  }
  if (!stationId) {
    return { ok: false, message: "Veldu stöð." };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: fullName, station_id: stationId },
  });

  if (error || !data.user) {
    const msg = error?.message ?? "Tókst ekki að stofna aðgang.";
    return {
      ok: false,
      message: /already.*registered|exists/i.test(msg)
        ? "Netfang er þegar skráð."
        : msg,
    };
  }

  // handle_new_user already inserted the profile (student/pending); promote it.
  const { error: upErr } = await admin
    .from("profiles")
    .update({ role: "coach", status: "active" })
    .eq("id", data.user.id);

  if (upErr) {
    return { ok: false, message: upErr.message };
  }

  return { ok: true };
}
