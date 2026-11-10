"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cloneWeekToLevels,
  copyWeekToNext,
  deleteWeek,
  generatePlanPdf,
  moveWeekStart,
  setCycleWeek,
} from "./actions";

const OTHER_LEVELS: Record<string, string> = {
  MB1: "MB2 + MB3",
  MB2: "MB1 + MB3",
  MB3: "MB1 + MB2",
};

// Primary "publish to screens" button.
export function PublishButton({ planId, published }: { planId: string; published: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await generatePlanPdf(planId);
            if (!res.ok) setError(res.error ?? "Villa kom upp.");
          });
        }}
        className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Birti…" : published ? "Uppfæra skjái" : "Birta á skjám"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

// "⋯" menu: the less frequent (and destructive) actions.
export function WeekMenu({
  planId,
  level,
  pdfUrl,
}: {
  planId: string;
  level: string;
  pdfUrl: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(fn: () => Promise<void>) {
    setMsg(null);
    setOpen(false);
    startTransition(fn);
  }

  const item =
    "flex h-10 w-full items-center rounded-md px-2.5 text-left text-sm hover:bg-background disabled:opacity-50";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Fleiri aðgerðir"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-muted text-lg hover:border-accent disabled:opacity-50"
      >
        {pending ? "…" : "⋯"}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-border bg-muted p-1.5 shadow-xl"
        >
          {OTHER_LEVELS[level] && (
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() =>
                run(async () => {
                  const res = await cloneWeekToLevels(planId);
                  if (!res.ok) return setMsg(res.error ?? "Tókst ekki að afrita.");
                  setMsg(`Búið til fyrir ${OTHER_LEVELS[level]}.`);
                  router.refresh();
                })
              }
            >
              Afrita á {OTHER_LEVELS[level]}
            </button>
          )}
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() =>
              run(async () => {
                const res = await copyWeekToNext(planId);
                if (!res.ok || !res.id) return setMsg(res.error ?? "Tókst ekki að afrita.");
                router.push(`/app/programs/weeks/${res.id}`);
              })
            }
          >
            Afrita í næstu viku
          </button>
          {pdfUrl && (
            <a role="menuitem" href={pdfUrl} target="_blank" rel="noopener noreferrer" className={item}>
              Sækja OptiSigns PDF
            </a>
          )}
          <div className="my-1 h-px bg-border" />
          <button
            role="menuitem"
            type="button"
            className={`${item} text-red-300`}
            onClick={() => {
              if (!confirm("Eyða þessari viku? Þetta er ekki hægt að afturkalla.")) return;
              run(async () => {
                const res = await deleteWeek(planId);
                if (!res.ok) return setMsg(res.error ?? "Tókst ekki að eyða.");
                router.push("/app/programs");
                router.refresh();
              });
            }}
          >
            Eyða viku…
          </button>
        </div>
      )}
      {msg && <div className="absolute right-0 mt-1 w-60 text-right text-xs text-muted-foreground">{msg}</div>}
    </div>
  );
}

export function MoveStartButton({ planId, to, label }: { planId: string; to: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await moveWeekStart(planId, to);
            if (!res.ok) setError(res.error ?? "Villa kom upp.");
          })
        }
        className="font-medium underline disabled:opacity-50"
      >
        {pending ? "Færi…" : label}
      </button>
      {error && <span className="text-red-400">{error}</span>}
    </>
  );
}

// The cycle tag ("Lota · vika 2 af 4") as an inline select for builders.
export function CycleSelect({ planId, value }: { planId: string; value: string }) {
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState(value);
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Vika í lotu</span>
      <select
        value={v}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setV(next);
          startTransition(async () => {
            await setCycleWeek(planId, next || null);
          });
        }}
        className={`h-7 cursor-pointer appearance-none rounded-full border px-3 pr-7 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60 ${
          v
            ? "border-accent/40 bg-accent/10 text-orange-400"
            : "border-border bg-muted text-muted-foreground"
        }`}
      >
        <option value="">Ekki í lotu</option>
        {[1, 2, 3, 4].map((n) => (
          <option key={n} value={`Vika ${n}`}>
            Lota · vika {n} af 4
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-2.5 text-[10px] text-orange-400">
        ▾
      </span>
    </label>
  );
}
