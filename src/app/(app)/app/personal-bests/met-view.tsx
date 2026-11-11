"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMeasure } from "@/lib/format";
import { ProgressChart } from "./progress-chart";
import { DeletePbButton } from "./delete-pb-button";
import { PbForm } from "./pb-form";

export type TestCard = {
  id: string;
  name: string;
  category: string;
  unit: string;
  higherIsBetter: boolean;
  best: { value: number; on: string } | null;
  points: { achieved_on: string; value: number }[]; // ascending
  entries: { id: string; value: number; on: string; notes: string | null }[]; // newest first
  isNew: boolean;
  rank: number | null;
  rankOf: number | null;
};

export type ExBest = { exercise: string; best_value: number; achieved_on: string; isNew: boolean };

const CAT_LABEL: Record<string, string> = {
  lyfta: "Lyftur",
  likamsthyngd: "Líkamsþyngd",
  thol: "Þol",
  timataka: "Tímatökur",
};
const MONTHS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];
const nice = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
};

// Change from first to best, signed so that "better" reads positive.
function deltaText(t: TestCard): string {
  if (!t.best || t.points.length < 2) return "";
  const first = t.points[0].value;
  const diff = t.best.value - first;
  if (!diff) return "";
  const better = t.higherIsBetter ? diff > 0 : diff < 0;
  if (!better) return "";
  const s = formatMeasure(Math.round(Math.abs(diff) * 100) / 100, t.unit);
  return `${t.higherIsBetter ? "+" : "−"}${s}`;
}

