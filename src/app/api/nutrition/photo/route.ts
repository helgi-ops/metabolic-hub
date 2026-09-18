import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  estimateFoodItemsFromImage,
  estimateProductFromImage,
} from "@/lib/ai/food-photo";

// Estimate nutrition from a photo via Claude vision. Members only.
//  - mode "meal" (default): a meal photo → a list of foods (each with totals).
//  - mode "product": a product's nutrition label → macros per 100 g.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { image?: string; mediaType?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const image = body.image ?? "";
  const mediaType = body.mediaType ?? "image/jpeg";
  const mode = body.mode === "product" ? "product" : "meal";
  if (!image || image.length > 8_000_000) {
    return NextResponse.json({ error: "invalid image" }, { status: 400 });
  }

  try {
    if (mode === "product") {
      const product = await estimateProductFromImage(image, mediaType);
      return NextResponse.json({ product });
    }
    const items = await estimateFoodItemsFromImage(image, mediaType);
    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "estimate failed";
    const missingKey = msg.includes("ANTHROPIC_API_KEY");
    return NextResponse.json(
      {
        error: missingKey
          ? "Myndgreining er ekki virkjuð enn (vantar ANTHROPIC_API_KEY á þjóninn)."
          : "Gat ekki metið myndina. Reyndu aftur eða skráðu handvirkt.",
      },
      { status: missingKey ? 503 : 502 },
    );
  }
}
