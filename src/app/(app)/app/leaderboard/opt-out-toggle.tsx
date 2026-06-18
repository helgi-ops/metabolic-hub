"use client";

import { useState, useTransition } from "react";
import { setLeaderboardOptOut } from "./actions";

export function OptOutToggle({ initialOptOut }: { initialOptOut: boolean }) {
  const [optOut, setOptOut] = useState(initialOptOut);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !optOut;
    setOptOut(next); // optimistic
    startTransition(async () => {
      const res = await setLeaderboardOptOut(next);
      if (!res.ok) setOptOut(!next); // revert on failure
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
