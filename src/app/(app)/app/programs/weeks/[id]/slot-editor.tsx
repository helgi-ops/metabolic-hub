"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABEL } from "@/lib/programs/ui";
import { getStructureOptions, updateWeekSlots, type StructureOption } from "./actions";

export type RawSlot = {
  slot: number;
  category: string;
  structure_source_id: string;
  name: string;
  day?: string;
  focus?: string;
  preview?: string;
};

// In-place editor for one day of a saved week: change category, swap the setup
// (searchable list for this level + category) and tweak the exercises for this
// week only. Saves the whole slots array back with updateWeekSlots.
export function SlotEditor({
  planId,
  level,
  slots,
  index,
  currentText,
  libraryPreview,
  lastUsed,
  onClose,
}: {
  planId: string;
  level: string;
  slots: RawSlot[];
  index: number;
  currentText: string;
  libraryPreview: string;
  lastUsed: Record<string, string>; // source_id → label ("Fyrir 9 dögum")
  onClose: () => void;
}) {
  const router = useRouter();
  const orig = slots[index];
  const [category, setCategory] = useState(orig.category);
  const [sourceId, setSourceId] = useState(orig.structure_source_id);
  const [name, setName] = useState(orig.name);
  const [libText, setLibText] = useState(libraryPreview);
  const [text, setText] = useState(currentText);
  const [options, setOptions] = useState<StructureOption[] | null>(null);
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Load the setups for this category whenever the picker is opened/changed.
  useEffect(() => {
    if (!picking) return;
    let cancelled = false;
    getStructureOptions(level, category).then((o) => {
      if (!cancelled) setOptions(o);
    });
    return () => {
      cancelled = true;
    };
  }, [picking, level, category]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (options ?? []).filter(
      (o) => !q || o.name.toLowerCase().includes(q) || o.preview.toLowerCase().includes(q),
    );
  }, [options, query]);

  function choose(o: StructureOption) {
    setSourceId(o.source_id);
    setName(o.name);
    setLibText(o.preview);
    setText(o.preview);
    setPicking(false);
  }

  function save() {
    setError(null);
    startSaving(async () => {
      const next = slots.map((s, i) => {
        if (i !== index) return s;
        const { preview: _p, focus, ...rest } = s;
        void _p;
        const updated: RawSlot = {
          ...rest,
          category,
          structure_source_id: sourceId,
          name,
          // The focus text describes the original category — drop it if changed.
          ...(category === orig.category && focus ? { focus } : {}),
          // Keep the exercise text only when it differs from the library version.
          ...(text.trim() && text !== libText ? { preview: text } : {}),
        };
        return updated;
      });
      const res = await updateWeekSlots(planId, next);
      if (!res.ok) {
        setError(res.error ?? "Tókst ekki að vista.");
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const changed =
    category !== orig.category || sourceId !== orig.structure_source_id || text !== currentText;

  return (
    <div className="space-y-4">
      {/* Category + setup */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted-foreground">Flokkur</span>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setOptions(null);
              setPicking(true);
            }}
            className="h-10 rounded-lg border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {Object.keys(CATEGORY_LABEL).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <div className="min-w-[240px] flex-1">
          <span className="mb-1.5 block text-xs text-muted-foreground">Uppsetning</span>
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 text-left text-sm hover:border-accent"
          >
            <span className="truncate font-medium">{name}</span>
            <span className="shrink-0 text-xs text-orange-400">{picking ? "Loka" : "Skipta út"}</span>
          </button>
        </div>
      </div>

      {picking && (
        <div className="rounded-xl border border-border bg-background/60">
          <div className="border-b border-border p-3">
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Leita í ${CATEGORY_LABEL[category] ?? category} · ${level}…`}
              aria-label="Leita að uppsetningu"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <ul className="max-h-[360px] space-y-1 overflow-y-auto p-2">
            {options === null && <li className="p-3 text-sm text-muted-foreground">Sæki uppsetningar…</li>}
            {options !== null && filtered.length === 0 && (
              <li className="p-3 text-sm text-muted-foreground">Ekkert fannst.</li>
            )}
            {filtered.map((o) => {
              const used = lastUsed[o.source_id];
              const selected = o.source_id === sourceId;
              return (
                <li key={o.source_id}>
                  <button
                    type="button"
                    onClick={() => choose(o)}
                    className={`block w-full rounded-lg p-3 text-left hover:bg-muted ${
                      selected ? "bg-accent/10 ring-1 ring-accent" : ""
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">{o.name}</span>
                      <span className={`shrink-0 text-[11px] ${used ? "text-muted-foreground" : "text-emerald-400"}`}>
                        {used ?? "Ekki notað nýlega"}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {o.preview.split("\n").find((l) => l.trim())}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Exercises */}
      <label className="block">
        <span className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>Æfingar — breytir aðeins þessari viku, ekki safninu</span>
          {text !== libText && (
            <button type="button" onClick={() => setText(libText)} className="hover:text-foreground">
              ↺ Upprunalegar æfingar
            </button>
          )}
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.max(8, text.split("\n").length + 1)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-sans text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !changed}
          className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Vista…" : "Vista breytingu"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          Hætta við
        </button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  );
}
