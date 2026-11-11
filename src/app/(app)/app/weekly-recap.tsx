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
  const [expanded, setExpanded] = useState(false);

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
    <div className="rounded-2xl border border-border bg-muted p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold">Síðasta vika í stuttu máli</h2>
        <span className="shrink-0 text-xs text-muted-foreground">{weekLabel}</span>
      </div>

      {content ? (
        <>
          <p
            className={`mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/85 ${
              expanded ? "" : "line-clamp-3"
            }`}
          >
            {content}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-sm text-orange-400 hover:text-orange-300"
          >
            {expanded ? "Sýna minna" : "Lesa allt →"}
          </button>
        </>
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
