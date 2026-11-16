"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openCourseAccess, setRegistrationStatus } from "./actions";

export function RegistrationActions({
  id,
  status,
  name,
}: {
  id: string;
  status: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  if (status === "enrolled") {
    return <span className="text-xs text-accent">✓ Aðgangur opinn</span>;
  }

  const btn =
    "rounded-md border border-border px-3 py-1.5 text-xs transition hover:text-foreground disabled:opacity-50";

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {status === "new" && (
          <button
            className={`${btn} text-muted-foreground`}
            disabled={pending}
            onClick={() => run(() => setRegistrationStatus(id, "invoiced"))}
          >
            Seðill sendur
          </button>
        )}
        {status !== "cancelled" && (
          <button
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
            disabled={pending}
            onClick={() => {
              if (confirm(`Opna aðgang fyrir ${name}? Viðkomandi fær tölvupóst með innskráningu.`))
                run(() => openCourseAccess(id));
            }}
          >
            {pending ? "Augnablik…" : "Greitt — opna aðgang"}
          </button>
        )}
        {status !== "cancelled" ? (
          <button
            className={`${btn} text-muted-foreground`}
            disabled={pending}
            onClick={() => {
              if (confirm(`Afskrá ${name}?`)) run(() => setRegistrationStatus(id, "cancelled"));
            }}
          >
            Hætta við
          </button>
        ) : (
          <button
            className={`${btn} text-muted-foreground`}
            disabled={pending}
            onClick={() => run(() => setRegistrationStatus(id, "new"))}
          >
            Endurvekja
          </button>
        )}
      </div>
      {msg && (
        <span className={`text-xs ${msg.ok ? "text-accent" : "text-red-400"}`}>{msg.text}</span>
      )}
    </div>
  );
}
