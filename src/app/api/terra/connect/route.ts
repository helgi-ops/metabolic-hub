import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateWidgetSession,
  siteUrl,
  terraConfigured,
} from "@/lib/terra/config";

// Starts the Terra connect flow: creates a widget session tied to the member
// (reference_id = our user id) and redirects them to Terra's device picker.
export async function GET() {
  const base = siteUrl();

  if (!terraConfigured()) {
    return NextResponse.redirect(`${base}/app/tengingar?terra=unconfigured`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`);

  const url = await generateWidgetSession(user.id);
  if (!url) return NextResponse.redirect(`${base}/app/tengingar?terra=error`);

  return NextResponse.redirect(url);
}
