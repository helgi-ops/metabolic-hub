"use server";

import { randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResetPasswordResult =
  | { ok: true; password: string }
  | { ok: false; message: string };

// Unambiguous alphabet (no 0/O/1/l/I) so a temporary password is easy to read
// off a screen and type on a phone.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function genTempPassword(): string {
  const pick = () =>
    Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
      "",
    );
  // Two groups → 11 chars incl. the dash, comfortably over the 8-char minimum.
  return `${pick()}-${pick()}`;
}

/**
 * Coach/admin-initiated password reset for a member. Sets a fresh temporary
 * password via the service-role admin client and returns it so the coach can
 * hand it to the member in person — no reliance on the (rate-limited, spam-prone)
 * built-in reset email. The member logs in with it and changes it under
 * "Mínar upplýsingar" / Breyta lykilorði.
 *
 * Authorization mirrors set_member_status: admins may reset anyone; coaches only
 * students who share one of their stations. Only student accounts are resettable.
 */
export async function resetMemberPassword(
  memberId: string,
): Promise<ResetPasswordResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Þú þarft að vera skráð(ur) inn." };
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!me || me.role === "student") {
    return {
      ok: false,
      message: "Aðeins þjálfarar og admin geta endurstillt lykilorð.",
    };
  }

  // Station scoping: admins pass; coaches only for members of their station(s).
  if (me.role !== "admin") {
    const { data: shares } = await supabase.rpc("shares_my_station", {
      target: memberId,
    });
    if (shares !== true) {
      return {
        ok: false,
        message: "Þú getur aðeins endurstillt lykilorð iðkenda á þinni stöð.",
      };
    }
  }

  // Only reset student accounts (never another coach/admin via this tool).
  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", memberId)
    .maybeSingle();
  if (!target) {
    return { ok: false, message: "Iðkandi fannst ekki." };
  }
  if (target.role !== "student") {
    return {
      ok: false,
      message: "Aðeins hægt að endurstilla lykilorð iðkenda hér.",
    };
  }

  const password = genTempPassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(memberId, {
    password,
  });
  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, password };
}
