"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVITY_LABEL,
  GOAL_LABEL,
  type BaseActivity,
  type Goal,
} from "@/lib/nutrition/energy";
import { MacroSuggest, type MacroKey } from "./macro-suggest";

export type ProfileRow = {
  sex: string | null;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  base_activity: string;
  goal: string;
};

export type Need = {
  base: number;
  training: number;
  total: number;
  estimated: boolean;
};

export type Suggested = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type MacroTile = {
  label: string;
  unit: string;
  value: number;
  target: number;
  macro?: MacroKey | null;
};

// The day's status in one card: macro totals vs targets (big numbers), the
// estimated energy need + intake balance, and the goal-based target suggestion.
export function EnergyCard({
  userId,
  profile,
  need,
  suggested,
  intakeKcal,
  dayMacros,
  hasTargets,
  targetsForm,
}: {
  userId: string;
  profile: ProfileRow | null;
  need: Need | null;
  suggested: Suggested | null;
  intakeKcal: number;
  dayMacros: MacroTile[];
  hasTargets: boolean;
  targetsForm: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState<{
    macro: MacroKey;
    label: string;
  } | null>(null);

  async function useAsTarget() {
    if (!suggested) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("nutrition_targets").upsert(
      {
        user_id: userId,
        kcal: suggested.kcal,
        protein_g: suggested.protein_g,
        carbs_g: suggested.carbs_g,
        fat_g: suggested.fat_g,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setBusy(false);
    router.refresh();
  }

  // Ring: eaten vs the member's kcal goal (markmið), else the estimated need.
  const kcalTarget = dayMacros.find((m) => m.unit === "kcal")?.target ?? 0;
  const goal = kcalTarget > 0 ? kcalTarget : (need?.total ?? 0);
  const eaten = Math.round(intakeKcal);
  const remaining = goal - eaten;
  const over = goal > 0 && remaining < 0;
  const R = 50;
  const C = 2 * Math.PI * R;
  const frac = goal > 0 ? Math.min(1, eaten / goal) : 0;
  const macroTiles = dayMacros.filter((m) => m.macro);
  const MACRO_COLOR: Record<string, string> = {
    protein: "#60a5fa",
    carbs: "#fbbf24",
    fat: "#fb7185",
  };
  // The biggest relative gap among macros with a target → a one-line nudge.
  const gap = macroTiles
    .filter((m) => m.target > 0 && m.value < m.target)
    .map((m) => ({ m, left: m.target - m.value, rel: (m.target - m.value) / m.target }))
    .sort((x, y) => y.rel - x.rel)[0];

  return (
    <div className="mb-5 rounded-2xl border border-border bg-muted p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Dagurinn</h2>
        <div className="flex items-center gap-2">
          {targetsForm}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
          >
            {profile ? "Orkuþörf" : "Reikna orkuþörf"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 sm:gap-6">
        <div className="relative h-[120px] w-[120px] shrink-0">
          <svg
            width="120"
            height="120"
            viewBox="0 0 120 120"
            role="img"
            aria-label={goal > 0 ? `${eaten} af ${goal} kcal` : `${eaten} kcal`}
          >
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--border)" strokeWidth="12" />
            {goal > 0 && (
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={over ? "#fbbf24" : "var(--accent)"}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - frac)}
                transform="rotate(-90 60 60)"
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[22px] font-bold tabular-nums">
              {(goal > 0 ? Math.abs(remaining) : eaten).toLocaleString("is-IS")}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {goal > 0 ? (over ? "kcal yfir" : "kcal eftir") : "kcal borðað"}
            </span>
          </div>
        </div>

        <dl className="min-w-0 flex-1 space-y-1.5 text-[13px]">
          <Row label="Borðað" value={eaten} strong />
          {kcalTarget > 0 && <Row label="Markmið" value={kcalTarget} />}
          {need && (
            <>
              <Row
                label={`Orkuþörf í dag${need.estimated ? " (áætl.)" : ""}`}
                value={need.total}
              />
              <div className="text-[11px] text-muted-foreground">
                grunnur {need.base.toLocaleString("is-IS")}
                {need.training > 0 ? (
                  <span className="text-emerald-400"> + æfing {need.training.toLocaleString("is-IS")}</span>
                ) : (
                  " · engin æfing skráð"
                )}
              </div>
            </>
          )}
          {!need && !kcalTarget && (
            <p className="text-xs text-muted-foreground">
              Reiknaðu orkuþörf eða settu markmið til að sjá hvað er eftir af deginum.
            </p>
          )}
        </dl>
      </div>

      {/* Macros — tap one for food ideas that close the gap. */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {macroTiles.map((m) => {
          const pct = m.target ? Math.min(100, Math.round((m.value / m.target) * 100)) : 0;
          return (
            <button
              key={m.label}
              type="button"
              onClick={() => setSuggest({ macro: m.macro!, label: m.label })}
              className="rounded-lg p-1 text-left transition hover:bg-background"
              title={`Hugmyndir að mat með ${m.label.toLowerCase()}`}
            >
              <div className="flex items-baseline justify-between gap-1 text-xs">
                <span>{m.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {m.value}
                  {m.target ? `/${m.target}` : ""} g
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${m.target ? pct : 0}%`, background: MACRO_COLOR[m.macro!] }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {gap && (
        <button
          type="button"
          onClick={() => setSuggest({ macro: gap.m.macro!, label: gap.m.label })}
          className="mt-3 w-full border-t border-border pt-3 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          Vantar{" "}
          <span className="font-semibold text-foreground">
            {Math.round(gap.left)} g {gap.m.label.toLowerCase()}
          </span>{" "}
          — <span className="text-orange-400">sjá hugmyndir</span>
        </button>
      )}

      {!hasTargets && (
        <p className="mt-3 text-xs text-muted-foreground">
          Settu þér markmið (eða notaðu tillöguna hér að neðan) til að sjá framvindu.
        </p>
      )}

      {suggested && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <div className="text-xs text-muted-foreground">
            Tillaga ({GOAL_LABEL[(profile?.goal as Goal) ?? "maintain"]}):{" "}
            <span className="text-foreground">
              {suggested.kcal} kcal · P {suggested.protein_g} · K {suggested.carbs_g} · F{" "}
              {suggested.fat_g}
            </span>
          </div>
          <button
            type="button"
            onClick={useAsTarget}
            disabled={busy}
            className="ml-auto rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Set…" : "Nota sem markmið"}
          </button>
        </div>
      )}

      {editing && (
        <ProfileModal
          userId={userId}
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}

      {suggest && (
        <MacroSuggest
          macro={suggest.macro}
          label={suggest.label}
          onClose={() => setSuggest(null)}
        />
      )}
    </div>
  );
}

function ProfileModal({
  userId,
  profile,
  onClose,
  onSaved,
}: {
  userId: string;
  profile: ProfileRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sex, setSex] = useState<string>(profile?.sex ?? "kk");
  const [birthYear, setBirthYear] = useState(
    profile?.birth_year != null ? String(profile.birth_year) : "",
  );
  const [height, setHeight] = useState(
    profile?.height_cm != null ? String(profile.height_cm) : "",
  );
  const [weight, setWeight] = useState(
    profile?.weight_kg != null ? String(profile.weight_kg) : "",
  );
  const [activity, setActivity] = useState<string>(
    profile?.base_activity ?? "light",
  );
  const [goal, setGoal] = useState<string>(profile?.goal ?? "maintain");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const num = (v: string) => (v.trim() ? parseFloat(v.replace(",", ".")) : null);

  async function save() {
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const { error: e } = await supabase.from("nutrition_profile").upsert(
      {
        user_id: userId,
        sex,
        birth_year: birthYear.trim() ? parseInt(birthYear, 10) : null,
        height_cm: num(height),
        weight_kg: num(weight),
        base_activity: activity,
        goal,
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
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold">Orkuþörf — mínar tölur</h3>

        <div className="space-y-3">
          <div>
            <span className="mb-1 block text-sm text-muted-foreground">Kyn</span>
            <div className="flex gap-2">
              {(["kk", "kvk"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSex(s)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition ${
                    sex === s
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "kk" ? "Karl" : "Kona"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Fæðingarár</span>
              <input inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="1990" className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Hæð (cm)</span>
              <input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="175" className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Þyngd (kg)</span>
              <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="75" className={field} />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">
              Dagleg hreyfing (utan æfinga)
            </span>
            <select value={activity} onChange={(e) => setActivity(e.target.value)} className={field}>
              {(Object.keys(ACTIVITY_LABEL) as BaseActivity[]).map((k) => (
                <option key={k} value={k}>
                  {ACTIVITY_LABEL[k]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">Markmið</span>
            <select value={goal} onChange={(e) => setGoal(e.target.value)} className={field}>
              {(Object.keys(GOAL_LABEL) as Goal[]).map((k) => (
                <option key={k} value={k}>
                  {GOAL_LABEL[k]}
                </option>
              ))}
            </select>
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

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value.toLocaleString("is-IS")}</dd>
    </div>
  );
}
