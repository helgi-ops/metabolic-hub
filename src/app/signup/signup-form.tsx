"use client";

import { useState } from "react";
import Link from "next/link";
import { registerMember } from "./actions";
import { isValidKennitala, normalizeKennitala } from "@/lib/kennitala";
import type { PricePlan } from "@/lib/pricing";

export type SignupStation = {
  id: string;
  name: string;
  onlineSignup: boolean;
  plans: PricePlan[];
};

const inputCls =
  "w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
const labelCls = "block text-sm font-medium text-muted-foreground mb-1";

export function SignupForm({
  stations,
  initialStationId = "",
}: {
  stations: SignupStation[];
  initialStationId?: string;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stationId, setStationId] = useState(initialStationId);
  const [kennitala, setKennitala] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [acceptBilling, setAcceptBilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<null | { membership: boolean }>(null);

  const station = stations.find((s) => s.id === stationId);
  const membership = !!station?.onlineSignup;
  const plans = station?.plans ?? [];

  const ktDigits = normalizeKennitala(kennitala);
  const ktInvalid = ktDigits.length >= 10 && !isValidKennitala(ktDigits);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (membership) {
      if (plans.length > 0 && !planTitle) {
        setError("Veldu áskriftarleið.");
        return;
      }
      if (!isValidKennitala(kennitala)) {
        setError("Kennitala er ekki gild.");
        return;
      }
      if (!acceptBilling) {
        setError("Samþykktu að greiðsluseðill verði stofnaður í heimabanka.");
        return;
      }
    }

    setLoading(true);
    const result = await registerMember({
      fullName,
      email,
      password,
      stationId,
      ...(membership ? { kennitala, planTitle, acceptBilling } : {}),
    });

    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }

    setSent({ membership: result.membership });
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 p-6 text-center">
        <div className="text-accent font-semibold">
          {sent.membership ? "Skráning móttekin! 🎉" : "Aðgangur stofnaður!"}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {sent.membership ? (
            <>
              Velkomin(n) í Metabolic! Greiðsluseðill birtist í heimabankanum
              þínum og þú færð aðgang að appinu um leið og skráningin hefur
              verið samþykkt.
            </>
          ) : (
            <>
              Þjálfari þarf að samþykkja skráninguna þína áður en þú færð
              aðgang. Þú getur skráð þig inn um leið og hún hefur verið
              samþykkt.
            </>
          )}
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
        <label htmlFor="station" className={labelCls}>
          Stöð
        </label>
        <select
          id="station"
          required
          value={stationId}
          onChange={(e) => {
            setStationId(e.target.value);
            setPlanTitle("");
            setError(null);
          }}
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

      {membership && plans.length > 0 && (
        <fieldset>
          <legend className={labelCls}>Áskriftarleið</legend>
          <div className="space-y-2">
            {plans.map((p) => {
              const active = planTitle === p.title;
              return (
                <label
                  key={p.title}
                  className={`block cursor-pointer rounded-lg border p-3 transition ${
                    active
                      ? "border-accent bg-accent/10"
                      : "border-border bg-muted hover:border-accent/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="plan"
                      value={p.title}
                      checked={active}
                      onChange={() => setPlanTitle(p.title)}
                      className="mt-1 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-sm font-medium">{p.title}</span>
                        <span className="text-sm">
                          <span className="font-bold">{p.price}</span>
                          {p.per && (
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              {p.per}
                            </span>
                          )}
                        </span>
                      </div>
                      {p.features && p.features.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {p.features.map((f) => (
                            <li key={f}>✓ {f}</li>
                          ))}
                        </ul>
                      )}
                      {p.note && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {p.note}
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

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

      {membership && (
        <div>
          <label htmlFor="kennitala" className={labelCls}>
            Kennitala
          </label>
          <input
            id="kennitala"
            type="text"
            required
            inputMode="numeric"
            autoComplete="off"
            placeholder="000000-0000"
            maxLength={11}
            value={kennitala}
            onChange={(e) => setKennitala(e.target.value.replace(/[^\d-]/g, ""))}
            className={`${inputCls} ${ktInvalid ? "border-red-400" : ""}`}
          />
          <div
            className={`text-xs mt-1 ${ktInvalid ? "text-red-400" : "text-muted-foreground"}`}
          >
            {ktInvalid
              ? "Kennitalan virðist ekki rétt — athugaðu tölustafina."
              : "Aðeins notuð til að stofna greiðsluseðil í heimabanka."}
          </div>
        </div>
      )}

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
          Lykilorð (fyrir appið)
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

      {membership && (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={acceptBilling}
            onChange={(e) => setAcceptBilling(e.target.checked)}
            className="mt-0.5 accent-accent"
          />
          <span className="text-muted-foreground">
            Ég samþykki að greiðsluseðill fyrir valda áskrift verði stofnaður í
            heimabankanum mínum.
          </span>
        </label>
      )}

      {error && <div className="text-sm text-red-400">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
      >
        {loading ? "Skrái…" : membership ? "Skrá mig í Metabolic" : "Búa til aðgang"}
      </button>
    </form>
  );
}
