"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Structure = {
  id: string;
  source_id: string;
  name: string;
  category: string;
  level: string; // "MB1" | "MB2" | "MB3" | "ALL"
  preview: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  strength: "Strength",
  power_strength: "Power/Strength",
  power: "Power",
  endurance: "Endurance",
  burn: "Burn",
};

const LEVELS = ["MB1", "MB2", "MB3"] as const;

// A typical Metabolic week: 6 sessions across the categories.
const DEFAULT_SLOT_CATEGORIES = [
  "strength",
  "power",
  "power_strength",
  "endurance",
  "burn",
  "strength",
];

// 4-week periodization cycle (authoritative spec). Each day has a focus; the slot
// categories differ between two variants ("A" = Power/Strength, "B" = Strength),
// encoded explicitly because the variant pattern doesn't follow from the focus.
const FOCUS = {
  powerLow: "Power (low force / high velocity) og Strength endurance (12-20 reps)",
  powerMod: "Power (moderate force / high velocity) og Hypertrophy zone (8-12 reps)",
  powerHigh: "Power (high force / high velocity) og Strength zone (below 6 reps)",
  endSimilar:
    "Endurance – stuttur til miðlungs vinnutími með svipaðan work:rest ratio",
  endLonger:
    "Endurance – stuttur til miðlungs vinnutími með svipaðan eða lengri hvíldartíma",
  endShort:
    "Endurance – hvíldartíminn styttri en vinnutími, eða langur vinnutími",
  burn: "Burn tími – work capacity dagur",
} as const;

type CycleDay = { day: string; focus: string };
type CyclePlan = { days: CycleDay[]; A: string[]; B: string[] };

const DAYS = [
  "Mánudagur",
  "Þriðjudagur",
  "Miðvikudagur",
  "Fimmtudagur",
  "Föstudagur",
  "Laugardagur",
];

const PERIODIZATION: Record<string, CyclePlan> = {
  "Vika 1": {
    days: [
      { day: DAYS[0], focus: FOCUS.powerLow },
      { day: DAYS[1], focus: FOCUS.endSimilar },
      { day: DAYS[2], focus: FOCUS.powerMod },
      { day: DAYS[3], focus: FOCUS.endShort },
      { day: DAYS[4], focus: FOCUS.powerHigh },
      { day: DAYS[5], focus: FOCUS.burn },
    ],
    A: ["power_strength", "endurance", "power_strength", "endurance", "power_strength", "burn"],
    B: ["strength", "endurance", "strength", "endurance", "power_strength", "burn"],
  },
  "Vika 2": {
    days: [
      { day: DAYS[0], focus: FOCUS.powerLow },
      { day: DAYS[1], focus: FOCUS.endLonger },
      { day: DAYS[2], focus: FOCUS.burn },
      { day: DAYS[3], focus: FOCUS.powerMod },
      { day: DAYS[4], focus: FOCUS.endShort },
      { day: DAYS[5], focus: FOCUS.powerHigh },
    ],
    A: ["power_strength", "endurance", "burn", "power_strength", "endurance", "power_strength"],
    B: ["strength", "endurance", "burn", "strength", "endurance", "power_strength"],
  },
  "Vika 3": {
    days: [
      { day: DAYS[0], focus: FOCUS.endLonger },
      { day: DAYS[1], focus: FOCUS.powerLow },
      { day: DAYS[2], focus: FOCUS.powerMod },
      { day: DAYS[3], focus: FOCUS.endShort },
      { day: DAYS[4], focus: FOCUS.powerHigh },
      { day: DAYS[5], focus: FOCUS.burn },
    ],
    A: ["endurance", "power_strength", "power_strength", "endurance", "power_strength", "burn"],
    B: ["endurance", "strength", "power_strength", "endurance", "power_strength", "burn"],
  },
  // Vika 4 mirrors Vika 2.
  "Vika 4": {
    days: [
      { day: DAYS[0], focus: FOCUS.powerLow },
      { day: DAYS[1], focus: FOCUS.endLonger },
      { day: DAYS[2], focus: FOCUS.burn },
      { day: DAYS[3], focus: FOCUS.powerMod },
      { day: DAYS[4], focus: FOCUS.endShort },
      { day: DAYS[5], focus: FOCUS.powerHigh },
    ],
    A: ["power_strength", "endurance", "burn", "power_strength", "endurance", "power_strength"],
    B: ["strength", "endurance", "burn", "strength", "endurance", "power_strength"],
  },
};
const CYCLE_WEEKS = ["Vika 1", "Vika 2", "Vika 3", "Vika 4"];
const VARIANTS = [
  { key: "A", label: "Power/Strength" },
  { key: "B", label: "Strength" },
] as const;

