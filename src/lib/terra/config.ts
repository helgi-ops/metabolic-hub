// Terra (tryterra.co) — wearable aggregator that holds its own Garmin/Apple/
// Polar/Fitbit partnerships, so members can connect a device without us needing
// each provider's own developer approval.
//
// SETUP (when we go live):
//   Vercel env (never commit real values):
//     TERRA_DEV_ID          — Terra developer id
//     TERRA_API_KEY         — Terra API key (server calls)
//     TERRA_SIGNING_SECRET  — webhook signing secret (verify terra-signature)
//     NEXT_PUBLIC_SITE_URL  — https://www.metabolic.is
//   Terra dashboard: set the webhook URL to
//     https://www.metabolic.is/api/terra/webhook

export const TERRA = {
  devId: process.env.TERRA_DEV_ID ?? "",
  apiKey: process.env.TERRA_API_KEY ?? "",
  signingSecret: process.env.TERRA_SIGNING_SECRET ?? "",
  apiBase: process.env.TERRA_API_BASE ?? "https://api.tryterra.co/v2",
  // Which providers to offer in the widget (empty = Terra's full picker).
  providers: process.env.TERRA_PROVIDERS ?? "GARMIN,FITBIT,POLAR,SUUNTO,OURA",
};

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://www.metabolic.is"
  );
}

export function terraConfigured(): boolean {
  return !!(TERRA.devId && TERRA.apiKey);
}

// Ask Terra for a widget session URL to send the member to. reference_id ties
// the resulting Terra user back to our member so webhook activities land on the
// right account.
export async function generateWidgetSession(
  referenceId: string,
): Promise<string | null> {
  const base = siteUrl();
  const res = await fetch(`${TERRA.apiBase}/auth/generateWidgetSession`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "dev-id": TERRA.devId,
      "x-api-key": TERRA.apiKey,
    },
    body: JSON.stringify({
      reference_id: referenceId,
      providers: TERRA.providers,
      language: "en",
      auth_success_redirect_url: `${base}/app/tengingar?terra=connected`,
      auth_failure_redirect_url: `${base}/app/tengingar?terra=error`,
    }),
  });
  if (!res.ok) {
    console.error("[terra] widget session failed", res.status);
    return null;
  }
  const json = (await res.json()) as { url?: string };
  return json.url ?? null;
}

// Verify a Terra webhook signature: header "t=<ts>,v1=<hmac>" where the HMAC is
// SHA-256 over `${t}.${rawBody}` keyed by the signing secret.
export async function verifyTerraSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.trim().split("=") as [string, string]),
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${t}.${rawBody}`),
  );
  const hex = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(hex, v1);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Activity mapping -------------------------------------------------------
// Terra normalises activities across providers. We map ergs the gym tracks onto
// the machine leaderboard by name; everything else is a named "önnur æfing".

export type TerraActivity = {
  metadata?: {
    start_time?: string;
    end_time?: string;
    name?: string;
    type?: number;
    summary_id?: string;
    upload_type?: number;
  };
  calories_data?: { total_burned_calories?: number };
  distance_data?: { summary?: { distance_meters?: number } };
  heart_rate_data?: { summary?: { avg_hr_bpm?: number } };
  active_durations_data?: { activity_seconds?: number };
};

export type MappedLog = {
  logged_on: string;
  activity: string | null;
  machine: string | null;
  calories: number | null;
  notes: string | null;
  source: string;
  external_id: string;
};

function machineFromName(name: string): string | null {
  const n = name.toLowerCase();
  if (/row|róð|erg/.test(n)) return "concept2_row";
  if (/ski/.test(n)) return "concept2_ski";
  if (/bike|cycl|spin|hjól/.test(n)) return "concept2_bike";
  return null;
}

export function mapTerraActivity(
  a: TerraActivity,
  terraUserId: string,
  provider?: string,
): MappedLog | null {
  const start = a.metadata?.start_time;
  const externalId =
    a.metadata?.summary_id ?? (start ? `${terraUserId}:${start}` : "");
  if (!externalId) return null;

  const name = a.metadata?.name?.trim() || "Æfing";
  const machine = machineFromName(name);
  const kcal =
    a.calories_data?.total_burned_calories != null
      ? Math.round(a.calories_data.total_burned_calories)
      : null;

  const parts: string[] = [provider ? cap(provider) : "Terra"];
  const secs = a.active_durations_data?.activity_seconds;
  if (secs) parts.push(`${Math.round(secs / 60)} mín`);
  const dist = a.distance_data?.summary?.distance_meters;
  if (dist) parts.push(`${(dist / 1000).toFixed(2)} km`);
  const hr = a.heart_rate_data?.summary?.avg_hr_bpm;
  if (hr) parts.push(`${Math.round(hr)} bpm`);

  return {
    logged_on: (start ?? new Date().toISOString()).slice(0, 10),
    activity: machine ? null : name,
    machine,
    calories: kcal,
    notes: parts.join(" · "),
    source: "terra",
    external_id: externalId,
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
