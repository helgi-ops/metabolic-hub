"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { siteBase } from "@/lib/site-base";
import { emailButton, emailShell, escHtml as esc } from "@/lib/email/admin-recipients";

type Result = { ok: true; message: string } | { ok: false; message: string };

async function adminUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role === "admin" ? user.id : null;
}

// Approve a submission (optionally with feedback) or send it back for
// revision. Approving the final project marks its lesson done, which unlocks
// the certificate (issue_certificate also checks the approval itself).
export async function reviewSubmission(
  submissionId: string,
  decision: "approved" | "needs_revision",
  feedback: string,
): Promise<Result> {
  const reviewerId = await adminUserId();
  if (!reviewerId) return { ok: false, message: "Aðeins stjórnendur." };
  if (decision !== "approved" && decision !== "needs_revision")
    return { ok: false, message: "Ógild aðgerð." };
  const fb = feedback.trim().slice(0, 20_000);
  if (decision === "needs_revision" && !fb)
    return { ok: false, message: "Skrifaðu hvað þarf að laga." };

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("submissions")
    .select("id, user_id, assignment_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) return { ok: false, message: "Skil fundust ekki." };
  const { data: assignment } = await admin
    .from("assignments")
    .select("id, lesson_id, title, requires_approval")
    .eq("id", sub.assignment_id)
    .single();
  if (!assignment) return { ok: false, message: "Verkefni fannst ekki." };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("submissions")
    .update({
      status: decision,
      feedback: fb || null,
      reviewer_id: reviewerId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", sub.id);
  if (error) return { ok: false, message: error.message };

  if (assignment.requires_approval) {
    await admin.from("lesson_progress").upsert(
      {
        user_id: sub.user_id,
        lesson_id: assignment.lesson_id,
        completed_at: decision === "approved" ? now : null,
        last_watched_at: now,
      },
      { onConflict: "user_id,lesson_id" },
    );
  }

  // Email the learner whenever there's something for them to read.
  let emailed = false;
  if (assignment.requires_approval || fb) {
    emailed = await notifyLearner({
      admin,
      userId: sub.user_id,
      lessonId: assignment.lesson_id,
      title: assignment.title,
      decision,
      isFinal: assignment.requires_approval,
      feedback: fb,
    });
  }

  revalidatePath("/app/akademia", "layout");
  const what = decision === "approved" ? "Samþykkt" : "Sent til baka til lagfæringar";
  return { ok: true, message: emailed ? `${what} — nemandinn fékk tölvupóst.` : `${what}.` };
}

async function notifyLearner(s: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  lessonId: string;
  title: string;
  decision: "approved" | "needs_revision";
  isFinal: boolean;
  feedback: string;
}): Promise<boolean> {
  const { data } = await s.admin.auth.admin.getUserById(s.userId);
  const email = data?.user?.email;
  if (!email) return false;
  const { data: profile } = await s.admin
    .from("profiles")
    .select("full_name")
    .eq("id", s.userId)
    .maybeSingle();
  const first = (profile?.full_name ?? "").split(/\s+/)[0] || "";
  const base = await siteBase();
  const link = `${base}/app/akademia/metabolic-coach/${s.lessonId}`;

  let heading: string;
  let lead: string;
  if (s.decision === "needs_revision") {
    heading = "Verkefnið þarf smá lagfæringu";
    lead = `Þjálfari hefur farið yfir <strong>${esc(s.title)}</strong> og biður þig að laga nokkur atriði og skila aftur.`;
  } else if (s.isFinal) {
    heading = "Lokaverkefnið þitt er samþykkt! 🎓";
    lead = `Til hamingju — <strong>${esc(s.title)}</strong> hefur verið samþykkt. Ef þú hefur lokið öllum lexíum geturðu nú sótt skírteinið á námskeiðssíðunni.`;
  } else {
    heading = "Endurgjöf á verkefnið þitt";
    lead = `Þjálfari hefur farið yfir <strong>${esc(s.title)}</strong>.`;
  }

  const html = emailShell(
    "Metabolic Academy",
    `<h1 style="font-size:20px;margin:0 0 12px">${first ? `${esc(first)}, ` : ""}${heading}</h1>
  <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 16px">${lead}</p>
  ${
    s.feedback
      ? `<div style="border-left:3px solid #16a34a;padding:8px 14px;margin:0 0 20px;background:#f6f6f6;font-size:14px;line-height:1.6;color:#222;white-space:pre-wrap">${esc(s.feedback)}</div>`
      : ""
  }
  ${emailButton(link, s.decision === "needs_revision" ? "Opna verkefnið" : "Opna námskeiðið")}`,
  );
  const sent = await sendEmail({ to: email, subject: `${heading.replace(/ 🎓$/, "")} – ${s.title}`, html });
  if (!sent.ok) console.error("Review email failed:", sent.error);
  return sent.ok;
}
