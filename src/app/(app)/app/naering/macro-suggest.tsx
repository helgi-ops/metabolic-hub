"use client";

import { useEffect, useState } from "react";

export type MacroKey = "protein" | "carbs" | "fat";

type Food = {
  name: string;
  gives: number; // grams of the macro per 100 g
  kcal: number; // kcal per 100 g
};

// Educational: tap a macro to see which foods are rich in it (per 100 g), plus
// an optional AI list of meal ideas. Not a logging tool — no adding here.
export function MacroSuggest({
  macro,
  label,
  onClose,
}: {
  macro: MacroKey;
  label: string;
  onClose: () => void;
}) {
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/nutrition/suggest?macro=${macro}`);
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) setError(data.error ?? "Villa við að sækja matvæli.");
        else setFoods(data.foods ?? []);
      } catch {
        if (alive) setError("Villa við að sækja matvæli.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [macro]);

  async function getMealIdea() {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/nutrition/meal-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macro }),
      });
      const data = await res.json();
      if (data.text) setAiText(data.text);
      else setAiError(data.error ?? "Gat ekki búið til hugmynd.");
    } catch {
      setAiError("Gat ekki búið til hugmynd.");
    }
    setAiLoading(false);
  }

  const low = label.toLowerCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-background p-5 shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold">Matvæli rík af {low}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Loka"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Hvar færðu {low}? Gildi miðast við 100 g.
        </p>

        {error && <div className="mb-3 text-sm text-red-400">{error}</div>}

        {foods === null && !error ? (
          <p className="text-sm text-muted-foreground">Sæki matvæli…</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(foods ?? []).map((f, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate">{f.name}</span>
                <span className="shrink-0 text-right">
                  <span className="font-semibold text-accent">{f.gives} g</span>
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {f.kcal} kcal
                  </span>
                </span>
              </li>
            ))}
            {foods !== null && foods.length === 0 && (
              <li className="px-3 py-2.5 text-sm text-muted-foreground">
                Engin matvæli fundust.
              </li>
            )}
          </ul>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          g af {low} í 100 g af matvælinu.
        </p>

        {/* AI meal ideas */}
        <div className="mt-4 border-t border-border pt-3">
          {aiText ? (
            <div className="whitespace-pre-line rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">
              {aiText}
            </div>
          ) : (
            <button
              type="button"
              onClick={getMealIdea}
              disabled={aiLoading}
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-accent hover:text-foreground disabled:opacity-50"
            >
              {aiLoading ? "Hugsa…" : `✨ Máltíðarhugmyndir ríkar af ${low}`}
            </button>
          )}
          {aiError && <div className="mt-2 text-xs text-red-400">{aiError}</div>}
        </div>
      </div>
    </div>
  );
}
