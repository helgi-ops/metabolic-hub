"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function OptOutToggle({
  userId,
  initialOptOut,
}: {
  userId: string;
  initialOptOut: boolean;
}) {
  const router = useRouter();
  const [optOut, setOptOut] = useState(initialOptOut);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !optOut;
    setOptOut(next); // optimistic
    startTransition(async () => {
      // Write directly from the browser (the user's own session) — the same
      // proven path SharePbToggle uses. The server action failed to persist.
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ leaderboard_opt_out: next })
        .eq("id", userId);
      if (error) setOptOut(!next); // revert on failure
      else router.refresh();
    });
  }

  return (
    <div className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-border bg-muted p-4">
      <div>
        <div className="text-sm font-medium">Sýna mig á leaderboard</div>
        <p className="text-xs text-muted-foreground">
          {optOut
            ? "Kaloríurnar þínar eru faldar — aðeins þú sérð þær í Dagbók."
            : "Kaloríurnar þínar birtast öðrum á stöðinni."}
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        role="switch"
        aria-checked={!optOut}
        aria-label="Sýna mig á leaderboard"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
          optOut ? "bg-border" : "bg-accent"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
            optOut ? "translate-x-0.5" : "translate-x-[22px]"
          }`}
        />
      </button>
    </div>
  );
}
