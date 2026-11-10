import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NaeringForm } from "./naering-form";
import { NaeringEntries } from "./naering-entries";
import { TargetsForm } from "./targets-form";
import { EnergyCard, type Need, type Suggested } from "./energy-card";
import { QuickTips } from "./quick-tips";
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

export const metadata = { title: "Matardagbók · Metabolic" };

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

  // Last 7 days (ending on the selected day) for the small bar chart.
  const DAY_SHORT = ["Sun", "Mán", "Þri", "Mið", "Fim", "Fös", "Lau"];
  const kcalTargetNum = targets ? Number(targets.kcal) || 0 : 0;
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDate(selected, i - 6);
    return {
      day,
      label: DAY_SHORT[new Date(`${day}T00:00:00`).getDay()],
      kcal: Math.round(byDay.get(day) ?? 0),
    };
  });
  const chartMax = Math.max(kcalTargetNum * 1.25, ...last7.map((x) => x.kcal), 1);
  const weekDays = last7.filter((x) => x.kcal > 0);
  const weekAvg = weekDays.length
    ? Math.round(weekDays.reduce((a, x) => a + x.kcal, 0) / weekDays.length)
    : 0;

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

  const longDate = new Date(`${selected}T00:00:00`).toLocaleDateString("is-IS", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10 lg:max-w-6xl">
      {/* Day nav */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={`/app/naering?d=${shiftDate(selected, -1)}`}
          aria-label="Fyrri dagur"
          className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-muted hover:border-accent"
        >
          ←
        </Link>
        <div className="text-center">
          <h1 className="text-lg font-bold">
            {prettyDate === selected ? "Matardagbók" : prettyDate}
          </h1>
          <div className="text-xs text-muted-foreground first-letter:uppercase">{longDate}</div>
        </div>
        {selected !== today ? (
          <Link
            href={`/app/naering?d=${shiftDate(selected, 1)}`}
            aria-label="Næsti dagur"
            className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-muted hover:border-accent"
          >
            →
          </Link>
        ) : (
          <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted-foreground/40">
            →
          </span>
        )}
      </div>
      {selected !== today && (
        <div className="-mt-2 mb-4 text-center">
          <Link href="/app/naering" className="text-xs text-orange-400 hover:text-orange-300">
            Fara á daginn í dag
          </Link>
        </div>
      )}

      {coachingOn && (
        <div className="mb-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-orange-400">
          Þjálfarinn þinn fylgist með næringunni þinni.
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
      <div className="min-w-0">
      <EnergyCard
        userId={user.id}
        profile={profileRowData}
        need={need}
        suggested={suggested}
        intakeKcal={totals.kcal}
        hasTargets={!!targets}
        targetsForm={<TargetsForm userId={user.id} targets={targets} />}
        dayMacros={MACROS.map((m) => ({
          label: m.label,
          unit: m.unit,
          value: Math.round(totals[m.key]),
          target: targets ? Number(targets[m.tkey]) || 0 : 0,
          macro: m.key === "kcal" ? null : (m.key as "protein" | "carbs" | "fat"),
        }))}
      />

      {/* Meals — each with its own "+ Bæta við". */}
      <NaeringEntries entries={entries} />
      </div>

      {/* Desktop: trend + tips beside the day; phone: below it. */}
      <aside className="min-w-0 lg:sticky lg:top-6">

      {/* Last 7 days */}
      {daysWithData > 0 && (
        <section className="mt-5 rounded-xl border border-border bg-muted p-4 lg:mt-0">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">Síðustu 7 dagar</span>
            <span className="text-xs text-muted-foreground">
              {weekAvg ? `meðaltal ${weekAvg.toLocaleString("is-IS")} kcal` : ""}
              {avgKcal && daysWithData > weekDays.length
                ? ` · 14 dagar ${avgKcal.toLocaleString("is-IS")}`
                : ""}
            </span>
          </div>
          <div className="relative mt-3 flex h-24 items-end gap-1.5">
            {kcalTargetNum > 0 && (
              <div
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-dashed border-muted-foreground/40"
                style={{ bottom: `calc(18px + (100% - 18px) * ${kcalTargetNum / chartMax})` }}
                title={`Markmið ${kcalTargetNum} kcal`}
              />
            )}
            {last7.map((x) => (
              <Link
                key={x.day}
                href={x.day === today ? "/app/naering" : `/app/naering?d=${x.day}`}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                title={`${x.kcal.toLocaleString("is-IS")} kcal`}
              >
                <div
                  className={`w-full rounded ${x.day === selected ? "bg-accent" : "bg-border"}`}
                  style={{ height: `calc((100% - 18px) * ${x.kcal / chartMax})`, minHeight: x.kcal ? 3 : 0 }}
                />
                <span className={`text-[10px] ${x.day === selected ? "text-foreground" : "text-muted-foreground"}`}>
                  {x.label}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Flexible Diet quick references (full guide at /app/fraedsla) */}
      <div className="mt-6 lg:mt-5">
        <QuickTips />
      </div>
      </aside>
      </div>

      {/* Add food: floating "+ Skrá mat" that opens the sheet. Last in the page
          so it stays stuck to the bottom of the screen while scrolling. */}
      <NaeringForm
        userId={user.id}
        loggedOn={selected}
        customFoods={customFoods}
        recentFoods={recentFoods}
      />
    </main>
  );
}
