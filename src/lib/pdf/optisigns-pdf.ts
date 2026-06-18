import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

// OptiSigns slides: one workout per two pages — a higher/lower level pair side
// by side (MB2|MB1, then MB3|MB2) — matching the studio's screen layout.

const ICE = "áéíóúýðþæöÁÉÍÓÚÝÐÞÆÖ";
const clean = (s: string): string =>
  [...(s ?? "")]
    .map((ch) => {
      if (ch === "—" || ch === "–") return "-";
      if ("“”„".includes(ch)) return '"';
      if ("’‘".includes(ch)) return "'";
      const c = ch.charCodeAt(0);
      return c <= 0x7e || ICE.includes(ch) ? ch : "";
    })
    .join("");

export type LevelContent = { intro: string; exercises: string[] } | null;
export type SlideWorkout = {
  title: string;
  levels: { 1: LevelContent; 2: LevelContent; 3: LevelContent };
};
export type OptiSignsData = {
  title: string;
  level?: string | null;
  workouts: SlideWorkout[];
  logoPng?: Uint8Array; // Metabolic logo, drawn in the header if provided
};

const ACCENT = rgb(0.976, 0.451, 0.086);
const DARK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.42, 0.42, 0.42);
const GRAYBAR = rgb(0.93, 0.93, 0.93);
const W = 842;
const H = 595;

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function generateOptiSignsPdf(
  data: OptiSignsData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const obl = await doc.embedFont(StandardFonts.HelveticaOblique);
  const logo = data.logoPng ? await doc.embedPng(data.logoPng) : null;

  const centered = (
    page: PDFPage,
    text: string,
    cx: number,
    y: number,
    size: number,
    f: PDFFont,
    color = DARK,
  ) => {
    const t = clean(text);
    page.drawText(t, {
      x: cx - f.widthOfTextAtSize(t, size) / 2,
      y,
      size,
      font: f,
      color,
    });
  };

  const COL_W = 330;
  const pairs: [number, number][] = [
    [2, 1],
    [3, 2],
  ];

  const workouts = data.workouts.length
    ? data.workouts
    : [{ title: "Engin æfing", levels: { 1: null, 2: null, 3: null } }];

  for (const wk of workouts) {
    for (const [hi, lo] of pairs) {
      const page = doc.addPage([W, H]);

      // Header
      page.drawRectangle({ x: 0, y: H - 80, width: W, height: 80, color: GRAYBAR });
      if (logo) page.drawImage(logo, { x: 22, y: H - 70, width: 56, height: 56 });
      centered(page, wk.title, W / 2, H - 48, 25, bold, DARK);
      centered(page, "METABOLIC  -  Markviss arangur", W / 2, H - 68, 9, font, MUTED);
      page.drawRectangle({ x: W / 2 - 60, y: H - 82, width: 120, height: 2.5, color: ACCENT });

      // Divider
      page.drawLine({
        start: { x: W / 2, y: 40 },
        end: { x: W / 2, y: H - 96 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });

      const columns: [number, number][] = [
        [hi, W / 4],
        [lo, (W * 3) / 4],
      ];
      for (const [lvl, cx] of columns) {
        const content = wk.levels[lvl as 1 | 2 | 3];
        let y = H - 130;
        centered(page, `MB ${lvl}`, cx, y, 28, bold, DARK);
        y -= 36;
        if (!content) {
          centered(page, "(engin gögn fyrir þetta stig)", cx, y, 11, obl, MUTED);
          continue;
        }
        for (const line of wrap(content.intro, obl, 11, COL_W)) {
          centered(page, line, cx, y, 11, obl, MUTED);
          y -= 15;
        }
        y -= 12;
        for (const ex of content.exercises) {
          for (const line of wrap(ex, font, 12.5, COL_W)) {
            centered(page, line, cx, y, 12.5, font, DARK);
            y -= 18;
          }
        }
      }
    }
  }

  return doc.save();
}
