import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Food search, two sources merged:
//  1. foods_is — the Icelandic ÍSGEM reference table (generic whole foods:
//     epli, brauð, kjöt, fiskur …), macros per 100g. Shown first.
//  2. Open Food Facts (free, no key) — branded/packaged products. Search-a-licious
//     first, legacy cgi/search.pl as fallback; energy recovered from kJ.

const UA = "MetabolicHub/1.0 (helgi@metabolic.is)";

type Result = {
  code: string | null;
  name: string;
  brand: string | null;
  per100g: { kcal: number; protein: number; carbs: number; fat: number };
  serving_g: number | null;
};

type Nutriments = Record<string, number | string | undefined>;
type Product = {
  code?: string;
  product_name?: string;
  product_name_is?: string;
  brands?: string;
  serving_quantity?: number | string;
  nutriments?: Nutriments;
};

function num(v: number | string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function energyKcal(n: Nutriments): number | null {
  const kcal = num(n["energy-kcal_100g"]);
  if (kcal != null) return kcal;
  const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
  return kj != null ? Math.round(kj / 4.184) : null;
}

function normalizeOff(p: Product): Result | null {
  const n = p.nutriments ?? {};
  const kcal = energyKcal(n);
  const name = (p.product_name || p.product_name_is || "").trim();
  if (!name || kcal == null) return null;
  return {
    code: p.code ?? null,
    name,
    brand: (p.brands ?? "").split(",")[0]?.trim() || null,
    per100g: {
      kcal,
      protein: num(n["proteins_100g"]) ?? 0,
      carbs: num(n["carbohydrates_100g"]) ?? 0,
      fat: num(n["fat_100g"]) ?? 0,
    },
    serving_g: num(p.serving_quantity),
  };
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchIcelandic(q: string): Promise<Result[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("foods_is")
      .select("name, kcal, protein_g, carbs_g, fat_g")
      .ilike("name", `%${q}%`)
      .limit(30);
    const ql = q.toLowerCase();
    return (data ?? [])
      .map((r) => ({
        code: null,
        name: r.name,
        brand: "ÍSGEM",
        per100g: {
          kcal: Number(r.kcal) || 0,
          protein: Number(r.protein_g) || 0,
          carbs: Number(r.carbs_g) || 0,
          fat: Number(r.fat_g) || 0,
        },
        serving_g: null,
      }))
      // names that start with the query first, then alphabetical
      .sort((a, b) => {
        const as = a.name.toLowerCase().startsWith(ql) ? 0 : 1;
        const bs = b.name.toLowerCase().startsWith(ql) ? 0 : 1;
        return as - bs || a.name.localeCompare(b.name, "is");
      })
      .slice(0, 12);
  } catch {
    return [];
  }
}

async function searchOff(q: string): Promise<Result[]> {
  const enc = encodeURIComponent(q);
  const sal = (await fetchJson(
    `https://search.openfoodfacts.org/search?q=${enc}&page_size=25`,
  )) as { hits?: Product[] } | null;
  let products: Product[] = sal?.hits ?? [];
  if (products.length === 0) {
    const legacy = (await fetchJson(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}` +
        `&json=1&page_size=25&fields=code,product_name,product_name_is,brands,nutriments,serving_quantity`,
    )) as { products?: Product[] } | null;
    products = legacy?.products ?? [];
  }
  return products
    .map(normalizeOff)
    .filter((r): r is Result => r !== null);
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  // Icelandic reference foods first, then branded products from OFF.
  const [local, off] = await Promise.all([searchIcelandic(q), searchOff(q)]);

  const seen = new Set<string>();
  const results = [...local, ...off]
    .filter((r) => {
      const key = `${r.name}|${r.brand ?? ""}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 25);

  return NextResponse.json({ results });
}
