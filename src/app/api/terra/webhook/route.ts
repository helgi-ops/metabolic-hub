import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TERRA,
  mapTerraActivity,
  verifyTerraSignature,
  type TerraActivity,
} from "@/lib/terra/config";

// Receives Terra webhooks: connection events (auth/deauth) update
// terra_connections; activity events map to workout_logs for the member,
// de-duped by (user_id, external_id).
export async function POST(request: Request) {
  const raw = await request.text();

  // Verify the signature when a secret is configured (skip only pre-setup).
  if (TERRA.signingSecret) {
    const ok = await verifyTerraSignature(
      raw,
      request.headers.get("terra-signature"),
      TERRA.signingSecret,
    );
    if (!ok) {
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
  }

  let body: {
    type?: string;
    user?: { user_id?: string; provider?: string; reference_id?: string };
    data?: TerraActivity[];
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const admin = createAdminClient();
  const type = body.type ?? "";
  const terraUserId = body.user?.user_id ?? "";
  const provider = body.user?.provider;
  const referenceId = body.user?.reference_id;

  // Connection lifecycle.
  if (type === "auth" && terraUserId && referenceId) {
    await admin.from("terra_connections").upsert(
      {
        user_id: referenceId,
        terra_user_id: terraUserId,
        provider: provider ?? null,
        reference_id: referenceId,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
    return NextResponse.json({ ok: true });
  }

  if (
    (type === "deauth" ||
      type === "access_revoked" ||
      type === "connection_error") &&
    terraUserId
  ) {
    await admin
      .from("terra_connections")
      .delete()
      .eq("terra_user_id", terraUserId);
    return NextResponse.json({ ok: true });
  }

  // Activity import.
  if (type === "activity" && Array.isArray(body.data) && body.data.length) {
    // Resolve our member: prefer reference_id, else look up by terra user id.
    let userId = referenceId ?? null;
    if (!userId && terraUserId) {
      const { data: conn } = await admin
        .from("terra_connections")
        .select("user_id")
        .eq("terra_user_id", terraUserId)
        .maybeSingle();
      userId = conn?.user_id ?? null;
    }
    if (!userId) return NextResponse.json({ ok: true, imported: 0 });

    let imported = 0;
    for (const item of body.data) {
      const mapped = mapTerraActivity(item, terraUserId, provider);
      if (!mapped) continue;

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
        console.error("[terra] insert log failed", error);
        continue;
      }
      imported++;
    }
    return NextResponse.json({ ok: true, imported });
  }

  // Any other event type — acknowledge so Terra doesn't retry.
  return NextResponse.json({ ok: true });
}
