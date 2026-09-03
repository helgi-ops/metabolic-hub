"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Entry } from "./page";

const MEAL_LABEL: Record<string, string> = {
  breakfast: "Morgunmatur",
  lunch: "Hádegi",
  dinner: "Kvöldmatur",
  snack: "Snarl",
};
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack", "__other__"];

export function NaeringEntries({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string, name: string) {
    if (!window.confirm(`Eyða "${name}" úr dagbókinni?`)) return;
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("nutrition_entries")
      .delete()
      .eq("id", id);
    setBusyId(null);
    if (!error) router.refresh();
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ekkert skráð þennan dag enn.
      </p>
    );
  }

  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.meal ?? "__other__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return (
    <>
      <div className="space-y-5">
        {MEAL_ORDER.filter((k) => groups.has(k)).map((key) => {
          const rows = groups.get(key)!;
          const kcal = Math.round(
            rows.reduce((a, r) => a + (Number(r.kcal) || 0), 0),
          );
          return (
            <section key={key}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {key === "__other__" ? "Annað" : (MEAL_LABEL[key] ?? key)}
                </h3>
                <span className="text-xs text-muted-foreground">{kcal} kcal</span>
              </div>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {rows.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => setEditing(e)}
                      className="min-w-0 flex-1 text-left transition hover:opacity-80"
                    >
                      <span className="block truncate font-medium">
                        {e.name}
                        {e.brand && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {e.brand}
                          </span>
                        )}
                        {e.quantity_g != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {Math.round(e.quantity_g)}g
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {Math.round(Number(e.kcal) || 0)} kcal · P{" "}
                        {Number(e.protein_g) || 0} · K {Number(e.carbs_g) || 0} · F{" "}
                        {Number(e.fat_g) || 0}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(e.id, e.name)}
                      disabled={busyId === e.id}
                      aria-label={`Eyða ${e.name}`}
                      title="Eyða færslu"
                      className="shrink-0 rounded-md border border-transparent px-2 py-1 text-muted-foreground transition hover:border-red-400 hover:text-red-400 disabled:opacity-50"
                    >
                      {busyId === e.id ? "…" : "✕"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {editing && (
        <EditModal entry={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function EditModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const router = useRouter();
  const [meal, setMeal] = useState(entry.meal ?? "");
  const [qty, setQty] = useState(entry.quantity_g != null ? String(entry.quantity_g) : "");
  const [kcal, setKcal] = useState(entry.kcal != null ? String(entry.kcal) : "");
  const [protein, setProtein] = useState(entry.protein_g != null ? String(entry.protein_g) : "");
  const [carbs, setCarbs] = useState(entry.carbs_g != null ? String(entry.carbs_g) : "");
  const [fat, setFat] = useState(entry.fat_g != null ? String(entry.fat_g) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const num = (v: string) => (v.trim() ? parseFloat(v.replace(",", ".")) : null);

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase
      .from("nutrition_entries")
      .update({
        meal: meal || null,
        quantity_g: num(qty),
        kcal: num(kcal),
        protein_g: num(protein),
        carbs_g: num(carbs),
        fat_g: num(fat),
        updated_at: new Date().toISOString(),
      })
      .eq("id", entry.id);
    if (e) {
      setError(e.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
    router.refresh();
  }

  async function remove() {
    setSaving(true);
    const supabase = createClient();
    const { error: e } = await supabase
      .from("nutrition_entries")
      .delete()
      .eq("id", entry.id);
    if (e) {
      setError(e.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
    router.refresh();
  }

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-lg font-semibold">Leiðrétta</h3>
        <p className="mb-4 truncate text-sm text-muted-foreground">{entry.name}</p>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-muted-foreground">Máltíð</span>
          <select value={meal} onChange={(e) => setMeal(e.target.value)} className={field}>
            <option value="">Annað</option>
            <option value="breakfast">Morgunmatur</option>
            <option value="lunch">Hádegi</option>
            <option value="dinner">Kvöldmatur</option>
            <option value="snack">Snarl</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">Grömm</span>
            <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="g" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">Kaloríur</span>
            <input inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="kcal" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">Prótein (g)</span>
            <input inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="g" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">Kolvetni (g)</span>
            <input inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="g" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">Fita (g)</span>
            <input inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="g" className={field} />
          </label>
        </div>

        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className="rounded-md border border-transparent px-2 py-2 text-sm text-muted-foreground transition hover:text-red-400 disabled:opacity-50"
          >
            Eyða
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
              Hætta við
            </button>
            <button type="button" onClick={save} disabled={saving} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50">
              {saving ? "Vista…" : "Vista"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