type Slot = { category: string; structureId: string };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function BuilderClient({
  userId,
  stationId,
  structures,
}: {
  userId: string;
  stationId: string | null;
  structures: Structure[];
}) {
  const router = useRouter();
  const byId = useMemo(
    () => new Map(structures.map((s) => [s.id, s])),
    [structures],
  );

  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("MB1");

  // Only structures for the selected level (plus cross-level "ALL" ones), grouped
  // by category. Recomputes when the level changes so L1/L2/L3 never mix.
  const byCategory = useMemo(() => {
    const map = new Map<string, Structure[]>();
    for (const s of structures) {
      if (s.level !== level && s.level !== "ALL") continue;
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return map;
  }, [structures, level]);
  const [weekStarting, setWeekStarting] = useState(todayISO());
  const [slots, setSlots] = useState<Slot[]>(
    DEFAULT_SLOT_CATEGORIES.map((category) => ({ category, structureId: "" })),
  );
  // Editable exercise text per slot (per-week override). Empty = use the
  // structure's library preview. Kept index-aligned with `slots`.
  const [previews, setPreviews] = useState<string[]>(() =>
    DEFAULT_SLOT_CATEGORIES.map(() => ""),
  );
  const [cycleWeek, setCycleWeek] = useState("");
  const [variant, setVariant] = useState<"A" | "B">("A");
  const cycleDays = cycleWeek ? PERIODIZATION[cycleWeek].days : null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setSlot(i: number, patch: Partial<Slot>) {
    setSlots((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }

  function setPreview(i: number, text: string) {
    setPreviews((prev) => prev.map((p, idx) => (idx === i ? text : p)));
  }

  // Pick a structure for a slot and seed its editable text from the library, so
  // the coach can tweak individual exercises right here before saving.
  function pickStructure(i: number, structureId: string) {
    const st = structureId ? byId.get(structureId) : null;
    setSlot(i, { structureId });
    setPreview(i, st?.preview ?? "");
  }

  function changeLevel(next: (typeof LEVELS)[number]) {
    setLevel(next);
    // Picked structures were for the previous level — clear them and their text.
    setSlots((prev) => prev.map((s) => ({ ...s, structureId: "" })));
    setPreviews((prev) => prev.map(() => ""));
  }

  function applyCycle(week: string, v: "A" | "B" = variant) {
    setCycleWeek(week);
    setVariant(v);
    if (!week) {
      // Back to a standalone week.
      setSlots(
        DEFAULT_SLOT_CATEGORIES.map((category) => ({
          category,
          structureId: "",
        })),
      );
      setPreviews(DEFAULT_SLOT_CATEGORIES.map(() => ""));
      return;
    }
    // Fill the 6 slot categories from the chosen variant's pattern.
    setSlots(
      PERIODIZATION[week][v].map((category) => ({ category, structureId: "" })),
    );
    setPreviews(PERIODIZATION[week][v].map(() => ""));
  }

  function changeVariant(v: "A" | "B") {
    if (cycleWeek) applyCycle(cycleWeek, v);
    else setVariant(v);
  }

  function randomizeSlot(i: number) {
    const pool = byCategory.get(slots[i].category) ?? [];
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSlot(i, { structureId: pick.id });
    setPreview(i, pick.preview ?? "");
  }

  function randomizeAll() {
    const picks = slots.map((s) => {
      const pool = byCategory.get(s.category) ?? [];
      return pool.length
        ? pool[Math.floor(Math.random() * pool.length)]
        : null;
    });
    setSlots((prev) =>
      prev.map((s, i) => ({ ...s, structureId: picks[i]?.id ?? "" })),
    );
    setPreviews(picks.map((p) => p?.preview ?? ""));
  }

  function clearAll() {
    setSlots((prev) => prev.map((s) => ({ ...s, structureId: "" })));
    setPreviews((prev) => prev.map(() => ""));
  }

  const filledCount = slots.filter((s) => s.structureId).length;

  async function save() {
    setError(null);
    if (filledCount === 0) {
      setError("Veldu að minnsta kosti eina æfingu áður en þú vistar.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const programs_json = slots
      .map((s, i) => {
        const st = byId.get(s.structureId);
        if (!st) return null;
        const cd = cycleDays?.[i];
        // Save the edited exercise text only when it differs from the library
        // preview, so untouched slots keep tracking the structure library.
        const edited = (previews[i] ?? "").trim();
        const lib = st.preview ?? "";
        return {
          slot: i + 1,
          category: s.category,
          structure_source_id: st.source_id,
          name: st.name,
          ...(cd ? { day: cd.day, focus: cd.focus } : {}),
          ...(edited && previews[i] !== lib ? { preview: previews[i] } : {}),
        };
      })
      .filter(Boolean);

    const defaultTitle = cycleWeek
      ? `Lota – ${cycleWeek} (${VARIANTS.find((v) => v.key === variant)?.label})`
      : null;

    const { error: insertError } = await supabase.from("weekly_plans").insert({
      owner_id: userId,
      station_id: stationId,
      title: title.trim() || defaultTitle,
      level,
      week_starting: weekStarting,
      programs_json,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }
    router.push("/app/programs");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <Link
          href="/app/programs"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Til baka í safnið
        </Link>
        <div className="mt-4 font-mono text-xs tracking-widest text-accent uppercase">
          Program Builder
        </div>
        <h1 className="mt-2 text-3xl font-bold">Smíða viku</h1>
        <p className="mt-2 text-muted-foreground">
          Veldu structure í hvern tíma vikunnar — og breyttu stökum æfingum
          beint ef þú vilt (það breytir aðeins vikunni, ekki safninu). Vistaðu
          þegar þú ert tilbúin(n).
        </p>
      </div>

      {/* Meta */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">Heiti</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="t.d. Vika 25 – MB2"
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">Stig</span>
          <select
            value={level}
            onChange={(e) =>
              changeLevel(e.target.value as (typeof LEVELS)[number])
            }
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">
            Vika hefst
          </span>
          <input
            type="date"
            value={weekStarting}
            onChange={(e) => setWeekStarting(e.target.value)}
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
      </div>

      {/* Periodization */}
      <div className="mb-6 rounded-lg border border-border bg-muted p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Periodization</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => applyCycle("")}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                !cycleWeek
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              Stök vika
            </button>
            {CYCLE_WEEKS.map((w) => (
              <button
                key={w}
                onClick={() => applyCycle(w)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  cycleWeek === w
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        {cycleWeek && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Útgáfa:</span>
            {VARIANTS.map((v) => (
              <button
                key={v.key}
                onClick={() => changeVariant(v.key)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  variant === v.key
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {cycleWeek
            ? `4ra vikna lota — flokkar dagana fyllast eftir mynstri ${cycleWeek} (${
                VARIANTS.find((v) => v.key === variant)?.label
              } útgáfa). Veldu structure í hvern dag.`
            : "Veldu viku úr 4ra vikna lotunni til að fá sjálfvirkt dag-mynstur og fókus, eða smíðaðu staka viku frjálst."}
        </p>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={randomizeAll}
          className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm hover:border-accent"
        >
          🎲 Randomize allt
        </button>
        <button
          onClick={clearAll}
          className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm hover:border-accent"
        >
          Hreinsa
        </button>
        <span className="ml-auto text-sm text-muted-foreground">
          {filledCount}/6 tímar valdir
        </span>
      </div>

      {/* Slots */}
      <div className="space-y-3">
        {slots.map((slot, i) => {
          const pool = byCategory.get(slot.category) ?? [];
          const chosen = slot.structureId ? byId.get(slot.structureId) : null;
          const cd = cycleDays?.[i];
          return (
            <div
              key={i}
              className="rounded-lg border border-border bg-muted p-4"
            >
              {cd && (
                <div className="mb-3 border-b border-border pb-2">
                  <span className="text-sm font-semibold">{cd.day}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {cd.focus}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground w-8">
                  {i + 1}
                </span>
                <select
                  value={slot.category}
                  onChange={(e) => {
                    setSlot(i, { category: e.target.value, structureId: "" });
                    setPreview(i, "");
                  }}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {Object.keys(CATEGORY_LABEL).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
                <select
                  value={slot.structureId}
                  onChange={(e) => pickStructure(i, e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">— veldu structure ({pool.length}) —</option>
                  {pool.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => randomizeSlot(i)}
                  title="Random úr þessum flokki"
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm hover:border-accent"
                >
                  🎲
                </button>
              </div>
              {chosen && (
                <div className="mt-3 pl-11">
                  <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
                    Æfingar (breyttu frjálst — t.d. Kassahopp → KB hopp)
                  </label>
                  <textarea
                    value={previews[i] ?? ""}
                    onChange={(e) => setPreview(i, e.target.value)}
                    rows={Math.max(4, (previews[i] ?? "").split("\n").length + 1)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 font-sans text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  {(previews[i] ?? "") !== (chosen.preview ?? "") && (
                    <button
                      type="button"
                      onClick={() => setPreview(i, chosen.preview ?? "")}
                      className="mt-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      ↺ Endurstilla á upprunalegu æfinguna
                    </button>
                  )}
                </div>
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
          className="rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? "Vista…" : "Vista viku"}
        </button>
        <Link
          href="/app/programs"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Hætta við
        </Link>
      </div>
    </main>
  );
}
