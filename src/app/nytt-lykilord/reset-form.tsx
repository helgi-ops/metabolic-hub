"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Verifies the recovery token and sets the new password — both only on submit,
// so a GET prefetch of this page never consumes the single-use token.
export function ResetForm({ tokenHash }: { tokenHash: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError("Lykilorð þarf að vera a.m.k. 8 stafir.");
      return;
    }
    if (pw !== pw2) {
      setError("Lykilorðin stemma ekki.");
      return;
    }
    setLoading(true);
    const supabase = createClient();

    // 1) Consume the recovery token now (user action) → establishes a session.
    const { error: vErr } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    if (vErr) {
      setLoading(false);
      setError(
        "Hlekkurinn er útrunninn eða þegar notaður. Biddu um nýjan á Gleymt lykilorð.",
      );
      return;
    }

    // 2) Set the new password on the now-authenticated session.
    const { error: uErr } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (uErr) {
      setError(uErr.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 p-6 text-center">
        <div className="font-semibold text-accent">✓ Lykilorð uppfært</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Þú ert skráð/ur inn með nýja lykilorðinu.
        </p>
        <button
          onClick={() => router.push("/app")}
          className="mt-4 inline-block rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
        >
          Áfram í appið →
        </button>
      </div>
    );
  }

  const input =
    "w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="pw"
          className="block text-sm font-medium text-muted-foreground mb-1"
        >
          Nýtt lykilorð
        </label>
        <input
          id="pw"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className={input}
        />
        <div className="mt-1 text-xs text-muted-foreground">
          Að lágmarki 8 stafir.
        </div>
      </div>
      <div>
        <label
          htmlFor="pw2"
          className="block text-sm font-medium text-muted-foreground mb-1"
        >
          Staðfestu nýtt lykilorð
        </label>
        <input
          id="pw2"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          className={input}
        />
      </div>
      {error && (
        <div className="text-sm text-red-400">
          {error}{" "}
          <Link href="/gleymt-lykilord" className="underline">
            Biðja um nýjan hlekk
          </Link>
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
      >
        {loading ? "Vista…" : "Vista nýtt lykilorð"}
      </button>
    </form>
  );
}
