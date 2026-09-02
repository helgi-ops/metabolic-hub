import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NaeringForm } from "./naering-form";
import { NaeringEntries } from "./naering-entries";
import { TargetsForm } from "./targets-form";
import { ProgressChart } from "../personal-bests/progress-chart";
import { EnergyCard, type Need, type Suggested } from "./energy-card";
import {
  ageFromBirthYear,
  baseMaintenance,
  suggestTargets,
  trainingKcalForDay,
  trainingKcalForLog,
  type BaseActivity,
  type Goal,
  type Sex,
  type WorkoutLog,
} from "@/lib/nutrition/energy";

export const metadata = { title: "Næringardagbók · Metabolic" };

export type Entry = {
  id: string;
  logged_on: string;
  meal: string | null;
  name: string;
  brand: string | null;
  source: string;
  quantity_g: number | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type CustomFood = {
  id: string;
  name: string;
  brand: string | null;
  basis: string;
  serving_g: number | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type RecentFood = {
  name: string;
  brand: string | null;
  source: string;
  quantity_g: number | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const sum = (rows: Entry[], k: keyof Entry) =>
  rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

export default async function NaeringPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = todayISO();
  const selected = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today;

  const [
    { data: dayRows },
    { data: weekRows },
    { data: targetRow },
    { data: foods },
    { data: recentRows },
    { data: profileRow },
    { data: dayWorkouts },
    { data: weekWorkouts },
  ] = await Promise.all([
    supabase
      .from("nutrition_entries")
      .select(
        "id, logged_on, meal, name, brand, source, quantity_g, kcal, protein_g, carbs_g, fat_g",
      )
      .eq("user_id", user.id)
      .eq("logged_on", selected)
      .order("created_at", { ascending: true }),
    supabase
      .from("nutrition_entries")
      .select("logged_on, kcal")
      .eq("user_id", user.id)
      .gte("logged_on", shiftDate(selected, -13))
      .lte("logged_on", selected),
    supabase
      .from("nutrition_targets")
      .select("kcal, protein_g, carbs_g, fat_g")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("custom_foods")
      .select(
        "id, name, brand, basis, serving_g, kcal, protein_g, carbs_g, fat_g",
      )
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supabase
      .from("nutrition_entries")
      .select("name, brand, source, quantity_g, kcal, protein_g, carbs_g, fat_g")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("nutrition_profile")
      .select("sex, birth_year, height_cm, weight_kg, base_activity, goal")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("workout_logs")
      .select("calories, machine, machines_json, rpe, scheduled_category, duration_min")
      .eq("user_id", user.id)
      .eq("logged_on", selected),
    supabase
      .from("workout_logs")
      .select("logged_on, calories, machine, machines_json, rpe, scheduled_category, duration_min")
      .eq("user_id", user.id)
      .gte("logged_on", shiftDate(selected, -13))
      .lte("logged_on", selected),
  ]);

  const entries = (dayRows ?? []) as Entry[];
  const customFoods = (foods ?? []) as CustomFood[];
  const targets = targetRow ?? null;

  const { data: prof } = await supabase
    .from("profiles")
    .select("nutrition_coaching")
    .eq("id", user.id)
    .maybeSingle();
  const coachingOn = !!prof?.nutrition_coaching;

  const totals = {
    kcal: sum(entries, "kcal"),
    protein: sum(entries, "protein_g"),
    carbs: sum(entries, "carbs_g"),
    fat: sum(entries, "fat_g"),
  };

  // Estimated daily energy need (BMR + base lifestyle + this day's training),
  // and a suggested macro target from a representative TDEE (base + avg training
  // per day over the last 14 days) adjusted for the member's goal.
  const profileRowData = profileRow ?? null;
  let need: Need | null = null;
  let suggested: Suggested | null = null;
  if (
    profileRowData?.sex &&
    profileRowData.birth_year &&
    profileRowData.height_cm &&
    profileRowData.weight_kg
  ) {
    const p = {
      sex: profileRowData.sex as Sex,
      age: ageFromBirthYear(profileRowData.birth_year),
      heightCm: Number(profileRowData.height_cm),
      weightKg: Number(profileRowData.weight_kg),
      base_activity: profileRowData.base_activity as BaseActivity,
      goal: profileRowData.goal as Goal,
    };
    const base = baseMaintenance(p);
    const dayTrain = trainingKcalForDay(
      (dayWorkouts ?? []) as unknown as WorkoutLog[],
      p.weightKg,
    );
    need = {
      base,
      training: dayTrain.kcal,
      total: base + dayTrain.kcal,
      estimated: dayTrain.estimated,
    };
    const perDay = new Map<string, number>();
    for (const w of (weekWorkouts ?? []) as unknown as (WorkoutLog & {
      logged_on: string;
    })[]) {
      perDay.set(
        w.logged_on,
        (perDay.get(w.logged_on) ?? 0) + trainingKcalForLog(w, p.weightKg).kcal,
      );
    }
    const avgTrain = Math.round(
      [...perDay.values()].reduce((a, b) => a + b, 0) / 14,
    );
    suggested = suggestTargets(base + avgTrain, p.goal, p.weightKg);
  }

  // Daily kcal over the last 14 days (up to the selected day) — average over the
  // days that actually have entries, plus a trend line.
  const byDay = new Map<string, number>();
  for (const r of weekRows ?? []) {
    byDay.set(r.logged_on, (byDay.get(r.logged_on) ?? 0) + (Number(r.kcal) || 0));
  }
  const daysWithData = byDay.size;
  const avgKcal = daysWithData
    ? Math.round([...byDay.values()].reduce((a, b) => a + b, 0) / daysWithData)
    : 0;
  const trendPoints = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, kcal]) => ({ achieved_on: day, value: Math.round(kcal) }));

  // Most-used recent foods for one-tap re-logging.
  const seen = new Set<string>();
  const recentFoods = ((recentRows ?? []) as RecentFood[])
    .filter((r) => {
      const key = r.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  const prettyDate =
    selected === today
      ? "Í dag"
      : selected === shiftDate(today, -1)
        ? "Í gær"
        : selected;

  const MACROS: { key: keyof typeof totals; label: string; unit: string; tkey: "kcal" | "protein_g" | "carbs_g" | "fat_g" }[] = [
    { key: "kcal", label: "Kaloríur", unit: "kcal", tkey: "kcal" },
    { key: "protein", label: "Prótein", unit: "g", tkey: "protein_g" },
    { key: "carbs", label: "Kolvetni", unit: "g", tkey: "carbs_g" },
    { key: "fat", label: "Fita", unit: "g", tkey: "fat_g" },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Næringardagbók
        </div>
        <h1 className="mt-2 text-3xl font-bold">Næringardagbók</h1>
        <p className="mt-2 text-muted-foreground">
          Skráðu matinn þinn — leitaðu, veldu úr þínum matvælum eða sláðu inn
          handvirkt. Dagurinn leggst saman á móti markmiðunum þínum.
        </p>
      </div>

      {coachingOn && (
        <div className="mb-6 rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent">
          🥗 Þjálfarinn þinn fylgist með næringunni þinni.
        </div>
      )}

      {/* Day nav */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link
          href={`/app/naering?d=${shiftDate(selected, -1)}`}
          className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground"
        >
          ← Fyrri
        </Link>
        <span className="font-medium">{prettyDate}</span>
        {selected !== today && (
          <Link
            href="/app/naering"
            className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground"
          >
            Í dag
          </Link>
        )}
        {selected !== today && (
          <Link
            href={`/app/naering?d=${shiftDate(selected, 1)}`}
            className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground"
          >
            Næsti →
          </Link>
        )}
      </div>

      {/* Totals vs targets */}
      <div className="mb-8 rounded-lg border border-border bg-muted p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Dagurinn</h2>
          <TargetsForm userId={user.id} targets={targets} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {MACROS.map((m) => {
            const val = Math.round(totals[m.key]);
            const target = targets ? Number(targets[m.tkey]) || 0 : 0;
            const pct = target ? Math.min(100, Math.round((val / target) * 100)) : 0;
            return (
              <div key={m.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="font-medium">
                    {val}
                    {target ? (
                      <span className="text-muted-foreground">
                        {" "}
                        / {target} {m.unit}
                      </span>
                    ) : (
                      <span className="text-muted-foreground"> {m.unit}</span>
                    )}
                  </span>
                </div>
                {target > 0 && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-accent/60"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!targets && (
          <p className="mt-3 text-xs text-muted-foreground">
            Settu þér markmið til að sjá framvindu.
          </p>
        )}
      </div>

      {/* Estimated energy need */}
      <EnergyCard
        userId={user.id}
        profile={profileRowData}
        need={need}
        suggested={suggested}
        intakeKcal={totals.kcal}
      />

      {/* Add food */}
      <div className="mb-8">
        <NaeringForm
          userId={user.id}
          loggedOn={selected}
          customFoods={customFoods}
          recentFoods={recentFoods}
        />
      </div>

      {/* Entries by meal */}
      <div className="mb-8">
        <h2 className="mb-3 font-semibold">Skráð í dag</h2>
        <NaeringEntries entries={entries} />
      </div>

      {/* Trend + average (last 14 days) */}
      {daysWithData > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Meðaltal ({daysWithData} {daysWithData === 1 ? "dagur" : "dagar"})
            </div>
            <div className="mt-1 text-2xl font-bold">
              {avgKcal.toLocaleString("is-IS")} kcal/dag
            </div>
          </div>
          {trendPoints.length >= 2 && (
            <ProgressChart
              name="Kaloríur/dag"
              unit="kcal"
              higherIsBetter
              points={trendPoints}
            />
          )}
        </div>
      )}
    </main>
  );
}
