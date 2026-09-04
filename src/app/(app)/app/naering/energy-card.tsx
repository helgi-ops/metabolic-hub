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

  return (
    <div className="mb-8 rounded-lg border border-border bg-muted p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
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

      {/* Energy need + intake balance */}
      {profile && need ? (
        <div className="mb-4 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Áætluð orkuþörf í dag
              </div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums">
                {need.total.toLocaleString("is-IS")}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  kcal
                </span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                grunnur {need.base.toLocaleString("is-IS")} + æfing{" "}
                {need.training.toLocaleString("is-IS")}
                {need.estimated && " (áætluð)"}
              </div>
            </div>
            {(() => {
              const diff = Math.round(intakeKcal) - need.total;
              const over = diff > 0;
              return (
                <div className="text-right text-sm">
                  <div className="text-muted-foreground">Inntaka í dag</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {Math.round(intakeKcal).toLocaleString("is-IS")} kcal
                  </div>
                  <div className={over ? "text-amber-400" : "text-accent"}>
                    {over ? "+" : "−"}
                    {Math.abs(diff).toLocaleString("is-IS")} kcal{" "}
                    {over ? "yfir" : "eftir"}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">
          Reiknaðu orkuþörf (kyn, aldur, hæð, þyngd) til að sjá stöðuna á
          deginum miðað við hreyfingu.
        </p>
      )}

      {/* Macro totals vs targets */}
      <div className="grid gap-4 sm:grid-cols-2">
        {dayMacros.map((m) => {
          const pct = m.target
            ? Math.min(100, Math.round((m.value / m.target) * 100))
            : 0;
          return (
            <div
              key={m.label}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {m.label}
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tabular-nums">
                  {m.value}
                </span>
                <span className="text-sm text-muted-foreground">
                  {m.target ? `/ ${m.target} ${m.unit}` : m.unit}
                </span>
              </div>
              {m.target > 0 && (
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!hasTargets && (
        <p className="mt-3 text-xs text-muted-foreground">
          Settu þér markmið (eða notaðu tillöguna hér að neðan) til að sjá
          framvindu.
        </p>
      )}

      {suggested && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <div className="text-xs text-muted-foreground">
            Tillaga ({GOAL_LABEL[(profile?.goal as Goal) ?? "maintain"]}):{" "}
            <span className="text-foreground">
              {suggested.kcal} kcal · P {suggested.protein_g} · K{" "}
              {suggested.carbs_g} · F {suggested.fat_g}
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
