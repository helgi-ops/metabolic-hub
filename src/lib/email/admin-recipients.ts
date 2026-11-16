import { createAdminClient } from "@/lib/supabase/admin";

// SERVER-ONLY. Who gets "new registration" notices: SIGNUP_NOTIFY_EMAIL
// (comma-separated) if set, otherwise every admin's login email.
export async function adminNotifyRecipients(): Promise<string[]> {
  const fromEnv = process.env.SIGNUP_NOTIFY_EMAIL?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  const admin = createAdminClient();
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  const emails: string[] = [];
  for (const a of admins ?? []) {
    const { data } = await admin.auth.admin.getUserById(a.id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return emails;
}

/** Escape text for interpolation into email HTML. */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared wrapper so all Metabolic emails look the same. */
export function emailShell(eyebrow: string, inner: string): string {
  return `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
  <p style="font:600 12px/1 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;color:#16a34a;margin:0 0 16px">${eyebrow}</p>
  ${inner}
</div>`.trim();
}

export function emailButton(href: string, label: string): string {
  return `<p style="margin:0 0 20px"><a href="${href}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">${label}</a></p>`;
}
