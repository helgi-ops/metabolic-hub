#!/usr/bin/env node
/*
 * Machine-translate Metabolic Coach lessons that have NO Icelandic source doc
 * (lessons.body_markdown_is IS NULL) from English into Icelandic with Claude.
 * Writes title_is + body_markdown_is and sets body_is_machine = true so the UI
 * can label them. Run scripts/ingest-course-is.cjs first — Helgi's own
 * Icelandic text always wins; this only fills gaps.
 *
 * Usage: node scripts/translate-course-is.mjs [--apply]
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 * in .env.local (or the file named by MB_ENV_FILE).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.MB_ENV_FILE || path.join(here, "..", ".env.local");
const env = Object.fromEntries(
  fs
    .readFileSync(envFile, "utf8")
    .split("\n")
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
// Resolve deps from this repo, or from NODE_PATH when run outside it.
const require = createRequire(
  process.env.NODE_PATH ? path.join(process.env.NODE_PATH, "x.js") : import.meta.url,
);
const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk").default;

const apply = process.argv.includes("--apply");
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SYSTEM = `You translate Metabolic coach-education lessons from English into Icelandic.
Write natural, professional Icelandic for fitness coaches, matching the house style of the author's own Icelandic lessons:
- Keep brand and protocol names in English: METABOLIC, Burn, Endurance, Strength, Power, HIIT, HIRT, HIPT, MB1/MB2/MB3, protocol names (Triplex, Omnis, Base, Wave, Ladder, Cluster…).
- Use established Icelandic terms: þjálfari, iðkandi, lotuþjálfun á háu álagi (HIIT), sprengikraftur, vöðvaþol, endurheimt, efnaskipti, orkukerfi. Where a technical English term helps, add it in parentheses the first time, e.g. „einhliða flutningsprótein (monocarboxylate transporters)“.
- Preserve the Markdown structure exactly: headings (##, ###), bullet lists, tables (| … |) and bold/italic. Do not add or drop content.
Return ONLY the translated Markdown.`;

async function translate(text, maxTokens) {
  const msg = await claude.messages
    .stream({
      model: "claude-opus-4-8",
      max_tokens: maxTokens,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
    })
    .finalMessage();
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

const { data: course } = await supa.from("courses").select("id").eq("slug", "metabolic-coach").single();
const { data: mods } = await supa.from("modules").select("id, position").eq("course_id", course.id);
const modPos = new Map(mods.map((m) => [m.id, m.position]));
const { data: todo } = await supa
  .from("lessons")
  .select("id, module_id, position, title, body_markdown")
  .in("module_id", mods.map((m) => m.id))
  .is("body_markdown_is", null);

for (const l of todo ?? []) {
  const key = `${modPos.get(l.module_id)}.${l.position}`;
  if (!l.body_markdown?.trim()) {
    console.log(`${key} — no English body, skipping`);
    continue;
  }
  console.log(`${key} ${l.title} (${l.body_markdown.length}c) …`);
  const title = await translate(`Translate this lesson title (title only, no quotes):\n${l.title}`, 2000);
  const body = await translate(l.body_markdown, 32000);
  console.log(`  → ${title} (${body.length}c)`);
  if (apply) {
    const { error } = await supa
      .from("lessons")
      .update({ title_is: title, body_markdown_is: body, body_is_machine: true })
      .eq("id", l.id);
    if (error) console.log(`  ✗ ${error.message}`);
  } else {
    console.log(body.slice(0, 600) + "\n…");
  }
}
console.log(apply ? "applied." : "(dry run — add --apply to write)");
