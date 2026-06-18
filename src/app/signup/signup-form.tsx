"use client";

import { useState } from "react";
import Link from "next/link";
import { registerMember } from "./actions";

export function SignupForm({
  stations,
}: {
  stations: { id: string; name: string }[];
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stationId, setStationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await registerMember({
      fullName,
      email,
      password,
      stationId,
    });

    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 p-6 text-center">
        <div className="text-accent font-semibold">Aðgangur stofnaður!</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Þjálfari þarf að samþykkja skráninguna þína áður en þú færð aðgang.
          Þú getur skráð þig inn um leið og hún hefur verið samþykkt.
        </div>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
        >
          Innskráning
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="full_name"
          className="block text-sm font-medium text-muted-foreground mb-1"
        >
          Fullt nafn
        </label>
        <input
          id="full_name"
          type="text"
          required
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label
          htmlFor="station"
          className="block text-sm font-medium text-muted-foreground mb-1"
        >
          Stöð
        </label>
        <select
          id="station"
          required
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">Veldu stöðina þína</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
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
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-muted-foreground mb-1"
        >
          Lykilorð
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <div className="text-xs text-muted-foreground mt-1">
          Að lágmarki 8 stafir.
        </div>
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
      >
        {loading ? "Skrái…" : "Búa til aðgang"}
      </button>
    </form>
  );
}
