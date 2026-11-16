"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { siteBase } from "@/lib/site-base";
import {
  adminNotifyRecipients,
  emailButton,
  emailShell,
  escHtml as esc,
} from "@/lib/email/admin-recipients";

export type SubmitResult = { ok: true; message: string } | { ok: false; message: string };

const MAX_LEN = 60_000;

// A learner hands in (or updates) their answer to a lesson's assignment.
// Writes go through the service role so learners can never set their own
// status/feedback; access is checked here instead (enrolled or admin).
export async function submitAssignment(
  assignmentId: string,
  text: string,
): Promise<SubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Þú þarft að vera skráð/ur inn." };

  const answer = text.trim();
  if (answer.length < 20) return { ok: false, message: "Svarið er of stutt." };
  if (answer.length > MAX_LEN) return { ok: false, message: "Svarið er of langt." };

  // RLS on assignments only returns it to enrolled learners and admins.
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, lesson_id, title, requires_approval")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { ok: false, message: "Þú hefur ekki aðgang að þessu verkefni." };

  const admin = createAdminClient();
  const { data: prev } = await admin
    .from("submissions")
    .select("id, status")
    .eq("assignment_id", assignment.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (prev?.status === "approved") {
    return { ok: false, message: "Verkefnið hefur þegar verið samþykkt." };
  }

  const now = new Date().toISOString();
  const { error } = await admin.from("submissions").upsert(
    {
      assignment_id: assignment.id,
      user_id: user.id,
      text_response: answer,
      status: "submitted",
      submitted_at: now,
      updated_at: now,
    },
    { onConflict: "assignment_id,user_id" },
  );
  if (error) {
    console.error("submitAssignment failed:", error.message);
    return { ok: false, message: "Tókst ekki að vista. Reyndu aftur." };
  }

  // Chapter assignments count as done on submission. The final project is
  // marked done when it is approved (see verkefni/actions.ts).
  if (!assignment.requires_approval) {
    await admin.from("lesson_progress").upsert(
      { user_id: user.id, lesson_id: assignment.lesson_id, completed_at: now, last_watched_at: now },
      { onConflict: "user_id,lesson_id" },
    );
  } else if (prev?.status !== "submitted") {
    // First hand-in, or a resubmission after "needs revision": tell the admins.
    try {
      await notifyFinalSubmitted(admin, user.id, assignment.title);
    } catch (e) {
      console.error("Final project notice failed:", e);
    }
  }

  revalidatePath("/app/akademia", "layout");
  return {
    ok: true,
    message: assignment.requires_approval
      ? "Lokaverkefninu hefur verið skilað. Þú færð tölvupóst þegar það hefur verið yfirfarið."
      : "Verkefninu hefur verið skilað.",
  };
}

async function notifyFinalSubmitted(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  title: string,
) {
  const to = await adminNotifyRecipients();
  if (to.length === 0) return;
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  const name = profile?.full_name || "Nemandi";
  const base = await siteBase();
  const html = emailShell(
    "Metabolic Academy · Lokaverkefni",
    `<h1 style="font-size:20px;margin:0 0 12px">${esc(name)} skilaði lokaverkefni</h1>
  <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 20px">
    ${esc(title)} bíður yfirferðar. Skírteinið opnast þegar þú samþykkir verkefnið.
  </p>
  ${emailButton(`${base}/app/akademia/metabolic-coach/verkefni`, "Fara yfir verkefnið")}`,
  );
  for (const addr of to) {
    const sent = await sendEmail({ to: addr, subject: `Lokaverkefni til yfirferðar: ${name}`, html });
    if (!sent.ok) console.error("Final project notice email failed:", sent.error);
  }
}
