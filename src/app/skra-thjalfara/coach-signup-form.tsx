"use client";

import { useState } from "react";
import Link from "next/link";
import { registerCoach } from "./actions";

export function CoachSignupForm({
  stations,
  presetCode,
}: {
  stations: { id: string; name: string }[];
  presetCode: string;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stationId, setStationId] = useState("");
  const [code, setCode] = useState(presetCode);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await registerCoach({
      fullName,
      email,
      password,
      stationId,
      code,
    });
    setLoading(false);
    if (res.ok) {
      setDone(true);
    } else {
      setError(res.message);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 p-6 text-center">
        <div className="text-accent font-semibold">Aðgangur tilbúinn 🎉</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Þjálfaraaðgangurinn þinn er virkur. Þú getur skráð þig inn núna.
        </div>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
        >
          Innskráning →
        </Link>
      </div>
    );
  }

  const labelCls = "block text-sm font-medium text-muted-foreground mb-1";
  const inputCls =
    "w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="full_name" className={labelCls}>
          Fullt nafn
        </label>
        <input
          id="full_name"
          type="text"
          required
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="station" className={labelCls}>
          Stöð
        </label>
        <select
          id="station"
          required
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className={inputCls}
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
        <label htmlFor="email" className={labelCls}>
          Netfang
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="password" className={labelCls}>
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
          className={inputCls}
        />
        <div className="text-xs text-muted-foreground mt-1">
          Að lágmarki 8 stafir.
        </div>
      </div>
      <div>
        <label htmlFor="code" className={labelCls}>
          Boðskóði
        </label>
        <input
          id="code"
          type="text"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Frá Metabolic"
          className={inputCls}
        />
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
      >
        {loading ? "Stofna…" : "Búa til þjálfaraaðgang"}
      </button>
    </form>
  );
}
