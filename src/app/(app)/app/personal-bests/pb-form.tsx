"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMeasure, isTimeUnit, parseTimeToSeconds } from "@/lib/format";

type Benchmark = {
  id: string;
  name: string;
  unit: string;
  category: string;
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function PbForm({
  userId,
  benchmarks,
  initialBenchmarkId,
  bests = {},
  onSaved,
}: {
  userId: string;
  benchmarks: Benchmark[];
  initialBenchmarkId?: string;
  bests?: Record<string, number>; // current best per benchmark, for context
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [benchmarkId, setBenchmarkId] = useState(initialBenchmarkId ?? benchmarks[0]?.id ?? "");
  const [value, setValue] = useState("");
  const [achievedOn, setAchievedOn] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = benchmarks.find((b) => b.id === benchmarkId);
  const isTime = selected ? isTimeUnit(selected.unit) : false;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const num = isTime
      ? parseTimeToSeconds(value)
      : parseFloat(value.replace(",", "."));
    if (!benchmarkId || num == null || Number.isNaN(num)) {
      setError(
        isTime
          ? "Veldu æfingu og sláðu inn tíma (mm:ss)."
          : "Veldu æfingu og sláðu inn gildi.",
      );
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("personal_bests").insert({
      user_id: userId,
      benchmark_id: benchmarkId,
      value: num,
      unit: selected?.unit ?? "",
      achieved_on: achievedOn,
      notes: notes.trim() || null,
    });
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }
    setValue("");
    setNotes("");
    setSaving(false);
    router.refresh();
    onSaved?.();
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm text-muted-foreground">Æfing</span>
          <select
            value={benchmarkId}
            onChange={(e) => setBenchmarkId(e.target.value)}
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-base [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {benchmarks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">
            {isTime ? "Tími (mm:ss)" : `Gildi ${selected ? `(${selected.unit})` : ""}`}
          </span>
          <input
            inputMode={isTime ? "text" : "decimal"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isTime ? "t.d. 14:30" : "t.d. 120"}
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-base [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">
            Dagsetning
          </span>
          <input
            type="date"
            value={achievedOn}
            onChange={(e) => setAchievedOn(e.target.value)}
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-base [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm text-muted-foreground">
            Athugasemd (valfrjálst)
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="t.d. nýtt PB eftir 6 vikna prógramm"
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-base [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
      </div>
      {selected && bests[selected.id] != null && (
        <p className="mt-3 text-sm text-muted-foreground">
          Núverandi met:{" "}
          <span className="text-foreground">{formatMeasure(bests[selected.id], selected.unit)}</span>
        </p>
      )}
      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
      <button
        type="submit"
        disabled={saving}
        className="mt-4 h-12 w-full rounded-xl bg-accent text-base font-bold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Vista…" : "Skrá met"}
      </button>
    </form>
  );
}
