"use client";

import { useState, useTransition } from "react";
import { isValidKennitala } from "@/lib/kennitala";
import { registerForCourse } from "./actions";

const input =
  "w-full rounded-md border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60";

export function CourseRegistrationForm({
  courseSlug,
  price,
}: {
  courseSlug: string;
  price: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const kennitala = String(f.get("kennitala") ?? "");
    if (!isValidKennitala(kennitala)) {
      setError("Kennitala er ekki gild.");
      return;
    }
    startTransition(async () => {
      const res = await registerForCourse({
        courseSlug,
        fullName: String(f.get("fullName") ?? ""),
        email: String(f.get("email") ?? ""),
        phone: String(f.get("phone") ?? ""),
        kennitala,
        acceptBilling: f.get("acceptBilling") === "on",
        website: String(f.get("website") ?? ""),
      });
      if (res.ok) setDone(true);
      else setError(res.message);
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 p-6 text-center">
        <div className="text-lg font-semibold text-accent">Takk — skráning móttekin!</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Þú færð staðfestingu í tölvupósti. Við sendum greiðsluseðil í heimabankann
          þinn og opnum aðganginn um leið og hann er greiddur.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-left">
      <input name="fullName" required autoComplete="name" placeholder="Fullt nafn" className={input} disabled={pending} />
      <input name="email" type="email" required autoComplete="email" placeholder="Netfang" className={input} disabled={pending} />
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="phone" type="tel" required autoComplete="tel" placeholder="Sími" className={input} disabled={pending} />
        <input
          name="kennitala"
          required
          inputMode="numeric"
          autoComplete="off"
          placeholder="Kennitala (fyrir greiðsluseðil)"
          className={input}
          disabled={pending}
        />
      </div>
      {/* Honeypot: hidden from people, tempting for bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Vefsíða
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
        <input name="acceptBilling" type="checkbox" required className="mt-0.5 accent-accent" disabled={pending} />
        <span>
          Ég samþykki að greiðsluseðill að upphæð <strong className="text-foreground">{price}</strong> verði
          stofnaður í heimabankanum mínum.
        </span>
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Sendi skráningu…" : "Skrá mig á námskeiðið →"}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        Engin greiðsla núna — þú færð greiðsluseðil og aðgang í kjölfarið.
      </p>
    </form>
  );
}
