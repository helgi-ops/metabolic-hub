import { headers } from "next/headers";

// SERVER-ONLY. Base URL for links we put in emails. The host comes from the
// real request (set by Vercel), validated against an allowlist so a spoofed
// Host header can't point a link at another origin.
const ALLOWED_HOST = [/(^|\.)metabolic\.is$/i, /\.vercel\.app$/i, /^localhost(:\d+)?$/i];

export async function siteBase(): Promise<string> {
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
