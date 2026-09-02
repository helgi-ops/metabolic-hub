import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProgressChart } from "../../../../personal-bests/progress-chart";
import {
  ageFromBirthYear,
  baseMaintenance,
  trainingKcalForLog,
  type BaseActivity,
  type Goal,
  type Sex,
  type WorkoutLog,
} from "@/lib/nutrition/energy";

export const metadata = { title: "Næring iðkanda · Metabolic" };

type Row = {
  logged_on: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function CoachNutritionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role, station_id, coach_station_ids")
    .eq("id", user.id)
    .single();
  if (!me || me.role === "student") redirect("/app");
  const isAdmin = me.role === "admin";

  const { data: member } = await supabase
    .from("profiles")
    .select("full_name, station_id, nutrition_coaching")
    .eq("id", id)
    .single();
  if (!member) notFound();

  // Access: admin, or a coach whose stations include the member's station.
  const myStations = [me.station_id, ...(me.coach_station_ids ?? [])].filter(
    Boolean,
  );
  const allowed =
    isAdmin || (member.station_id && myStations.includes(member.station_id));
  if (!allowed) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const since = shiftDate(today, -13);

  const [{ data: rows }, { data: targetRow }, { data: profRow }, { data: wLogs }] =
    await Promise.all([
      supabase
        .from("nutrition_entries")
        .select("logged_on, kcal, protein_g, carbs_g, fat_g")
        .eq("user_id", id)
        .gte("logged_on", since)
        .lte("logged_on", today),
      supabase
        .from("nutrition_targets")
        .select("kcal, protein_g, carbs_g, fat_g")
        .eq("user_id", id)
        .maybeSingle(),
      supabase
        .from("nutrition_profile")
        .select("sex, birth_year, height_cm, weight_kg, base_activity, goal")
        .eq("user_id", id)
        .maybeSingle(),
      supabase
        .from("workout_logs")
        .select("logged_on, calories, machine, machines_json, rpe, scheduled_category, duration_min")
        .eq("user_id", id)
        .gte("logged_on", since)
        .lte("logged_on", today),
    ]);

  const entries = (rows ?? []) as Row[];
  const targets = targetRow ?? null;

  // Representative daily energy need for the coach (base + avg training/day).
  let energyNeed: number | null = null;
  if (
    profRow?.sex &&
    profRow.birth_year &&
    profRow.height_cm &&
    profRow.weight_kg
  ) {
    const weight = Number(profRow.weight_kg);
    const base = baseMaintenance({
      sex: profRow.sex as Sex,
      age: ageFromBirthYear(profRow.birth_year),
      heightCm: Number(profRow.height_cm),
      weightKg: weight,
      base_activity: profRow.base_activity as BaseActivity,
      goal: profRow.goal as Goal,
    });
    const perDay = new Map<string, number>();
    for (const w of (wLogs ?? []) as unknown as (WorkoutLog & {
      logged_on: string;
    })[]) {
      perDay.set(
        w.logged_on,
        (perDay.get(w.logged_on) ?? 0) + trainingKcalForLog(w, weight).kcal,
      );
    }
    const avgTrain = Math.round(
      [...perDay.values()].reduce((a, b) => a + b, 0) / 14,
    );
    energyNeed = base + avgTrain;
  }

  // Aggregate per day.
  const byDay = new Map<
    string,
    { kcal: number; protein: number; carbs: number; fat: number }
  >();
  for (const r of entries) {
    const cur = byDay.get(r.logged_on) ?? {
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };
    cur.kcal += Number(r.kcal) || 0;
    cur.protein += Number(r.protein_g) || 0;
    cur.carbs += Number(r.carbs_g) || 0;
    cur.fat += Number(r.fat_g) || 0;
    byDay.set(r.logged_on, cur);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const trendPoints = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, t]) => ({ achieved_on: day, value: Math.round(t.kcal) }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/app/station"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Stöðin
      </Link>
      <div className="mt-4 mb-6">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Næring iðkanda
        </div>
        <h1 className="mt-2 text-3xl font-bold">{member.full_name ?? "—"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Síðustu 14 dagar. Iðkandinn skráir sjálf(ur) — þú sérð yfirlit.
        </p>
      </div>

      {!member.nutrition_coaching ? (
        <div className="rounded-lg border border-border bg-muted p-5 text-sm text-muted-foreground">
          Næringar-þjónusta er ekki virk fyrir þennan iðkanda.
        </div>
      ) : (
        <>
          {energyNeed != null && (
            <div className="mb-3 rounded-lg border border-border bg-muted p-4 text-sm">
              <span className="font-medium">Áætluð orkuþörf:</span> ~
              {energyNeed.toLocaleString("is-IS")} kcal/dag{" "}
              <span className="text-muted-foreground">
                (grunnbrennsla + meðal-æfingaorka)
              </span>
            </div>
          )}
          {targets && (
            <div className="mb-6 rounded-lg border border-border bg-muted p-4 text-sm">
              <span className="font-medium">Markmið:</span>{" "}
              {targets.kcal ? `${targets.kcal} kcal` : "—"}
              {targets.protein_g ? ` · P ${targets.protein_g}g` : ""}
              {targets.carbs_g ? ` · K ${targets.carbs_g}g` : ""}
              {targets.fat_g ? ` · F ${targets.fat_g}g` : ""}
            </div>
          )}

          {trendPoints.length >= 2 && (
            <div className="mb-6">
              <ProgressChart
                name="Kaloríur/dag"
                unit="kcal"
                higherIsBetter
                points={trendPoints}
              />
            </div>
          )}

          {days.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Engin skráning síðustu 14 daga.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Dags.</th>
                    <th className="px-4 py-2 text-right font-medium">kcal</th>
                    <th className="px-4 py-2 text-right font-medium">P</th>
                    <th className="px-4 py-2 text-right font-medium">K</th>
                    <th className="px-4 py-2 text-right font-medium">F</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {days.map(([day, t]) => (
                    <tr key={day}>
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                        {day === today ? "Í dag" : day}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {Math.round(t.kcal)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {Math.round(t.protein)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {Math.round(t.carbs)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {Math.round(t.fat)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
