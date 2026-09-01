// Server-only. Estimates the nutrition of food in a photo using Claude vision.
// The estimate is approximate and meant to be reviewed/edited by the member
// before logging. ANTHROPIC_API_KEY is read from the environment and must never
// reach the client.

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

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
const ALLOWED: MediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const SYSTEM = `Þú metur næringu matar á ljósmynd fyrir æfingadagbók.
Þú færð mynd af mat og áætlar HEILDAR-næringu skammtsins sem sést (ekki per 100g).

Reglur:
- Skoðaðu magn/skammt eins vel og hægt er af myndinni (diskur, skál, umbúðir gefa vísbendingu).
- Ef margir hlutir eru á myndinni skaltu leggja þá saman í eina færslu.
- Skilaðu AÐEINS JSON hlut, engum texta í kring, á forminu:
  {"name": "stutt íslenskt heiti", "quantity_g": <heild grömm eða null>, "kcal": <heild kcal>, "protein_g": <g>, "carbs_g": <g>, "fat_g": <g>, "note": "stutt lýsing á því sem sést"}
- Tölur eru heildarmagn fyrir skammtinn á myndinni. Vertu raunsæ/r; ef óviss, gefðu besta mat.
- Aldrei skila neinu nema JSON.`;

export async function estimateFoodFromImage(
  base64: string,
  mediaType: string,
): Promise<FoodEstimate> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }
  const media: MediaType = ALLOWED.includes(mediaType as MediaType)
    ? (mediaType as MediaType)
    : "image/jpeg";

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 500,
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: media, data: base64 },
          },
          {
            type: "text",
            text: "Áætlaðu næringu matarins á myndinni. Skilaðu aðeins JSON.",
          },
        ],
      },
    ],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Gat ekki lesið mat úr svari.");
  }
  const json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;

  const numOr = (v: unknown, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    name: String(json.name ?? "Matur").slice(0, 80),
    quantity_g: json.quantity_g != null ? Math.round(numOr(json.quantity_g)) : null,
    kcal: Math.round(numOr(json.kcal)),
    protein_g: round1(numOr(json.protein_g)),
    carbs_g: round1(numOr(json.carbs_g)),
    fat_g: round1(numOr(json.fat_g)),
    note: json.note ? String(json.note).slice(0, 200) : null,
  };
}
