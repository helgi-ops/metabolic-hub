"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { siteBase } from "@/lib/site-base";
import { formatPrice } from "@/lib/format";
import { formatKennitala, isValidKennitala, normalizeKennitala } from "@/lib/kennitala";
import {
  adminNotifyRecipients,
  emailButton,
  emailShell,
  escHtml as esc,
} from "@/lib/email/admin-recipients";

export type CourseRegistrationResult = { ok: true } | { ok: false; message: string };

// Public sign-up for the online coach course. No account is created here: the
// registration (incl. kennitala) goes into course_registrations (admin-only
// RLS) via the service role, Helgi gets an email, sends a greiðsluseðill and
// opens access from /app/akademia/<slug>/skraningar once it's paid.
export async function registerForCourse(input: {
  courseSlug: string;
  fullName: string;
  email: string;
  phone: string;
  kennitala: string;
  acceptBilling: boolean;
  website?: string; // honeypot — real people never fill this in
}): Promise<CourseRegistrationResult> {
  // Bots that fill every field get a quiet "success".
  if (input.website && input.website.trim()) return { ok: true };

  const fullName = input.fullName.trim().slice(0, 120);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  const phone = input.phone.replace(/[^\d+ ]/g, "").trim().slice(0, 20);
  const kt = normalizeKennitala(input.kennitala ?? "");

  if (!fullName) return { ok: false, message: "Fylltu út nafn." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, message: "Netfangið er ekki gilt." };
  if (phone.replace(/\D/g, "").length < 7)
    return { ok: false, message: "Fylltu út símanúmer." };
  if (!isValidKennitala(kt)) return { ok: false, message: "Kennitala er ekki gild." };
  if (!input.acceptBilling)
    return {
      ok: false,
      message: "Samþykktu að greiðsluseðill verði stofnaður í heimabanka.",
    };

  const admin = createAdminClient();
  const { data: course } = await admin
    .from("courses")
    .select("id, title, title_is, price_cents, currency")
    .eq("slug", input.courseSlug)
    .eq("is_archived", false)
    .maybeSingle();
  if (!course) return { ok: false, message: "Námskeið fannst ekki." };

  // Same person registering twice (double click / second try) → one row.
  const { data: existing } = await admin
    .from("course_registrations")
    .select("id")
    .eq("course_id", course.id)
    .eq("email", email)
    .neq("status", "cancelled")
    .limit(1);
  if (existing && existing.length > 0) return { ok: true };

  const { error } = await admin.from("course_registrations").insert({
    course_id: course.id,
    full_name: fullName,
    email,
    phone: phone || null,
    kennitala: kt,
  });
  if (error) {
    console.error("course_registrations insert failed:", error.message);
    return { ok: false, message: "Tókst ekki að vista skráninguna. Reyndu aftur eftir smá stund." };
  }

  const courseTitle = course.title_is || course.title;
  const price = formatPrice(course.price_cents, course.currency);
  try {
    await Promise.all([
      notifyAdmins({ fullName, email, phone, kt, courseTitle, price, slug: input.courseSlug }),
      confirmToRegistrant({ fullName, email, courseTitle, price }),
    ]);
  } catch (e) {
    // The row is saved and visible on the registrations page either way.
    console.error("Course registration emails failed:", e);
  }
  return { ok: true };
}

async function notifyAdmins(s: {
  fullName: string;
  email: string;
  phone: string;
  kt: string;
  courseTitle: string;
  price: string;
  slug: string;
}) {
  const to = await adminNotifyRecipients();
  if (to.length === 0) return;
  const base = await siteBase();
  const when = new Date().toLocaleString("is-IS", {
    timeZone: "Atlantic/Reykjavik",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#777;font-size:13px;white-space:nowrap">${label}</td><td style="padding:6px 0;font-size:14px;font-weight:600">${esc(value)}</td></tr>`;
  const html = emailShell(
    "Metabolic · Skráning á námskeið",
    `<h1 style="font-size:20px;margin:0 0 16px">${esc(s.fullName)} skráði sig á ${esc(s.courseTitle)}</h1>
  <table style="border-collapse:collapse;margin:0 0 20px">
    ${row("Nafn", s.fullName)}
    ${row("Kennitala", formatKennitala(s.kt))}
    ${row("Netfang", s.email)}
    ${row("Sími", s.phone)}
    ${row("Námskeið", s.courseTitle)}
    ${row("Verð", s.price)}
    ${row("Skráð", when)}
  </table>
  <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 20px">
    Stofnaðu greiðsluseðil í heimabanka. Þegar hann er greiddur opnarðu aðganginn á skráningasíðunni — þá fær viðkomandi póst með innskráningu.
  </p>
  ${emailButton(`${base}/app/akademia/${s.slug}/skraningar`, "Opna skráningar")}`,
  );
  for (const addr of to) {
    const sent = await sendEmail({
      to: addr,
      subject: `Skráning á námskeið: ${s.fullName}`,
      html,
    });
    if (!sent.ok) console.error("Course registration notice failed:", sent.error);
  }
}

async function confirmToRegistrant(s: {
  fullName: string;
  email: string;
  courseTitle: string;
  price: string;
}) {
  const first = s.fullName.split(/\s+/)[0];
  const html = emailShell(
    "Metabolic Academy",
    `<h1 style="font-size:20px;margin:0 0 12px">Takk fyrir skráninguna, ${esc(first)}!</h1>
  <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 12px">
    Við höfum móttekið skráningu þína á <strong>${esc(s.courseTitle)}</strong>.
  </p>
  <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 12px">
    Næstu skref: við sendum greiðsluseðil (${esc(s.price)}) í heimabankann þinn. Um leið og hann er greiddur opnum við aðganginn og þú færð tölvupóst með innskráningu.
  </p>
  <p style="font-size:12px;line-height:1.6;color:#777;margin:16px 0 0">
    Spurningar? Hafðu samband við okkur á metabolic.is.
  </p>`,
  );
  const sent = await sendEmail({
    to: s.email,
    subject: `Skráning móttekin – ${s.courseTitle}`,
    html,
  });
  if (!sent.ok) console.error("Course registration confirmation failed:", sent.error);
}
