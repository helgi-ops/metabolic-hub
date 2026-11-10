"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Option = { value: string; label: string };

// One filter bar for the setups library: search + category/level/type selects,
// a "hide recently used" toggle and a grid/list switch. Everything lives in the
// URL so the server page does the filtering and links stay shareable.
export function LibraryFilters({
  categories,
  levels,
  families,
}: {
  categories: Option[];
  levels: Option[];
  families: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page"); // any filter change starts from page 1
    const s = next.toString();
    startTransition(() => {
      router.replace(s ? `${pathname}?${s}#safn` : `${pathname}#safn`, {
        scroll: false,
      });
    });
  }

  const fresh = params.get("fresh") === "1";
  const view = params.get("view") === "list" ? "list" : "grid";

  const selectCls =
    "h-10 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <div
      className={`sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/95 p-3 backdrop-blur transition ${
        pending ? "opacity-70" : ""
      }`}
    >
      <form
        className="min-w-[220px] flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() || null });
        }}
      >
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value) update({ q: null });
          }}
          placeholder="Leita – nafn, æfing, áhald… (Enter)"
          aria-label="Leita í uppsetningum"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </form>
      <select
        aria-label="Flokkur"
        value={params.get("category") ?? ""}
        onChange={(e) => update({ category: e.target.value || null })}
        className={selectCls}
      >
        <option value="">Allir flokkar</option>
        {categories.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Stig"
        value={params.get("level") ?? ""}
        onChange={(e) => update({ level: e.target.value || null })}
        className={selectCls}
      >
        <option value="">Öll stig</option>
        {levels.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Tegund"
        value={params.get("family") ?? ""}
        onChange={(e) => update({ family: e.target.value || null })}
        className={selectCls}
      >
        <option value="">Allar tegundir</option>
        {families.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-pressed={fresh}
        onClick={() => update({ fresh: fresh ? null : "1" })}
        className={`h-10 rounded-lg border px-3 text-sm transition ${
          fresh
            ? "border-accent bg-accent/10 text-orange-400"
            : "border-border bg-background text-muted-foreground hover:text-foreground"
        }`}
      >
        Fela nýlega notað
      </button>
      <div
        role="group"
        aria-label="Útlit"
        className="flex overflow-hidden rounded-lg border border-border"
      >
        <button
          type="button"
          aria-label="Spjöld"
          aria-pressed={view === "grid"}
          onClick={() => update({ view: null })}
          className={`grid h-10 w-10 place-items-center ${
            view === "grid" ? "bg-border text-foreground" : "bg-background text-muted-foreground"
          }`}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="7" height="7" />
            <rect x="13" y="4" width="7" height="7" />
            <rect x="4" y="13" width="7" height="7" />
            <rect x="13" y="13" width="7" height="7" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Listi"
          aria-pressed={view === "list"}
          onClick={() => update({ view: "list" })}
          className={`grid h-10 w-10 place-items-center ${
            view === "list" ? "bg-border text-foreground" : "bg-background text-muted-foreground"
          }`}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