function sparkPath(t: TestCard): string {
  const pts = t.points;
  if (pts.length < 2) return "";
  const vals = pts.map((p) => p.value);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  return pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * 100;
      let y = mx === mn ? 14 : 24 - ((p.value - mn) / (mx - mn)) * 20;
      if (!t.higherIsBetter) y = 28 - y;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function MetView({
  userId,
  tests,
  exBests,
  shareToggle,
}: {
  userId: string;
  tests: TestCard[];
  exBests: ExBest[];
  shareToggle: React.ReactNode;
}) {
  const tested = tests.filter((t) => t.best);
  const [tab, setTab] = useState<"tests" | "ex">(tested.length || !exBests.length ? "tests" : "ex");
  const [cat, setCat] = useState<string>("");
  const [selId, setSelId] = useState<string | null>(tested[0]?.id ?? tests[0]?.id ?? null);
  const [adding, setAdding] = useState<string | null>(null); // benchmark id for the sheet
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!adding) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAdding(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [adding]);

  const cats = [...new Set(tests.map((t) => t.category))];
  // Tested first (newest best first), then untested ones as "Prófa" cards.
  const visible = tests
    .filter((t) => !cat || t.category === cat)
    .sort((a, b) => (a.best ? 0 : 1) - (b.best ? 0 : 1) || (b.best?.on ?? "").localeCompare(a.best?.on ?? ""));
  const sel = tests.find((t) => t.id === selId) ?? null;
  const exList = exBests.filter((e) => !q.trim() || e.exercise.toLowerCase().includes(q.trim().toLowerCase()));

  const seg = (on: boolean) =>
    `flex h-9 items-center rounded-md px-3.5 text-[13px] font-semibold transition ${
      on ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  function pick(id: string) {
    setSelId(id);
    if (window.matchMedia("(max-width: 1023px)").matches)
      document.getElementById("met-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Tegund meta" className="flex gap-1 rounded-lg border border-border bg-muted p-[3px]">
          <button type="button" role="tab" aria-selected={tab === "tests"} onClick={() => setTab("tests")} className={seg(tab === "tests")}>
            Próf ({tested.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === "ex"} onClick={() => setTab("ex")} className={seg(tab === "ex")}>
            Æfingamet ({exBests.length})
          </button>
        </div>
        {tab === "tests" && cats.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {["", ...cats].map((c) => (
              <button
                key={c || "all"}
                type="button"
                onClick={() => setCat(c)}
                aria-pressed={cat === c}
                className={`h-8 rounded-full border px-3 text-[13px] transition ${
                  cat === c
                    ? "border-accent bg-accent/15 text-orange-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {c ? (CAT_LABEL[c] ?? c) : "Allt"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          {tab === "tests" ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {visible.map((t) => {
                const on = t.id === selId;
                const d = deltaText(t);
                const path = sparkPath(t);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pick(t.id)}
                    aria-pressed={on}
                    className={`flex min-w-0 flex-col gap-2 rounded-xl border bg-muted p-3.5 text-left transition ${
                      t.best ? "" : "border-dashed opacity-70"
                    } ${on ? "border-accent" : "border-border hover:border-muted-foreground/50"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] leading-snug text-foreground/85">{t.name}</span>
                      {t.isNew && <span className="shrink-0 text-[11px] font-semibold text-amber-300">Nýtt</span>}
                      {!t.best && <span className="shrink-0 text-[11px] font-semibold text-orange-400">Prófa</span>}
                    </div>
                    <div className="text-2xl leading-tight font-bold tabular-nums">
                      {t.best ? formatMeasure(t.best.value, t.unit) : "—"}
                    </div>
                    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
                      {path && (
                        <path
                          d={path}
                          fill="none"
                          stroke={on ? "var(--accent)" : "var(--muted-foreground)"}
                          strokeOpacity={on ? 1 : 0.5}
                          strokeWidth="2"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </svg>
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{t.best ? nice(t.best.on) : "Ekki prófað"}</span>
                      {d && <span className="text-emerald-400">{d}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Þyngsta þyngd sem þú hefur notað í hverri æfingu — skráist sjálfkrafa úr æfingadagbókinni.
              </p>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Leita að æfingu…"
                aria-label="Leita að æfingu"
                className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {exList.length === 0 ? (
                <p className="rounded-xl border border-border bg-muted p-5 text-sm text-muted-foreground">
                  {exBests.length ? "Ekkert fannst." : "Engin æfingamet enn — þau koma þegar þú skráir þyngdir í æfingadagbókina."}
                </p>
              ) : (
                <ul className="divide-y divide-border/60 rounded-xl border border-border bg-muted">
                  {exList.map((e) => (
                    <li key={e.exercise} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">
                          {e.exercise}
                          {e.isNew && <span className="ml-1.5 text-[11px] font-semibold text-amber-300">Nýtt</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{nice(e.achieved_on)}</div>
                      </div>
                      <span className="font-mono font-bold tabular-nums">{Number(e.best_value)} kg</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Selected test + sharing */}
        <aside id="met-detail" className="mt-4 min-w-0 scroll-mt-4 space-y-4 lg:sticky lg:top-6 lg:mt-0">
          {tab === "tests" && sel && (
            <section className="space-y-3 rounded-2xl border border-accent bg-muted p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">{sel.name}</h2>
                <span className="text-xs text-muted-foreground">{CAT_LABEL[sel.category] ?? sel.category}</span>
              </div>
              <div className="text-4xl leading-none font-bold tabular-nums">
                {sel.best ? formatMeasure(sel.best.value, sel.unit) : "—"}
              </div>
              {sel.points.length >= 2 && (
                <ProgressChart
                  name="Framvinda"
                  unit={sel.unit}
                  higherIsBetter={sel.higherIsBetter}
                  points={sel.points}
                />
              )}
              <div className="flex flex-wrap gap-2 text-[13px]">
                {deltaText(sel) && (
                  <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-emerald-400">
                    {deltaText(sel)} frá fyrstu mælingu
                  </span>
                )}
                {sel.rank && (
                  <Link
                    href={`/app/leaderboard?met=${sel.id}`}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-foreground/85 hover:border-accent"
                  >
                    #{sel.rank}
                    {sel.rankOf ? ` af ${sel.rankOf}` : ""} á stöðinni →
                  </Link>
                )}
              </div>
              {sel.entries.length > 0 ? (
                <ul className="border-t border-border pt-1">
                  {sel.entries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 border-b border-border/50 py-2 text-[13px] last:border-0">
                      <span className="min-w-0">
                        <span className="text-muted-foreground">{nice(e.on)}</span>
                        {e.notes && <span className="block truncate text-xs text-muted-foreground">{e.notes}</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="font-mono">{formatMeasure(e.value, sel.unit)}</span>
                        <DeletePbButton id={e.id} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Ekkert skráð í þessu prófi enn.</p>
              )}
              <button
                type="button"
                onClick={() => setAdding(sel.id)}
                className="h-11 w-full rounded-xl border border-border bg-background font-semibold hover:border-accent"
              >
                + Nýtt met í {sel.name}
              </button>
            </section>
          )}
          {shareToggle}
        </aside>
      </div>

      {/* Header button lives in the page; it opens this via a custom event. */}
      <OpenAddListener onOpen={() => setAdding(selId ?? tests[0]?.id ?? "")} />

      {adding !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          onClick={() => setAdding(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Skrá met"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-muted p-5 sm:max-w-md sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Skrá met</h2>
              <button type="button" onClick={() => setAdding(null)} className="h-9 px-2 text-sm text-muted-foreground hover:text-foreground">
                Loka
              </button>
            </div>
            <PbForm
              userId={userId}
              benchmarks={tests.map((t) => ({ id: t.id, name: t.name, unit: t.unit, category: t.category }))}
              initialBenchmarkId={adding || undefined}
              bests={Object.fromEntries(tests.filter((t) => t.best).map((t) => [t.id, t.best!.value]))}
              onSaved={() => setAdding(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}

export const OPEN_ADD_PB = "pb:open-add";

function OpenAddListener({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    const h = () => onOpen();
    window.addEventListener(OPEN_ADD_PB, h);
    return () => window.removeEventListener(OPEN_ADD_PB, h);
  }, [onOpen]);
  return null;
}

export function AddPbButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_ADD_PB))}
      className="h-11 rounded-xl bg-accent px-5 text-[15px] font-bold text-accent-foreground hover:opacity-90"
    >
      + Skrá met
    </button>
  );
}
