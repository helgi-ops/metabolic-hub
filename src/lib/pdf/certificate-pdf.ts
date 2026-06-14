import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

// pdf-lib standard fonts use WinAnsi, which covers ASCII + Icelandic letters.
// Swap common typographic glyphs to ASCII so nothing fails to encode.
const ICELANDIC = "áéíóúýðþæöÁÉÍÓÚÝÐÞÆÖ";
function clean(s: string): string {
  return [...(s ?? "")]
    .map((ch) => {
      if (ch === "—" || ch === "–") return "-";
      if (ch === "“" || ch === "”" || ch === "„") return '"';
      if (ch === "’" || ch === "‘") return "'";
      const code = ch.charCodeAt(0);
      if (code <= 0x7e || ICELANDIC.includes(ch)) return ch;
      return "";
    })
    .join("");
}

const ACCENT = rgb(0.976, 0.451, 0.086); // #f97316
const DARK = rgb(0.04, 0.04, 0.04);
const MUTED = rgb(0.45, 0.45, 0.45);

export type CertificateData = {
  name: string;
  courseTitle: string;
  dateStr: string;
  number: string;
};

export async function generateCertificatePdf(
  data: CertificateData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const center = (
    text: string,
    y: number,
    size: number,
    f: PDFFont,
    color = DARK,
    spacing = 0,
  ) => {
    const t = clean(text);
    const w = f.widthOfTextAtSize(t, size) + spacing * Math.max(0, t.length - 1);
    page.drawText(t, {
      x: (width - w) / 2,
      y,
      size,
      font: f,
      color,
      ...(spacing ? { characterSpacing: spacing } : {}),
    });
  };

  // Frame
  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: ACCENT,
    borderWidth: 2,
  });
  page.drawRectangle({
    x: 30,
    y: 30,
    width: width - 60,
    height: height - 60,
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 0.5,
  });

  center("METABOLIC", height - 90, 30, bold, DARK, 8);
  center("COACH ACADEMY", height - 112, 11, font, MUTED, 5);

  center("Viðurkenningarskjal", height - 200, 30, bold, DARK);
  center("Þetta staðfestir að", height - 235, 13, font, MUTED);

  center(data.name, height - 295, 40, bold, DARK);

  center("hefur lokið námskeiðinu", height - 335, 13, font, MUTED);
  center(data.courseTitle, height - 375, 22, bold, ACCENT);

  // Footer line
  page.drawLine({
    start: { x: 80, y: 110 },
    end: { x: width - 80, y: 110 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  page.drawText(clean(`Dagsetning: ${data.dateStr}`), {
    x: 80,
    y: 88,
    size: 11,
    font,
    color: MUTED,
  });
  const numText = clean(`Skírteinisnúmer: ${data.number}`);
  page.drawText(numText, {
    x: width - 80 - font.widthOfTextAtSize(numText, 11),
    y: 88,
    size: 11,
    font,
    color: MUTED,
  });
  center("Metabolic — Markviss árangur", 60, 10, font, MUTED, 1);

  return doc.save();
}
