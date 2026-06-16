"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/site-url";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback?next=/breyta-lykilord`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 p-6 text-center">
        <div className="font-semibold text-accent">Tékkaðu á netfanginu</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Ef til er aðgangur fyrir {email} sendum við hlekk til að endurstilla
          lykilorðið. Smelltu á hann og veldu nýtt lykilorð.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-muted-foreground mb-1"
        >
          Netfang
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
      >
        {loading ? "Sendi…" : "Senda endurstillingar-hlekk"}
      </button>
    </form>
  );
}
