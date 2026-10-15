"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";

// Hosts we are willing to put inside a reset link. The link host comes from the
// real request (set by Vercel), validated here so a spoofed Host header can't
// point the token at another origin.
const ALLOWED_HOST = [/(^|\.)metabolic\.is$/i, /\.vercel\.app$/i, /^localhost(:\d+)?$/i];

async function siteBase(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host && ALLOWED_HOST.some((re) => re.test(host))) {
    return `${proto}://${host}`;
  }
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  return "https://www.metabolic.is";
}

function resetEmailHtml(link: string): string {
  return `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <p style="font:600 12px/1 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;color:#16a34a;margin:0 0 16px">Metabolic</p>
  <h1 style="font-size:20px;margin:0 0 12px">Endurstilla lykilorð</h1>
  <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 20px">
    Þú (eða einhver) baðst um að endurstilla lykilorðið á Metabolic-aðganginum þínum.
    Smelltu á hnappinn til að velja nýtt lykilorð. Hlekkurinn rennur út eftir klukkustund.
  </p>
  <p style="margin:0 0 24px">
    <a href="${link}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">
      Velja nýtt lykilorð
    </a>
  </p>
  <p style="font-size:12px;line-height:1.6;color:#777;margin:0">
    Virkar hnappurinn ekki? Afritaðu þennan hlekk í vafrann:<br>
    <span style="word-break:break-all;color:#16a34a">${link}</span>
  </p>
  <p style="font-size:12px;line-height:1.6;color:#777;margin:16px 0 0">
    Baðstu ekki um þetta? Þá máttu hunsa póstinn — lykilorðið þitt breytist ekki.
  </p>
</div>`.trim();
}

/**
 * Self-service password reset. Generates a recovery token via the service-role
 * admin API and emails a link to OUR OWN /nytt-lykilord page (which verifies the
 * token only on form submit, so email-scanner prefetch can't burn it) through
 * Resend — never the rate-limited built-in Supabase mailer.
 *
 * Always resolves `{ ok: true }` regardless of whether the address exists, so the
 * endpoint can't be used to enumerate accounts. Returns `{ ok: false }` only when
 * sending is misconfigured (e.g. RESEND_API_KEY missing), so the UI can say so.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ ok: boolean; configError?: boolean }> {
  const addr = email.trim().toLowerCase();
  if (!addr || !addr.includes("@")) return { ok: true };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: addr,
  });

  // No such user (or any other generate error): stay silent (enumeration-safe).
  if (error || !data?.properties?.hashed_token) return { ok: true };

  const base = await siteBase();
  const link = `${base}/nytt-lykilord?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}&type=recovery`;

  const sent = await sendEmail({
    to: addr,
    subject: "Endurstilltu lykilorðið þitt – Metabolic",
    html: resetEmailHtml(link),
  });

  if (!sent.ok) {
    console.error("Password reset email failed:", sent.error);
    // Surface a config problem (missing key) so the coach/admin knows to fix it;
    // transient send failures still read as a config-ish error to the user, which
    // is acceptable — they can retry or ask a coach to reset in person.
    return { ok: false, configError: true };
  }

  return { ok: true };
}
