"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type MacroKey = "protein" | "carbs" | "fat";

type Food = {
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  gives: number;
};

// Tap a macro → food ideas rich in it, sized to help close today's gap, with
// one-tap logging and an optional AI meal idea.
export function MacroSuggest({
  userId,
  loggedOn,
  macro,
  label,
  remaining,
  onClose,
}: {
  userId: string;
  loggedOn: string;
  macro: MacroKey;
  label: string;
  remaining: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
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
        const res = await fetch(
          `/api/nutrition/suggest?macro=${macro}&remaining=${Math.round(remaining)}`,
        );
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) setError(data.error ?? "Villa við að sækja tillögur.");
        else setFoods(data.foods ?? []);
      } catch {
        if (alive) setError("Villa við að sækja tillögur.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [macro, remaining]);

  async function add(food: Food, idx: number) {
    setAddingIdx(idx);
    const supabase = createClient();
    const { error: e } = await supabase.from("nutrition_entries").insert({
      user_id: userId,
      logged_on: loggedOn,
      meal: null,
      name: food.name,
      source: "suggest",
      quantity_g: food.grams,
      kcal: food.kcal,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
    });
    setAddingIdx(null);
    if (e) {
      setError(e.message);
      return;
    }
    onClose();
    router.refresh();
  }

  async function getMealIdea() {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/nutrition/meal-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macro, remaining: Math.round(remaining) }),
      });
      const data = await res.json();
      if (data.text) setAiText(data.text);
      else setAiError(data.error ?? "Gat ekki búið til hugmynd.");
    } catch {
      setAiError("Gat ekki búið til hugmynd.");
    }
    setAiLoading(false);
  }

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
          <h3 className="text-lg font-semibold">{label} — hugmyndir</h3>
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
          {remaining > 0
            ? `${Math.round(remaining).toLocaleString("is-IS")} g eftir í dag — hér eru matvæli rík af ${label.toLowerCase()}.`
            : `Markmiðinu er náð 🎉 — hér eru samt matvæli rík af ${label.toLowerCase()}.`}
        </p>

        {error && <div className="mb-3 text-sm text-red-400">{error}</div>}

        {foods === null && !error ? (
          <p className="text-sm text-muted-foreground">Sæki tillögur…</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(foods ?? []).map((f, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{f.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.grams} g → +{f.gives} g {label.toLowerCase()} · {f.kcal} kcal
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => add(f, i)}
                  disabled={addingIdx !== null}
                  className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  {addingIdx === i ? "Bæti…" : "Bæta við"}
                </button>
              </li>
            ))}
            {foods !== null && foods.length === 0 && (
              <li className="px-3 py-2.5 text-sm text-muted-foreground">
                Engar tillögur fundust.
              </li>
            )}
          </ul>
        )}

        {/* AI meal idea */}
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
              {aiLoading ? "Hugsa…" : "✨ Gefðu mér máltíðarhugmynd"}
            </button>
          )}
          {aiError && <div className="mt-2 text-xs text-red-400">{aiError}</div>}
        </div>
      </div>
    </div>
  );
}
