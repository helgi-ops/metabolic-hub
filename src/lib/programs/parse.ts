// Turn a structure's free-text preview into something we can lay out.
// Previews are written by hand in a few shapes, e.g.
//
//   6 og 8 mín tímarammi; 90 sek hvíld á milli tímabila.   ← intro paragraph
//
//   6 mín Tímarammi 1                                      ← block heading (+ time)
//   1a Hnébeygjuhopp 8-6-4-2 reps                          ← row: key · exercise · reps
//   BASE: JG hopp 5 reps
//   1 Box jump – 4 reps × 10 sett (skiptast á)
//
//   Hvíld það sem eftir stendur af 2 mín; 8 umferðir.      ← note paragraph
//
// Anything that doesn't fit is kept as plain text, so nothing is ever lost.

export type PreviewRow = { key: string; exercise: string; reps: string };
export type PreviewBlock = {
  title: string;
  time: string;
  rows: PreviewRow[];
  note: string; // a paragraph with no exercise rows
};
export type ParsedPreview = { intro: string; blocks: PreviewBlock[] };

// "6 mín Tímarammi 1", "8 min Block"
const TIMED_HEADING = /^(\d+(?:[.,]\d+)?\s*(?:mín|min|sek|sec)\.?)\s+(\D.*)$/i;
// "1a ", "2. ", "3) ", "4 ", "BASE: "
const ROW_KEY = /^(\d+[a-zA-Z]?|[A-ZÁÐÉÍÓÚÝÞÆÖ]{2,}):?[.)]?\s+(.+)$/;
// Prescription starts at the first standalone number (optionally after " – ").
const REPS_SPLIT = /^(.*?\S)\s+(?:[–-]\s+)?(\d.*)$/;

function isRow(line: string): boolean {
  return ROW_KEY.test(line) && !TIMED_HEADING.test(line);
}

function splitRow(line: string): PreviewRow {
  const k = line.match(ROW_KEY);
  const key = k ? k[1] : "";
  const rest = k ? k[2] : line;
  const r = rest.match(REPS_SPLIT);
  // Only split when the tail is short enough to be a prescription.
  if (r && r[2].length <= 34) return { key, exercise: r[1], reps: r[2] };
  return { key, exercise: rest, reps: "" };
}

function isHeading(line: string): boolean {
  if (TIMED_HEADING.test(line)) return true;
  return !isRow(line) && line.split(/\s+/).length <= 4 && !/[.;:]$/.test(line);
}

export function parsePreview(text: string | null | undefined): ParsedPreview {
  const paragraphs = (text ?? "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .filter((p) => p.length);

  let intro = "";
  const blocks: PreviewBlock[] = [];

  paragraphs.forEach((lines, i) => {
    const hasRows = lines.some(isRow);
    // A lone sentence on top ("2 saman. ~20 mín tímarammi.") is the intro even
    // when it happens to start with a number.
    const loneSentence =
      paragraphs.length > 1 && lines.length === 1 && /[.;]$/.test(lines[0]);
    if (i === 0 && (loneSentence || (!hasRows && !(lines.length > 1 && isHeading(lines[0]))))) {
      intro = lines.join(" ");
      return;
    }
    if (!hasRows) {
      blocks.push({ title: "", time: "", rows: [], note: lines.join(" ") });
      return;
    }
    let title = "";
    let time = "";
    let body = lines;
    if (isHeading(lines[0])) {
      const t = lines[0].match(TIMED_HEADING);
      title = t ? t[2] : lines[0];
      time = t ? t[1] : "";
      body = lines.slice(1);
    }
    blocks.push({ title, time, rows: body.map(splitRow), note: "" });
  });

  return { intro, blocks };
}
