"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { siteBase } from "@/lib/site-base";
import { parsePricing } from "@/lib/pricing";
import {
  formatKennitala,
  isValidKennitala,
  normalizeKennitala,
} from "@/lib/kennitala";

export type MemberSignupResult =
  | { ok: true; membership: boolean }
  | { ok: false; message: string };

// Creates a member account via the service-role admin client with
// email_confirm:true, so signup never depends on confirmation-email delivery
// (the built-in Supabase mailer is rate-limited on the free tier and was
// silently failing new signups). The real gate is unchanged: handle_new_user
// inserts the profile as student/pending, so the member still waits for a coach
// to approve them before they can use the system.
//
// Stations with online_signup (Reykjanesbær) also take a membership: the member
// picks a plan from the station's pricing and gives their kennitala so the
// owner can issue a greiðsluseðill. That goes into membership_signups (admin-only
// RLS — never profiles/user_metadata) and the admin gets an email.
export async function registerMember(input: {
  fullName: string;
  email: string;
  password: string;
  stationId: string;
  kennitala?: string;
  planTitle?: string;
  acceptBilling?: boolean;
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

  const { data: station } = await admin
    .from("stations")
    .select("id, name, online_signup, pricing")
    .eq("id", stationId)
    .maybeSingle();
  if (!station) {
    return { ok: false, message: "Veldu stöð." };
  }

  // Membership details (only for stations taking online signups).
  let membership: { kennitala: string; planTitle: string; planPrice: string } | null =
    null;
  if (station.online_signup) {
    const plans = parsePricing(station.pricing);
    const plan = plans.find((p) => p.title === input.planTitle);
    if (plans.length > 0 && !plan) {
      return { ok: false, message: "Veldu áskriftarleið." };
    }
    const kt = normalizeKennitala(input.kennitala ?? "");
    if (!isValidKennitala(kt)) {
      return { ok: false, message: "Kennitala er ekki gild." };
    }
    if (!input.acceptBilling) {
      return {
        ok: false,
        message: "Samþykktu að greiðsluseðill verði stofnaður í heimabanka.",
      };
    }
    membership = {
      kennitala: kt,
      planTitle: plan?.title ?? "Aðild",
      planPrice: plan ? [plan.price, plan.per].filter(Boolean).join(" ") : "",
    };
  }

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

  if (membership) {
    const { error: msErr } = await admin.from("membership_signups").insert({
      user_id: data.user.id,
      station_id: station.id,
      kennitala: membership.kennitala,
      plan_title: membership.planTitle,
      plan_price: membership.planPrice || null,
    });
    if (msErr) {
      // Roll back the just-created account so the member can simply retry —
      // no half-finished signup the owner never hears about.
      console.error("membership_signups insert failed:", msErr.message);
      await admin.auth.admin.deleteUser(data.user.id);
      return {
        ok: false,
        message: "Tókst ekki að vista skráninguna. Reyndu aftur eftir smá stund.",
      };
    }

    // Notify the owner. Never fails the signup — the row is also visible on
    // the Stöðin page for admins.
    try {
      await notifySignup({
        fullName,
        email,
        stationName: station.name,
        ...membership,
      });
    } catch (e) {
      console.error("Signup notification failed:", e);
    }
  }

  // handle_new_user already inserted the profile as student/pending; the
  // member waits for coach approval.
  return { ok: true, membership: !!membership };
}

async function notificationRecipients(): Promise<string[]> {
  const fromEnv = process.env.SIGNUP_NOTIFY_EMAIL?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  const admin = createAdminClient();
  const { data: admins } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  const emails: string[] = [];
  for (const a of admins ?? []) {
    const { data } = await admin.auth.admin.getUserById(a.id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return emails;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function notifySignup(s: {
  fullName: string;
  email: string;
  stationName: string;
  kennitala: string;
  planTitle: string;
  planPrice: string;
}) {
  const to = await notificationRecipients();
  if (to.length === 0) return;

  const base = await siteBase();
  const when = new Date().toLocaleString("is-IS", {
    timeZone: "Atlantic/Reykjavik",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#777;font-size:13px;white-space:nowrap">${label}</td><td style="padding:6px 0;font-size:14px;font-weight:600">${esc(value)}</td></tr>`;

  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
  <p style="font:600 12px/1 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;color:#16a34a;margin:0 0 16px">Metabolic · Ný skráning</p>
  <h1 style="font-size:20px;margin:0 0 16px">${esc(s.fullName)} skráði sig í ${esc(s.stationName)}</h1>
  <table style="border-collapse:collapse;margin:0 0 20px">
    ${row("Nafn", s.fullName)}
    ${row("Kennitala", formatKennitala(s.kennitala))}
    ${row("Netfang", s.email)}
    ${row("Áskrift", s.planPrice ? `${s.planTitle} — ${s.planPrice}` : s.planTitle)}
    ${row("Stöð", s.stationName)}
    ${row("Skráð", when)}
  </table>
  <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 20px">
    Stofnaðu greiðsluseðil í heimabanka og samþykktu svo iðkandann á Stöðin-síðunni.
  </p>
  <p style="margin:0">
    <a href="${base}/app/station" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">
      Opna Stöðina
    </a>
  </p>
</div>`.trim();

  for (const addr of to) {
    const sent = await sendEmail({
      to: addr,
      subject: `Ný skráning: ${s.fullName} – ${s.planTitle}`,
      html,
    });
    if (!sent.ok) console.error("Signup notification email failed:", sent.error);
  }
}
