"use client";

import { useState, useTransition } from "react";
import { requestPasswordReset } from "./actions";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await requestPasswordReset(email);
      if (!res.ok) {
        setError(
          "Ekki tókst að senda póst í augnablikinu. Reyndu aftur eða biddu þjálfarann þinn að endurstilla lykilorðið.",
        );
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 p-6 text-center">
        <div className="font-semibold text-accent">Tékkaðu á netfanginu</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Ef til er aðgangur fyrir {email} sendum við hlekk til að endurstilla
          lykilorðið. Smelltu á hann og veldu nýtt lykilorð. Athugaðu ruslpóstinn
          ef hann birtist ekki strax.
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
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
      >
        {pending ? "Sendi…" : "Senda endurstillingar-hlekk"}
      </button>
    </form>
  );
}
