// Quick local demo of the AI weekly recap — prints a real recap from sample
// stats so you can see exactly what members get. No login or DB needed.
//
//   1. Put ANTHROPIC_API_KEY=sk-ant-... in .env.local
//   2. npx tsx scripts/demo-recap.ts
//
// (This is a dev-only demo, not part of the app build.)

import { readFileSync } from "node:fs";
import { generateRecapText, type RecapStats } from "../src/lib/ai/weekly-recap";

// Load ANTHROPIC_API_KEY from .env.local (Next does this automatically in-app;
// a standalone script has to read it itself).
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* no .env.local — rely on the ambient environment */
}

// A realistic week for a member who trained 4 times.
const sample: RecapStats = {
  firstName: "Anna",
  weekStart: "2026-06-08",
  weekEnd: "2026-06-14",
  workouts: 4,
  daysActive: 4,
  avgRpe: 6.8,
  totalCalories: 312,
  categories: ["Strength", "Burn", "Endurance"],
  newPbs: 1,
  streakWeeks: 5,
  notes: ["góð orka", "vinstri öxl aðeins aum", "deadlift leið vel"],
};

async function main() {
  console.log("Sýnigögn:\n", JSON.stringify(sample, null, 2), "\n");
  console.log("Bý til yfirlit með Claude…\n");
  const text = await generateRecapText(sample);
  console.log("──────── Vika í baksýn ────────\n");
  console.log(text);
  console.log("\n───────────────────────────────");
}

main().catch((e) => {
  console.error("Villa:", e instanceof Error ? e.message : e);
  process.exit(1);
});
