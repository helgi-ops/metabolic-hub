// Server-only. Turns a member's past-week training stats into a short, warm
// Icelandic recap using Claude. The API key (ANTHROPIC_API_KEY) is read from the
// environment and must never reach the client — only import this from server
// code (server actions / route handlers).

import Anthropic from "@anthropic-ai/sdk";

export type RecapStats = {
  firstName: string;
  weekStart: string; // Monday (YYYY-MM-DD)
  weekEnd: string; // Sunday (YYYY-MM-DD)
  workouts: number; // logged workouts that week
  daysActive: number; // distinct days with a log
  avgRpe: number | null; // mean RPE across logs that had one
  totalCalories: number; // summed kcal on cardio machines
  categories: string[]; // human labels of workout types done
  newPbs: number; // personal bests achieved that week
  streakWeeks: number; // consecutive-week streak (incl. this week if logged)
  notes: string[]; // member's own short notes that week
};

const SYSTEM = `Þú ert hlýr, hvetjandi þjálfari hjá Metabolic — íslenskri líkamsræktarstöð.
Þú skrifar stutt "vika í baksýn" yfirlit fyrir iðkanda út frá tölum vikunnar.

Reglur:
- Skrifaðu á íslensku, í beinu ávarpi ("þú").
- Hlýtt og hvetjandi en ekki yfirdrifið — eins og raunverulegur þjálfari, ekki auglýsing.
- 2–3 stuttar málsgreinar, samtals ~60–110 orð. Engir hausar, engin upptalning með punktum.
- Nefndu 1–3 áþreifanlegar tölur úr gögnunum (t.d. fjölda æfinga, meðal-RPE, kaloríur, samfellni).
- Metabolic snýst um samfellni og ánægju af hreyfingu — hrósaðu mætingu, ekki bara afköstum.
- Endaðu á einni léttri hvatningu fyrir næstu viku.
- Aldrei finna upp tölur sem ekki eru í gögnunum. Engin heilsufars- eða læknisráð.
- Skilaðu BARA yfirlitstextanum, engu öðru.`;

/** Generate the recap paragraph. Throws if ANTHROPIC_API_KEY is not set. */
export async function generateRecapText(stats: RecapStats): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content:
          "Skrifaðu vikuyfirlit út frá þessum gögnum (JSON):\n\n" +
          JSON.stringify(stats, null, 2),
      },
    ],
  });

  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
