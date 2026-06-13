import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/require-staff";
import { PrintButton } from "./print-button";
import { PdfButton } from "./pdf-button";

export const metadata = {
  title: "Vika · Metabolic",
};

const CATEGORY_LABEL: Record<string, string> = {
  strength: "Strength",
  power_strength: "Power/Strength",
  power: "Power",
  endurance: "Endurance",
  burn: "Burn",
};

type Slot = {
  slot: number;
  category: string;
  structure_source_id: string;
  name: string;
  day?: string;
  focus?: string;
};

export default async function WeekPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireStaff();

  const { data: week } = await supabase
    .from("weekly_plans")
    .select(
      "id, title, level, week_starting, programs_json, created_at, generated_pdf_url, optisigns_pushed_at",
    )
    .eq("id", id)
    .single();

  if (!week) notFound();

  let pdfUrl: string | null = null;
  if (week.generated_pdf_url) {
    const { data: signed } = await supabase.storage
      .from("weekly-plan-pdfs")
      .createSignedUrl(week.generated_pdf_url, 3600);
    pdfUrl = signed?.signedUrl ?? null;
  }

  const slots = (Array.isArray(week.programs_json)
    ? week.programs_json
    : []) as Slot[];

  // Pull the full prescription text for each slot's structure.
  const sourceIds = slots.map((s) => s.structure_source_id).filter(Boolean);
  const { data: structures } = await supabase
    .from("structures")
    .select("source_id, name, category, preview")
    .in("source_id", sourceIds);
  const bySource = new Map((structures ?? []).map((s) => [s.source_id, s]));

  return (
    <main className="print-doc mx-auto max-w-3xl px-6 py-12">
      <div className="no-print mb-8">
        <Link
          href="/app/programs"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Til baka í safnið
        </Link>
      </div>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="print-accent font-mono text-xs tracking-widest text-accent uppercase">
            Metabolic · {week.level} · Vika {week.week_starting}
          </div>
          <h1 className="mt-2 text-3xl font-bold">
            {week.title || `Vika ${week.week_starting}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {slots.length} tímar
          </p>
        </div>
        <div className="no-print flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <PrintButton />
            <PdfButton planId={week.id} />
          </div>
          {week.optisigns_pushed_at && (
            <div className="text-xs text-muted-foreground">
              OptiSigns PDF ·{" "}
              {new Date(week.optisigns_pushed_at).toLocaleDateString("is-IS")}
              {pdfUrl && (
                <>
                  {" · "}
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Sækja PDF
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {slots.map((slot) => {
          const st = bySource.get(slot.structure_source_id);
          return (
            <article
              key={slot.slot}
              className="print-card rounded-lg border border-border bg-muted p-5"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-sm text-muted-foreground">
                  {slot.slot}
                </span>
                {slot.day && <span className="font-semibold">{slot.day}</span>}
                <span className="print-accent font-mono text-[10px] tracking-widest text-accent uppercase">
                  {CATEGORY_LABEL[slot.category] ?? slot.category}
                </span>
              </div>
              {slot.focus && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {slot.focus}
                </div>
              )}
              <h2 className="mt-1 font-semibold">{st?.name ?? slot.name}</h2>
              {st?.preview && (
                <pre className="mt-3 whitespace-pre-line font-sans text-xs leading-relaxed text-muted-foreground">
                  {st.preview}
                </pre>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
