"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateWeekSlots } from "../actions";

type Structure = {
  source_id: string;
  name: string;
  category: string;
  level: string; // MB1 | MB2 | MB3 | ALL
  preview: string;
};

type Slot = {
  slot: number;
  category: string;
  structure_source_id: string;
  name: string;
  day?: string;
  focus?: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  strength: "Strength",
  power_strength: "Power/Strength",
  power: "Power",
  endurance: "Endurance",
  burn: "Burn",
};

export function EditClient({
  planId,
  title,
  level,
  weekStarting,
  slots: initialSlots,
  structures,
}: {
  planId: string;
  title: string;
  level: string;
  weekStarting: string;
  slots: Slot[];
  structures: Structure[];
}) {
  const router = useRouter();
  const bySource = useMemo(
    () => new Map(structures.map((s) => [s.source_id, s])),
    [structures],
  );

  // Structures available for this week's level (plus ALL), grouped by category.
  const byCategory = useMemo(() => {
    const map = new Map<string, Structure[]>();
    for (const s of structures) {
      if (s.level !== level && s.level !== "ALL") continue;
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return map;
  }, [structures, level]);

  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setSlot(i: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function pickStructure(i: number, sourceId: string) {
    const st = bySource.get(sourceId);
    setSlot(i, {
      structure_source_id: sourceId,
      name: st?.name ?? slots[i].name,
    });
  }

  async function save() {
    setError(null);
    setSaving(true);
    const res = await updateWeekSlots(planId, slots);
    if (!res.ok) {
      setError(res.error ?? "Tókst ekki að vista.");
      setSaving(false);
      return;
    }
    router.push(`/app/programs/weeks/${planId}`);
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <Link
          href={`/app/programs/weeks/${planId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Til baka í vikuna
        </Link>
        <div className="mt-4 font-mono text-xs tracking-widest text-accent uppercase">
          Program Builder · {level} · Vika {weekStarting}
        </div>
        <h1 className="mt-2 text-3xl font-bold">
          Breyta: {title || `Vika ${weekStarting}`}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Skiptu út stökum æfingum í þessari viku. Þetta breytir aðeins vikunni
          — ekki structure-safninu.
        </p>
      </div>

      <div className="space-y-3">
        {slots.map((slot, i) => {
          const pool = byCategory.get(slot.category) ?? [];
          const chosen = slot.structure_source_id
            ? bySource.get(slot.structure_source_id)
            : null;
          // The saved pick might not be in the current pool (e.g. ALL-level);
          // make sure it's still selectable.
          const inPool = pool.some(
            (s) => s.source_id === slot.structure_source_id,
          );
          return (
            <div key={i} className="rounded-lg border border-border bg-muted p-4">
              {slot.day && (
                <div className="mb-3 border-b border-border pb-2">
                  <span className="text-sm font-semibold">{slot.day}</span>
                  {slot.focus && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {slot.focus}
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="w-8 font-mono text-sm text-muted-foreground">
                  {i + 1}
                </span>
                <select
                  value={slot.category}
                  onChange={(e) =>
                    setSlot(i, {
                      category: e.target.value,
                      structure_source_id: "",
                      name: "",
                    })
                  }
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {Object.keys(CATEGORY_LABEL).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
                <select
                  value={slot.structure_source_id}
                  onChange={(e) => pickStructure(i, e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">— veldu structure ({pool.length}) —</option>
                  {!inPool && slot.structure_source_id && (
                    <option value={slot.structure_source_id}>
                      {slot.name} (núverandi)
                    </option>
                  )}
                  {pool.map((s) => (
                    <option key={s.source_id} value={s.source_id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {chosen?.preview && (
                <pre className="mt-3 whitespace-pre-wrap pl-11 font-sans text-xs leading-relaxed text-muted-foreground">
                  {chosen.preview}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className="mt-4 text-sm text-red-400">{error}</div>}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Vista…" : "Vista breytingar"}
        </button>
        <Link
          href={`/app/programs/weeks/${planId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Hætta við
        </Link>
      </div>
    </main>
  );
}
