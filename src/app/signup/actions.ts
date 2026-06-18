"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type MemberSignupResult =
  | { ok: true }
  | { ok: false; message: string };

// Creates a member account via the service-role admin client with
// email_confirm:true, so signup never depends on confirmation-email delivery
// (the built-in Supabase mailer is rate-limited on the free tier and was
// silently failing new signups). The real gate is unchanged: handle_new_user
// inserts the profile as student/pending, so the member still waits for a coach
// to approve them before they can use the system.
export async function registerMember(input: {
  fullName: string;
  email: string;
  password: string;
  stationId: string;
}): Promise<MemberSignupResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const stationId = input.stationId || null;

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
        ? "Netfang er þegar skráð. Prófaðu að skrá þig inn."
        : msg,
    };
  }

  // handle_new_user already inserted the profile as student/pending — nothing
  // more to do; the member waits for coach approval.
  return { ok: true };
}
