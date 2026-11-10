"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generatePlanPdf } from "../weeks/[id]/actions";

type Structure = {
  id: string;
  source_id: string;
  name: string;
  category: string;
  level: string; // "MB1" | "MB2" | "MB3" | "ALL"
  preview: string;
};

export type RecentWeek = {
  id: string;
  title: string | null;
  level: string;
  week_starting: string;
  cycle_week: string | null;
  slots: { category: string; structure_source_id: string; preview?: string }[];
};

const CATEGORY_LABEL: Record<string, string> = {
  strength: "Strength",
  power_strength: "Power/Strength",
  power: "Power",
  endurance: "Endurance",
  burn: "Burn",
};

// One colour per category — same palette as the program library.
const CATEGORY_COLOR: Record<string, string> = {
  strength: "#60a5fa",
  power_strength: "#a78bfa",
  power: "#fbbf24",
  endurance: "#34d399",
  burn: "#fb7185",
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

// Short version of each focus for the day cards (full text on hover).
const FOCUS_SHORT: Record<string, string> = {
  [FOCUS.powerLow]: "Low force · 12–20 reps",
  [FOCUS.powerMod]: "Moderate force · 8–12 reps",
  [FOCUS.powerHigh]: "High force · undir 6 reps",
  [FOCUS.endSimilar]: "Svipað work:rest",
  [FOCUS.endLonger]: "Hvíld jöfn eða lengri en vinna",
  [FOCUS.endShort]: "Hvíld styttri en vinna / löng vinna",
  [FOCUS.burn]: "Work capacity",
};

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
const DAY_SHORT = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau"];
const MONTHS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];

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

// A setup used within this many days of the new week counts as "in the cycle".
const CYCLE_DAYS = 28;
const DAY_MS = 86_400_000;

type Slot = { category: string; structureId: string };

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Coaches build the coming week: default to the next Monday after today.
function nextMondayISO() {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + add);
  return toISO(d);
}

