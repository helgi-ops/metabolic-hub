#!/usr/bin/env node
/*
 * Ingest the ICELANDIC Metabolic Coach course text into Supabase.
 *
 * Reads Helgi's Icelandic chapter .docx files from `Íslenska/Module N`, converts
 * them to Markdown (paragraphs, numbered section headings, bullet lists and
 * real tables, parsed from the docx XML) and writes lessons.title_is +
 * lessons.body_markdown_is (body_is_machine = false).
 *
 * Chapter → lesson mapping: the i-th chapter number in a module folder is
 * lesson position i (same rule as scripts/ingest-course.cjs), plus the
 * OVERRIDES below where the Icelandic folder differs from the English course.
 *
 * Usage:
 *   node scripts/ingest-course-is.cjs all [--apply]
 *   node scripts/ingest-course-is.cjs <modulePosition> [--apply]
 *   node scripts/ingest-course-is.cjs --file <path.docx>     # print Markdown
 * Without --apply it only prints what it would write.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const COURSE_SLUG = "metabolic-coach";
const IS_DIR =
  process.env.MB_COURSE_IS_DIR ||
  path.join(os.homedir(), "Desktop/Metabolic/Metabolic Þjálfaranámskeið/Íslenska");

// "M.L" (module.lesson position) → file name prefix in that module's folder,
// or null = no matching Icelandic doc (left for machine translation).
const OVERRIDES = {
  "3.1": null, // Icelandic 3.1 covers ATP-PC/cellular adaptation, not membrane transport
  "10.15": "10.15 Handbók", // French Contrast (not the general contrast-training doc)
  "14.3": "14.4 ", // Icelandic 14.3/14.4 are swapped relative to the English lessons
  "14.4": "14.3 ",
  "14.5": "14-5 ",
  "14.6": "14.6",
};

// --- env ---
function loadEnv() {
  const env = {};
  const file = process.env.MB_ENV_FILE || path.join(__dirname, "..", ".env.local");
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

// --- docx XML → Markdown ---
const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

function paraInfo(xml) {
  const style = (xml.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || "";
  const isList = /<w:numPr>/.test(xml);
  const runs = xml.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || [];
  let text = "";
  let boldChars = 0;
  let allChars = 0;
  for (const r of runs) {
    let t = "";
    const re = /<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g;
    let m;
    while ((m = re.exec(r))) t += m[1] !== undefined ? decode(m[1]) : " ";
    const bold = /<w:b\/>|<w:b w:val="(?:1|true)"\/>/.test(r);
    allChars += t.trim().length;
    if (bold) boldChars += t.trim().length;
    text += t;
  }
  text = text.replace(/\s+/g, " ").trim();
  return { text, style, isList, bold: allChars > 0 && boldChars === allChars };
}

function tableToMd(xml) {
  const rows = (xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map((tr) =>
    (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map((tc) =>
      (tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])
        .map((p) => paraInfo(p).text)
        .filter(Boolean)
        .join(" · ")
        .replace(/\|/g, "/"),
    ),
  );
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (!width) return "";
  const pad = (r) => [...r, ...Array(width - r.length).fill("")];
  const line = (r) => `| ${pad(r).map((c) => c || " ").join(" | ")} |`;
  return [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
}

// Returns { title, md }: title from the chapter heading line ("3.1 X: Y" → "X — Y").
function docxToMarkdown(file) {
  const xml = execFileSync("unzip", ["-p", file, "word/document.xml"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [])[1] || "";
  const blocks = body.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p(?=[ >])[\s\S]*?<\/w:p>/g) || [];
  const out = [];
  let title = null;
  let prevList = false;
  for (const b of blocks) {
    if (b.startsWith("<w:tbl>")) {
      const t = tableToMd(b);
      if (t) out.push("", t, "");
      prevList = false;
      continue;
    }
    const { text, style, isList, bold } = paraInfo(b);
    if (!text) {
      prevList = false;
      continue;
    }
    if (title === null && /^\d+[.\-]\d+\b/.test(text)) {
      title = text
        .replace(/^\d+[.\-]\d+\s*[:.\-–]?\s*/, "")
        .replace(/\s*:\s+/, " — ")
        .trim();
      continue;
    }
    if (title === null) title = "";
    const num = text.match(/^(\d+)\.(\d+)\.?\s+(\S.*)$/);
    const bullet = text.match(/^[•◦·‣▪]\s*(.*)$/);
    if (/^(Heading1|Title)$/i.test(style) || (num && text.length < 110 && num[2] === "0")) {
      out.push("", `## ${num ? num[3] : text}`, "");
      prevList = false;
    } else if (/^Heading[2-4]$/i.test(style) || (num && text.length < 110)) {
      out.push("", `### ${num ? num[3] : text}`, "");
      prevList = false;
    } else if (isList || bullet) {
      if (!prevList) out.push("");
      out.push(`- ${bullet ? bullet[1] : text}`);
      prevList = true;
    } else if (bold && text.length < 90 && !/[.!?]$/.test(text)) {
      out.push("", `### ${text}`, "");
      prevList = false;
    } else {
      out.push("", text, "");
      prevList = false;
    }
  }
  const md = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title: title || null, md };
}

