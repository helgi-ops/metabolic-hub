"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteWeek, cloneWeekToLevels } from "./actions";

const OTHER_LEVELS: Record<string, string> = {
  MB1: "MB2 + MB3",
  MB2: "MB1 + MB3",
  MB3: "MB1 + MB2",
};

export function WeekActions({
  planId,
  level,
}: {
  planId: string;
  level: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function clone() {
    setMsg(null);
    startTransition(async () => {
      const res = await cloneWeekToLevels(planId);
      if (!res.ok) {
        setMsg(res.error ?? "Tókst ekki að afrita.");
        return;
      }
      router.push("/app/programs");
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Eyða þessari viku? Þetta er ekki hægt að afturkalla.")) return;
    setMsg(null);
    startTransition(async () => {
      const res = await deleteWeek(planId);
      if (!res.ok) {
        setMsg(res.error ?? "Tókst ekki að eyða.");
        return;
      }
      router.push("/app/programs");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {OTHER_LEVELS[level] && (
          <button
            onClick={clone}
            disabled={pending}
            title={`Búa til eins viku fyrir ${OTHER_LEVELS[level]} með sömu uppsetningum`}
            className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm hover:border-accent transition disabled:opacity-50"
          >
            Afrita á {OTHER_LEVELS[level]}
          </button>
        )}
        <button
          onClick={remove}
          disabled={pending}
          className="rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
        >
          Eyða viku
        </button>
      </div>
      {msg && <div className="text-xs text-red-400">{msg}</div>}
    </div>
  );
}
