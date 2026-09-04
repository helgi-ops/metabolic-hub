import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

// Short, goal-oriented meal/snack ideas for closing a single macro's remaining
// gap for the day. Members only. ANTHROPIC_API_KEY stays server-side.

const LABEL: Record<string, string> = {
  protein: "prótein",
  carbs: "kolvetni",
  fat: "fitu",
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Óauðkennt" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { text: null, error: "AI-tillögur eru ekki tengdar sem stendur." },
      { status: 200 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    macro?: string;
    remaining?: number;
  };
  const macro = body.macro && body.macro in LABEL ? body.macro : null;
  const remaining = Math.max(0, Math.round(Number(body.remaining) || 0));
  if (!macro) {
    return NextResponse.json({ error: "Ógilt orkuefni" }, { status: 400 });
  }
  const label = LABEL[macro];

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 400,
    output_config: { effort: "low" },
    system:
      "Þú ert íslenskur næringar-aðstoðarmaður í æfingaappi. Svaraðu stutt, hagnýtt og á íslensku. Engin læknisráð, bara venjulegar matarhugmyndir.",
    messages: [
      {
        role: "user",
        content: `Iðkanda vantar um það bil ${remaining} g af ${label} til að klára daginn. Gefðu 2-3 fljótlegar, hollar hugmyndir (matur eða millimál) sem eru ríkar af ${label}. Hafðu hverja hugmynd á einni línu með áætluðu magni og hversu mikið ${label} hún gefur, t.d. "• 170 g skyr — ~17 g prótein". Engin inngangsorð eða útskýring, bara punktalínurnar.`,
      },
    ],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return NextResponse.json({ text });
}