// --- mapping ---
function chapterFiles(modPos) {
  const dir = path.join(IS_DIR, `Module ${modPos}`);
  if (!fs.existsSync(dir)) return { dir, byMinor: new Map(), files: [] };
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d+[.\-]\d+/.test(f) && /\.docx$/i.test(f) && !f.startsWith("~$"));
  const byMinor = new Map();
  for (const f of files) {
    const mi = +f.match(/^\d+[.\-](\d+)/)[1];
    if (!byMinor.has(mi)) byMinor.set(mi, []);
    byMinor.get(mi).push(f);
  }
  return { dir, byMinor, files };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--file") {
    const r = docxToMarkdown(args[1]);
    console.log(`TITLE: ${r.title}\n\n${r.md}`);
    return;
  }
  const apply = args.includes("--apply");
  const which = args.find((a) => !a.startsWith("--"));
  if (!which) {
    console.error("Usage: node scripts/ingest-course-is.cjs <modulePosition|all> [--apply]");
    process.exit(1);
  }
  const env = loadEnv();
  const { createClient } = require("@supabase/supabase-js");
  const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: course } = await supa.from("courses").select("id").eq("slug", COURSE_SLUG).single();
  const { data: mods } = await supa
    .from("modules")
    .select("id, position")
    .eq("course_id", course.id)
    .order("position");
  for (const m of mods) {
    if (which !== "all" && +which !== m.position) continue;
    const { data: lessons } = await supa
      .from("lessons")
      .select("id, position, title")
      .eq("module_id", m.id)
      .order("position");
    const { dir, byMinor, files } = chapterFiles(m.position);
    const minors = [...byMinor.keys()].sort((a, b) => a - b);
    console.log(`\n## Module ${m.position}`);
    for (let i = 0; i < lessons.length; i++) {
      const l = lessons[i];
      const key = `${m.position}.${l.position}`;
      let file;
      if (key in OVERRIDES) {
        const pre = OVERRIDES[key];
        // macOS stores names decomposed (NFD) — compare in NFC.
        file =
          pre === null
            ? null
            : files.find((f) => f.normalize("NFC").startsWith(pre.normalize("NFC"))) ?? null;
      } else {
        file = minors[i] != null ? byMinor.get(minors[i])[0] : null;
      }
      if (!file) {
        console.log(`  ${key} — no Icelandic doc (machine translation later)`);
        continue;
      }
      const { title, md } = docxToMarkdown(path.join(dir, file));
      const tables = (md.match(/^\| --- /gm) || []).length;
      console.log(`  ${key} ${l.title.slice(0, 40).padEnd(40)} → ${title} (${md.length}c, ${tables} töflur)`);
      if (apply) {
        const { error } = await supa
          .from("lessons")
          .update({ title_is: title, body_markdown_is: md, body_is_machine: false })
          .eq("id", l.id);
        if (error) console.log(`    ✗ ${error.message}`);
      }
    }
  }
  console.log(apply ? "\napplied." : "\n(dry run — add --apply to write)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
