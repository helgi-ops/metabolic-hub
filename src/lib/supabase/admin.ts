// Service-role Supabase client — bypasses RLS. SERVER-ONLY: only import this
// from server actions / route handlers, never from a client component, or the
// secret key would be bundled for the browser.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
