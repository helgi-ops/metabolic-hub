import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = {
  title: "Breyta lykilorði · Metabolic",
};

// Works both for logged-in users (change password) and for users arriving from
// a password-reset link (the recovery session is active by the time they land
// here via /auth/callback). Kept outside the (app) layout so the pending/
// suspended member gate never blocks a password reset.
export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/breyta-lykilord");

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link
            href="/app"
            className="font-mono text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground"
          >
            ← Metabolic
          </Link>
          <h1 className="mt-6 text-2xl font-semibold">Breyta lykilorði</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Veldu nýtt lykilorð fyrir aðganginn þinn.
          </p>
        </div>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
