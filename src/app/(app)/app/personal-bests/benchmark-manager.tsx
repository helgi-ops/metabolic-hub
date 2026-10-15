"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBenchmark, deleteBenchmark } from "./actions";

type CustomBenchmark = { id: string; name: string; unit: string };

const CATEGORY_OPTIONS = [
  { value: "lyfta", label: "Lyftur" },
  { value: "likamsthyngd", label: "Líkamsþyngd" },
  { value: "thol", label: "Þol" },
  { value: "timataka", label: "Tímataka (WOD)" },
];

const UNIT_OPTIONS = [
  { value: "kg", label: "kg" },
  { value: "reps", label: "reps" },
  { value: "sek", label: "Tími (mm:ss)" },
  { value: "kcal", label: "kcal" },
  { value: "m", label: "Metrar" },
];

// Coach/admin tool on Mín met: create station-scoped benchmark exercises that
// then appear in the PB form, the chips and the station leaderboards. Shown only
// to coaches with Program Builder access (and admins) — gated by the page.
export function BenchmarkManager({
  custom,
}: {
  custom: CustomBenchmark[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("lyfta");
  const [unit, setUnit] = useState("kg");
  const [higherIsBetter, setHigherIsBetter] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeUnit(u: string) {
    setUnit(u);
    // Time: faster (lower) is better; everything else: higher is better.
    setHigherIsBetter(u !== "sek");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Sláðu inn nafn.");
      return;
    }
    startTransition(async () => {
      const res = await createBenchmark({
        name,
        category,
        unit,
        higherIsBetter,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setName("");
      router.refresh();
    });
  }

  const input =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <div className="mb-8 rounded-lg border border-border bg-muted p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="font-semibold">🏋️ Eigin æfingar stöðvarinnar</span>
        <span className="text-xs text-muted-foreground">
          {open ? "Loka" : "Opna"} {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-xs text-muted-foreground">
            Búðu til æfingu/próf fyrir þína stöð. Hún birtist í „Skrá nýtt met",
            topplistanum og hjá iðkendum á þinni stöð — ekki öðrum stöðvum.
          </p>

          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm text-muted-foreground">
                Nafn æfingar
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="t.d. Hnébeygja á kassa (1RM)"
                className={input}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">
                Flokkur
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={input}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">
                Eining
              </span>
              <select
                value={unit}
                onChange={(e) => changeUnit(e.target.value)}
                className={input}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm text-muted-foreground">
                Hvað telst betra?
              </span>
              <select
                value={higherIsBetter ? "high" : "low"}
                onChange={(e) => setHigherIsBetter(e.target.value === "high")}
                className={input}
              >
                <option value="high">Meira / hærra er betra (t.d. kg, reps)</option>
                <option value="low">Minna / hraðar er betra (t.d. tími)</option>
              </select>
            </label>
            {error && (
              <div className="text-sm text-red-400 sm:col-span-2">{error}</div>
            )}
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Vista…" : "Búa til æfingu"}
              </button>
            </div>
          </form>

          {custom.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Eigin æfingar ({custom.length})
              </h3>
              <ul className="divide-y divide-border rounded-md border border-border">
                {custom.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {b.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({b.unit})
                      </span>
                    </span>
                    <DeleteBenchmarkButton id={b.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeleteBenchmarkButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteBenchmark(id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-2 text-xs">
        {error && <span className="text-red-400">{error}</span>}
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded border border-red-400 bg-red-500/15 px-2 py-0.5 text-red-400 hover:bg-red-500/25 disabled:opacity-50"
        >
          {pending ? "Eyði…" : "Já, eyða"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground"
        >
          Hætta við
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="shrink-0 text-xs text-muted-foreground hover:text-red-400"
    >
      Eyða
    </button>
  );
}
