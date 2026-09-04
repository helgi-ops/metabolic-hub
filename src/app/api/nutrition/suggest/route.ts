import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Foods to suggest for a given macro. Returns real Icelandic foods (ÍSGEM) that
// are rich in the macro, each with a sensible portion sized to help close the
// remaining gap for the day, and the macros/kcal that portion provides.

type Macro = "protein" | "carbs" | "fat";
const FIELD: Record<Macro, "protein_g" | "carbs_g" | "fat_g"> = {
  protein: "protein_g",
  carbs: "carbs_g",
  fat: "fat_g",
};
// Only suggest foods genuinely dense in the macro (per 100 g).
const MIN_PER_100: Record<Macro, number> = { protein: 10, carbs: 20, fat: 12 };

// Skip supplement/powder/oddity categories and garbled ÍSGEM rows.
const SKIP_CATEGORY = new Set([
  "Fæðubótarefni og sérfæði",
  "Krydd, salt, edik",
]);
const SKIP_NAME = /µg|retinol|vítamín steinefni|duft|matarlím|þurrger|^ger\b/i;

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Óauðkennt" }, { status: 401 });

  const url = new URL(req.url);
  const macro = url.searchParams.get("macro") as Macro | null;
  const remaining = Math.max(
    0,
    Math.round(Number(url.searchParams.get("remaining")) || 0),
  );
  if (!macro || !(macro in FIELD)) {
    return NextResponse.json({ error: "Ógilt orkuefni" }, { status: 400 });
  }
  const field = FIELD[macro];

  // Pull a generous ranked slice, then clean + shape in JS.
  const { data, error } = await supabase
    .from("foods_is")
    .select("name, category, kcal, protein_g, carbs_g, fat_g")
    .gte(field, MIN_PER_100[macro])
    .lte("kcal", 500)
    .order(field, { ascending: false })
    .limit(80);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aim a portion at the remaining gap (fall back to a typical 40 g of the macro
  // when the day is already met), capped to a realistic 20–300 g serving.
  const targetMacro = remaining > 0 ? remaining : 40;

  const foods = (data ?? [])
    .filter(
      (f) =>
        f.name.length <= 45 &&
        !SKIP_NAME.test(f.name) &&
        !(f.category && SKIP_CATEGORY.has(f.category)),
    )
    .slice(0, 12)
    .map((f) => {
      const per100 = Number(f[field]) || 0;
      if (per100 <= 0) return null;
      let grams = Math.round((targetMacro / per100) * 100 / 10) * 10;
      grams = Math.min(300, Math.max(20, grams));
      const factor = grams / 100;
      return {
        name: f.name,
        grams,
        kcal: Math.round((Number(f.kcal) || 0) * factor),
        protein_g: Math.round(Number(f.protein_g) * factor),
        carbs_g: Math.round(Number(f.carbs_g) * factor),
        fat_g: Math.round(Number(f.fat_g) * factor),
        gives: Math.round(per100 * factor), // amount of the chosen macro
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ foods });
}
