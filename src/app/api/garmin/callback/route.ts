import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GARMIN,
  garminConfigured,
  garminRedirectUri,
  siteUrl,
} from "@/lib/garmin/config";

// Handles the redirect back from Garmin: validates state, exchanges the code
// for tokens (PKCE), and stores them against the logged-in member.
export async function GET(request: Request) {
  const base = siteUrl();
  // Clear the one-shot PKCE/state cookies on every outcome.
  const done = (status: string) => {
    const res = NextResponse.redirect(
      `${base}/app/tengingar?garmin=${status}`,
    );
    res.cookies.delete("garmin_oauth_state");
    res.cookies.delete("garmin_pkce_verifier");
    return res;
  };

  if (!garminConfigured()) return done("unconfigured");

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const jar = await cookies();
  const expectedState = jar.get("garmin_oauth_state")?.value;
  const verifier = jar.get("garmin_pkce_verifier")?.value;

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return done("error");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`);

  // Exchange the authorization code for tokens.
  let tokenRes: Response;
  try {
    tokenRes = await fetch(GARMIN.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: garminRedirectUri(),
        client_id: GARMIN.clientId,
        client_secret: GARMIN.clientSecret,
        code_verifier: verifier,
      }),
    });
  } catch (e) {
    console.error("[garmin] token fetch failed", e);
    return done("error");
  }

  if (!tokenRes.ok) {
    console.error("[garmin] token exchange rejected", tokenRes.status);
    return done("error");
  }

  const token = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    // Some Garmin responses include the user id; otherwise fetched separately.
    userId?: string;
    user_id?: string;
  };

  if (!token.access_token) return done("error");

  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null;

  // Store tokens with the service role (RLS-bypassing) — token columns are not
  // granted to the member's own client.
  const admin = createAdminClient();
  const { error } = await admin.from("garmin_connections").upsert(
    {
      user_id: user.id,
      garmin_user_id: token.userId ?? token.user_id ?? null,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      token_expires_at: expiresAt,
      scope: token.scope ?? GARMIN.scope,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[garmin] store connection failed", error);
    return done("error");
  }

  return done("connected");
}
