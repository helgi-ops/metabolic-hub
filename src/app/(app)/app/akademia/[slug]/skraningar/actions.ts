"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { siteBase } from "@/lib/site-base";
import { emailButton, emailShell, escHtml as esc } from "@/lib/email/admin-recipients";

type Result = { ok: true; message: string } | { ok: false; message: string };

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role === "admin";
}

type Admin = ReturnType<typeof createAdminClient>;

async function findUserIdByEmail(admin: Admin, email: string): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

// After the greiðsluseðill is paid: make sure the person has an account (create
// one if not — confirmed, no password yet), let them past the member-approval
// gate, enroll them in the course and email them how to log in.
export async function openCourseAccess(registrationId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Aðeins stjórnendur." };
  const admin = createAdminClient();

  const { data: reg } = await admin
    .from("course_registrations")
    .select("id, course_id, full_name, email, status")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg) return { ok: false, message: "Skráning fannst ekki." };

  const { data: course } = await admin
    .from("courses")
    .select("id, slug, title, title_is, price_cents, currency")
    .eq("id", reg.course_id)
    .single();
  if (!course) return { ok: false, message: "Námskeið fannst ekki." };

  const email = reg.email.trim().toLowerCase();
  let userId = await findUserIdByEmail(admin, email);
  const isNew = !userId;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: reg.full_name },
    });
    if (error || !data.user) {
      return { ok: false, message: error?.message ?? "Tókst ekki að stofna aðgang." };
    }
    userId = data.user.id;
  }

  // handle_new_user creates new profiles as student/pending; a paying course
  // learner shouldn't wait for station approval. Suspended accounts stay closed.
  const { data: profile } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.role === "student" && profile.status === "pending") {
    await admin.from("profiles").update({ status: "active" }).eq("id", userId);
  }

  const { error: enrErr } = await admin.from("enrollments").insert({
    user_id: userId,
    course_id: course.id,
    source: "invoice",
    amount_paid_cents: course.price_cents,
    currency: course.currency,
  });
  if (enrErr && enrErr.code !== "23505") {
    return { ok: false, message: `Skráning í námskeið mistókst: ${enrErr.message}` };
  }

  await admin
    .from("course_registrations")
    .update({ status: "enrolled", user_id: userId, enrolled_at: new Date().toISOString() })
    .eq("id", reg.id);

  const emailed = await sendWelcome({
    admin,
    email,
    fullName: reg.full_name,
    isNew,
    courseTitle: course.title_is || course.title,
    courseSlug: course.slug,
  });

  revalidatePath(`/app/akademia/${course.slug}/skraningar`);
  return {
    ok: true,
    message: emailed
      ? `Aðgangur opnaður og póstur sendur á ${email}.`
      : `Aðgangur opnaður, en pósturinn fór ekki — láttu ${email} vita (Gleymt lykilorð virkar).`,
  };
}

async function sendWelcome(s: {
  admin: Admin;
  email: string;
  fullName: string;
  isNew: boolean;
  courseTitle: string;
  courseSlug: string;
}): Promise<boolean> {
  const base = await siteBase();
  const first = s.fullName.split(/\s+/)[0];
  let action: string;
  if (s.isNew) {
    const { data } = await s.admin.auth.admin.generateLink({ type: "recovery", email: s.email });
    const token = data?.properties?.hashed_token;
    const link = token
      ? `${base}/nytt-lykilord?token_hash=${encodeURIComponent(token)}&type=recovery`
      : `${base}/gleymt-lykilord`;
    action = `<p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 16px">
    Fyrsta skref: veldu þér lykilorð. Notandanafnið er netfangið þitt, <strong>${esc(s.email)}</strong>.
  </p>
  ${emailButton(link, "Velja lykilorð")}
  <p style="font-size:12px;line-height:1.6;color:#777;margin:0 0 16px">
    Hlekkurinn gildir í takmarkaðan tíma. Ef hann er útrunninn ferðu á
    <a href="${base}/gleymt-lykilord" style="color:#16a34a">Gleymt lykilorð</a> og slærð inn netfangið þitt.
  </p>`;
  } else {
    action = `<p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 16px">
    Námskeiðið hefur bæst við Metabolic-aðganginn þinn (${esc(s.email)}).
  </p>
  ${emailButton(`${base}/app/akademia/${s.courseSlug}`, "Opna námskeiðið")}`;
  }
  const html = emailShell(
    "Metabolic Academy",
    `<h1 style="font-size:20px;margin:0 0 12px">Velkomin/n á námskeiðið, ${esc(first)}!</h1>
  <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 16px">
    Greiðslan er móttekin og aðgangurinn þinn að <strong>${esc(s.courseTitle)}</strong> er opinn.
  </p>
  ${action}
  <p style="font-size:13px;line-height:1.6;color:#333;margin:0">
    Námskeiðið finnurðu undir <strong>Akademía</strong> eftir innskráningu á
    <a href="${base}/login" style="color:#16a34a">metabolic.is</a>. Lesefnið er bæði á íslensku og ensku — veldu IS/EN efst á námskeiðssíðunni.
  </p>`,
  );
  const sent = await sendEmail({
    to: s.email,
    subject: `Aðgangurinn þinn er opinn – ${s.courseTitle}`,
    html,
  });
  if (!sent.ok) console.error("Course welcome email failed:", sent.error);
  return sent.ok;
}

export async function setRegistrationStatus(
  registrationId: string,
  status: "new" | "invoiced" | "cancelled",
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Aðeins stjórnendur." };
  if (!["new", "invoiced", "cancelled"].includes(status))
    return { ok: false, message: "Ógild staða." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_registrations")
    .update({ status })
    .eq("id", registrationId)
    .neq("status", "enrolled")
    .select("course_id")
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Skráning fannst ekki eða er þegar með aðgang." };
  revalidatePath("/app/akademia", "layout");
  return { ok: true, message: "Uppfært." };
}
