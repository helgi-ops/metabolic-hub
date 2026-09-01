"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Targets = {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
} | null;

export function TargetsForm({
  userId,
  targets,
}: {
  userId: string;
  targets: Targets;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
      >
        {targets ? "Breyta markmiðum" : "Setja markmið"}
      </button>
      {open && (
        <Modal
          userId={userId}
          targets={targets}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Modal({
  userId,
  targets,
  onClose,
  onSaved,
}: {
  userId: string;
  targets: Targets;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kcal, setKcal] = useState(targets?.kcal != null ? String(targets.kcal) : "");
  const [protein, setProtein] = useState(
    targets?.protein_g != null ? String(targets.protein_g) : "",
  );
  const [carbs, setCarbs] = useState(
    targets?.carbs_g != null ? String(targets.carbs_g) : "",
  );
  const [fat, setFat] = useState(targets?.fat_g != null ? String(targets.fat_g) : "");
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
    const { error: e } = await supabase.from("nutrition_targets").upsert(
      {
        user_id: userId,
        kcal: num(kcal),
        protein_g: num(protein),
        carbs_g: num(carbs),
        fat_g: num(fat),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (e) {
      setError(e.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
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
        <h3 className="mb-4 text-lg font-semibold">Dagleg markmið</h3>
        <div className="grid grid-cols-2 gap-3">
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
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
            Hætta við
          </button>
          <button type="button" onClick={save} disabled={saving} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50">
            {saving ? "Vista…" : "Vista"}
          </button>
        </div>
      </div>
    </div>
  );
}
