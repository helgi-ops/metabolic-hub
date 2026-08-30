// Garmin Connect Developer Program — integration config + activity mapping.
//
// SETUP (once the Garmin application is approved):
//   Set these in Vercel env (never commit real values):
//     GARMIN_CONSUMER_KEY      — OAuth 2.0 client id from the Garmin portal
//     GARMIN_CONSUMER_SECRET   — OAuth 2.0 client secret
//     GARMIN_AUTHORIZE_URL     — user consent URL (from the portal)
//     GARMIN_TOKEN_URL         — token exchange URL (from the portal)
//     GARMIN_API_BASE          — REST base for pulling activity details
//     GARMIN_WEBHOOK_TOKEN     — shared secret we require on the webhook (our own)
//     NEXT_PUBLIC_SITE_URL     — e.g. https://www.metabolic.is (for the redirect URI)
//
// The exact Garmin URLs and payload field names are confirmed inside the
// developer portal after approval — they live in env on purpose so finishing the
// integration is filling values, not restructuring code.

export const GARMIN = {
  clientId: process.env.GARMIN_CONSUMER_KEY ?? "",
  clientSecret: process.env.GARMIN_CONSUMER_SECRET ?? "",
  authorizeUrl: process.env.GARMIN_AUTHORIZE_URL ?? "",
  tokenUrl: process.env.GARMIN_TOKEN_URL ?? "",
  apiBase: process.env.GARMIN_API_BASE ?? "",
  webhookToken: process.env.GARMIN_WEBHOOK_TOKEN ?? "",
  // Activity API scope (adjust to what the approved app is granted).
  scope: process.env.GARMIN_SCOPE ?? "ACTIVITY_EXPORT",
};

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://www.metabolic.is"
  );
}

export function garminRedirectUri(): string {
  return `${siteUrl()}/api/garmin/callback`;
}

// Whether the OAuth flow can run at all (credentials + endpoints present).
export function garminConfigured(): boolean {
  return !!(
    GARMIN.clientId &&
    GARMIN.clientSecret &&
    GARMIN.authorizeUrl &&
    GARMIN.tokenUrl
  );
}

// --- Activity mapping -------------------------------------------------------
// Map a Garmin activity type onto our machine board where it's an erg the gym
// tracks; otherwise it's logged as a generic "önnur æfing" with a readable name.

const MACHINE_BY_TYPE: Record<string, string> = {
  INDOOR_ROWING: "concept2_row",
  ROWING: "concept2_row",
  INDOOR_CYCLING: "concept2_bike",
  CYCLING: "concept2_bike",
  VIRTUAL_RIDE: "concept2_bike",
  ROAD_BIKING: "concept2_bike",
};

const ACTIVITY_LABEL: Record<string, string> = {
  RUNNING: "Hlaup",
  INDOOR_RUNNING: "Hlaup (inni)",
  TREADMILL_RUNNING: "Hlaupabretti",
  TRAIL_RUNNING: "Utanvegahlaup",
  WALKING: "Ganga",
  HIKING: "Fjallganga",
  LAP_SWIMMING: "Sund",
  OPEN_WATER_SWIMMING: "Sund (opið vatn)",
  STRENGTH_TRAINING: "Styrktaræfing",
  CARDIO: "Þrek",
  HIIT: "HIIT",
  YOGA: "Jóga",
  ELLIPTICAL: "Sporbaugur",
  STAIR_CLIMBING: "Stigvél",
};

export type GarminActivity = {
  // Garmin summary fields (names per the Activity API payload).
  summaryId?: string;
  activityId?: string | number;
  activityType?: string;
  startTimeInSeconds?: number;
  durationInSeconds?: number;
  activeKilocalories?: number;
  distanceInMeters?: number;
  averageHeartRateInBeatsPerMinute?: number;
};

// A partial workout_logs insert (user_id added by the webhook). Kept as a plain
// shape so it can be spread into the typed insert.
export type MappedLog = {
  logged_on: string;
  activity: string | null;
  machine: string | null;
  calories: number | null;
  notes: string | null;
  source: string;
  external_id: string;
};

function isoDate(startSeconds?: number): string {
  // Fall back to now only if Garmin omitted the timestamp (shouldn't happen).
  const ms = startSeconds ? startSeconds * 1000 : Date.now();
  return new Date(ms).toISOString().slice(0, 10);
}

export function mapGarminActivity(a: GarminActivity): MappedLog | null {
  const externalId = String(a.summaryId ?? a.activityId ?? "");
  if (!externalId) return null;

  const type = (a.activityType ?? "").toUpperCase();
  const machine = MACHINE_BY_TYPE[type] ?? null;
  const kcal =
    a.activeKilocalories != null ? Math.round(a.activeKilocalories) : null;

  const parts: string[] = ["Garmin"];
  if (a.durationInSeconds)
    parts.push(`${Math.round(a.durationInSeconds / 60)} mín`);
  if (a.distanceInMeters)
    parts.push(`${(a.distanceInMeters / 1000).toFixed(2)} km`);
  if (a.averageHeartRateInBeatsPerMinute)
    parts.push(`${a.averageHeartRateInBeatsPerMinute} bpm`);

  // Cardio ergs count on the machine leaderboard via machine+calories; other
  // types are logged as a named "önnur æfing".
  const label =
    ACTIVITY_LABEL[type] ??
    (type
      ? type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, " ")
      : "Æfing");

  return {
    logged_on: isoDate(a.startTimeInSeconds),
    activity: machine ? null : label,
    machine,
    calories: kcal,
    notes: parts.join(" · "),
    source: "garmin",
    external_id: externalId,
  };
}
