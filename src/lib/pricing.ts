import type { Json } from "@/lib/types/database";

// Shape of one entry in stations.pricing (jsonb array).
export type PricePlan = {
  title: string;
  price: string;
  per?: string | null;
  note?: string | null;
  features?: string[];
};

export function parsePricing(raw: Json | null | undefined): PricePlan[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown as PricePlan[]).filter(
    (p) => p && typeof p.title === "string" && typeof p.price === "string",
  );
}
