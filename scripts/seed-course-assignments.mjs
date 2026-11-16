#!/usr/bin/env node
/*
 * Put the reviewed assignments from scripts/course-assignments.json into the
 * Metabolic Coach course: each becomes the LAST lesson of its module
 * ("Verkefni N — …" / "Assignment N — …", instructions in the lesson body,
 * EN + IS) plus an `assignments` row the learner answers in the app. The
 * "final" entry becomes the final project at the end of the last module and
 * requires admin approval before the certificate.
 *
 * Idempotent: rows are keyed by assignments.rubric_json.key ("module:N" /
 * "final"); re-running updates text instead of duplicating.
 *
 * Usage: node scripts/seed-course-assignments.mjs [--apply]
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

const apply = process.argv.includes("--apply");
const data = JSON.parse(fs.readFileSync(path.join(here, "course-assignments.json"), "utf8"));
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

const course = must(
  await supa.from("courses").select("id").eq("slug", "metabolic-coach").single(),
  "course",
);
const mods = must(
  await supa.from("modules").select("id, position").eq("course_id", course.id).order("position"),
  "modules",
);
const lastModule = mods[mods.length - 1];
const existing = must(
  await supa.from("assignments").select("id, lesson_id, rubric_json"),
  "assignments",
);
const byKey = new Map(existing.filter((a) => a.rubric_json?.key).map((a) => [a.rubric_json.key, a]));

// Chapter assignments first, final project last (so it sits after module 14's).
const keys = Object.keys(data)
  .filter((k) => k !== "final")
  .sort((a, b) => +a - +b);
if (data.final) keys.push("final");

for (const k of keys) {
  const d = data[k];
  const isFinal = k === "final";
  const mod = isFinal ? lastModule : mods.find((m) => m.position === +k);
  if (!mod) {
    console.log(`? no module for ${k}`);
    continue;
  }
  const key = isFinal ? "final" : `module:${k}`;
  const lesson = {
    title: isFinal ? `Final project — ${d.title_en}` : `Assignment ${k} — ${d.title_en}`,
    title_is: isFinal ? `Lokaverkefni — ${d.title_is}` : `Verkefni ${k} — ${d.title_is}`,
    body_markdown: d.body_en,
    body_markdown_is: d.body_is,
    body_is_machine: false,
  };
  const assignment = {
    title: lesson.title_is,
    type: "text",
    is_required: true,
    requires_approval: isFinal,
    rubric_json: { key, template_is: d.template_is ?? "", template_en: d.template_en ?? "" },
  };
  const prev = byKey.get(key);
  console.log(`${prev ? "update" : "create"} ${key}: ${lesson.title_is}`);
  if (!apply) continue;

  if (prev) {
    must(await supa.from("lessons").update(lesson).eq("id", prev.lesson_id), `lesson ${key}`);
    must(await supa.from("assignments").update(assignment).eq("id", prev.id), `assignment ${key}`);
  } else {
    const last = must(
      await supa
        .from("lessons")
        .select("position")
        .eq("module_id", mod.id)
        .order("position", { ascending: false })
        .limit(1),
      "max position",
    );
    const row = must(
      await supa
        .from("lessons")
        .insert({ ...lesson, module_id: mod.id, position: (last[0]?.position ?? 0) + 1 })
        .select("id")
        .single(),
      `insert lesson ${key}`,
    );
    must(
      await supa.from("assignments").insert({ ...assignment, lesson_id: row.id }),
      `insert assignment ${key}`,
    );
  }
}
console.log(apply ? "applied." : "(dry run — add --apply to write)");