function parseISO(iso: string) {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

function shortDate(iso: string, offsetDays = 0) {
  const d = new Date(parseISO(iso) + offsetDays * DAY_MS);
  return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
}

function isoWeek(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

type Usage = {
  label: string;
  tone: "fresh" | "old" | "recent" | "week";
};

export function BuilderClient({
  userId,
  stationId,
  structures,
  usage,
  recentWeeks,
}: {
  userId: string;
  stationId: string | null;
  structures: Structure[];
  usage: Record<string, string[]>;
  recentWeeks: RecentWeek[];
}) {
  const router = useRouter();
  const pickerRef = useRef<HTMLElement>(null);
  const byId = useMemo(
    () => new Map(structures.map((s) => [s.id, s])),
    [structures],
  );
  const bySource = useMemo(
    () => new Map(structures.map((s) => [s.source_id, s])),
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
  const [weekStarting, setWeekStarting] = useState(nextMondayISO());
  const [slots, setSlots] = useState<Slot[]>(
    DEFAULT_SLOT_CATEGORIES.map((category) => ({ category, structureId: "" })),
  );
  // Editable exercise text per slot (per-week override). Empty = use the
  // structure's library preview. Kept index-aligned with `slots`.
  const [previews, setPreviews] = useState<string[]>(() =>
    DEFAULT_SLOT_CATEGORIES.map(() => ""),
  );
  const [editing, setEditing] = useState<boolean[]>(() =>
    DEFAULT_SLOT_CATEGORIES.map(() => false),
  );
  const [cycleWeek, setCycleWeek] = useState("");
  // Cycle-week label for a standalone ("stök") week — lets a coach tag the week
  // as Vika 1–4 without applying the 4-week category pattern.
  const [manualWeek, setManualWeek] = useState("");
  const [variant, setVariant] = useState<"A" | "B">("A");
  const cycleDays = cycleWeek ? PERIODIZATION[cycleWeek].days : null;

  // Picker state: which day is being filled, plus search/filters.
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [onlyFresh, setOnlyFresh] = useState(false);
  const [partnerOnly, setPartnerOnly] = useState(false);
  const [noAirbike, setNoAirbike] = useState(false);

  const [saving, setSaving] = useState<null | "draft" | "publish">(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const weekStartMs = parseISO(weekStarting);

  // How recently a setup was used, relative to the week being built.
  function usageOf(st: Structure, slotIndex: number | null): Usage {
    const inWeek = slots.some(
      (s, i) => i !== slotIndex && s.structureId === st.id,
    );
    if (inWeek) return { label: "Í þessari viku", tone: "week" };
    const dates = usage[st.source_id] ?? [];
    if (!dates.length) return { label: "Aldrei notað", tone: "fresh" };
    let nearest = dates[0];
    for (const d of dates) {
      if (Math.abs(parseISO(d) - weekStartMs) < Math.abs(parseISO(nearest) - weekStartMs))
        nearest = d;
    }
    const diff = Math.round((weekStartMs - parseISO(nearest)) / DAY_MS);
    if (Math.abs(diff) < CYCLE_DAYS) {
      const label =
        diff === 0
          ? "Sama vika"
          : diff > 0
            ? `Fyrir ${diff} ${diff === 1 ? "degi" : "dögum"}`
            : `Planað ${shortDate(nearest)}`;
      return { label, tone: "recent" };
    }
    return { label: `Síðast ${shortDate(dates[0])}`, tone: "old" };
  }

  function setSlot(i: number, patch: Partial<Slot>) {
    setSlots((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }

  function setPreview(i: number, text: string) {
    setPreviews((prev) => prev.map((p, idx) => (idx === i ? text : p)));
  }

  function setEditingAt(i: number, on: boolean) {
    setEditing((prev) => prev.map((e, idx) => (idx === i ? on : e)));
  }

  function selectSlot(i: number) {
    setActive(i);
    setQuery("");
    // On narrow screens the picker sits below the week — bring it into view.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Pick a structure for the active slot, seed its editable text from the
  // library, then move on to the next empty day.
  function pickStructure(i: number, structureId: string) {
    const st = structureId ? byId.get(structureId) : null;
    const next = slots.map((s, idx) => (idx === i ? { ...s, structureId } : s));
    setSlots(next);
    setPreview(i, st?.preview ?? "");
    setEditingAt(i, false);
    const nextEmpty = next.findIndex((s, idx) => idx > i && !s.structureId);
    const anyEmpty = nextEmpty !== -1 ? nextEmpty : next.findIndex((s) => !s.structureId);
    if (anyEmpty !== -1) setActive(anyEmpty);
  }

  function resetSlots(categories: string[]) {
    setSlots(categories.map((category) => ({ category, structureId: "" })));
    setPreviews(categories.map(() => ""));
    setEditing(categories.map(() => false));
    setActive(0);
  }

  function changeLevel(next: (typeof LEVELS)[number]) {
    setLevel(next);
    // Picked structures were for the previous level — clear them and their text.
    setSlots((prev) => prev.map((s) => ({ ...s, structureId: "" })));
    setPreviews((prev) => prev.map(() => ""));
    setEditing((prev) => prev.map(() => false));
    setActive(0);
  }

  function applyCycle(week: string, v: "A" | "B" = variant) {
    setCycleWeek(week);
    setVariant(v);
    resetSlots(week ? PERIODIZATION[week][v] : DEFAULT_SLOT_CATEGORIES);
  }

  function changeVariant(v: "A" | "B") {
    if (cycleWeek) applyCycle(cycleWeek, v);
    else setVariant(v);
  }

  // Random pick for empty days, preferring setups not used in the cycle and not
  // already in this week.
  function suggestEmpty() {
    const taken = new Set(slots.map((s) => s.structureId).filter(Boolean));
    const picks = slots.map((s, i) => {
      if (s.structureId) return null;
      const pool = (byCategory.get(s.category) ?? []).filter((st) => !taken.has(st.id));
      const fresh = pool.filter((st) => {
        const t = usageOf(st, i).tone;
        return t === "fresh" || t === "old";
      });
      const from = fresh.length ? fresh : pool;
      if (!from.length) return null;
      const pick = from[Math.floor(Math.random() * from.length)];
      taken.add(pick.id);
      return pick;
    });
    setSlots((prev) =>
      prev.map((s, i) => (picks[i] ? { ...s, structureId: picks[i]!.id } : s)),
    );
    setPreviews((prev) => prev.map((p, i) => (picks[i] ? picks[i]!.preview : p)));
  }

  function suggestActive() {
    const s = slots[active];
    const pool = (byCategory.get(s.category) ?? []).filter(
      (st) => st.id !== s.structureId && usageOf(st, active).tone !== "week",
    );
    const fresh = pool.filter((st) => {
      const t = usageOf(st, active).tone;
      return t === "fresh" || t === "old";
    });
    const from = fresh.length ? fresh : pool;
    if (!from.length) return;
    pickStructure(active, from[Math.floor(Math.random() * from.length)].id);
  }

  const lastWeekForLevel = recentWeeks.find((w) => w.level === level) ?? null;

  function copyLastWeek() {
    const w = lastWeekForLevel;
    if (!w) return;
    const copied = w.slots.slice(0, 6).map((s) => {
      const st = bySource.get(s.structure_source_id);
      return {
        slot: { category: s.category || st?.category || "strength", structureId: st?.id ?? "" },
        preview: s.preview ?? st?.preview ?? "",
      };
    });
    while (copied.length < 6)
      copied.push({
        slot: { category: DEFAULT_SLOT_CATEGORIES[copied.length], structureId: "" },
        preview: "",
      });
    setSlots(copied.map((c) => c.slot));
    setPreviews(copied.map((c) => c.preview));
    setEditing(copied.map(() => false));
  }

  function clearAll() {
    setSlots((prev) => prev.map((s) => ({ ...s, structureId: "" })));
    setPreviews((prev) => prev.map(() => ""));
    setEditing((prev) => prev.map(() => false));
    setActive(0);
  }

  const filledCount = slots.filter((s) => s.structureId).length;
  const cycleLabel = cycleWeek || manualWeek;
  const autoTitle = `Vika ${isoWeek(weekStarting)} · ${level}${
    cycleLabel ? ` · Lota ${cycleLabel.replace("Vika ", "")}` : ""
  }`;

  const warnings = slots.filter((s, i) => {
    const st = s.structureId ? byId.get(s.structureId) : null;
    if (!st) return false;
    const t = usageOf(st, i).tone;
    return t === "recent" || t === "week";
  }).length;

  const categoryMix = Object.entries(
    slots.reduce<Record<string, number>>((acc, s) => {
      acc[s.category] = (acc[s.category] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([c, n]) => `${n}× ${CATEGORY_LABEL[c] ?? c}`)
    .join(" · ");

  // Picker list for the active day.
  const activeSlot = slots[active];
  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (byCategory.get(activeSlot.category) ?? [])
      .filter((st) => {
        if (q && !st.name.toLowerCase().includes(q) && !st.preview.toLowerCase().includes(q))
          return false;
        if (partnerOnly && !/partner/i.test(st.name)) return false;
        if (noAirbike && /air\s?bike/i.test(st.preview)) return false;
        return true;
      })
      .map((st) => ({ st, use: usageOf(st, active) }))
      .filter(({ use }) => !onlyFresh || use.tone === "fresh" || use.tone === "old")
      .sort((a, b) => {
        const rank = (t: Usage["tone"]) => (t === "fresh" || t === "old" ? 0 : 1);
        return rank(a.use.tone) - rank(b.use.tone) || a.st.name.localeCompare(b.st.name);
      });
    // usageOf depends on slots/weekStarting/usage, all of which change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byCategory, activeSlot.category, query, partnerOnly, noAirbike, onlyFresh, slots, weekStarting, active, usage]);

  async function save(publish: boolean) {
    setError(null);
    if (filledCount === 0) {
      setError("Veldu að minnsta kosti einn tíma áður en þú vistar.");
      return;
    }
    setSaving(publish ? "publish" : "draft");
    const supabase = createClient();
    const programs_json = slots
      .map((s, i) => {
        const st = byId.get(s.structureId);
        if (!st) return null;
        const cd = cycleDays?.[i];
        // Keep the day label, but only persist the focus text when the coach
        // left the slot on its periodization category — if they overrode it
        // (e.g. → Burn/Endurance) the focus no longer describes the day, so drop
        // it rather than saving a stale description.
        const expectedCat = cycleWeek
          ? PERIODIZATION[cycleWeek][variant][i]
          : null;
        const keepFocus = cd != null && s.category === expectedCat;
        // Save the edited exercise text only when it differs from the library
        // preview, so untouched slots keep tracking the structure library.
        const edited = (previews[i] ?? "").trim();
        const lib = st.preview ?? "";
        return {
          slot: i + 1,
          category: s.category,
          structure_source_id: st.source_id,
          name: st.name,
          ...(cd ? { day: cd.day } : {}),
          ...(keepFocus ? { focus: cd.focus } : {}),
          ...(edited && previews[i] !== lib ? { preview: previews[i] } : {}),
        };
      })
      .filter(Boolean);

    const { data: inserted, error: insertError } = await supabase
      .from("weekly_plans")
      .insert({
        owner_id: userId,
        station_id: stationId,
        title: title.trim() || autoTitle,
        level,
        week_starting: weekStarting,
        cycle_week: cycleWeek || manualWeek || null,
        programs_json,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      setError(insertError?.message ?? "Tókst ekki að vista vikuna.");
      setSaving(null);
      return;
    }

    if (publish) {
      const res = await generatePlanPdf(inserted.id);
      if (!res.ok) {
        setSavedId(inserted.id);
        setError(
          `Vikan var vistuð en birting á skjám mistókst: ${res.error ?? "óþekkt villa"}`,
        );
        setSaving(null);
        return;
      }
    }
    router.push(`/app/programs/weeks/${inserted.id}`);
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-6xl px-6 pt-10">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/app/programs"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Æfingaplön
          </Link>
          <h1 className="mt-2 text-3xl font-bold">Smíða viku</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyLastWeek}
            disabled={!lastWeekForLevel}
            title={
              lastWeekForLevel
                ? `${lastWeekForLevel.title ?? ""} (${shortDate(lastWeekForLevel.week_starting)})`
                : `Engin vistuð ${level} vika`
            }
            className="h-10 rounded-lg border border-border bg-muted px-3.5 text-sm hover:border-accent disabled:opacity-40 disabled:hover:border-border"
          >
            Afrita síðustu {level} viku
          </button>
          <button
            type="button"
            onClick={suggestEmpty}
            className="h-10 rounded-lg border border-border bg-muted px-3.5 text-sm hover:border-accent"
          >
            Stinga upp á tómum tímum
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="h-10 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Hreinsa
          </button>
        </div>
      </div>

      {/* Setup bar */}
      <section className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-border bg-muted px-5 py-4">
        <Field label="Stig">
          <Segmented
            options={LEVELS.map((l) => ({ key: l, label: l }))}
            value={level}
            onChange={(v) => changeLevel(v as (typeof LEVELS)[number])}
          />
        </Field>
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted-foreground">Vika hefst</span>
          <input
            type="date"
            value={weekStarting}
            onChange={(e) => e.target.value && setWeekStarting(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-2.5 text-sm [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <Field label="Vika í lotu">
          <Segmented
            options={[
              { key: "", label: "Stök" },
              ...CYCLE_WEEKS.map((w) => ({ key: w, label: w.replace("Vika ", "") })),
            ]}
            value={cycleWeek}
            onChange={(v) => applyCycle(v)}
          />
        </Field>
        {cycleWeek ? (
          <Field label="Útgáfa">
            <Segmented
              options={VARIANTS.map((v) => ({ key: v.key, label: v.label }))}
              value={variant}
              onChange={(v) => changeVariant(v as "A" | "B")}
            />
          </Field>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">
              Merkja sem (valfrjálst)
            </span>
            <select
              value={manualWeek}
              onChange={(e) => setManualWeek(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Engin vika</option>
              {CYCLE_WEEKS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block min-w-[220px] flex-1">
          <span className="mb-1.5 block text-xs text-muted-foreground">Heiti</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={autoTitle}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Week */}
        <section className="space-y-2.5">
          {slots.map((slot, i) => {
            const chosen = slot.structureId ? byId.get(slot.structureId) : null;
            const cd = cycleDays?.[i];
            const expectedCat = cycleWeek ? PERIODIZATION[cycleWeek][variant][i] : null;
            const focusApplies = expectedCat == null || slot.category === expectedCat;
            const use = chosen ? usageOf(chosen, i) : null;
            const warn = use?.tone === "recent" || use?.tone === "week";
            const isActive = active === i;
            const color = CATEGORY_COLOR[slot.category] ?? "#a3a3a3";
            const text = previews[i] ?? "";
            return (
              <div
                key={i}
                className={`rounded-xl border bg-muted p-4 transition ${
                  isActive
                    ? "border-accent ring-[3px] ring-accent/15"
                    : warn
                      ? "border-red-400/40"
                      : "border-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectSlot(i)}
                  aria-pressed={isActive}
                  className="flex w-full items-start gap-4 text-left"
                >
                  <div className="w-14 shrink-0">
                    <div className="font-semibold">{DAY_SHORT[i] ?? `Tími ${i + 1}`}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {shortDate(weekStarting, i)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CategoryTag category={slot.category} />
                      {cd &&
                        (focusApplies ? (
                          <span className="text-xs text-muted-foreground" title={cd.focus}>
                            {FOCUS_SHORT[cd.focus] ?? cd.focus}
                          </span>
                        ) : (
                          <span className="text-xs italic text-muted-foreground">
                            Flokki breytt
                          </span>
                        ))}
                    </div>
                    {chosen ? (
                      <>
                        <div className="text-base font-semibold">{chosen.name}</div>
                        {!editing[i] && text && (
                          <div className="line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                            {text}
                          </div>
                        )}
                        {warn && (
                          <div className="text-xs text-red-300">
                            {use!.tone === "week"
                              ? "Sama uppsetning er líka annan dag í vikunni"
                              : `${use!.label} – innan lotunnar`}
                          </div>
                        )}
                      </>
                    ) : (
                      <div
                        className="flex h-11 items-center rounded-lg border border-dashed px-3 text-sm text-muted-foreground"
                        style={{ borderColor: isActive ? color : undefined }}
                      >
                        {isActive ? "Veldu uppsetningu í listanum" : "Smelltu til að velja"}
                      </div>
                    )}
                  </div>
                </button>

                {chosen && editing[i] && (
                  <div className="mt-3 pl-[72px]">
                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
                      Æfingar — breytir aðeins þessari viku
                    </label>
                    <textarea
                      value={text}
                      onChange={(e) => setPreview(i, e.target.value)}
                      rows={Math.max(4, text.split("\n").length + 1)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 pl-[72px] text-xs text-muted-foreground">
                  {chosen && (
                    <button
                      type="button"
                      onClick={() => setEditingAt(i, !editing[i])}
                      className="hover:text-foreground"
                    >
                      {editing[i] ? "Loka æfingum" : "Breyta æfingum"}
                    </button>
                  )}
                  {chosen && text !== (chosen.preview ?? "") && (
                    <button
                      type="button"
                      onClick={() => setPreview(i, chosen.preview ?? "")}
                      className="hover:text-foreground"
                    >
                      ↺ Upprunalegar æfingar
                    </button>
                  )}
                  <label className="flex items-center gap-1.5">
                    <span>Flokkur</span>
                    <select
                      value={slot.category}
                      onChange={(e) => {
                        setSlot(i, { category: e.target.value, structureId: "" });
                        setPreview(i, "");
                        setEditingAt(i, false);
                        setActive(i);
                      }}
                      className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                    >
                      {Object.keys(CATEGORY_LABEL).map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {chosen && (
                    <button
                      type="button"
                      onClick={() => {
                        setSlot(i, { structureId: "" });
                        setPreview(i, "");
                        setEditingAt(i, false);
                        setActive(i);
                      }}
                      className="hover:text-foreground"
                    >
                      Fjarlægja
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Picker */}
        <aside
          ref={pickerRef}
          className="flex scroll-mt-4 flex-col rounded-xl border border-border bg-muted lg:sticky lg:top-6 lg:max-h-[calc(100vh-7rem)]"
        >
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">
                Velja fyrir {DAY_SHORT[active] ?? `tíma ${active + 1}`}
              </h2>
              <CategoryTag category={activeSlot.category} />
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Leita í ${CATEGORY_LABEL[activeSlot.category] ?? ""} · ${level}…`}
              aria-label="Leita að uppsetningu"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Toggle on={onlyFresh} onClick={() => setOnlyFresh((v) => !v)}>
                Ekki notað í lotu
              </Toggle>
              <Toggle on={partnerOnly} onClick={() => setPartnerOnly((v) => !v)}>
                Partner
              </Toggle>
              <Toggle on={noAirbike} onClick={() => setNoAirbike((v) => !v)}>
                Án AirBike
              </Toggle>
              <button
                type="button"
                onClick={suggestActive}
                className="ml-auto rounded-full px-2 py-1 text-muted-foreground hover:text-foreground"
              >
                Handahóf
              </button>
            </div>
          </div>
          <ul className="max-h-[560px] space-y-1 overflow-y-auto p-2 lg:max-h-none lg:flex-1">
            {pool.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">
                Engin uppsetning passar. Prófaðu aðra leit eða slökktu á síum.
              </li>
            )}
            {pool.map(({ st, use }) => {
              const selected = activeSlot.structureId === st.id;
              const dim = use.tone === "recent" || use.tone === "week";
              const firstLine = st.preview.split("\n").find((l) => l.trim()) ?? "";
              return (
                <li key={st.id}>
                  <button
                    type="button"
                    onClick={() => pickStructure(active, st.id)}
                    className={`block w-full rounded-lg p-3 text-left transition hover:bg-background ${
                      selected ? "bg-accent/10 ring-1 ring-accent" : ""
                    } ${dim && !selected ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">{st.name}</span>
                      <span
                        className={`shrink-0 text-[11px] ${
                          use.tone === "fresh"
                            ? "text-emerald-400"
                            : use.tone === "recent"
                              ? "text-red-300"
                              : use.tone === "week"
                                ? "text-orange-400"
                                : "text-muted-foreground"
                        }`}
                      >
                        {use.label}
                      </span>
                    </div>
                    {firstLine && (
                      <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {firstLine}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 z-10 -mx-6 mt-8 border-t border-border bg-background/95 px-6 py-3.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex gap-1" aria-hidden="true">
            {slots.map((s, i) => (
              <span
                key={i}
                className="h-1.5 w-5 rounded-full"
                style={{
                  background: s.structureId
                    ? (CATEGORY_COLOR[s.category] ?? "#a3a3a3")
                    : "var(--border)",
                }}
              />
            ))}
          </div>
          <span className="text-sm">{filledCount}/{slots.length} tímar</span>
          <span className="hidden text-sm text-muted-foreground md:inline">{categoryMix}</span>
          {warnings > 0 && (
            <span className="text-sm text-red-300">
              {warnings} {warnings === 1 ? "endurtekning" : "endurtekningar"}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Link
              href="/app/programs"
              className="flex h-11 items-center px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Hætta við
            </Link>
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving !== null}
              className="h-11 rounded-lg border border-border bg-muted px-4 text-sm hover:border-accent disabled:opacity-50"
            >
              {saving === "draft" ? "Vista…" : "Vista drög"}
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving !== null}
              className="h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving === "publish" ? "Birti…" : "Vista og birta á skjám"}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-2 text-sm text-red-400">
            {error}
            {savedId && (
              <>
                {" "}
                <Link href={`/app/programs/weeks/${savedId}`} className="underline">
                  Opna vikuna
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-background p-[3px]">
      {options.map((o) => (
        <button
          key={o.key || "none"}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`h-[34px] min-w-[44px] rounded-md px-3 text-sm font-semibold transition ${
            value === o.key
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-2.5 py-1 transition ${
        on
          ? "border-accent bg-accent/10 text-orange-400"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function CategoryTag({ category }: { category: string }) {
  const color = CATEGORY_COLOR[category] ?? "#a3a3a3";
  return (
    <span
      className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest"
      style={{ color, borderColor: `${color}55` }}
    >
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}
