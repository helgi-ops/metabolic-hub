import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GARMIN, mapGarminActivity, type GarminActivity } from "@/lib/garmin/config";

// Receives Garmin activity notifications (Activity API "push" summaries) and
// writes them into workout_logs for the matching member. De-duped by
// (user_id, external_id) so repeated pings don't create duplicates.
//
// NOTE: the exact payload shape is confirmed in the Garmin portal. This handles
// the push model where each activity carries a Garmin userId plus summary
// fields. If the app is configured for the ping model instead, the summaries
// must be pulled from GARMIN.apiBase using the stored access token — wire that
// in the marked branch once the portal format is known.
export async function POST(request: Request) {
  // Optional shared secret we set on the Garmin webhook config.
  if (GARMIN.webhookToken) {
    const url = new URL(request.url);
    const provided =
      url.searchParams.get("token") ??
      request.headers.get("x-webhook-token") ??
      "";
    if (provided !== GARMIN.webhookToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Garmin sends activities under a top-level key; accept the common shapes.
  const b = body as Record<string, unknown>;
  const rawActivities = (b.activities ??
    b.activityDetails ??
    b.activitySummary ??
    []) as (GarminActivity & { userId?: string; userAccessToken?: string })[];

  if (!Array.isArray(rawActivities) || rawActivities.length === 0) {
    // Nothing to import (could be a ping-only notification) — ack so Garmin
    // doesn't retry. Ping→pull wiring goes here once the portal format is known.
    return NextResponse.json({ ok: true, imported: 0 });
  }

  const admin = createAdminClient();

  // Resolve Garmin user ids → our user ids in one pass.
  const garminUserIds = [
    ...new Set(
      rawActivities
        .map((a) => a.userId)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ];
  const userByGarmin = new Map<string, string>();
  if (garminUserIds.length) {
    const { data: conns } = await admin
      .from("garmin_connections")
      .select("user_id, garmin_user_id")
      .in("garmin_user_id", garminUserIds);
    for (const c of conns ?? []) {
      if (c.garmin_user_id) userByGarmin.set(c.garmin_user_id, c.user_id);
    }
  }

  let imported = 0;
  for (const a of rawActivities) {
    const userId = a.userId ? userByGarmin.get(a.userId) : undefined;
    if (!userId) continue; // unknown Garmin user → skip

    const mapped = mapGarminActivity(a);
    if (!mapped) continue;

    // De-dupe: skip if this activity was already imported for this member.
    const { data: existing } = await admin
      .from("workout_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("external_id", mapped.external_id)
      .maybeSingle();
    if (existing) continue;

    const { error } = await admin.from("workout_logs").insert({
      user_id: userId,
      logged_on: mapped.logged_on,
      activity: mapped.activity,
      machine: mapped.machine,
      calories: mapped.calories,
      notes: mapped.notes,
      source: mapped.source,
      external_id: mapped.external_id,
    });
    if (error) {
      console.error("[garmin] insert log failed", error);
      continue;
    }
    imported++;
  }

  return NextResponse.json({ ok: true, imported });
}
