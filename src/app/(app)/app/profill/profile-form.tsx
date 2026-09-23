"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVITY_LABEL,
  GOAL_LABEL,
  type BaseActivity,
  type Goal,
} from "@/lib/nutrition/energy";

type NP = {
  sex: string | null;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  base_activity: string | null;
  goal: string | null;
} | null;

export function ProfileForm({
  userId,
  fullName: initialName,
  profile,
}: {
  userId: string;
  fullName: string;
  profile: NP;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialName);
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
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (v: string) => (v.trim() ? parseFloat(v.replace(",", ".")) : null);

  async function save() {
    setError(null);
    setSaved(false);
    setSaving(true);
    const supabase = createClient();

    if (fullName.trim()) {
      const { error: pe } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() })
        .eq("id", userId);
      if (pe) {
        setError(pe.message);
        setSaving(false);
        return;
      }
    }

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
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted p-5">
        <h2 className="font-semibold">Nafn</h2>
        <label className="mt-3 block">
          <span className="mb-1 block text-sm text-muted-foreground">
            Fullt nafn
          </span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nafn"
            className={field}
          />
        </label>
      </div>

      <div className="rounded-lg border border-border bg-muted p-5">
        <h2 className="font-semibold">Líkamstölur</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Notað til að áætla brennslu og orkuþörf.
        </p>

        <div className="mt-4 space-y-3">
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
      </div>

      {error && <div className="text-sm text-red-400">{error}</div>}
      {saved && <div className="text-sm text-accent">✓ Vistað</div>}

      <div className="flex items-center justify-between">
        <Link
          href="/breyta-lykilord"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Breyta lykilorði →
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? "Vista…" : "Vista"}
        </button>
      </div>
    </div>
  );
}
