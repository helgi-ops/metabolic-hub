import Link from "next/link";
import { ResetForm } from "./reset-form";

export const metadata = {
  title: "Nýtt lykilorð · Metabolic",
};

// Landing page for the password-reset email link. It does NOT verify the token
// on load — the token is only consumed when the member submits the form (see
// reset-form.tsx), so email-scanner prefetch (Gmail/Outlook doing a GET) can't
// burn a single-use link before the member clicks. Lives outside the (app)
// layout so the member-approval gate never blocks a reset, and needs no session.
export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash, type } = await searchParams;
  const tokenHash = typeof token_hash === "string" ? token_hash : null;
  const otpType = type === "recovery" ? "recovery" : null;

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link
            href="/login"
            className="font-mono text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground"
          >
            ← Metabolic
          </Link>
          <h1 className="mt-6 text-2xl font-semibold">Nýtt lykilorð</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Veldu nýtt lykilorð fyrir aðganginn þinn.
          </p>
        </div>

        {tokenHash && otpType ? (
          <ResetForm tokenHash={tokenHash} />
        ) : (
          <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-6 text-center text-sm">
            <div className="font-semibold text-red-400">Ógildur hlekkur</div>
            <p className="mt-2 text-muted-foreground">
              Hlekkurinn er ófullnægjandi eða útrunninn. Biddu um nýjan á{" "}
              <Link href="/gleymt-lykilord" className="text-accent hover:underline">
                Gleymt lykilorð
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
