import { NextResponse } from "next/server";

// Food search via Open Food Facts (free, no key). Two sources, best-effort:
//  1. Search-a-licious (search.openfoodfacts.org) — much better full-text
//     relevance, incl. Icelandic product names.
//  2. Legacy cgi/search.pl — fallback if the first returns nothing/errors.
// Normalised to per-100g macros; energy recovered from kJ when kcal is missing.
// NOTE: OFF is a *branded product* database — generic whole foods (an apple,
// plain oats) are sparse; those are best covered by custom foods / an ÍSGEM
// import.

const UA = "MetabolicHub/1.0 (helgi@metabolic.is)";

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
  // OFF stores energy_100g in kJ; recover an approximate kcal.
  const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
  return kj != null ? Math.round(kj / 4.184) : null;
}

function normalize(p: Product) {
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

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  const enc = encodeURIComponent(q);

  // 1. Search-a-licious (better relevance).
  const sal = (await fetchJson(
    `https://search.openfoodfacts.org/search?q=${enc}&page_size=25`,
  )) as { hits?: Product[] } | null;
  let products: Product[] = sal?.hits ?? [];

  // 2. Fallback to the legacy endpoint if nothing came back.
  if (products.length === 0) {
    const legacy = (await fetchJson(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}` +
        `&json=1&page_size=25&fields=code,product_name,product_name_is,brands,nutriments,serving_quantity`,
    )) as { products?: Product[] } | null;
    products = legacy?.products ?? [];
  }

  const seen = new Set<string>();
  const results = products
    .map(normalize)
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .filter((r) => {
      const key = `${r.name}|${r.brand ?? ""}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  return NextResponse.json({ results });
}
