import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  GARMIN,
  garminConfigured,
  garminRedirectUri,
  siteUrl,
} from "@/lib/garmin/config";

// Starts the Garmin OAuth 2.0 (PKCE) consent flow. The member must be logged in
// so the callback can tie the returned tokens to their account.
export async function GET() {
  const base = siteUrl();

  if (!garminConfigured()) {
    return NextResponse.redirect(`${base}/app/tengingar?garmin=unconfigured`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`);

  // PKCE: verifier kept in an httpOnly cookie, challenge sent to Garmin.
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  const challenge = await sha256Base64url(verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: GARMIN.clientId,
    redirect_uri: garminRedirectUri(),
    scope: GARMIN.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const res = NextResponse.redirect(
    `${GARMIN.authorizeUrl}?${params.toString()}`,
  );
  const cookieOpts = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 minutes
  };
  res.cookies.set("garmin_pkce_verifier", verifier, cookieOpts);
  res.cookies.set("garmin_oauth_state", state, cookieOpts);
  return res;
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64url(new Uint8Array(digest));
}
