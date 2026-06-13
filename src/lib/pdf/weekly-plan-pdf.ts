import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
} from "pdf-lib";

export type PdfSession = {
  slot: number;
  category: string;
  name: string;
  preview: string;
  day?: string;
};

export type WeeklyPlanPdfData = {
  title: string;
  level: string;
  weekStarting: string;
  sessions: PdfSession[];
};

const CAT_COLOR: Record<string, [number, number, number]> = {
  strength: [0.15, 0.39, 0.92],
  power: [0.86, 0.15, 0.15],
  power_strength: [0.55, 0.27, 0.8],
  endurance: [0.08, 0.55, 0.52],
  burn: [0.98, 0.45, 0.09],
};
const CAT_LABEL: Record<string, string> = {
  strength: "STRENGTH",
  power: "POWER",
  power_strength: "POWER/STRENGTH",
  endurance: "ENDURANCE",
  burn: "BURN",
};

// pdf-lib standard fonts use WinAnsi — keep ASCII + Icelandic letters, swap common
// typographic glyphs for ASCII, drop anything else (avoids "cannot encode" errors).
const ICELANDIC = "áéíóúýðþæöÁÉÍÓÚÝÐÞÆÖ";
function sanitize(s: string): string {
  return (s || "")
    .replace(/[–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→|⇒/g, "->")
    .replace(/[•·]/g, "-")
    .replace(/×/g, "x")
    .replace(/✓/g, "")
    .split("")
    .filter((ch) => ch.charCodeAt(0) <= 126 || ICELANDIC.includes(ch))
    .join("");
}

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxW: number,
): string[] {
  const out: string[] = [];
  for (const rawLine of sanitize(text).split("\n")) {
    if (rawLine.trim() === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of rawLine.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxW) {
        line = test;
      } else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export async function generateWeeklyPlanPdf(
  data: WeeklyPlanPdfData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // 16:9 signage page.
  const W = 1120;
  const H = 630;
  const page = doc.addPage([W, H]);

  // Header bar.
  page.drawRectangle({ x: 0, y: H - 60, width: W, height: 60, color: rgb(0.06, 0.06, 0.06) });
  page.drawText("METABOLIC", {
    x: 40,
    y: H - 40,
    size: 20,
    font: bold,
    color: rgb(0.98, 0.45, 0.09),
  });
  const title = sanitize(data.title);
  if (title) {
    page.drawText(title, {
      x: W / 2 - font.widthOfTextAtSize(title, 16) / 2,
      y: H - 38,
      size: 16,
      font,
      color: rgb(0.85, 0.85, 0.85),
    });
  }
  const headRight = sanitize(`${data.level}  ·  Vika ${data.weekStarting}`);
  page.drawText(headRight, {
    x: W - 40 - bold.widthOfTextAtSize(headRight, 15),
    y: H - 38,
    size: 15,
    font: bold,
    color: rgb(1, 1, 1),
  });

  // 3 x 2 grid of session cards.
  const cols = 3;
  const rows = 2;
  const margin = 24;
  const gap = 16;
  const gridTop = H - 60 - margin;
  const cardW = (W - margin * 2 - gap * (cols - 1)) / cols;
  const cardH = (gridTop - margin - gap * (rows - 1)) / rows;

  data.sessions.slice(0, 6).forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * (cardW + gap);
    const y = gridTop - row * (cardH + gap) - cardH;

    page.drawRectangle({
      x,
      y,
      width: cardW,
      height: cardH,
      color: rgb(0.97, 0.97, 0.97),
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 1,
    });

    const c = CAT_COLOR[s.category] ?? [0.3, 0.3, 0.3];
    const catColor = rgb(c[0], c[1], c[2]);
    const pad = 12;
    let cy = y + cardH - pad - 9;

    const label = s.day
      ? `${s.slot}   ${s.day.toUpperCase()}  ·  ${CAT_LABEL[s.category] ?? s.category}`
      : `${s.slot}   ${CAT_LABEL[s.category] ?? s.category}`;
    page.drawText(sanitize(label), {
      x: x + pad,
      y: cy,
      size: 9,
      font: bold,
      color: catColor,
    });
    cy -= 16;

    for (const nl of wrap(s.name, bold, 12, cardW - pad * 2).slice(0, 2)) {
      page.drawText(nl, { x: x + pad, y: cy, size: 12, font: bold, color: rgb(0.1, 0.1, 0.1) });
      cy -= 14;
    }
    cy -= 4;

    const prevSize = 7.5;
    const lineGap = prevSize + 2;
    const lines = wrap(s.preview, font, prevSize, cardW - pad * 2);
    const maxLines = Math.max(0, Math.floor((cy - (y + pad)) / lineGap));
    lines.slice(0, maxLines).forEach((ln) => {
      page.drawText(ln, { x: x + pad, y: cy, size: prevSize, font, color: rgb(0.32, 0.32, 0.32) });
      cy -= lineGap;
    });
    if (lines.length > maxLines && maxLines > 0) {
      page.drawText("...", { x: x + pad, y: cy, size: prevSize, font, color: rgb(0.32, 0.32, 0.32) });
    }
  });

  return doc.save();
}
