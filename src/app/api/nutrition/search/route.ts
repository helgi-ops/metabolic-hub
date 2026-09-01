import { NextResponse } from "next/server";

// Food search proxied through Open Food Facts (free, no API key). We normalise
// to per-100g macros so the client can scale by grams/servings. Kept server-side
// to attach a descriptive User-Agent (OFF asks for one), avoid CORS, and keep the
// data source swappable.

const OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";
const UA = "MetabolicHub/1.0 (helgi@metabolic.is)";

type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

function num(v: number | string | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const params = new URLSearchParams({
    search_terms: q,
    json: "1",
    page_size: "20",
    fields: "code,product_name,brands,nutriments,serving_quantity",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let data: { products?: OffProduct[] };
  try {
    const res = await fetch(`${OFF_SEARCH}?${params.toString()}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      return NextResponse.json(
        { results: [], error: "search_failed" },
        { status: 502 },
      );
    }
    data = await res.json();
  } catch {
    return NextResponse.json(
      { results: [], error: "search_unavailable" },
      { status: 504 },
    );
  } finally {
    clearTimeout(timeout);
  }

  const results = (data.products ?? [])
    .map((p) => {
      const n = p.nutriments ?? {};
      const kcal = num(n["energy-kcal_100g"]);
      const name = (p.product_name ?? "").trim();
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
    })
    .filter(Boolean)
    .slice(0, 20);

  return NextResponse.json({ results });
}
