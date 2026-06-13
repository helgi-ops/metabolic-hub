#!/usr/bin/env node
/*
 * Ingest Metabolic Coach course content into Supabase.
 *
 * Reads chapter .docx files from the course folder, extracts text with macOS
 * `textutil`, converts to Markdown, and writes it into lessons.body_markdown —
 * matching chapters to lessons by position within each module.
 *
 * Usage:
 *   node scripts/ingest-course.cjs <modulePosition> [moduleFolderName]
 *   node scripts/ingest-course.cjs all            # every English module that is downloaded
 *
 * Requires in .env.local (gitignored):
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...     (Supabase → Settings → API → service_role)
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { createClient } = require("@supabase/supabase-js");

const COURSE_SLUG = "metabolic-coach";
const COURSE_DIR =
  process.env.MB_COURSE_DIR ||
  path.join(os.homedir(), "Desktop/Metabolic/Metabolic Þjálfaranámskeið");

// --- env ---
function loadEnv() {
  const file = path.join(__dirname, "..", ".env.local");
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supa = createClient(url, key, { auth: { persistSession: false } });

// --- docx → markdown ---
function extractDocx(file) {
  return execFileSync("textutil", ["-convert", "txt", "-stdout", file], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}
function toMarkdown(txt) {
  const lines = txt.replace(/\r/g, "").split("\n");
  const out = [];
  let inList = false,
    first = true;
  for (const raw of lines) {
    const s = raw.replace(/\s+$/, "").trim();
    if (!s) {
      inList = false;
      continue;
    }
    if (first) {
      first = false;
      if (/^\d+\.\d+\b/.test(s)) continue; // drop the chapter-title line
    }
    const bm = s.replace(/^[\t ]+/, "").match(/^[•◦·‣▪]\s*\t?\s*(.*)$/);
    const isHeading = s.length < 100 && /^\d+(\.\d+)*\.?\s+\S/.test(s);
    if (bm && bm[1]) {
      out.push((inList ? "" : "\n") + "- " + bm[1].trim());
      inList = true;
    } else if (isHeading) {
      out.push("\n## " + s.replace(/^\d+(\.\d+)*\.?\s+/, "").trim());
      inList = false;
    } else {
      out.push("\n" + s);
      inList = false;
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// chapters in a module folder, deduped by minor (prefer English), sorted
function chapters(dir) {
  if (!fs.existsSync(dir)) return [];
  const isIce = (s) => /[þæðöáíéúýó]/i.test(s);
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d+\.\d+/.test(f) && /\.docx$/i.test(f) && !f.startsWith("~$"));
  const byMinor = new Map();
  for (const f of files) {
    const minor = +f.match(/^\d+\.(\d+)/)[1];
    const ex = byMinor.get(minor);
    if (!ex) byMinor.set(minor, f);
    else if (isIce(ex) && !isIce(f)) byMinor.set(minor, f);
  }
  return [...byMinor.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
}

function downloaded(file) {
  try {
    return execFileSync("stat", ["-f", "%b", file], { encoding: "utf8" }).trim() !== "0";
  } catch {
    return false;
  }
}

async function ingestModule(pos) {
  const dir = path.join(COURSE_DIR, `Module ${pos}`);
  const files = chapters(dir);
  if (!files.length) {
    console.log(`Module ${pos}: no chapter docs found at ${dir}`);
    return;
  }
  // map to lessons by position
  const { data: course } = await supa.from("courses").select("id").eq("slug", COURSE_SLUG).single();
  const { data: mod } = await supa
    .from("modules")
    .select("id")
    .eq("course_id", course.id)
    .eq("position", pos)
    .single();
  if (!mod) {
    console.log(`Module ${pos}: not found in DB`);
    return;
  }
  const { data: lessons } = await supa
    .from("lessons")
    .select("id, position, title")
    .eq("module_id", mod.id)
    .order("position");

  const n = Math.min(files.length, lessons.length);
  if (files.length !== lessons.length)
    console.log(`  ⚠ Module ${pos}: ${files.length} docs vs ${lessons.length} lessons — aligning first ${n}`);

  let done = 0;
  for (let i = 0; i < n; i++) {
    const file = path.join(dir, files[i]);
    if (!downloaded(file)) {
      console.log(`  · L${lessons[i].position} SKIP (not downloaded): ${files[i]}`);
      continue;
    }
    const md = toMarkdown(extractDocx(file));
    const { error } = await supa
      .from("lessons")
      .update({ body_markdown: md, updated_at: new Date().toISOString() })
      .eq("id", lessons[i].id);
    if (error) console.log(`  ✗ L${lessons[i].position}: ${error.message}`);
    else {
      console.log(`  ✓ L${lessons[i].position} (${md.length}c) ${lessons[i].title}`);
      done++;
    }
  }
  console.log(`Module ${pos}: updated ${done}/${n}`);
}

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node scripts/ingest-course.cjs <modulePosition|all>");
    process.exit(1);
  }
  if (arg === "all") {
    for (const p of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14]) await ingestModule(p);
  } else {
    await ingestModule(+arg);
  }
  console.log("done.");
})();
