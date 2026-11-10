"use client";

import { useState } from "react";
import Link from "next/link";
import type { ParsedPreview } from "@/lib/programs/parse";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "@/lib/programs/ui";

export type DayView = {
  short: string; // "Mán"
  long: string; // "Mánudagur"
  date: string; // "9. nóv"
  category: string;
  focus: string; // short focus label
  name: string;
  parsed: ParsedPreview;
  edited: boolean; // exercises changed for this week only
  compare: { level: string; name: string; parsed: ParsedPreview | null; current: boolean }[];
};

export function WeekView({
  days,
  initialDay,
  editHref,
}: {
  days: DayView[];
  initialDay: number;
  editHref: string | null;
}) {
  const [active, setActive] = useState(Math.min(initialDay, Math.max(0, days.length - 1)));
  const [compare, setCompare] = useState(false);
  const day = days[active];
  if (!day) return null;

  const mix = Object.entries(
    days.reduce<Record<string, number>>((acc, d) => {
      acc[d.category] = (acc[d.category] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([c, n]) => `${n}× ${CATEGORY_LABEL[c] ?? c}`)
    .join(" · ");

  return (
    <div className="no-print space-y-5">
      {/* Day strip */}
      <nav
        aria-label="Dagar"
        className="sticky top-0 z-10 grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-muted/95 p-2 backdrop-blur sm:grid-cols-3 lg:grid-cols-6"
      >
        {days.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={active === i}
            className={`flex min-h-[56px] flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition ${
              active === i
                ? "border-accent bg-background"
                : "border-transparent hover:bg-background/60"
            }`}
          >
            <span className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {d.short} · {d.date}
              </span>
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ background: CATEGORY_COLOR[d.category] ?? "#a3a3a3" }}
              />
            </span>
            <span className="truncate text-[13px] font-semibold">{d.name}</span>
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">
          {day.long} <span className="font-medium text-muted-foreground">· {day.date}</span>
        </h2>
        <button
          type="button"
          onClick={() => setCompare((v) => !v)}
          aria-pressed={compare}
          className={`h-9 rounded-lg border px-3 text-sm transition ${
            compare
              ? "border-accent bg-accent/10 text-orange-400"
              : "border-border bg-muted text-foreground hover:border-accent"
          }`}
        >
          Bera saman MB1 · MB2 · MB3
        </button>
      </div>

      {compare ? (
        <div className="grid gap-3 md:grid-cols-3">
          {day.compare.map((c) => (
            <article
              key={c.level}
              className={`flex flex-col gap-3 rounded-xl border bg-muted p-4 ${
                c.current ? "border-accent" : "border-border"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold">{c.level}</span>
                <span className="truncate text-xs text-muted-foreground">{c.name}</span>
              </div>
              {c.parsed ? (
                <Exercises parsed={c.parsed} compact />
              ) : (
                <p className="text-sm text-muted-foreground">Engin {c.level} útgáfa af þessum tíma.</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <article className="space-y-5 rounded-xl border border-border bg-muted p-5 sm:p-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryTag category={day.category} />
              {day.focus && <span className="text-sm text-muted-foreground">{day.focus}</span>}
            </div>
            <h3 className="text-2xl font-bold">{day.name}</h3>
            {day.parsed.intro && (
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{day.parsed.intro}</p>
            )}
          </div>
          <Exercises parsed={day.parsed} />
          {(day.edited || editHref) && (
            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
              {day.edited && (
                <span className="text-amber-300">Æfingum breytt fyrir þessa viku</span>
              )}
              {editHref && (
                <Link href={editHref} className="hover:text-foreground">
                  Skipta út eða breyta tíma
                </Link>
              )}
            </div>
          )}
        </article>
      )}

      {/* Week overview */}
      <section className="rounded-xl border border-border bg-muted px-5 py-4">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span className="font-semibold">Vikan í heild</span>
          <span className="text-muted-foreground">{mix}</span>
        </div>
        <div aria-hidden="true" className="mt-2.5 flex h-2 gap-[3px]">
          {days.map((d, i) => (
            <span
              key={i}
              className="flex-1 rounded-[3px]"
              style={{
                background: CATEGORY_COLOR[d.category] ?? "#a3a3a3",
                opacity: i === active ? 1 : 0.45,
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export function Exercises({ parsed, compact = false }: { parsed: ParsedPreview; compact?: boolean }) {
  if (!parsed.blocks.length) {
    return compact && parsed.intro ? (
      <p className="text-sm text-muted-foreground">{parsed.intro}</p>
    ) : null;
  }
  return (
    <div className={compact ? "space-y-3" : "grid gap-3 md:grid-cols-2 lg:grid-cols-3"}>
      {parsed.blocks.map((b, i) =>
        b.note ? (
          <p
            key={i}
            className={`text-sm text-muted-foreground ${compact ? "" : "md:col-span-2 lg:col-span-3"}`}
          >
            {b.note}
          </p>
        ) : (
          <section
            key={i}
            className={compact ? "" : "overflow-hidden rounded-lg border border-border bg-background/60"}
          >
            {(b.title || b.time) && (
              <div
                className={`flex justify-between gap-2 text-[13px] ${
                  compact ? "pb-1 text-muted-foreground" : "border-b border-border px-3.5 py-2.5"
                }`}
              >
                <span className="font-semibold">{b.title}</span>
                {b.time && <span className="font-mono text-orange-400">{b.time}</span>}
              </div>
            )}
            <ul className={compact ? "" : "px-3.5 py-1.5"}>
              {b.rows.map((r, j) => (
                <li
                  key={j}
                  className="flex justify-between gap-3 border-b border-border/50 py-2 text-sm last:border-0"
                >
                  <span>
                    {r.key && (
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{r.key}</span>
                    )}
                    {r.exercise}
                  </span>
                  {r.reps && (
                    <span className="shrink-0 text-right font-mono text-[13px] text-foreground/85">
                      {r.reps}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

export function CategoryTag({ category }: { category: string }) {
  const color = CATEGORY_COLOR[category] ?? "#a3a3a3";
  return (
    <span
      className="print-accent w-fit rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-widest uppercase"
      style={{ color, borderColor: `${color}55` }}
    >
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}
