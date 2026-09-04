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
const MIN_PER_100: Record<Macro, number> = { protein: 10, carbs: 8, fat: 12 };
// For carbs, cap the density so pure sugar, syrup, flour and raw grains (all
// 70–100 g/100 g) drop out and real carb sources (pasta/rice cooked, potatoes,
// fruit, vegetables) remain.
const MAX_PER_100: Partial<Record<Macro, number>> = { carbs: 40 };

// Skip supplement/powder/oddity/sweet/snack categories and garbled ÍSGEM rows.
const SKIP_CATEGORY = new Set([
  "Fæðubótarefni og sérfæði",
  "Krydd, salt, edik",
  "Sykur, hunang, sælgæti",
  "Snakk, popp, flögur",
]);
const SKIP_NAME = /µg|retinol|vítamín steinefni|duft|matarlím|þurrger|^ger\b/i;
// For fat, drop pure oils/margarine (prefer real foods like cheese, nuts, avocado).
const SKIP_NAME_MACRO: Record<Macro, RegExp | null> = {
  protein: null,
  carbs: null,
  fat: /olía|olíu|smjörlíki|tólg|ístr|jurtafeiti|dýrafita/i,
};

// Carbs are whitelisted to real sources (pasta/rice/bread/oats/barley,
// vegetables/potatoes, fruit/berries) rather than blacklisting the endless
// sweets — this keeps the list to foods you'd actually eat for carbs.
function allowCarb(name: string, category: string | null): boolean {
  const n = name.toLowerCase();
  if (category === "Grænmeti og kartöflur")
    return !/hvítlauk|olíu|franskar|steikt|djúpst|sagó|mjöl/.test(n);
  if (category === "Ávextir, ber, hnetur og fræ")
    return !/hneta|hnetur|fræ|möndl|kasjú|pistas|valhnet|heslihnet|jarðhnet|saft|safi|þykkni|þurrk/.test(
      n,
    );
  if (category === "Kornmatur, brauð, kökur")
    return (
      /pasta|spaghett|makkar|núðl|tortellini|hrísgrjón|brauð|hafragraut|bygg|kínóa|quinoa|couscous|bulgur/.test(
        n,
      ) &&
      !/döðlu|kaka|kök|köku|vínarbrauð|skonsur|vöffl|klein|bolla|marens|kex|snúð/.test(
        n,
      )
    );
  return false;
}

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
  let query = supabase
    .from("foods_is")
    .select("name, category, kcal, protein_g, carbs_g, fat_g")
    .gte(field, MIN_PER_100[macro])
    .lte("kcal", 500);
  const max = MAX_PER_100[macro];
  if (max != null) query = query.lte(field, max);
  const { data, error } = await query
    .order(field, { ascending: false })
    .limit(80);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const macroRe = SKIP_NAME_MACRO[macro];

  // Aim a portion at the remaining gap (fall back to a typical 40 g of the macro
  // when the day is already met), capped to a realistic 20–300 g serving.
  const targetMacro = remaining > 0 ? remaining : 40;

  const foods = (data ?? [])
    .filter((f) => {
      if (f.name.length > 45 || SKIP_NAME.test(f.name)) return false;
      if (f.category && SKIP_CATEGORY.has(f.category)) return false;
      if (macro === "carbs") return allowCarb(f.name, f.category);
      if (macroRe && macroRe.test(f.name)) return false;
      return true;
    })
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
