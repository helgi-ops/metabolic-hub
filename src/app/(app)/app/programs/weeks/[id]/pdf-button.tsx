"use client";

import { useState, useTransition } from "react";
import { generatePlanPdf } from "./actions";

export function PdfButton({ planId }: { planId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="no-print flex flex-col items-end gap-1">
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await generatePlanPdf(planId);
            if (!res.ok) setError(res.error ?? "Villa kom upp.");
          });
        }}
        disabled={pending}
        className="rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium hover:border-accent transition disabled:opacity-50"
      >
        {pending ? "Bý til…" : "Búa til OptiSigns PDF"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
