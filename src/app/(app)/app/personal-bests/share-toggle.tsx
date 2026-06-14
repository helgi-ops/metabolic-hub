"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SharePbToggle({
  userId,
  initial,
  stationName,
}: {
  userId: string;
  initial: boolean;
  stationName: string | null;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ share_pbs: next })
        .eq("id", userId);
      if (error) setOn(!next);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted p-4">
      <div>
        <div className="text-sm font-medium">
          Deila metunum mínum{stationName ? ` á ${stationName}` : ""}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {on
            ? "Aðrir á þinni stöð sjá metin þín á topplistanum."
            : "Metin þín eru falin. Kveiktu til að taka þátt í topplistanum."}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        disabled={pending}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
          on ? "bg-accent" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
