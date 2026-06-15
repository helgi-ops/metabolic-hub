"use client";

import { useState } from "react";
import { generateWeeklyRecap } from "./recap-actions";

export function WeeklyRecap({
  initialContent,
  weekLabel,
  hasLogs,
}: {
  initialContent: string | null;
  weekLabel: string;
  hasLogs: boolean;
}) {
  const [content, setContent] = useState<string | null>(initialContent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    setLoading(true);
    setError(null);
    const res = await generateWeeklyRecap();
    if (res.ok) {
      setContent(res.content);
    } else if (res.reason === "empty") {
      setContent(null);
      setError("Engar skráðar æfingar í síðustu viku.");
    } else {
      setError(res.message);
    }
    setLoading(false);
  }

  return (
    <div className="mb-8 rounded-lg border border-border bg-muted p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-xs tracking-widest text-accent uppercase">
            Vika í baksýn
          </div>
          <h2 className="mt-1 font-semibold">Hvernig gekk vikan? ✨</h2>
          <p className="text-xs text-muted-foreground">{weekLabel}</p>
        </div>
        {content && (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            AI-yfirlit
          </span>
        )}
      </div>

      {content ? (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
          {content}
        </p>
      ) : (
        <div className="mt-3">
          {hasLogs ? (
            <>
              <p className="text-sm text-muted-foreground">
                Fáðu stutt, hvetjandi yfirlit yfir æfingavikuna þína — byggt á því
                sem þú skráðir.
              </p>
              <button
                type="button"
                onClick={onGenerate}
                disabled={loading}
                className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Bý til yfirlit…" : "Búa til vikuyfirlit"}
              </button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Engar skráðar æfingar í síðustu viku. Skráðu æfingar í Dagbók — þá
              færðu vikuyfirlit hér næst.
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
