#!/usr/bin/env node
/*
 * Match the standalone infographic PNGs in each module folder to lessons (by
 * title similarity), upload them to the public `course-media` bucket, and set
 * lessons.image_urls. Kept separate from body_markdown so re-running either
 * ingestion never clobbers the other.
 *
 * Usage:
 *   node scripts/ingest-images.cjs <modulePosition|all>           # dry-run (prints matches)
 *   node scripts/ingest-images.cjs <modulePosition|all> --apply   # upload + write image_urls
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { createClient } = require("@supabase/supabase-js");

const COURSE_SLUG = "metabolic-coach";
const BUCKET = "course-media";
const COURSE_DIR =
  process.env.MB_COURSE_DIR ||
  path.join(os.homedir(), "Desktop/Metabolic/Metabolic Þjálfaranámskeið");
const APPLY = process.argv.includes("--apply");

// Explicit image → lesson-position map, keyed by a distinctive normalized
// substring of the image filename. Curated by hand (semantic match) because the
// infographic titles paraphrase the academic lesson titles. Only images that
// match an entry here are placed — avoids wrong auto-matches.
const OVERRIDE = {
  1: { "rethinking": 1, "solution redefining": 3, "coach s mandate": 4 },
  2: { "rewires": 1, "atp pc power engine": 2, "anaerobic engine and glycolysis": 3, "engine of endurance": 4, "nerve signal": 5 },
  3: { "muscle gatekeepers": 1, "pump beat fatigue": 2, "cellular endurance switch": 3, "science of muscle growth": 4, "concurrent training": 5 },
  4: { "four pillars": 1, "atp cp energy": 2, "blueprint for dup": 3, "4 week training cycle": 4, "class anatomy": 5 },
  5: { "production vs maintenance": 1, "common hiit pitfalls": 2, "power of the pause": 3, "strategy for group": 4, "beyond the finish line": 5 },
  6: { "janda": 2, "dynamic warm": 4, "with play": 5, "4 step blueprint": 1 },
  7: { "anatomy of a metabolic burn": 1, "burn toolkit variations": 3, "endurance training work and rest": 4, "decoding metabolic endurance": 4 },
  8: { "advanced strength training protocols": 3, "power explosive training": 4, "unorthodox power workout": 5, "advanced metabolic training toolkit": 6, "combining power and strength": 7, "hirt": 2 },
  9: { "four otm": 5 },
  10: { "twofold ladder": 6, "cluster complex training blueprint": 4, "density 5x5": 9, "rest pause training maximum": 8, "wave protocol": 12 },
  11: { "garcia ramos explosive": 6, "hansen protocol guide to peak power": 8, "iglesias soler peak performance": 5, "iglesias soler protocol for power endurance": 9, "moreno protocol explosive power": 7, "tufano advanced strength": 5, "tufano protocol training guide": 11 },
};

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}
const env = loadEnv();
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const STOP = new Set(
  ("the a an of for and to in on with your you how why what is are be it that this its part "
    + "metabolic protocol protocols training guide explained explainer lesson introduction "
    + "understanding mastering master unlock unlocking complete comprehensive coach coachs coachʼs "
    + "coaching group groups setting based deep dive variations variation real fitness hiit miit "
    + "method system blueprint design designing workout workouts toolkit science vs new").split(/\s+/),
);
const norm = (s) =>
  s.toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s) => norm(s).split(" ").filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w));
const blocks = (f) => {
  try { return execFileSync("stat", ["-f", "%b", f], { encoding: "utf8" }).trim(); } catch { return "0"; }
};

function imagesFor(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f) && !f.startsWith("."));
  // dedupe colon/punct variants by normalized key; prefer downloaded + larger
  const byKey = new Map();
  for (const f of files) {
    const full = path.join(dir, f);
    const key = norm(f);
    const dl = blocks(full) !== "0";
    const size = (() => { try { return fs.statSync(full).size; } catch { return 0; } })();
    const ex = byKey.get(key);
    if (!ex || (dl && !ex.dl) || (dl === ex.dl && size > ex.size))
      byKey.set(key, { f, full, dl, size });
  }
  return [...byKey.values()];
}

async function processModule(pos) {
  const dir = path.join(COURSE_DIR, `Module ${pos}`);
  const imgs = imagesFor(dir);
  if (!imgs.length) { console.log(`Module ${pos}: no images`); return; }

  const { data: course } = await supa.from("courses").select("id").eq("slug", COURSE_SLUG).single();
  const { data: mod } = await supa.from("modules").select("id").eq("course_id", course.id).eq("position", pos).single();
  if (!mod) { console.log(`Module ${pos}: not in DB`); return; }
  const { data: lessons } = await supa.from("lessons").select("id, position, title").eq("module_id", mod.id).order("position");
  const byPos = new Map(lessons.map((l) => [l.position, l]));
  const map = OVERRIDE[pos] || {};
  const perLesson = new Map(); // lessonId -> [{f, full}]
  console.log(`\n═══ Module ${pos} (${imgs.length} images, ${lessons.length} lessons) ═══`);
  for (const img of imgs) {
    const key = norm(img.f);
    let lessonPos = null;
    for (const [sub, lp] of Object.entries(map)) if (key.includes(sub)) { lessonPos = lp; break; }
    const best = lessonPos ? byPos.get(lessonPos) : null;
    const dlFlag = img.dl ? "" : " (NOT downloaded — skip)";
    if (best && img.dl) {
      if (!perLesson.has(best.id)) perLesson.set(best.id, []);
      perLesson.get(best.id).push(img);
      console.log(`  "${img.f}"  →  L${best.position} ${best.title}`);
    } else {
      console.log(`  "${img.f}"  →  (unmatched${dlFlag})`);
    }
  }

  if (!APPLY) return;
  // upload + set image_urls for every lesson in module (rebuild from current matches)
  for (const l of lessons) {
    const matched = perLesson.get(l.id) || [];
    const urls = [];
    for (const img of matched) {
      const ext = path.extname(img.f).toLowerCase();
      const dest = `${COURSE_SLUG}/module-${pos}/${norm(img.f).replace(/\s+/g, "-")}${ext}`;
      const buf = fs.readFileSync(img.full);
      const ct = ext === ".png" ? "image/png" : "image/jpeg";
      const { error } = await supa.storage.from(BUCKET).upload(dest, buf, { contentType: ct, upsert: true });
      if (error) { console.log(`  ✗ upload ${img.f}: ${error.message}`); continue; }
      urls.push(supa.storage.from(BUCKET).getPublicUrl(dest).data.publicUrl);
    }
    const { error } = await supa.from("lessons").update({ image_urls: urls }).eq("id", l.id);
    if (error) console.log(`  ✗ L${l.position} set image_urls: ${error.message}`);
  }
  const total = [...perLesson.values()].reduce((a, v) => a + v.length, 0);
  console.log(`Module ${pos}: uploaded+linked ${total} images`);
}

(async () => {
  const arg = process.argv[2];
  if (!arg) { console.error("Usage: node scripts/ingest-images.cjs <pos|all> [--apply]"); process.exit(1); }
  const list = arg === "all" ? [1,2,3,4,5,6,7,8,9,10,11,12,14] : [+arg];
  for (const p of list) await processModule(p);
  console.log(APPLY ? "\napplied." : "\ndry-run (add --apply to upload).");
})();
