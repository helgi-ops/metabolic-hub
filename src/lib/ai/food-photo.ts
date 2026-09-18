// Server-only. Estimates nutrition from photos using Claude vision. Two modes:
//  - meal: a plate/meal photo → a LIST of the foods seen, each with total macros
//    for the portion, so the member can edit/remove/add before logging.
//  - product: a packaged product's nutrition label → macros PER 100 g, to save
//    into the member's own foods ("mín matvæli").
// Estimates are approximate and meant to be reviewed/edited before saving.
// ANTHROPIC_API_KEY is read from the environment and must never reach the client.

import Anthropic from "@anthropic-ai/sdk";

export type FoodEstimate = {
  name: string;
  quantity_g: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  note: string | null;
};

export type ProductEstimate = {
  name: string;
  brand: string | null;
  per100g: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  serving_g: number | null;
};

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
const ALLOWED: MediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const numOr = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

// Run one vision request and return the assistant's text.
async function askVision(
  base64: string,
  mediaType: string,
  system: string,
  userText: string,
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }
  const media: MediaType = ALLOWED.includes(mediaType as MediaType)
    ? (mediaType as MediaType)
    : "image/jpeg";

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 700,
    output_config: { effort: "low" },
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: media, data: base64 },
          },
          { type: "text", text: userText },
        ],
      },
    ],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

const MEAL_SYSTEM = `Þú metur næringu matar á ljósmynd fyrir matardagbók.
Þú færð mynd af máltíð og átt að SUNDURLIÐA hana í einstaka rétti/matvæli sem sjást.

Reglur:
- Skilaðu einum hlut fyrir hvern aðgreindan rétt (t.d. hrísgrjón, kjúklingur, salat, sósa). Ef aðeins einn réttur sést, skilaðu einum hlut.
- Fyrir hvern hlut: áætlaðu HEILDAR-næringu skammtsins sem sést (ekki per 100g), út frá magni á disknum.
- Skilaðu AÐEINS JSON fylki (array), engum texta í kring, á forminu:
  [{"name": "stutt íslenskt heiti", "quantity_g": <heild grömm eða null>, "kcal": <heild kcal>, "protein_g": <g>, "carbs_g": <g>, "fat_g": <g>, "note": "stutt lýsing"}]
- Tölur eru heildarmagn fyrir þann skammt á myndinni. Vertu raunsæ/r; ef óviss, gefðu besta mat.
- Aldrei skila neinu nema JSON fylki.`;

// Itemize a meal photo into individual foods, each with totals for its portion.
export async function estimateFoodItemsFromImage(
  base64: string,
  mediaType: string,
): Promise<FoodEstimate[]> {
  const text = await askVision(
    base64,
    mediaType,
    MEAL_SYSTEM,
    "Sundurliðaðu máltíðina á myndinni í einstaka rétti. Skilaðu aðeins JSON fylki.",
  );
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error("Gat ekki lesið mat úr svari.");
  }
  const arr = JSON.parse(text.slice(start, end + 1)) as Record<
    string,
    unknown
  >[];
  const items = (Array.isArray(arr) ? arr : [])
    .map((json) => ({
      name: String(json.name ?? "Matur").slice(0, 80),
      quantity_g:
        json.quantity_g != null ? Math.round(numOr(json.quantity_g)) : null,
      kcal: Math.round(numOr(json.kcal)),
      protein_g: round1(numOr(json.protein_g)),
      carbs_g: round1(numOr(json.carbs_g)),
      fat_g: round1(numOr(json.fat_g)),
      note: json.note ? String(json.note).slice(0, 200) : null,
    }))
    .filter((it) => it.name);
  if (!items.length) throw new Error("Fann engan mat á myndinni.");
  return items;
}

const PRODUCT_SYSTEM = `Þú lest næringartöflu á umbúðum matvöru fyrir matardagbók.
Þú færð mynd af vöru (framhlið og/eða næringartöflu) og átt að skila næringu PER 100 g.

Reglur:
- Lestu næringargildi PER 100 g af töflunni (orka í kcal, prótein, kolvetni, fita).
- Ef orka er aðeins gefin í kJ, deildu með 4,184 til að fá kcal.
- Finndu heiti vörunnar og framleiðanda (brand) ef það sést.
- Ef skammtastærð (t.d. "ein sneið" eða "skammtur") sést í grömmum, skilaðu henni sem serving_g, annars null.
- Skilaðu AÐEINS JSON hlut, engum texta í kring, á forminu:
  {"name": "heiti vörunnar", "brand": "framleiðandi eða null", "kcal": <per 100g>, "protein_g": <g per 100g>, "carbs_g": <g per 100g>, "fat_g": <g per 100g>, "serving_g": <grömm eða null>}
- Aldrei skila neinu nema JSON.`;

// Read a product's nutrition label into per-100g macros for "mín matvæli".
export async function estimateProductFromImage(
  base64: string,
  mediaType: string,
): Promise<ProductEstimate> {
  const text = await askVision(
    base64,
    mediaType,
    PRODUCT_SYSTEM,
    "Lestu næringartöflu vörunnar og skilaðu næringu per 100 g. Skilaðu aðeins JSON.",
  );
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Gat ekki lesið næringartöflu úr svari.");
  }
  const json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  return {
    name: String(json.name ?? "Vara").slice(0, 80),
    brand: json.brand ? String(json.brand).slice(0, 60) : null,
    per100g: {
      kcal: Math.round(numOr(json.kcal)),
      protein_g: round1(numOr(json.protein_g)),
      carbs_g: round1(numOr(json.carbs_g)),
      fat_g: round1(numOr(json.fat_g)),
    },
    serving_g: json.serving_g != null ? Math.round(numOr(json.serving_g)) : null,
  };
}
