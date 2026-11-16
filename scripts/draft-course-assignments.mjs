#!/usr/bin/env node
/*
 * Draft the practical assignments for the Metabolic Coach course with Claude:
 * one per module (built from that module's Icelandic lesson text) plus a final
 * project. Writes scripts/course-assignments.json for human review; nothing is
 * written to the database — scripts/seed-course-assignments.mjs does that.
 *
 * Usage: node scripts/draft-course-assignments.mjs [moduleNumbers…|final]
 *   (no args = all modules + final; existing entries in the JSON are kept
 *    unless that module is named explicitly)
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
const require = createRequire(
  process.env.NODE_PATH ? path.join(process.env.NODE_PATH, "x.js") : import.meta.url,
);
const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk").default;

const OUT = path.join(here, "course-assignments.json");
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SYSTEM = `You write practical assignments for the METABOLIC coach certification — an online course for group-fitness coaches in Iceland. You receive the full text of one course module (or several, for the final project).

Write ONE assignment that makes the learner APPLY the module, not recall it: they plan, design, adapt or explain something a coach would really do in a METABOLIC class. Use a concrete, realistic scenario (a group, a level MB1/MB2/MB3, a constraint, a client situation) drawn from the module's content. Never ask for things the module doesn't teach.

Format (Markdown, no H1):
- A short intro paragraph: what the assignment trains and why it matters for a coach.
- "## Aðstæður" / "## Scenario": the concrete scenario.
- "## Verkefnið" / "## Your task": 3–5 numbered parts.
- "## Hvað á að skila" / "## What to submit": form and length (written answer in the app, roughly 300–600 words; tables/bullets welcome).
- "## Viðmið" / "## Criteria": 3–5 bullets describing a strong answer.

House style for Icelandic: natural, professional Icelandic for coaches, matching the module text you were given. Keep brand/protocol names in English (METABOLIC, Burn, Endurance, Strength, Power, HIIT, MB1/MB2/MB3, protocol names). The English version must say the same thing.

Return ONLY a JSON object, no prose around it:
{"title_is": "...", "title_en": "...", "body_is": "...", "body_en": "...", "template_is": "...", "template_en": "..."}
Titles are short (max ~8 words) and name the task, without a "Verkefni N" prefix. template_* is a short Markdown skeleton (headings/table) pre-filled in the learner's answer box, matching the parts of the task.`;

const FINAL_BRIEF = `This is the FINAL PROJECT of the whole course (approved by the head coach before the certificate is issued). The learner designs one complete METABOLIC training week for ONE level of their choice (MB1, MB2 or MB3) as part of a 4-week mesocycle: for every class in the week give the protocol/format, exercises with sets/reps/work-rest, level-appropriate exercise selection and scaling options, and where the week sits in the 4-week block. Then a written rationale: energy-system/intent of each day, how the week balances the training variables, how it progresses within the block, how they would coach and adapt it live for a mixed group (incl. a client with a knee/shoulder/back issue). It should be substantial (the answer may be long, ~1000–2000 words plus tables). Criteria should be what the head coach checks before approving.`;

function lessonText(l) {
  const body = l.body_markdown_is?.trim() ? l.body_markdown_is : l.body_markdown;
  return `### ${l.title_is || l.title}\n\n${body ?? ""}`;
}

async function ask(userText) {
  const msg = await claude.messages
    .stream({
      model: "claude-opus-4-8",
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [{ role: "user", content: userText }],
    })
    .finalMessage();
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

const { data: course } = await supa.from("courses").select("id").eq("slug", "metabolic-coach").single();
const { data: mods } = await supa
  .from("modules")
  .select("id, position, title, title_is")
  .eq("course_id", course.id)
  .order("position");
const { data: existingAssignments } = await supa.from("assignments").select("lesson_id");
const assignmentLessons = new Set((existingAssignments ?? []).map((a) => a.lesson_id));
const { data: lessons } = await supa
  .from("lessons")
  .select("id, module_id, position, title, title_is, body_markdown, body_markdown_is")
  .in("module_id", mods.map((m) => m.id))
  .order("position");
const byModule = new Map(mods.map((m) => [m.id, []]));
for (const l of lessons) if (!assignmentLessons.has(l.id)) byModule.get(l.module_id).push(l);

const args = process.argv.slice(2);
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const jobs = [];
for (const m of mods) {
  const key = String(m.position);
  if (args.length ? !args.includes(key) : out[key]) continue;
  jobs.push({
    key,
    prompt: `Module ${m.position}: ${m.title_is || m.title}\n\n${byModule.get(m.id).map(lessonText).join("\n\n---\n\n")}`,
  });
}
if (args.length ? args.includes("final") : !out.final) {
  const pick = new Set([4, 5, 13, 14]);
  const ctx = mods
    .filter((m) => pick.has(m.position))
    .map((m) => `## Module ${m.position}: ${m.title_is || m.title}\n\n${byModule.get(m.id).map(lessonText).join("\n\n")}`)
    .join("\n\n=====\n\n");
  jobs.push({ key: "final", prompt: `${FINAL_BRIEF}\n\nCourse material:\n\n${ctx}` });
}

console.log(`drafting ${jobs.length}: ${jobs.map((j) => j.key).join(", ")}`);
const CONCURRENCY = 4;
let i = 0;
async function worker() {
  while (i < jobs.length) {
    const job = jobs[i++];
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        out[job.key] = await ask(job.prompt);
        fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
        console.log(`✓ ${job.key}: ${out[job.key].title_is}`);
        break;
      } catch (e) {
        console.log(`✗ ${job.key} (attempt ${attempt}): ${e.message}`);
      }
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`wrote ${OUT}`);
