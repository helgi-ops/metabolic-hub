import { NextResponse } from "next/server";

// Barcode → product lookup via Open Food Facts (free, no key). Same normalised
// per-100g shape as the search route. Used by the Phase-2 barcode scanner.

const UA = "MetabolicHub/1.0 (helgi@metabolic.is)";

function num(v: number | string | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!/^\d{6,14}$/.test(code)) {
    return NextResponse.json({ product: null }, { status: 400 });
  }

  const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,brands,nutriments,serving_quantity`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let data: {
    status?: number;
    product?: {
      code?: string;
      product_name?: string;
      brands?: string;
      serving_quantity?: number | string;
      nutriments?: Record<string, number | string | undefined>;
    };
  };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      return NextResponse.json({ product: null }, { status: 502 });
    }
    data = await res.json();
  } catch {
    return NextResponse.json({ product: null }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }

  const p = data.product;
  const n = p?.nutriments ?? {};
  const kcal = num(n["energy-kcal_100g"]);
  const name = (p?.product_name ?? "").trim();
  if (!p || !name || kcal == null) {
    return NextResponse.json({ product: null });
  }

  return NextResponse.json({
    product: {
      code: p.code ?? code,
      name,
      brand: (p.brands ?? "").split(",")[0]?.trim() || null,
      per100g: {
        kcal,
        protein: num(n["proteins_100g"]) ?? 0,
        carbs: num(n["carbohydrates_100g"]) ?? 0,
        fat: num(n["fat_100g"]) ?? 0,
      },
      serving_g: num(p.serving_quantity),
    },
  });
}
