"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function ChangePasswordForm() {
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
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 p-6 text-center">
        <div className="font-semibold text-accent">✓ Lykilorð uppfært</div>
        <Link
          href="/app"
          className="mt-4 inline-block rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
        >
          Áfram í appið →
        </Link>
      </div>
    );
  }

  const input =
    "w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="pw" className="block text-sm font-medium text-muted-foreground mb-1">
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
        <div className="mt-1 text-xs text-muted-foreground">Að lágmarki 8 stafir.</div>
      </div>
      <div>
        <label htmlFor="pw2" className="block text-sm font-medium text-muted-foreground mb-1">
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
      {error && <div className="text-sm text-red-400">{error}</div>}
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
